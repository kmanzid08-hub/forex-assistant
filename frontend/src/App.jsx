import { useEffect, useState } from "react";
import "./App.css";

const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

function App() {
  const [activePage, setActivePage] = useState("dashboard");

  const [pair, setPair] = useState("EURUSD=X");
  const [balance, setBalance] = useState(1000);
  const [riskPercent, setRiskPercent] = useState(1);
  const [entryPrice, setEntryPrice] = useState(1.1728);
  const [stopLossPrice, setStopLossPrice] = useState(1.1708);
  const [winRate, setWinRate] = useState(45);

  const [suggestion, setSuggestion] = useState(null);
  const [monteCarlo, setMonteCarlo] = useState(null);
  const [journal, setJournal] = useState([]);

  const [loadingSuggestion, setLoadingSuggestion] = useState(false);
  const [loadingMonteCarlo, setLoadingMonteCarlo] = useState(false);
  const [loadingJournal, setLoadingJournal] = useState(false);
  const [error, setError] = useState("");

  const markets = [
    { label: "EUR/USD", value: "EURUSD=X", type: "Forex" },
    { label: "GBP/USD", value: "GBPUSD=X", type: "Forex" },
    { label: "USD/JPY", value: "USDJPY=X", type: "Forex" },
    { label: "AUD/USD", value: "AUDUSD=X", type: "Forex" },
    { label: "USD/CAD", value: "USDCAD=X", type: "Forex" },
    { label: "USD/CHF", value: "USDCHF=X", type: "Forex" },
    { label: "NZD/USD", value: "NZDUSD=X", type: "Forex" },
    { label: "Gold / XAUUSD", value: "GC=F", type: "Gold" },
  ];

  const selectedMarket = markets.find((m) => m.value === pair);

  const runMonteCarloForTrade = async (rrRatio) => {
    setLoadingMonteCarlo(true);
    setMonteCarlo(null);

    try {
      const params = new URLSearchParams({
        balance: balance.toString(),
        risk_percent: riskPercent.toString(),
        win_rate: winRate.toString(),
        risk_reward_ratio: rrRatio.toString(),
        trades: "100",
        simulations: "1000",
      });

      const response = await fetch(`${API_URL}/monte-carlo?${params}`);
      const data = await response.json();

      if (!response.ok || data.error) {
        throw new Error(data.error || "Monte Carlo simulation failed");
      }

      setMonteCarlo(data);
    } catch (err) {
      setError(err.message || "Failed to run Monte Carlo simulation");
    } finally {
      setLoadingMonteCarlo(false);
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
        throw new Error(data.error || "Unable to generate a trade setup");
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

  const fetchJournal = async () => {
    setLoadingJournal(true);
    setError("");

    try {
      const response = await fetch(`${API_URL}/journal`);
      const data = await response.json();

      if (!response.ok || data.error) {
        throw new Error(data.error || "Unable to fetch saved trades");
      }

      setJournal(data.trades || []);
    } catch (err) {
      setError(err.message || "Failed to load saved trades");
    } finally {
      setLoadingJournal(false);
    }
  };

  const saveTrade = async () => {
    if (!suggestion) return;

    try {
      const response = await fetch(`${API_URL}/journal`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          ...suggestion,
          market_label: selectedMarket?.label || pair,
          market_type: selectedMarket?.type || "Market",
          saved_at: new Date().toLocaleString(),
        }),
      });

      const data = await response.json();

      if (!response.ok || data.error) {
        throw new Error(data.error || "Unable to save trade");
      }

      alert("Trade saved successfully");
      fetchJournal();
    } catch (err) {
      alert(err.message || "Failed to save trade");
    }
  };

  useEffect(() => {
    fetchJournal();
  }, []);

  const getVerdictClass = (verdict) => {
    if (verdict === "good setup") return "good";
    if (verdict === "possible setup") return "medium";
    return "bad";
  };

  const getTrendClass = (trend) => {
    if (trend === "bullish") return "green";
    if (trend === "bearish") return "red";
    return "muted";
  };

  const getMonteCarloMessage = (mc) => {
    if (!mc) return "";

    if (
      mc.probability_of_loss_percent <= 5 &&
      mc.worst_max_drawdown_percent <= 25
    ) {
      return "Risk outlook looks acceptable if the assumed win rate is realistic. The strategy still needs discipline and consistent execution.";
    }

    if (
      mc.probability_of_loss_percent <= 20 &&
      mc.worst_max_drawdown_percent <= 40
    ) {
      return "Risk outlook is moderate. The trader should expect drawdowns and should avoid increasing lot size after losses.";
    }

    return "Risk outlook is high. Consider reducing risk, skipping the setup, or waiting for a cleaner trade.";
  };

  const renderStat = (label, value, extraClass = "") => (
    <div className="stat-card">
      <span>{label}</span>
      <strong className={extraClass}>{value ?? "-"}</strong>
    </div>
  );

  const DashboardPage = () => (
    <>
      <section className="hero">
        <div className="hero-content">
          <p className="eyebrow">Forex & gold advisory system</p>
          <h1>Trade cleaner. Size smarter. Avoid weak setups.</h1>
          <p>
            A polished decision-support dashboard for forex and gold traders,
            combining trend analysis, risk-based lot sizing, saved trades, and
            Monte Carlo risk simulation.
          </p>

          <div className="hero-actions">
            <button className="primary-btn" onClick={() => setActivePage("assistant")}>
              Open Assistant
            </button>
            <button className="ghost-btn" onClick={() => setActivePage("journal")}>
              View Saved Trades
            </button>
          </div>
        </div>

        <div className="hero-visual">
          <div className="orb"></div>

          <div className="floating-card card-a">
            <span>Markets</span>
            <strong>Forex + Gold</strong>
          </div>

          <div className="floating-card card-b">
            <span>Risk Engine</span>
            <strong>Lot Size + MC</strong>
          </div>
        </div>
      </section>

      <section className="quick-stats">
        {renderStat("Saved Trades", journal.length)}
        {renderStat("Default Risk", `${riskPercent}%`)}
        {renderStat("Expected Win Rate", `${winRate}%`)}
        {renderStat("Markets", "Forex + Gold", "gold-text")}
      </section>
    </>
  );

  const AssistantPage = () => (
    <>
      <div className="section-heading">
        <p className="eyebrow">Trading assistant</p>
        <h1>Generate a trade setup</h1>
        <p>
          Select a market, define your account size and risk, then let the
          assistant generate a risk-controlled setup.
        </p>
      </div>

      <div className="input-panel">
        <label>
          Market
          <select value={pair} onChange={(e) => setPair(e.target.value)}>
            {markets.map((market) => (
              <option key={market.value} value={market.value}>
                {market.label}
              </option>
            ))}
          </select>
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
          Expected Win Rate %
          <input
            type="number"
            value={winRate}
            onChange={(e) => setWinRate(Number(e.target.value))}
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
          <button
            className="primary-btn"
            onClick={getSuggestion}
            disabled={loadingSuggestion || loadingMonteCarlo}
          >
            {loadingSuggestion ? "Analyzing Market..." : "Suggest Trade"}
          </button>
        </div>
      </div>

      {error && <div className="error-box">{error}</div>}

      {loadingMonteCarlo && (
        <div className="glass-card pulse">Running risk simulation...</div>
      )}

      {monteCarlo && (
        <div className="result-section">
          <div className="section-heading compact">
            <p className="eyebrow">Monte Carlo Simulation</p>
            <h2>Risk Outlook</h2>
            <p>{getMonteCarloMessage(monteCarlo)}</p>
          </div>

          <div className="grid stats-grid">
            {renderStat("Average Ending Balance", monteCarlo.average_ending_balance)}
            {renderStat("Worst Ending Balance", monteCarlo.worst_ending_balance)}
            {renderStat("Best Ending Balance", monteCarlo.best_ending_balance)}
            {renderStat("Probability of Loss", `${monteCarlo.probability_of_loss_percent}%`)}
            {renderStat("Worst Drawdown", `${monteCarlo.worst_max_drawdown_percent}%`)}
          </div>
        </div>
      )}

      {suggestion && (
        <div className="result-section">
          <div className="trade-layout">
            <div className="trade-main-card">
              <div className="card-title-row">
                <div>
                  <p className="eyebrow">
                    {selectedMarket?.type || "Market"} setup
                  </p>
                  <h2>{selectedMarket?.label || suggestion.pair}</h2>
                </div>

                <span className={`verdict-pill ${getVerdictClass(suggestion.verdict)}`}>
                  {suggestion.verdict}
                </span>
              </div>

              <div className="price-line">
                <span>Current Price</span>
                <strong>{suggestion.price}</strong>
              </div>

              <div className="grid stats-grid">
                {renderStat("Trend", suggestion.trend, getTrendClass(suggestion.trend))}
                {renderStat("Session", suggestion.session)}
                {renderStat("Market State", suggestion.choppy_market ? "Choppy" : "Clean")}
                {renderStat("Score", suggestion.score)}
                {renderStat("Quality", suggestion.quality)}
                {renderStat("Risk / Reward", suggestion.risk_reward_ratio)}
              </div>

              <div className="trade-map">
                <div>
                  <span>Entry</span>
                  <strong>{suggestion.suggested_entry_price}</strong>
                </div>

                <div>
                  <span>Stop Loss</span>
                  <strong>{suggestion.suggested_stop_loss_price}</strong>
                </div>

                <div>
                  <span>Take Profit</span>
                  <strong>{suggestion.suggested_take_profit_price}</strong>
                </div>
              </div>
            </div>

            <div className="side-stack">
              <div className="glass-card">
                <p className="eyebrow">Position size</p>
                <div className="lot-big">{suggestion.standard_lots}</div>
                <span>Standard lots</span>

                <div className="mini-grid">
                  {renderStat("Mini Lots", suggestion.mini_lots)}
                  {renderStat("Micro Lots", suggestion.micro_lots)}
                  {renderStat("Units", suggestion.units)}
                  {renderStat("Risk Amount", suggestion.risk_amount)}
                </div>
              </div>

              <div className="glass-card">
                <p className="eyebrow">Coach action</p>
                <h3>{suggestion.coach_action}</h3>
                <p className="coach-note">
                  The assistant gives a conservative signal based on trend,
                  structure, session, and risk.
                </p>
              </div>

              <button className="primary-btn" onClick={saveTrade}>
                Save Trade
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );

  const JournalPage = () => (
    <>
      <div className="section-heading">
        <p className="eyebrow">Saved trades</p>
        <h1>Trade Journal</h1>
        <p>
          Review trades saved from the assistant and compare quality, risk,
          position size, and market conditions.
        </p>
      </div>

      <button className="secondary-btn refresh-btn" onClick={fetchJournal}>
        {loadingJournal ? "Loading..." : "Refresh Saved Trades"}
      </button>

      {journal.length === 0 ? (
        <div className="empty-state">
          <h2>No saved trades yet</h2>
          <p>Save a trade from the assistant and it will appear here.</p>
        </div>
      ) : (
        <div className="journal-grid">
          {journal.map((trade, index) => (
            <div className="journal-card" key={index}>
              <div className="card-title-row">
                <div>
                  <p className="eyebrow">
                    {trade.saved_at || `Trade ${index + 1}`}
                  </p>
                  <h3>{trade.market_label || trade.pair}</h3>
                </div>

                <span className={`verdict-pill ${getVerdictClass(trade.verdict)}`}>
                  {trade.verdict}
                </span>
              </div>

              <div className="mini-grid">
                {renderStat("Trend", trade.trend)}
                {renderStat("Score", trade.score)}
                {renderStat("R/R", trade.risk_reward_ratio)}
                {renderStat("Lots", trade.standard_lots)}
                {renderStat("Risk", trade.risk_amount)}
                {renderStat("Session", trade.session)}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );

  const AboutPage = () => (
    <div className="about-card">
      <p className="eyebrow">About the platform</p>
      <h1>How this assistant works</h1>

      <p>
        This app supports major forex pairs and gold. It analyzes the selected
        market using moving averages, identifies trend quality, checks whether
        conditions are choppy, calculates position size, and runs a Monte Carlo
        simulation to estimate risk over many possible trade outcomes.
      </p>

      <p>
        It is a decision-support tool. It does not execute trades automatically
        and it does not guarantee profit. Demo testing is strongly recommended
        before using it with real money.
      </p>
    </div>
  );

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="logo">
          <div className="logo-cube">FX</div>
          <div>
            <strong>Forex Assistant</strong>
            <span>Forex + Gold</span>
          </div>
        </div>

        <nav>
          <button
            className={activePage === "dashboard" ? "active" : ""}
            onClick={() => setActivePage("dashboard")}
          >
            Dashboard
          </button>

          <button
            className={activePage === "assistant" ? "active" : ""}
            onClick={() => setActivePage("assistant")}
          >
            Trade Assistant
          </button>

          <button
            className={activePage === "journal" ? "active" : ""}
            onClick={() => setActivePage("journal")}
          >
            Saved Trades
          </button>

          <button
            className={activePage === "about" ? "active" : ""}
            onClick={() => setActivePage("about")}
          >
            About
          </button>
        </nav>
      </aside>

      <main className="main-content">
        {activePage === "dashboard" && <DashboardPage />}
        {activePage === "assistant" && <AssistantPage />}
        {activePage === "journal" && <JournalPage />}
        {activePage === "about" && <AboutPage />}
      </main>
    </div>
  );
}

export default App;