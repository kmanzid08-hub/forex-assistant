import { useState } from "react";
import "./App.css";

const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

function App() {
  const [pair, setPair] = useState("EURUSD=X");
  const [balance, setBalance] = useState(1000);
  const [riskPercent, setRiskPercent] = useState(1);
  const [entryPrice, setEntryPrice] = useState(1.1728);
  const [stopLossPrice, setStopLossPrice] = useState(1.1708);

  const [winRate, setWinRate] = useState(45);
  const [mcTrades, setMcTrades] = useState(100);
  const [mcSimulations, setMcSimulations] = useState(1000);

  const [result, setResult] = useState(null);
  const [suggestion, setSuggestion] = useState(null);
  const [monteCarlo, setMonteCarlo] = useState(null);

  const [loadingAdvice, setLoadingAdvice] = useState(false);
  const [loadingSuggestion, setLoadingSuggestion] = useState(false);
  const [loadingMonteCarlo, setLoadingMonteCarlo] = useState(false);
  const [savingManual, setSavingManual] = useState(false);
  const [savingSuggestion, setSavingSuggestion] = useState(false);

  const [error, setError] = useState("");

  const runMonteCarloForTrade = async (rrRatio) => {
    setLoadingMonteCarlo(true);
    setMonteCarlo(null);

    try {
      const params = new URLSearchParams({
        balance: balance.toString(),
        risk_percent: riskPercent.toString(),
        win_rate: winRate.toString(),
        risk_reward_ratio: rrRatio.toString(),
        trades: mcTrades.toString(),
        simulations: mcSimulations.toString(),
      });

      const response = await fetch(`${API_URL}/monte-carlo?${params}`);
      const data = await response.json();

      if (!response.ok || data.error) {
        throw new Error(data.error || "Monte Carlo failed");
      }

      setMonteCarlo(data);
    } catch (err) {
      setError(err.message || "Failed to run Monte Carlo");
    } finally {
      setLoadingMonteCarlo(false);
    }
  };

  const getAdvice = async () => {
    setLoadingAdvice(true);
    setError("");
    setResult(null);
    setMonteCarlo(null);

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
      await runMonteCarloForTrade(data.risk_reward_ratio);
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
    setMonteCarlo(null);

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

      await runMonteCarloForTrade(data.risk_reward_ratio);
    } catch (err) {
      setError(err.message || "Failed to fetch suggestion");
    } finally {
      setLoadingSuggestion(false);
    }
  };

  const saveTrade = async (tradeData, type) => {
    if (!tradeData) return;

    if (type === "manual") setSavingManual(true);
    else setSavingSuggestion(true);

    try {
      const response = await fetch(`${API_URL}/journal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
      if (type === "manual") setSavingManual(false);
      else setSavingSuggestion(false);
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

  const getMonteCarloMessage = (mc) => {
    if (!mc) return "";

    if (mc.probability_of_loss_percent <= 5 && mc.worst_max_drawdown_percent <= 25) {
      return "Risk outlook looks acceptable. The simulation suggests the account has a good chance of growing if the assumed win rate is realistic.";
    }

    if (mc.probability_of_loss_percent <= 20 && mc.worst_max_drawdown_percent <= 40) {
      return "Risk outlook is moderate. The setup may still work, but the trader must be ready for drawdowns and losing streaks.";
    }

    return "Risk outlook is high. The simulation shows a meaningful chance of loss or heavy drawdown. Reduce risk or skip the setup.";
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

  const renderTradeCards = (data, suggested = false) => {
    if (!data) return null;

    return (
      <div className="grid">
        <div className="stat-card">
          <span className="label">Pair</span>
          <span className="value">{data.pair}</span>
        </div>

        <div className="stat-card">
          <span className="label">Current Price</span>
          <span className="value">{data.current_price}</span>
        </div>

        <div className="stat-card">
          <span className="label">Trend</span>
          <span className={`value ${getTrendClass(data.trend)}`}>{data.trend}</span>
        </div>

        <div className="stat-card">
          <span className="label">Session</span>
          <span className="value">{data.session}</span>
        </div>

        <div className="stat-card">
          <span className="label">Market State</span>
          <span className="value">{data.choppy_market ? "Choppy" : "Clean"}</span>
        </div>

        <div className="stat-card">
          <span className="label">Score</span>
          <span className="value">{data.score}</span>
        </div>

        <div className="stat-card">
          <span className="label">Quality</span>
          <span className="value">{data.quality}</span>
        </div>

        <div className="stat-card">
          <span className="label">{suggested ? "Suggested Entry" : "Entry Price"}</span>
          <span className="value">
            {suggested ? data.suggested_entry_price : data.entry_price}
          </span>
        </div>

        <div className="stat-card">
          <span className="label">{suggested ? "Suggested Stop Loss" : "Stop Loss Price"}</span>
          <span className="value">
            {suggested ? data.suggested_stop_loss_price : data.stop_loss_price}
          </span>
        </div>

        <div className="stat-card">
          <span className="label">Stop Loss Pips</span>
          <span className="value">{data.stop_loss_pips}</span>
        </div>

        <div className="stat-card">
          <span className="label">{suggested ? "Suggested Take Profit" : "Take Profit Price"}</span>
          <span className="value">
            {suggested ? data.suggested_take_profit_price : data.take_profit_price}
          </span>
        </div>

        <div className="stat-card">
          <span className="label">Risk / Reward</span>
          <span className="value">{data.risk_reward_ratio}</span>
        </div>

        <div className="stat-card">
          <span className="label">Risk Amount</span>
          <span className="value">{data.risk_amount}</span>
        </div>

        <div className="stat-card">
          <span className="label">Standard Lots</span>
          <span className="value">{data.standard_lots}</span>
        </div>

        <div className="stat-card">
          <span className="label">Mini Lots</span>
          <span className="value">{data.mini_lots}</span>
        </div>

        <div className="stat-card">
          <span className="label">Micro Lots</span>
          <span className="value">{data.micro_lots}</span>
        </div>

        <div className="stat-card">
          <span className="label">Units</span>
          <span className="value">{data.units}</span>
        </div>
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
          <input value={pair} onChange={(e) => setPair(e.target.value)} />
        </label>

        <label>
          Balance
          <input type="number" value={balance} onChange={(e) => setBalance(Number(e.target.value))} />
        </label>

        <label>
          Risk %
          <input type="number" step="0.1" value={riskPercent} onChange={(e) => setRiskPercent(Number(e.target.value))} />
        </label>

        <label>
          Expected Win Rate %
          <input type="number" value={winRate} onChange={(e) => setWinRate(Number(e.target.value))} />
        </label>

        <label>
          Entry Price
          <input type="number" step="0.00001" value={entryPrice} onChange={(e) => setEntryPrice(Number(e.target.value))} />
        </label>

        <label>
          Stop Loss Price
          <input type="number" step="0.00001" value={stopLossPrice} onChange={(e) => setStopLossPrice(Number(e.target.value))} />
        </label>

        <div className="button-row">
          <button onClick={getSuggestion} disabled={loadingSuggestion || loadingMonteCarlo}>
            {loadingSuggestion ? "Suggesting..." : "Suggest Trade"}
          </button>

          <button onClick={getAdvice} disabled={loadingAdvice || loadingMonteCarlo}>
            {loadingAdvice ? "Analyzing..." : "Get Advice"}
          </button>
        </div>

        {loadingMonteCarlo && <p>Running risk simulation...</p>}
      </div>

      {error && <div className="error-box">Error: {error}</div>}

      {monteCarlo && (
        <div className="result-card">
          <div className="result-top">
            <h2>Risk Simulation Summary</h2>
            <span className="verdict-badge verdict-medium">Monte Carlo</span>
          </div>

          <p>{getMonteCarloMessage(monteCarlo)}</p>

          <div className="grid">
            <div className="stat-card">
              <span className="label">Average Ending Balance</span>
              <span className="value">{monteCarlo.average_ending_balance}</span>
            </div>

            <div className="stat-card">
              <span className="label">Worst Ending Balance</span>
              <span className="value">{monteCarlo.worst_ending_balance}</span>
            </div>

            <div className="stat-card">
              <span className="label">Probability of Loss</span>
              <span className="value">{monteCarlo.probability_of_loss_percent}%</span>
            </div>

            <div className="stat-card">
              <span className="label">Worst Drawdown</span>
              <span className="value">{monteCarlo.worst_max_drawdown_percent}%</span>
            </div>
          </div>
        </div>
      )}

      {suggestion && (
        <div className="result-card">
          <div className="result-top">
            <h2>Suggested Trade</h2>
            <span className={`verdict-badge ${getVerdictClass(suggestion.verdict)}`}>
              {suggestion.verdict}
            </span>
          </div>

          {renderTradeCards(suggestion, true)}
          {renderCoachBox(suggestion)}

          <div className="save-row">
            <button onClick={() => saveTrade(suggestion, "suggestion")} disabled={savingSuggestion}>
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

          {renderTradeCards(result, false)}
          {renderCoachBox(result)}

          <div className="save-row">
            <button onClick={() => saveTrade(result, "manual")} disabled={savingManual}>
              {savingManual ? "Saving..." : "Save Manual Trade"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;