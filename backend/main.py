from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import yfinance as yf
import pandas as pd
from datetime import datetime, timezone
import random
import os
from dotenv import load_dotenv

load_dotenv()

FMP_API_KEY = os.getenv("FMP_API_KEY")

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


def is_gold(symbol: str) -> bool:
    symbol = symbol.upper()
    return "XAU" in symbol or "GOLD" in symbol or symbol in ["GC=F", "MGC=F"]


def normalize_symbol(symbol: str) -> str:
    symbol = symbol.upper()

    if symbol in ["XAUUSD=X", "XAUUSD", "GOLD"]:
        return "GC=F"

    return symbol


def get_gold_symbols_to_try():
    return ["GC=F", "MGC=F", "XAUUSD=X"]


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


def get_current_session():
    now_utc = datetime.now(timezone.utc)
    hour = now_utc.hour

    if 0 <= hour < 7:
        return "asia"

    if 7 <= hour < 12:
        return "london"

    if 12 <= hour < 21:
        return "new_york"

    return "after_hours"


def get_market_currencies(symbol: str):
    symbol = symbol.upper()

    if is_gold(symbol):
        return ["USD"]

    cleaned = symbol.replace("=X", "")

    if len(cleaned) >= 6:
        return [cleaned[:3], cleaned[3:6]]

    if "USD" in symbol:
        return ["USD"]

    return []


def get_rule_based_news_risk(symbol: str):
    symbol = symbol.upper()
    now_utc = datetime.now(timezone.utc)
    weekday = now_utc.weekday()
    hour = now_utc.hour

    usd_sensitive = (
        "USD" in symbol
        or "XAU" in symbol
        or "GOLD" in symbol
        or symbol in ["GC=F", "MGC=F"]
    )

    if not usd_sensitive:
        return {
            "news_risk": "normal",
            "news_warning": "No major default news filter triggered for this market.",
            "avoid_due_to_news": False,
            "upcoming_events": [],
        }

    if weekday < 5 and 12 <= hour <= 15:
        return {
            "news_risk": "high",
            "news_warning": "USD-sensitive market during common US macro news window. CPI, NFP, PPI, retail sales, or jobless claims can cause sharp moves.",
            "avoid_due_to_news": True,
            "upcoming_events": [],
        }

    if weekday == 2 and 17 <= hour <= 20:
        return {
            "news_risk": "high",
            "news_warning": "Possible FOMC/Fed-related risk window. Gold and USD pairs can move violently.",
            "avoid_due_to_news": True,
            "upcoming_events": [],
        }

    return {
        "news_risk": "normal",
        "news_warning": "No major rule-based news risk detected right now.",
        "avoid_due_to_news": False,
        "upcoming_events": [],
    }


def get_live_news_risk(symbol: str):
    return get_rule_based_news_risk(symbol)


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

    standard_lots = risk_amount / (stop_loss_pips * pip_value_per_standard_lot)

    return {
        "risk_amount": round(risk_amount, 2),
        "standard_lots": round(standard_lots, 3),
        "mini_lots": round(standard_lots * 10, 2),
        "micro_lots": round(standard_lots * 100, 2),
        "units": round(standard_lots * 100000),
    }


def download_market_data(symbol: str, period: str = "5d", interval: str = "15m"):
    original_symbol = symbol.upper()
    fetch_symbol = normalize_symbol(original_symbol)

    symbols_to_try = [fetch_symbol]

    if is_gold(original_symbol):
        symbols_to_try = get_gold_symbols_to_try()

    data = pd.DataFrame()
    used_symbol = fetch_symbol

    for test_symbol in symbols_to_try:
        data = yf.download(
            test_symbol,
            period=period,
            interval=interval,
            auto_adjust=False,
            progress=False,
        )

        if not data.empty:
            used_symbol = test_symbol
            break

    if not data.empty and isinstance(data.columns, pd.MultiIndex):
        data.columns = data.columns.get_level_values(0)

    return data, used_symbol, symbols_to_try


def prepare_market_data(symbol: str, period: str = "5d", interval: str = "15m"):
    data, used_symbol, symbols_to_try = download_market_data(symbol, period, interval)

    if data.empty:
        return None, {
            "error": "No market data found",
            "pair": symbol.upper(),
            "symbols_tried": symbols_to_try,
        }

    data = data.dropna(subset=["Close"])

    if data.empty:
        return None, {
            "error": "No usable close-price data found",
            "pair": symbol.upper(),
            "data_source": used_symbol,
        }

    data["EMA20"] = data["Close"].ewm(span=20, adjust=False).mean()
    data["EMA50"] = data["Close"].ewm(span=50, adjust=False).mean()
    data["EMA200"] = data["Close"].ewm(span=200, adjust=False).mean()

    return data, None


