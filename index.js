const express = require("express");
const cors = require("cors");
const cron = require("node-cron");
const path = require("path");
const { PORT, FIAT_CURRENCIES, REFRESH_CRON } = require("./src/config");
const { fetchAllRates: fetchBinanceRates } = require("./src/binanceP2P");
const { fetchAllRates: fetchBybitRates } = require("./src/bybitP2P");
const binanceCache = require("./src/cache");
const bybitCache = require("./src/bybitCache");
const binanceRoutes = require("./src/routes");
const bybitRoutes = require("./src/bybitRoutes");

const app = express();

app.use(cors());
app.use(express.json());

// Serve dashboard static files
app.use(express.static(path.join(__dirname, "public")));

// API routes
app.use("/api", binanceRoutes);
app.use("/api/bybit", bybitRoutes);

// API docs endpoint
app.get("/api", (req, res) => {
  res.json({
    name: "P2P Auditor API",
    version: "2.0.0",
    description: "Real-time USDT P2P exchange rates from Binance & Bybit",
    binance: {
      "GET /api/rate/:fiat": "Binance USDT rate for a fiat",
      "GET /api/rates": "All Binance cached rates",
      "GET /api/summary": "Binance rates summary",
      "GET /api/health": "Binance health check",
    },
    bybit: {
      "GET /api/bybit/rate/:fiat": "Bybit USDT rate for a fiat",
      "GET /api/bybit/rates": "All Bybit cached rates",
      "GET /api/bybit/summary": "Bybit rates summary",
      "GET /api/bybit/health": "Bybit health check",
    },
    shared: {
      "GET /api/currencies": "List all supported fiat currencies",
      "GET /api/rates/refresh": "Force refresh Binance rates",
      "GET /api/bybit/rates/refresh": "Force refresh Bybit rates",
    },
  });
});

// Initial data load
async function initialLoad() {
  console.log(`Loading Binance rates for ${FIAT_CURRENCIES.length} currencies...`);
  const startBinance = Date.now();
  const binance = await fetchBinanceRates(FIAT_CURRENCIES);
  for (const [fiat, rate] of Object.entries(binance.results)) binanceCache.set(fiat, rate);
  binanceCache.setLastRefresh();
  console.log(`Binance: ${Object.keys(binance.results).length} rates in ${((Date.now() - startBinance) / 1000).toFixed(1)}s`);

  console.log(`Loading Bybit rates for ${FIAT_CURRENCIES.length} currencies...`);
  const startBybit = Date.now();
  const bybit = await fetchBybitRates(FIAT_CURRENCIES);
  for (const [fiat, rate] of Object.entries(bybit.results)) bybitCache.set(fiat, rate);
  bybitCache.setLastRefresh();
  console.log(`Bybit: ${Object.keys(bybit.results).length} rates in ${((Date.now() - startBybit) / 1000).toFixed(1)}s`);
}

// Background refresh
cron.schedule(REFRESH_CRON, async () => {
  const ts = new Date().toISOString();

  console.log(`[${ts}] Binance refresh starting...`);
  const binance = await fetchBinanceRates(FIAT_CURRENCIES);
  for (const [fiat, rate] of Object.entries(binance.results)) binanceCache.set(fiat, rate);
  binanceCache.setLastRefresh();
  console.log(`[${ts}] Binance: ${Object.keys(binance.results).length} rates, ${binance.errors.length} errors`);

  console.log(`[${ts}] Bybit refresh starting...`);
  const bybit = await fetchBybitRates(FIAT_CURRENCIES);
  for (const [fiat, rate] of Object.entries(bybit.results)) bybitCache.set(fiat, rate);
  bybitCache.setLastRefresh();
  console.log(`[${ts}] Bybit: ${Object.keys(bybit.results).length} rates, ${bybit.errors.length} errors`);
});

// Start server
app.listen(PORT, async () => {
  console.log(`P2P Auditor API running on http://localhost:${PORT}`);
  await initialLoad();
  console.log("Ready to serve requests!");
});
