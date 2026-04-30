import { useState } from "react";
import "./App.css";

const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

function App() {
  const [pair, setPair] = useState("EURUSD=X");
  const [balance, setBalance] = useState(1000);
  const [riskPercent, setRiskPercent] = useState(1);
  const [entryPrice, setEntryPrice] = useState(1.1728);
  const [stopLossPrice, setStopLossPrice] = useState(1.1708);

  const [result, setResult] = useState(null);
  const [suggestion, setSuggestion] = useState(null);

  const [loadingAdvice, setLoadingAdvice] = useState(false);
  const [loadingSuggestion, setLoadingSuggestion] = useState(false);
  const [savingManual, setSavingManual] = useState(false);
  const [savingSuggestion, setSavingSuggestion] = useState(false);

  const [error, setError] = useState("");

  const getAdvice = async () => {
    setLoadingAdvice(true);
    setError("");
    setResult(null);

    try {
      const params = new URLSearchParams({
        pair,
        balance: balance.toString(),
        risk_percent: riskPercent.toString(),
        entry_price: entryPrice.toString(),
        stop_loss_price: stopLossPrice.toString(),
      });

      const response = await fetch(`${API_URL}/advice?${params}`);
      const data = await response.json();

      if (!response.ok || data.error) {
        throw new Error(data.error || "Something went wrong");
      }

      setResult(data);
    } catch (err) {
      setError(err.message || "Failed to fetch advice");
    } finally {
      setLoadingAdvice(false);
    }
  };

  const getSuggestion = async () => {
    setLoadingSuggestion(true);
    setError("");
    setSuggestion(null);

    try {
      const params = new URLSearchParams({
        pair,
        balance: balance.toString(),
        risk_percent: riskPercent.toString(),
      });

      const response = await fetch(`${API_URL}/suggest?${params}`);
      const data = await response.json();

      if (!response.ok || data.error) {
        throw new Error(data.error || "Something went wrong");
      }

      setSuggestion(data);
      setEntryPrice(data.suggested_entry_price);
      setStopLossPrice(data.suggested_stop_loss_price);
    } catch (err) {
      setError(err.message || "Failed to fetch suggestion");
    } finally {
      setLoadingSuggestion(false);
    }
  };

  const saveTrade = async (tradeData, type) => {
    if (!tradeData) return;

    if (type === "manual") {
      setSavingManual(true);
    } else {
      setSavingSuggestion(true);
    }

    try {
      const response = await fetch(`${API_URL}/journal`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(tradeData),
      });

      const data = await response.json();

      if (!response.ok || data.error) {
        throw new Error(data.error || "Failed to save trade");
      }

      alert("Trade saved!");
    } catch (err) {
      alert(err.message || "Failed to save trade");
    } finally {
      if (type === "manual") {
        setSavingManual(false);
      } else {
        setSavingSuggestion(false);
      }
    }
  };

  const getVerdictClass = (verdict) => {
    if (verdict === "good setup") return "verdict-good";
    if (verdict === "possible setup") return "verdict-medium";
    return "verdict-bad";
  };

  const getTrendClass = (trend) => {
    if (trend === "bullish") return "trend-bullish";
    if (trend === "bearish") return "trend-bearish";
    return "trend-neutral";
  };

  const renderCoachBox = (data) => {
    if (!data || !data.coach_feedback) return null;

    return (
      <div className="coach-box">
        <div className="coach-title-row">
          <h3>Coach Feedback</h3>
          <span className="coach-action">{data.coach_action}</span>
        </div>

        <div className="coach-meta">
          <span className="meta-pill">Session: {data.session}</span>
          <span className={`meta-pill ${data.choppy_market ? "meta-warn" : "meta-ok"}`}>
            {data.choppy_market ? "Choppy Market" : "Clean Structure"}
          </span>
        </div>

        <ul className="coach-list">
          {data.coach_feedback.map((item, index) => (
            <li key={index}>{item}</li>
          ))}
        </ul>
      </div>
    );
  };

  return (
    <div className="app">
      <div className="header">
        <h1>Forex Assistant</h1>
        <p>Manual trading advisory dashboard</p>
      </div>

      <div className="form-card">
        <label>
          Pair
          <input
            value={pair}
            onChange={(e) => setPair(e.target.value)}
            placeholder="EURUSD=X"
          />
        </label>

        <label>
          Balance
          <input
            type="number"
            value={balance}
            onChange={(e) => setBalance(Number(e.target.value))}
          />
        </label>

        <label>
          Risk %
          <input
            type="number"
            step="0.1"
            value={riskPercent}
            onChange={(e) => setRiskPercent(Number(e.target.value))}
          />
        </label>

        <label>
          Entry Price
          <input
            type="number"
            step="0.00001"
            value={entryPrice}
            onChange={(e) => setEntryPrice(Number(e.target.value))}
          />
        </label>

        <label>
          Stop Loss Price
          <input
            type="number"
            step="0.00001"
            value={stopLossPrice}
            onChange={(e) => setStopLossPrice(Number(e.target.value))}
          />
        </label>

        <div className="button-row">
          <button onClick={getSuggestion} disabled={loadingSuggestion}>
            {loadingSuggestion ? "Suggesting..." : "Suggest Trade"}
          </button>

          <button onClick={getAdvice} disabled={loadingAdvice}>
            {loadingAdvice ? "Analyzing..." : "Get Advice"}
          </button>
        </div>
      </div>

      {error && <div className="error-box">Error: {error}</div>}

      {suggestion && (
        <div className="result-card">
          <div className="result-top">
            <h2>Suggested Trade</h2>
            <span className={`verdict-badge ${getVerdictClass(suggestion.verdict)}`}>
              {suggestion.verdict}
            </span>
          </div>

          <div className="grid">
            <div className="stat-card">
              <span className="label">Pair</span>
              <span className="value">{suggestion.pair}</span>
            </div>

            <div className="stat-card">
              <span className="label">Current Price</span>
              <span className="value">{suggestion.current_price}</span>
            </div>

            <div className="stat-card">
              <span className="label">Trend</span>
              <span className={`value ${getTrendClass(suggestion.trend)}`}>
                {suggestion.trend}
              </span>
            </div>

            <div className="stat-card">
              <span className="label">Session</span>
              <span className="value">{suggestion.session}</span>
            </div>

            <div className="stat-card">
              <span className="label">Market State</span>
              <span className="value">
                {suggestion.choppy_market ? "Choppy" : "Clean"}
              </span>
            </div>

            <div className="stat-card">
              <span className="label">Score</span>
              <span className="value">{suggestion.score}</span>
            </div>

            <div className="stat-card">
              <span className="label">Quality</span>
              <span className="value">{suggestion.quality}</span>
            </div>

            <div className="stat-card">
              <span className="label">Suggested Entry</span>
              <span className="value">{suggestion.suggested_entry_price}</span>
            </div>

            <div className="stat-card">
              <span className="label">Suggested Stop Loss</span>
              <span className="value">{suggestion.suggested_stop_loss_price}</span>
            </div>

            <div className="stat-card">
              <span className="label">Stop Loss Pips</span>
              <span className="value">{suggestion.stop_loss_pips}</span>
            </div>

            <div className="stat-card">
              <span className="label">Suggested Take Profit</span>
              <span className="value">{suggestion.suggested_take_profit_price}</span>
            </div>

            <div className="stat-card">
              <span className="label">Take Profit Pips</span>
              <span className="value">{suggestion.take_profit_pips}</span>
            </div>

            <div className="stat-card">
              <span className="label">Risk / Reward</span>
              <span className="value">{suggestion.risk_reward_ratio}</span>
            </div>

            <div className="stat-card">
              <span className="label">Risk Amount</span>
              <span className="value">{suggestion.risk_amount}</span>
            </div>
          </div>

          {renderCoachBox(suggestion)}

          <div className="save-row">
            <button
              onClick={() => saveTrade(suggestion, "suggestion")}
              disabled={savingSuggestion}
            >
              {savingSuggestion ? "Saving..." : "Save Suggested Trade"}
            </button>
          </div>
        </div>
      )}

      {result && (
        <div className="result-card">
          <div className="result-top">
            <h2>Manual Trade Advice</h2>
            <span className={`verdict-badge ${getVerdictClass(result.verdict)}`}>
              {result.verdict}
            </span>
          </div>

          <div className="grid">
            <div className="stat-card">
              <span className="label">Pair</span>
              <span className="value">{result.pair}</span>
            </div>

            <div className="stat-card">
              <span className="label">Current Price</span>
              <span className="value">{result.current_price}</span>
            </div>

            <div className="stat-card">
              <span className="label">Trend</span>
              <span className={`value ${getTrendClass(result.trend)}`}>
                {result.trend}
              </span>
            </div>

            <div className="stat-card">
              <span className="label">Session</span>
              <span className="value">{result.session}</span>
            </div>

            <div className="stat-card">
              <span className="label">Market State</span>
              <span className="value">
                {result.choppy_market ? "Choppy" : "Clean"}
              </span>
            </div>

            <div className="stat-card">
              <span className="label">Score</span>
              <span className="value">{result.score}</span>
            </div>

            <div className="stat-card">
              <span className="label">Quality</span>
              <span className="value">{result.quality}</span>
            </div>

            <div className="stat-card">
              <span className="label">Balance</span>
              <span className="value">{result.balance}</span>
            </div>

            <div className="stat-card">
              <span className="label">Risk %</span>
              <span className="value">{result.risk_percent}</span>
            </div>

            <div className="stat-card">
              <span className="label">Risk Amount</span>
              <span className="value">{result.risk_amount}</span>
            </div>

            <div className="stat-card">
              <span className="label">Entry Price</span>
              <span className="value">{result.entry_price}</span>
            </div>

            <div className="stat-card">
              <span className="label">Stop Loss Price</span>
              <span className="value">{result.stop_loss_price}</span>
            </div>

            <div className="stat-card">
              <span className="label">Stop Loss Pips</span>
              <span className="value">{result.stop_loss_pips}</span>
            </div>

            <div className="stat-card">
              <span className="label">Take Profit Price</span>
              <span className="value">{result.take_profit_price}</span>
            </div>

            <div className="stat-card">
              <span className="label">Take Profit Pips</span>
              <span className="value">{result.take_profit_pips}</span>
            </div>

            <div className="stat-card">
              <span className="label">Risk / Reward</span>
              <span className="value">{result.risk_reward_ratio}</span>
            </div>
          </div>

          {renderCoachBox(result)}

          <div className="save-row">
            <button
              onClick={() => saveTrade(result, "manual")}
              disabled={savingManual}
            >
              {savingManual ? "Saving..." : "Save Manual Trade"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;