def get_market_analysis(symbol: str):
    original_symbol = symbol.upper()
    data, error = prepare_market_data(original_symbol)

    if error:
        return error

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
        "pair": original_symbol,
        "data_source": normalize_symbol(original_symbol),
        "price": round(close_price, 5),
        "ema20": round(ema20, 5),
        "ema50": round(ema50, 5),
        "ema200": round(ema200, 5),
        "trend": trend,
        "score": score,
        "quality": quality,
        "session": get_current_session(),
        "choppy_market": choppy_market,
    }


def generate_coach_feedback(
    trend: str,
    quality: str,
    score: float,
    stop_loss_pips: float,
    rr_ratio: float,
    risk_percent: float,
    session: str,
    choppy_market: bool,
    news_risk: str,
    news_warning: str,
    avoid_due_to_news: bool,
):
    feedback = []

    feedback.append(news_warning)

    if session == "london":
        feedback.append("London session is active. This is usually a good session for forex and gold movement.")
    elif session == "new_york":
        feedback.append("New York session is active. Volatility can be good, but moves can be sharp.")
    elif session == "asia":
        feedback.append("Asia session is active. Market can be slower unless the market is Asia-sensitive.")
    else:
        feedback.append("Market is outside major sessions. Liquidity may be weaker.")

    if trend == "neutral":
        feedback.append("Trend is neutral. Waiting may be better than entering now.")
    elif trend == "bullish":
        feedback.append("Trend is bullish. Prefer buy setups over sell setups.")
    elif trend == "bearish":
        feedback.append("Trend is bearish. Prefer sell setups over buy setups.")

    if quality == "strong":
        feedback.append("Setup quality is strong. This is one of the better market conditions.")
    elif quality == "moderate":
        feedback.append("Setup quality is moderate. Be selective and avoid forcing the trade.")
    else:
        feedback.append("Setup quality is weak. This is usually better to skip.")

    if score >= 75:
        feedback.append("Market structure score is strong.")
    elif score >= 50:
        feedback.append("Market structure score is acceptable but not ideal.")
    else:
        feedback.append("Market structure score is low. The setup is not convincing.")

    if rr_ratio >= 2:
        feedback.append("Risk/reward is solid.")
    elif rr_ratio >= 1.5:
        feedback.append("Risk/reward is acceptable, but not excellent.")
    else:
        feedback.append("Risk/reward is poor. The trade may not be worth taking.")

    if stop_loss_pips > 80:
        feedback.append("Stop loss is wide. Lot size should be reduced.")
    elif stop_loss_pips < 8:
        feedback.append("Stop loss is very tight. The trade may get stopped out too easily.")
    else:
        feedback.append("Stop loss size looks reasonable.")

    if risk_percent > 1:
        feedback.append("Risk per trade is high. Consider risking 1% or less.")
    else:
        feedback.append("Risk per trade looks disciplined.")

    if choppy_market:
        feedback.append("Market looks choppy. False signals are more likely right now.")
    else:
        feedback.append("Market structure looks relatively clean.")

    if avoid_due_to_news:
        action = "avoid news risk"
    elif choppy_market or quality == "weak" or rr_ratio < 1.5:
        action = "skip"
    elif session == "after_hours":
        action = "wait for better session"
    elif quality == "strong" and rr_ratio >= 2:
        action = "consider entry"
    else:
        action = "wait for confirmation"

    return {
        "coach_feedback": feedback,
        "coach_action": action,
    }


@app.get("/analyze/{pair}")
def analyze_pair(pair: str):
    return get_market_analysis(pair)


@app.get("/news-risk")
def news_risk(pair: str):
    return get_live_news_risk(pair)


@app.get("/chart-data")
def chart_data(pair: str):
    try:
        symbol = pair.upper()
        data, error = prepare_market_data(symbol, period="5d", interval="15m")

        if error:
            return error

        chart_rows = []

        recent_data = data.tail(120)

        for index, row in recent_data.iterrows():
            chart_rows.append(
                {
                    "time": str(index),
                    "open": round(float(row["Open"]), 5),
                    "high": round(float(row["High"]), 5),
                    "low": round(float(row["Low"]), 5),
                    "close": round(float(row["Close"]), 5),
                    "ema20": round(float(row["EMA20"]), 5),
                    "ema50": round(float(row["EMA50"]), 5),
                    "ema200": round(float(row["EMA200"]), 5),
                }
            )

        return {
            "pair": symbol,
            "data": chart_rows,
        }

    except Exception as e:
        return {"error": str(e)}


