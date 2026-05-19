import { useEffect, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
} from "recharts";
import "./App.css";

const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
const LOCAL_JOURNAL_KEY = "forex_assistant_saved_trades";

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
  const [chartData, setChartData] = useState([]);

  const [loadingSuggestion, setLoadingSuggestion] = useState(false);
  const [loadingMonteCarlo, setLoadingMonteCarlo] = useState(false);
  const [loadingChart, setLoadingChart] = useState(false);
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

  useEffect(() => {
    const saved = localStorage.getItem(LOCAL_JOURNAL_KEY);
    if (saved) {
      try {
        setJournal(JSON.parse(saved));
      } catch {
        setJournal([]);
      }
    }
  }, []);

  const saveJournalToLocalStorage = (trades) => {
    localStorage.setItem(LOCAL_JOURNAL_KEY, JSON.stringify(trades));
    setJournal(trades);
  };

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

  const getChartData = async () => {
    setLoadingChart(true);
    setChartData([]);

    try {
      const response = await fetch(`${API_URL}/chart-data?pair=${pair}`);
      const data = await response.json();

      if (!response.ok || data.error) {
        return;
      }

      setChartData(data.data || []);
    } catch (err) {
      console.log(err);
    } finally {
      setLoadingChart(false);
    }
  };

  const getSuggestion = async () => {
    setLoadingSuggestion(true);
    setError("");
    setSuggestion(null);
    setMonteCarlo(null);
    setChartData([]);

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
      await getChartData();
    } catch (err) {
      setError(err.message || "Failed to fetch suggestion");
    } finally {
      setLoadingSuggestion(false);
    }
  };

  const saveTrade = () => {
    if (!suggestion) return;

    const tradeToSave = {
      ...suggestion,
      id: crypto.randomUUID(),
      market_label: selectedMarket?.label || pair,
      market_type: selectedMarket?.type || "Market",
      saved_at: new Date().toLocaleString(),
    };

    const updatedJournal = [tradeToSave, ...journal];
    saveJournalToLocalStorage(updatedJournal);

    alert("Trade saved successfully");
  };

  const deleteTrade = (id) => {
    const updatedJournal = journal.filter((trade) => trade.id !== id);
    saveJournalToLocalStorage(updatedJournal);
  };

  const clearJournal = () => {
    const confirmed = window.confirm("Are you sure you want to delete all saved trades?");
    if (!confirmed) return;

    saveJournalToLocalStorage([]);
  };

  const getJournalAnalytics = () => {
    const total = journal.length;

    if (total === 0) {
      return {
        total: 0,
        good: 0,
        possible: 0,
        avoided: 0,
        averageRR: 0,
        averageLots: 0,
      };
    }

    const good = journal.filter((t) => t.verdict === "good setup").length;
    const possible = journal.filter((t) => t.verdict === "possible setup").length;
    const avoided = journal.filter((t) => t.verdict === "avoid for now").length;

    const totalRR = journal.reduce(
      (sum, trade) => sum + Number(trade.risk_reward_ratio || 0),
      0
    );

    const totalLots = journal.reduce(
      (sum, trade) => sum + Number(trade.standard_lots || 0),
      0
    );

    return {
      total,
      good,
      possible,
      avoided,
      averageRR: (totalRR / total).toFixed(2),
      averageLots: (totalLots / total).toFixed(3),
    };
  };

  const analytics = getJournalAnalytics();

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

  const getNewsClass = (risk) => {
    if (risk === "high") return "red";
    return "green";
  };

  const getNewsMessage = (data) => {
    return data?.news_warning || "No major rule-based news risk detected right now.";
  };

  const getNewsRisk = (data) => {
    return data?.news_risk || "normal";
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

  const MarketChart = () => {
    if (loadingChart) {
      return <div className="glass-card pulse">Loading market chart...</div>;
    }

    if (!chartData || chartData.length === 0 || !suggestion) {
      return null;
    }

    return (
      <div
        className="glass-card"
        style={{
          marginTop: 24,
          height: 460,
          padding: 22,
        }}
      >
        <div className="card-title-row">
          <div>
            <p className="eyebrow">Market chart</p>
            <h3>{selectedMarket?.label || pair}</h3>
          </div>
          <span className="verdict-pill medium">EMA View</span>
        </div>

        <ResponsiveContainer width="100%" height="82%">
          <LineChart data={chartData}>
            <XAxis dataKey="time" hide />
            <YAxis domain={["auto", "auto"]} />
            <Tooltip
              contentStyle={{
                background: "#0f172a",
                border: "1px solid rgba(245, 197, 66, 0.25)",
                borderRadius: 12,
                color: "#ffffff",
              }}
            />

            <Line type="monotone" dataKey="close" stroke="#ffffff" dot={false} strokeWidth={2} />
            <Line type="monotone" dataKey="ema20" stroke="#f5c542" dot={false} strokeWidth={1.8} />
            <Line type="monotone" dataKey="ema50" stroke="#38bdf8" dot={false} strokeWidth={1.8} />
            <Line type="monotone" dataKey="ema200" stroke="#f87171" dot={false} strokeWidth={1.8} />

            <ReferenceLine y={suggestion.suggested_entry_price} stroke="#22c55e" label="Entry" />
            <ReferenceLine y={suggestion.suggested_stop_loss_price} stroke="#ef4444" label="SL" />
            <ReferenceLine y={suggestion.suggested_take_profit_price} stroke="#14b8a6" label="TP" />
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  };

  const DashboardPage = () => (
    <>
      <section className="hero">
        <div className="hero-content">
          <p className="eyebrow">Forex, gold & macro risk assistant</p>
          <h1>Trade cleaner. Size smarter. Avoid news traps.</h1>
          <p>
            A polished decision-support dashboard for forex and gold traders,
            combining trend analysis, risk-based lot sizing, saved trades,
            Monte Carlo simulation, macro-news risk filtering, and live market charts.
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
            <strong>Lot + Chart</strong>
          </div>
        </div>
      </section>

      <section className="quick-stats">
        {renderStat("Saved Trades", analytics.total)}
        {renderStat("Good Setups", analytics.good)}
        {renderStat("Average R/R", analytics.averageRR)}
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
          assistant generate a risk-controlled setup and show the chart.
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
          <button className="primary-btn" onClick={getSuggestion} disabled={loadingSuggestion || loadingMonteCarlo}>
            {loadingSuggestion ? "Analyzing Market..." : "Suggest Trade"}
          </button>
        </div>
      </div>

      {error && <div className="error-box">{error}</div>}

      {loadingMonteCarlo && <div className="glass-card pulse">Running risk simulation...</div>}

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
                  <p className="eyebrow">{selectedMarket?.type || "Market"} setup</p>
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
                {renderStat("News Risk", getNewsRisk(suggestion), getNewsClass(getNewsRisk(suggestion)))}
                {renderStat("Score", suggestion.score)}
                {renderStat("Quality", suggestion.quality)}
                {renderStat("Risk / Reward", suggestion.risk_reward_ratio)}
              </div>

              <div className={`news-box ${getNewsRisk(suggestion) === "high" ? "news-high" : "news-normal"}`}>
                <strong>Macro News Filter:</strong> {getNewsMessage(suggestion)}
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

              <MarketChart />
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
                <ul className="coach-list">
                  {(suggestion.coach_feedback || []).map((item, index) => (
                    <li key={index}>{item}</li>
                  ))}
                </ul>
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
        <h1>Trade Journal 2.0</h1>
        <p>
          Saved trades are stored in your browser, so they remain available even
          if the backend restarts.
        </p>
      </div>

      <section className="quick-stats">
        {renderStat("Total Trades", analytics.total)}
        {renderStat("Good Setups", analytics.good)}
        {renderStat("Possible Setups", analytics.possible)}
        {renderStat("Avoided Trades", analytics.avoided)}
        {renderStat("Average R/R", analytics.averageRR)}
        {renderStat("Average Lot Size", analytics.averageLots)}
      </section>

      <div className="hero-actions">
        <button className="secondary-btn" onClick={clearJournal}>
          Clear Journal
        </button>
      </div>

      {journal.length === 0 ? (
        <div className="empty-state">
          <h2>No saved trades yet</h2>
          <p>Save a trade from the assistant and it will appear here.</p>
        </div>
      ) : (
        <div className="journal-grid">
          {journal.map((trade, index) => (
            <div className="journal-card" key={trade.id || index}>
              <div className="card-title-row">
                <div>
                  <p className="eyebrow">{trade.saved_at || `Trade ${index + 1}`}</p>
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
                {renderStat("News Risk", trade.news_risk || "normal")}
              </div>

              <button className="secondary-btn refresh-btn" onClick={() => deleteTrade(trade.id)}>
                Delete Trade
              </button>
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
        market using moving averages, checks whether conditions are choppy,
        calculates position size, runs Monte Carlo simulation, and now displays
        a live market chart with EMA lines and trade levels.
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
          <button className={activePage === "dashboard" ? "active" : ""} onClick={() => setActivePage("dashboard")}>
            Dashboard
          </button>

          <button className={activePage === "assistant" ? "active" : ""} onClick={() => setActivePage("assistant")}>
            Trade Assistant
          </button>

          <button className={activePage === "journal" ? "active" : ""} onClick={() => setActivePage("journal")}>
            Saved Trades
          </button>

          <button className={activePage === "about" ? "active" : ""} onClick={() => setActivePage("about")}>
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