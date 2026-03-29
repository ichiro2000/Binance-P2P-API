const express = require("express");
const cors = require("cors");
const cron = require("node-cron");
const path = require("path");
const { PORT, FIAT_CURRENCIES, REFRESH_CRON } = require("./src/config");
const { fetchAllRates } = require("./src/binanceP2P");
const cache = require("./src/cache");
const routes = require("./src/routes");

const app = express();

app.use(cors());
app.use(express.json());

// Serve dashboard static files
app.use(express.static(path.join(__dirname, "public")));

// API routes
app.use("/api", routes);

// API docs endpoint
app.get("/api", (req, res) => {
  res.json({
    name: "Binance P2P Rate API",
    version: "1.0.0",
    description: "Real-time USDT P2P exchange rates from Binance for all supported fiat currencies",
    endpoints: {
      "GET /api/rate/:fiat": "Get USDT rate for a specific fiat (e.g., /api/rate/LKR)",
      "GET /api/rates": "Get all cached rates",
      "GET /api/rates/refresh": "Force refresh all rates (slow)",
      "GET /api/summary": "Quick summary of all rates (averages only)",
      "GET /api/currencies": "List all supported fiat currencies",
      "GET /api/health": "Health check",
    },
  });
});

// Initial data load on startup
async function initialLoad() {
  console.log(`Loading initial rates for ${FIAT_CURRENCIES.length} currencies...`);
  const startTime = Date.now();

  const { results, errors } = await fetchAllRates(FIAT_CURRENCIES);

  for (const [fiat, rate] of Object.entries(results)) {
    cache.set(fiat, rate);
  }
  cache.setLastRefresh();

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`Loaded ${Object.keys(results).length} rates in ${elapsed}s`);

  if (errors.length > 0) {
    console.log(`Failed for ${errors.length} currencies:`, errors.map((e) => e.fiat).join(", "));
  }
}

// Background refresh every 5 minutes
cron.schedule(REFRESH_CRON, async () => {
  console.log(`[${new Date().toISOString()}] Background refresh starting...`);
  const { results, errors } = await fetchAllRates(FIAT_CURRENCIES);

  for (const [fiat, rate] of Object.entries(results)) {
    cache.set(fiat, rate);
  }
  cache.setLastRefresh();

  console.log(`[${new Date().toISOString()}] Refreshed ${Object.keys(results).length} rates, ${errors.length} errors`);
});

// Start server
app.listen(PORT, async () => {
  console.log(`Binance P2P Rate API running on http://localhost:${PORT}`);
  console.log(`API docs: http://localhost:${PORT}/`);
  await initialLoad();
  console.log("Ready to serve requests!");
});