@app.get("/suggest")
def suggest_trade(pair: str, balance: float, risk_percent: float):
    try:
        symbol = pair.upper()
        market = get_market_analysis(symbol)

        if "error" in market:
            return market

        news = get_live_news_risk(symbol)

        current_price = market["price"]
        ema20 = market["ema20"]
        ema50 = market["ema50"]
        trend = market["trend"]

        pip_size = get_pip_size(symbol)

        if trend == "bullish":
            entry = ema20
            stop = ema50 - (10 * pip_size)
            take_profit = entry + (abs(entry - stop) * 2)
        elif trend == "bearish":
            entry = ema20
            stop = ema50 + (10 * pip_size)
            take_profit = entry - (abs(entry - stop) * 2)
        else:
            entry = current_price
            stop = current_price - (20 * pip_size)
            take_profit = current_price + (40 * pip_size)

        stop_loss_pips = abs(entry - stop) / pip_size

        if stop_loss_pips == 0:
            return {"error": "Invalid stop loss distance"}

        rr_ratio = 2

        lot = calculate_lot_size(
            balance=balance,
            risk_percent=risk_percent,
            stop_loss_pips=stop_loss_pips,
            pip_value_per_standard_lot=get_pip_value_per_standard_lot(symbol),
        )

        if news["avoid_due_to_news"]:
            verdict = "avoid for now"
        elif market["quality"] == "strong" and not market["choppy_market"]:
            verdict = "good setup"
        elif market["quality"] == "moderate" and not market["choppy_market"]:
            verdict = "possible setup"
        else:
            verdict = "avoid for now"

        coach = generate_coach_feedback(
            trend=trend,
            quality=market["quality"],
            score=market["score"],
            stop_loss_pips=stop_loss_pips,
            rr_ratio=rr_ratio,
            risk_percent=risk_percent,
            session=market["session"],
            choppy_market=market["choppy_market"],
            news_risk=news["news_risk"],
            news_warning=news["news_warning"],
            avoid_due_to_news=news["avoid_due_to_news"],
        )

        return {
            **market,
            "balance": balance,
            "risk_percent": risk_percent,
            "risk_amount": lot["risk_amount"],
            "suggested_entry_price": round(entry, 5),
            "suggested_stop_loss_price": round(stop, 5),
            "suggested_take_profit_price": round(take_profit, 5),
            "stop_loss_pips": round(stop_loss_pips, 2),
            "risk_reward_ratio": rr_ratio,
            "standard_lots": lot["standard_lots"],
            "mini_lots": lot["mini_lots"],
            "micro_lots": lot["micro_lots"],
            "units": lot["units"],
            "news_risk": news["news_risk"],
            "news_warning": news["news_warning"],
            "avoid_due_to_news": news["avoid_due_to_news"],
            "upcoming_events": news.get("upcoming_events", []),
            "verdict": verdict,
            "coach_feedback": coach["coach_feedback"],
            "coach_action": coach["coach_action"],
        }

    except Exception as e:
        return {"error": str(e)}


