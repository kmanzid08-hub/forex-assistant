from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import yfinance as yf
import pandas as pd
from datetime import datetime, timezone
import random

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

journal = []


@app.get("/")
def home():
    return {"message": "Forex Assistant is running"}


@app.get("/health")
def health():
    return {"status": "ok"}


# ---------------------------
# GOLD SUPPORT
# ---------------------------
def is_gold(symbol: str) -> bool:
    symbol = symbol.upper()
    return "XAU" in symbol or "GOLD" in symbol


def get_pip_size(symbol: str) -> float:
    symbol = symbol.upper()

    if is_gold(symbol):
        return 0.01

    if "JPY" in symbol:
        return 0.01

    return 0.0001


def get_pip_value_per_standard_lot(symbol: str) -> float:
    if is_gold(symbol):
        return 1
    return 10


# ---------------------------
# SESSION DETECTION
# ---------------------------
def get_current_session():
    now_utc = datetime.now(timezone.utc)
    hour = now_utc.hour

    if 0 <= hour < 7:
        return "asia"
    elif 7 <= hour < 12:
        return "london"
    elif 12 <= hour < 21:
        return "new_york"
    else:
        return "after_hours"


# ---------------------------
# LOT SIZE CALCULATOR
# ---------------------------
def calculate_lot_size(
    balance: float,
    risk_percent: float,
    stop_loss_pips: float,
    pip_value_per_standard_lot: float = 10,
):
    risk_amount = balance * (risk_percent / 100)

    if stop_loss_pips <= 0:
        return {
            "risk_amount": round(risk_amount, 2),
            "standard_lots": 0,
            "mini_lots": 0,
            "micro_lots": 0,
            "units": 0,
        }

    standard_lots = risk_amount / (
        stop_loss_pips * pip_value_per_standard_lot
    )

    return {
        "risk_amount": round(risk_amount, 2),
        "standard_lots": round(standard_lots, 3),
        "mini_lots": round(standard_lots * 10, 2),
        "micro_lots": round(standard_lots * 100, 2),
        "units": round(standard_lots * 100000),
    }


# ---------------------------
# MARKET ANALYSIS
# ---------------------------
def get_market_analysis(symbol: str):
    data = yf.download(
        symbol,
        period="5d",
        interval="15m",
        auto_adjust=False
    )

    if data.empty:
        return {"error": "No market data found"}

    if isinstance(data.columns, pd.MultiIndex):
        data.columns = data.columns.get_level_values(0)

    data = data.dropna(subset=["Close"])

    data["EMA20"] = data["Close"].ewm(
        span=20,
        adjust=False
    ).mean()

    data["EMA50"] = data["Close"].ewm(
        span=50,
        adjust=False
    ).mean()

    data["EMA200"] = data["Close"].ewm(
        span=200,
        adjust=False
    ).mean()

    latest = data.iloc[-1]

    close_price = float(latest["Close"])
    ema20 = float(latest["EMA20"])
    ema50 = float(latest["EMA50"])
    ema200 = float(latest["EMA200"])

    if ema50 > ema200:
        trend = "bullish"
    elif ema50 < ema200:
        trend = "bearish"
    else:
        trend = "neutral"

    score = 0

    if ema20 > ema50 > ema200:
        score += 40
    elif ema20 < ema50 < ema200:
        score += 40

    distance = abs(close_price - ema50) / ema50

    if distance < 0.0015:
        score += 20
    elif distance < 0.003:
        score += 10

    if trend == "bullish" and close_price > ema20:
        score += 20
    elif trend == "bearish" and close_price < ema20:
        score += 20

    ema_gap = abs(ema20 - ema50)
    choppy_market = ema_gap < (close_price * 0.0005)

    if choppy_market:
        score -= 15

    score = max(0, min(score, 100))

    if score >= 75:
        quality = "strong"
    elif score >= 50:
        quality = "moderate"
    else:
        quality = "weak"

    return {
        "pair": symbol,
        "price": round(close_price, 5),
        "ema20": round(ema20, 5),
        "ema50": round(ema50, 5),
        "ema200": round(ema200, 5),
        "trend": trend,
        "score": score,
        "quality": quality,
        "session": get_current_session(),
        "choppy_market": choppy_market
    }


