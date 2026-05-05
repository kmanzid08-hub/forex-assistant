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


def get_pip_size(symbol: str) -> float:
    return 0.01 if "JPY" in symbol.upper() else 0.0001


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


def get_market_analysis(symbol: str):
    data = yf.download(symbol, period="5d", interval="15m", auto_adjust=False)

    if data.empty:
        return {"error": "No data found for this pair"}

    if isinstance(data.columns, pd.MultiIndex):
        data.columns = data.columns.get_level_values(0)

    data = data.dropna(subset=["Close"])

    if data.empty:
        return {"error": "No usable closing-price data found"}

    data["EMA20"] = data["Close"].ewm(span=20, adjust=False).mean()
    data["EMA50"] = data["Close"].ewm(span=50, adjust=False).mean()
    data["EMA200"] = data["Close"].ewm(span=200, adjust=False).mean()

    data["RANGE"] = data["High"] - data["Low"]
    data["AVG_RANGE_20"] = data["RANGE"].rolling(20).mean()

    latest = data.iloc[-1]

    close_price = float(latest["Close"])
    ema20 = float(latest["EMA20"])
    ema50 = float(latest["EMA50"])
    ema200 = float(latest["EMA200"])
    avg_range_20 = float(latest["AVG_RANGE_20"]) if pd.notna(latest["AVG_RANGE_20"]) else 0.0

    if ema50 > ema200:
        trend = "bullish"
    elif ema50 < ema200:
        trend = "bearish"
    else:
        trend = "neutral"

    score = 0

    if ema20 > ema50 > ema200:
        score += 40
    elif ema50 > ema200:
        score += 20

    if ema20 < ema50 < ema200:
        score += 40
    elif ema50 < ema200:
        score += 20

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

    session = get_current_session()

    return {
        "pair": symbol,
        "price": close_price,
        "ema20": ema20,
        "ema50": ema50,
        "ema200": ema200,
        "trend": trend,
        "score": score,
        "quality": quality,
        "session": session,
        "choppy_market": choppy_market,
        "avg_range_20": round(avg_range_20, 6),
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
):
    feedback = []

    if session == "london":
        feedback.append("London session is active. This is usually a good session for forex movement.")
    elif session == "new_york":
        feedback.append("New York session is active. Volatility can be good, but moves can be sharp.")
    elif session == "asia":
        feedback.append("Asia session is active. Market can be slower unless the pair is Asia-sensitive.")
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

    if stop_loss_pips > 30:
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

    if choppy_market or quality == "weak" or rr_ratio < 1.5:
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
    symbol = pair.upper()
    return get_market_analysis(symbol)


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

        pip_size = get_pip_size(symbol)
        risk_amount = balance * (risk_percent / 100)

        stop_loss_distance = abs(entry_price - stop_loss_price)
        stop_loss_pips = stop_loss_distance / pip_size

        if stop_loss_pips == 0:
            return {"error": "Invalid stop loss"}

        take_profit_pips = stop_loss_pips * 2

        if market["trend"] == "bullish":
            take_profit_price = entry_price + (take_profit_pips * pip_size)
        else:
            take_profit_price = entry_price - (take_profit_pips * pip_size)

        rr_ratio = take_profit_pips / stop_loss_pips

        lot = calculate_lot_size(
            balance=balance,
            risk_percent=risk_percent,
            stop_loss_pips=stop_loss_pips,
        )

        if market["quality"] == "strong" and rr_ratio >= 2 and not market["choppy_market"]:
            verdict = "good setup"
        elif market["quality"] == "moderate" and rr_ratio >= 1.5 and not market["choppy_market"]:
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
        )

        return {
            "pair": symbol,
            "current_price": market["price"],
            "trend": market["trend"],
            "score": market["score"],
            "quality": market["quality"],
            "session": market["session"],
            "choppy_market": market["choppy_market"],
            "balance": balance,
            "risk_percent": risk_percent,
            "risk_amount": round(risk_amount, 2),
            "entry_price": entry_price,
            "stop_loss_price": stop_loss_price,
            "stop_loss_pips": round(stop_loss_pips, 2),
            "take_profit_price": round(take_profit_price, 5),
            "take_profit_pips": round(take_profit_pips, 2),
            "risk_reward_ratio": round(rr_ratio, 2),
            "standard_lots": lot["standard_lots"],
            "mini_lots": lot["mini_lots"],
            "micro_lots": lot["micro_lots"],
            "units": lot["units"],
            "verdict": verdict,
            "coach_feedback": coach["coach_feedback"],
            "coach_action": coach["coach_action"],
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

        current_price = market["price"]
        ema20 = market["ema20"]
        ema50 = market["ema50"]
        trend = market["trend"]
        pip_size = get_pip_size(symbol)
        risk_amount = balance * (risk_percent / 100)

        if trend == "bullish":
            entry_price = round(ema20, 5)
            stop_loss_price = round(ema50 - (10 * pip_size), 5)
        elif trend == "bearish":
            entry_price = round(ema20, 5)
            stop_loss_price = round(ema50 + (10 * pip_size), 5)
        else:
            entry_price = round(current_price, 5)
            stop_loss_price = round(current_price - (20 * pip_size), 5)

        stop_loss_distance = abs(entry_price - stop_loss_price)
        stop_loss_pips = stop_loss_distance / pip_size

        if stop_loss_pips == 0:
            return {"error": "Invalid suggested stop loss"}

        take_profit_pips = stop_loss_pips * 2

        if trend == "bullish":
            take_profit_price = round(entry_price + (take_profit_pips * pip_size), 5)
        else:
            take_profit_price = round(entry_price - (take_profit_pips * pip_size), 5)

        rr_ratio = take_profit_pips / stop_loss_pips

        lot = calculate_lot_size(
            balance=balance,
            risk_percent=risk_percent,
            stop_loss_pips=stop_loss_pips,
        )

        if market["quality"] == "strong" and rr_ratio >= 2 and not market["choppy_market"]:
            verdict = "good setup"
        elif market["quality"] == "moderate" and rr_ratio >= 1.5 and not market["choppy_market"]:
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
        )

        return {
            "pair": symbol,
            "current_price": round(current_price, 5),
            "trend": trend,
            "score": market["score"],
            "quality": market["quality"],
            "session": market["session"],
            "choppy_market": market["choppy_market"],
            "balance": balance,
            "risk_percent": risk_percent,
            "risk_amount": round(risk_amount, 2),
            "suggested_entry_price": entry_price,
            "suggested_stop_loss_price": stop_loss_price,
            "stop_loss_pips": round(stop_loss_pips, 2),
            "suggested_take_profit_price": take_profit_price,
            "take_profit_pips": round(take_profit_pips, 2),
            "risk_reward_ratio": round(rr_ratio, 2),
            "standard_lots": lot["standard_lots"],
            "mini_lots": lot["mini_lots"],
            "micro_lots": lot["micro_lots"],
            "units": lot["units"],
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
        if balance <= 0:
            return {"error": "Balance must be greater than zero"}

        if risk_percent <= 0:
            return {"error": "Risk percent must be greater than zero"}

        if win_rate < 0 or win_rate > 100:
            return {"error": "Win rate must be between 0 and 100"}

        if risk_reward_ratio <= 0:
            return {"error": "Risk/reward ratio must be greater than zero"}

        if trades <= 0 or simulations <= 0:
            return {"error": "Trades and simulations must be greater than zero"}

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

        average_ending_balance = sum(ending_balances) / simulations
        median_ending_balance = ending_balances[simulations // 2]
        worst_ending_balance = ending_balances[0]
        best_ending_balance = ending_balances[-1]

        losing_runs = len([x for x in ending_balances if x < balance])
        probability_of_loss = (losing_runs / simulations) * 100

        average_drawdown = sum(max_drawdowns) / simulations
        worst_drawdown = max_drawdowns[-1]

        return {
            "starting_balance": round(balance, 2),
            "risk_percent": risk_percent,
            "win_rate": win_rate,
            "risk_reward_ratio": risk_reward_ratio,
            "trades": trades,
            "simulations": simulations,
            "average_ending_balance": round(average_ending_balance, 2),
            "median_ending_balance": round(median_ending_balance, 2),
            "worst_ending_balance": round(worst_ending_balance, 2),
            "best_ending_balance": round(best_ending_balance, 2),
            "probability_of_loss_percent": round(probability_of_loss, 2),
            "average_max_drawdown_percent": round(average_drawdown, 2),
            "worst_max_drawdown_percent": round(worst_drawdown, 2),
        }

    except Exception as e:
        return {"error": str(e)}


@app.post("/journal")
def save_trade(trade: dict):
    try:
        journal.append(trade)
        return {"message": "Trade saved", "total_trades": len(journal)}
    except Exception as e:
        return {"error": str(e)}


@app.get("/journal")
def get_journal():
    return {"trades": journal}


@app.get("/analytics")
def get_analytics():
    try:
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

        avg_rr = total_rr / total_trades if total_trades > 0 else 0

        return {
            "total_trades": total_trades,
            "good_setups": good,
            "possible_setups": possible,
            "bad_setups": bad,
            "average_rr": round(avg_rr, 2),
        }

    except Exception as e:
        return {"error": str(e)}