@app.get("/advice")
def get_trade_advice(
    pair: str,
    balance: float,
    risk_percent: float,
    entry_price: float,
    stop_loss_price: float,
):
    try:
        symbol = pair.upper()
        market = get_market_analysis(symbol)

        if "error" in market:
            return market

        news = get_live_news_risk(symbol)

        pip_size = get_pip_size(symbol)

        stop_loss_pips = abs(entry_price - stop_loss_price) / pip_size

        if stop_loss_pips == 0:
            return {"error": "Invalid stop loss distance"}

        take_profit_pips = stop_loss_pips * 2

        if market["trend"] == "bullish":
            take_profit_price = entry_price + (take_profit_pips * pip_size)
        else:
            take_profit_price = entry_price - (take_profit_pips * pip_size)

        rr_ratio = 2

        lot = calculate_lot_size(
            balance=balance,
            risk_percent=risk_percent,
            stop_loss_pips=stop_loss_pips,
            pip_value_per_standard_lot=get_pip_value_per_standard_lot(symbol),
        )

        if news["avoid_due_to_news"]:
            verdict = "avoid for now"
        elif market["quality"] == "strong" and not market["choppy_market"]:
            verdict = "good setup"
        elif market["quality"] == "moderate" and not market["choppy_market"]:
            verdict = "possible setup"
        else:
            verdict = "avoid for now"

        coach = generate_coach_feedback(
            trend=market["trend"],
            quality=market["quality"],
            score=market["score"],
            stop_loss_pips=stop_loss_pips,
            rr_ratio=rr_ratio,
            risk_percent=risk_percent,
            session=market["session"],
            choppy_market=market["choppy_market"],
            news_risk=news["news_risk"],
            news_warning=news["news_warning"],
            avoid_due_to_news=news["avoid_due_to_news"],
        )

        return {
            **market,
            "balance": balance,
            "risk_percent": risk_percent,
            "risk_amount": lot["risk_amount"],
            "entry_price": entry_price,
            "stop_loss_price": stop_loss_price,
            "take_profit_price": round(take_profit_price, 5),
            "stop_loss_pips": round(stop_loss_pips, 2),
            "risk_reward_ratio": rr_ratio,
            "standard_lots": lot["standard_lots"],
            "mini_lots": lot["mini_lots"],
            "micro_lots": lot["micro_lots"],
            "units": lot["units"],
            "news_risk": news["news_risk"],
            "news_warning": news["news_warning"],
            "avoid_due_to_news": news["avoid_due_to_news"],
            "upcoming_events": news.get("upcoming_events", []),
            "verdict": verdict,
            "coach_feedback": coach["coach_feedback"],
            "coach_action": coach["coach_action"],
        }

    except Exception as e:
        return {"error": str(e)}


@app.get("/monte-carlo")
def monte_carlo(
    balance: float,
    risk_percent: float,
    win_rate: float,
    risk_reward_ratio: float,
    trades: int = 100,
    simulations: int = 1000,
):
    try:
        ending_balances = []
        max_drawdowns = []

        win_probability = win_rate / 100

        for _ in range(simulations):
            current_balance = balance
            peak_balance = balance
            max_drawdown = 0

            for _ in range(trades):
                risk_amount = current_balance * (risk_percent / 100)

                if random.random() < win_probability:
                    current_balance += risk_amount * risk_reward_ratio
                else:
                    current_balance -= risk_amount

                if current_balance > peak_balance:
                    peak_balance = current_balance

                drawdown = (peak_balance - current_balance) / peak_balance

                if drawdown > max_drawdown:
                    max_drawdown = drawdown

            ending_balances.append(current_balance)
            max_drawdowns.append(max_drawdown * 100)

        ending_balances.sort()
        max_drawdowns.sort()

        avg_balance = sum(ending_balances) / simulations
        median_balance = ending_balances[simulations // 2]

        probability_of_loss = (
            len([x for x in ending_balances if x < balance]) / simulations
        ) * 100

        return {
            "starting_balance": round(balance, 2),
            "average_ending_balance": round(avg_balance, 2),
            "median_ending_balance": round(median_balance, 2),
            "worst_ending_balance": round(ending_balances[0], 2),
            "best_ending_balance": round(ending_balances[-1], 2),
            "probability_of_loss_percent": round(probability_of_loss, 2),
            "average_max_drawdown_percent": round(sum(max_drawdowns) / simulations, 2),
            "worst_max_drawdown_percent": round(max_drawdowns[-1], 2),
        }

    except Exception as e:
        return {"error": str(e)}


@app.post("/journal")
def save_trade(trade: dict):
    journal.append(trade)
    return {
        "message": "Trade saved",
        "total_trades": len(journal),
    }


@app.get("/journal")
def get_journal():
    return {"trades": journal}


@app.get("/analytics")
def get_analytics():
    total_trades = len(journal)

    if total_trades == 0:
        return {"message": "No trades yet"}

    good = 0
    possible = 0
    bad = 0
    total_rr = 0

    for trade in journal:
        verdict = trade.get("verdict", "")
        rr = trade.get("risk_reward_ratio", 0)
        total_rr += rr

        if verdict == "good setup":
            good += 1
        elif verdict == "possible setup":
            possible += 1
        else:
            bad += 1

    return {
        "total_trades": total_trades,
        "good_setups": good,
        "possible_setups": possible,
        "bad_setups": bad,
        "average_rr": round(total_rr / total_trades, 2),
    }