# ---------------------------
# MONTE CARLO
# ---------------------------
@app.get("/monte-carlo")
def monte_carlo(
    balance: float,
    risk_percent: float,
    win_rate: float,
    risk_reward_ratio: float,
    trades: int = 100,
    simulations: int = 1000,
):
    ending_balances = []
    max_drawdowns = []

    win_probability = win_rate / 100

    for _ in range(simulations):
        current_balance = balance
        peak_balance = balance
        max_drawdown = 0

        for _ in range(trades):
            risk_amount = current_balance * (
                risk_percent / 100
            )

            if random.random() < win_probability:
                current_balance += (
                    risk_amount * risk_reward_ratio
                )
            else:
                current_balance -= risk_amount

            if current_balance > peak_balance:
                peak_balance = current_balance

            drawdown = (
                peak_balance - current_balance
            ) / peak_balance

            if drawdown > max_drawdown:
                max_drawdown = drawdown

        ending_balances.append(current_balance)
        max_drawdowns.append(max_drawdown * 100)

    ending_balances.sort()
    max_drawdowns.sort()

    avg_balance = sum(
        ending_balances
    ) / simulations

    probability_of_loss = (
        len(
            [x for x in ending_balances if x < balance]
        ) / simulations
    ) * 100

    return {
        "starting_balance": balance,
        "average_ending_balance": round(
            avg_balance, 2
        ),
        "worst_ending_balance": round(
            ending_balances[0], 2
        ),
        "best_ending_balance": round(
            ending_balances[-1], 2
        ),
        "probability_of_loss_percent": round(
            probability_of_loss, 2
        ),
        "worst_max_drawdown_percent": round(
            max_drawdowns[-1], 2
        )
    }


# ---------------------------
# SUGGEST TRADE
# ---------------------------
@app.get("/suggest")
def suggest_trade(
    pair: str,
    balance: float,
    risk_percent: float
):
    symbol = pair.upper()

    market = get_market_analysis(symbol)

    if "error" in market:
        return market

    current_price = market["price"]
    ema20 = market["ema20"]
    ema50 = market["ema50"]

    pip_size = get_pip_size(symbol)

    if market["trend"] == "bullish":
        entry = ema20
        stop = ema50 - (10 * pip_size)
        take_profit = entry + (
            abs(entry - stop) * 2
        )
    else:
        entry = ema20
        stop = ema50 + (10 * pip_size)
        take_profit = entry - (
            abs(entry - stop) * 2
        )

    stop_loss_pips = abs(
        entry - stop
    ) / pip_size

    rr_ratio = 2

    lot = calculate_lot_size(
        balance,
        risk_percent,
        stop_loss_pips,
        get_pip_value_per_standard_lot(symbol)
    )

    if (
        market["quality"] == "strong"
        and not market["choppy_market"]
    ):
        verdict = "good setup"
    elif market["quality"] == "moderate":
        verdict = "possible setup"
    else:
        verdict = "avoid for now"

    return {
        **market,
        "balance": balance,
        "risk_percent": risk_percent,
        "risk_amount": lot["risk_amount"],
        "suggested_entry_price": round(entry, 5),
        "suggested_stop_loss_price": round(stop, 5),
        "suggested_take_profit_price": round(
            take_profit, 5
        ),
        "stop_loss_pips": round(
            stop_loss_pips, 2
        ),
        "risk_reward_ratio": rr_ratio,
        "standard_lots": lot["standard_lots"],
        "mini_lots": lot["mini_lots"],
        "micro_lots": lot["micro_lots"],
        "units": lot["units"],
        "verdict": verdict,
        "coach_action": verdict
    }


# ---------------------------
# JOURNAL
# ---------------------------
@app.post("/journal")
def save_trade(trade: dict):
    journal.append(trade)
    return {
        "message": "Trade saved",
        "total_trades": len(journal)
    }


@app.get("/journal")
def get_journal():
    return {"trades": journal}