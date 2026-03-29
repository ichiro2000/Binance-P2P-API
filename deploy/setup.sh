#!/bin/bash
set -e

echo "=========================================="
echo "  Binance P2P API - DigitalOcean Setup"
echo "=========================================="

APP_DIR="/opt/binance-p2p-api"

# 1. Update system
echo "[1/7] Updating system packages..."
apt-get update -qq && apt-get upgrade -y -qq

# 2. Install Node.js 20 LTS
echo "[2/7] Installing Node.js 20..."
if ! command -v node &> /dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y -qq nodejs
fi
echo "Node.js $(node -v) installed"

# 3. Install PM2
echo "[3/7] Installing PM2..."
npm install -g pm2 --silent

# 4. Create app directory
echo "[4/7] Creating application files..."
mkdir -p $APP_DIR/src
mkdir -p /var/log/binance-p2p-api

# --- Write all project files ---

cat > $APP_DIR/package.json << 'FILEOF'
{
  "name": "binance-p2p-api",
  "version": "1.0.0",
  "description": "Real-time USDT P2P exchange rates from Binance for all supported fiat currencies",
  "main": "index.js",
  "scripts": {
    "start": "node index.js"
  },
  "license": "ISC",
  "type": "commonjs",
  "dependencies": {
    "cors": "^2.8.6",
    "express": "^5.2.1",
    "node-cron": "^4.2.1"
  }
}
FILEOF

cat > $APP_DIR/src/config.js << 'FILEOF'
const FIAT_CURRENCIES = [
  "AED", "ARS", "AUD", "BDT", "BHD", "BOB", "BRL", "CAD", "CLP", "CNY",
  "COP", "CRC", "CZK", "DOP", "DZD", "EGP", "EUR", "GBP", "GEL", "GHS",
  "HKD", "HNL", "IDR", "INR", "IQD", "JOD", "JPY", "KES", "KHR", "KRW",
  "KWD", "KZT", "LAK", "LBP", "LKR", "MAD", "MMK", "MXN", "MYR", "NGN",
  "NIO", "NOK", "NPR", "OMR", "PAB", "PEN", "PHP", "PKR", "PLN", "PYG",
  "QAR", "RON", "RUB", "SAR", "SDG", "SEK", "SGD", "THB", "TND", "TRY",
  "TWD", "TZS", "UAH", "UGX", "USD", "UYU", "UZS", "VES", "VND", "ZAR"
];

const BINANCE_P2P_API = "https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search";
const ADS_TO_FETCH = 10;
const CACHE_TTL = 5 * 60 * 1000;
const REQUEST_DELAY = 300;
const PORT = process.env.PORT || 3000;
const REFRESH_CRON = "*/5 * * * *";

module.exports = {
  FIAT_CURRENCIES, BINANCE_P2P_API, ADS_TO_FETCH,
  CACHE_TTL, REQUEST_DELAY, PORT, REFRESH_CRON,
};
FILEOF

cat > $APP_DIR/src/binanceP2P.js << 'FILEOF'
const { BINANCE_P2P_API, ADS_TO_FETCH, REQUEST_DELAY } = require("./config");

async function fetchAds(fiat, tradeType, asset = "USDT") {
  const body = {
    page: 1, rows: ADS_TO_FETCH, payTypes: [], asset, tradeType, fiat,
    publisherType: null, merchantCheck: false, transAmount: "",
    countries: [], proMerchantAds: false, shieldMerchantAds: false,
  };
  const response = await fetch(BINANCE_P2P_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Binance API returned ${response.status} for ${fiat} ${tradeType}`);
  const json = await response.json();
  if (json.code !== "000000" || !json.data) throw new Error(`Binance API error for ${fiat}: ${json.message || "Unknown error"}`);
  return json.data;
}

function parseAd(ad) {
  return {
    price: parseFloat(ad.adv.price),
    available: parseFloat(ad.adv.surplusAmount),
    minOrder: parseFloat(ad.adv.minSingleTransAmount),
    maxOrder: parseFloat(ad.adv.maxSingleTransAmount),
    advertiser: ad.advertiser.nickName,
    orders: ad.advertiser.monthOrderCount,
    completionRate: ad.advertiser.monthFinishRate,
    paymentMethods: ad.adv.tradeMethods.map((m) => m.tradeMethodName),
  };
}

function calculateStats(ads) {
  if (!ads || ads.length === 0) return null;
  const parsed = ads.map(parseAd);
  const prices = parsed.map((a) => a.price);
  const sum = prices.reduce((a, b) => a + b, 0);
  const avg = sum / prices.length;
  const totalAvailable = parsed.reduce((a, b) => a + b.available, 0);
  const weightedAvg = totalAvailable > 0
    ? parsed.reduce((acc, ad) => acc + ad.price * (ad.available / totalAvailable), 0) : avg;
  const sorted = [...prices].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return {
    average: parseFloat(avg.toFixed(4)), weightedAverage: parseFloat(weightedAvg.toFixed(4)),
    median: parseFloat(median.toFixed(4)), best: prices[0], worst: prices[prices.length - 1],
    min: Math.min(...prices), max: Math.max(...prices),
    spread: parseFloat((Math.max(...prices) - Math.min(...prices)).toFixed(4)),
    adsCount: ads.length, ads: parsed,
  };
}

async function fetchRateForFiat(fiat, asset = "USDT") {
  const [buyAds, sellAds] = await Promise.all([
    fetchAds(fiat, "BUY", asset).catch(() => []),
    fetchAds(fiat, "SELL", asset).catch(() => []),
  ]);
  const buyStats = calculateStats(buyAds);
  const sellStats = calculateStats(sellAds);
  if (!buyStats && !sellStats) return null;
  return {
    fiat, asset, buy: buyStats, sell: sellStats,
    summary: {
      buyAverage: buyStats?.average || null, sellAverage: sellStats?.average || null,
      buyWeightedAvg: buyStats?.weightedAverage || null, sellWeightedAvg: sellStats?.weightedAverage || null,
      midRate: buyStats && sellStats ? parseFloat(((buyStats.average + sellStats.average) / 2).toFixed(4)) : null,
      spreadPercent: buyStats && sellStats
        ? parseFloat((((buyStats.average - sellStats.average) / sellStats.average) * 100).toFixed(4)) : null,
    },
    updatedAt: new Date().toISOString(),
  };
}

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function fetchAllRates(fiats, asset = "USDT") {
  const results = {};
  const errors = [];
  for (const fiat of fiats) {
    try {
      const rate = await fetchRateForFiat(fiat, asset);
      if (rate) results[fiat] = rate;
    } catch (err) { errors.push({ fiat, error: err.message }); }
    await sleep(REQUEST_DELAY);
  }
  return { results, errors };
}

module.exports = { fetchAds, fetchRateForFiat, fetchAllRates, calculateStats };
FILEOF

cat > $APP_DIR/src/cache.js << 'FILEOF'
const { CACHE_TTL } = require("./config");

class RateCache {
  constructor() { this.store = new Map(); this.lastFullRefresh = null; }
  set(key, value) { this.store.set(key, { data: value, timestamp: Date.now() }); }
  get(key) {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > CACHE_TTL) { this.store.delete(key); return null; }
    return entry.data;
  }
  getAll() {
    const result = {};
    for (const [key, entry] of this.store) {
      if (Date.now() - entry.timestamp <= CACHE_TTL) result[key] = entry.data;
    }
    return result;
  }
  setLastRefresh() { this.lastFullRefresh = new Date().toISOString(); }
  getLastRefresh() { return this.lastFullRefresh; }
  size() { return this.store.size; }
  clear() { this.store.clear(); }
}

module.exports = new RateCache();
FILEOF

cat > $APP_DIR/src/routes.js << 'FILEOF'
const express = require("express");
const { FIAT_CURRENCIES } = require("./config");
const { fetchRateForFiat, fetchAllRates } = require("./binanceP2P");
const cache = require("./cache");

const router = express.Router();

router.get("/rate/:fiat", async (req, res) => {
  const fiat = req.params.fiat.toUpperCase();
  if (!FIAT_CURRENCIES.includes(fiat)) {
    return res.status(400).json({ success: false, error: `Unsupported fiat currency: ${fiat}`, supported: FIAT_CURRENCIES });
  }
  const cached = cache.get(fiat);
  if (cached) return res.json({ success: true, cached: true, data: cached });
  try {
    const rate = await fetchRateForFiat(fiat);
    if (!rate) return res.status(404).json({ success: false, error: `No P2P ads found for USDT/${fiat}` });
    cache.set(fiat, rate);
    return res.json({ success: true, cached: false, data: rate });
  } catch (err) { return res.status(500).json({ success: false, error: err.message }); }
});

router.get("/rates", (req, res) => {
  const allRates = cache.getAll();
  return res.json({ success: true, count: Object.keys(allRates).length, lastFullRefresh: cache.getLastRefresh(), data: allRates });
});

router.get("/rates/refresh", async (req, res) => {
  try {
    const { results, errors } = await fetchAllRates(FIAT_CURRENCIES);
    for (const [fiat, rate] of Object.entries(results)) cache.set(fiat, rate);
    cache.setLastRefresh();
    return res.json({ success: true, count: Object.keys(results).length, errors: errors.length > 0 ? errors : undefined, data: results });
  } catch (err) { return res.status(500).json({ success: false, error: err.message }); }
});

router.get("/summary", (req, res) => {
  const allRates = cache.getAll();
  const summary = {};
  for (const [fiat, rate] of Object.entries(allRates)) {
    summary[fiat] = {
      buyAverage: rate.summary.buyAverage, sellAverage: rate.summary.sellAverage,
      midRate: rate.summary.midRate, spreadPercent: rate.summary.spreadPercent, updatedAt: rate.updatedAt,
    };
  }
  return res.json({ success: true, count: Object.keys(summary).length, lastFullRefresh: cache.getLastRefresh(), data: summary });
});

router.get("/currencies", (req, res) => {
  return res.json({ success: true, count: FIAT_CURRENCIES.length, currencies: FIAT_CURRENCIES });
});

router.get("/health", (req, res) => {
  return res.json({ status: "ok", cachedCurrencies: cache.size(), lastFullRefresh: cache.getLastRefresh(), uptime: process.uptime() });
});

module.exports = router;
FILEOF

cat > $APP_DIR/index.js << 'FILEOF'
const express = require("express");
const cors = require("cors");
const cron = require("node-cron");
const { PORT, FIAT_CURRENCIES, REFRESH_CRON } = require("./src/config");
const { fetchAllRates } = require("./src/binanceP2P");
const cache = require("./src/cache");
const routes = require("./src/routes");

const app = express();
app.use(cors());
app.use(express.json());
app.use("/api", routes);

app.get("/", (req, res) => {
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

async function initialLoad() {
  console.log(`Loading initial rates for ${FIAT_CURRENCIES.length} currencies...`);
  const startTime = Date.now();
  const { results, errors } = await fetchAllRates(FIAT_CURRENCIES);
  for (const [fiat, rate] of Object.entries(results)) cache.set(fiat, rate);
  cache.setLastRefresh();
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`Loaded ${Object.keys(results).length} rates in ${elapsed}s`);
  if (errors.length > 0) console.log(`Failed for ${errors.length} currencies:`, errors.map((e) => e.fiat).join(", "));
}

cron.schedule(REFRESH_CRON, async () => {
  console.log(`[${new Date().toISOString()}] Background refresh starting...`);
  const { results, errors } = await fetchAllRates(FIAT_CURRENCIES);
  for (const [fiat, rate] of Object.entries(results)) cache.set(fiat, rate);
  cache.setLastRefresh();
  console.log(`[${new Date().toISOString()}] Refreshed ${Object.keys(results).length} rates, ${errors.length} errors`);
});

app.listen(PORT, async () => {
  console.log(`Binance P2P Rate API running on http://localhost:${PORT}`);
  await initialLoad();
  console.log("Ready to serve requests!");
});
FILEOF

cat > $APP_DIR/ecosystem.config.js << 'FILEOF'
module.exports = {
  apps: [{
    name: "binance-p2p-api",
    script: "index.js",
    cwd: "/opt/binance-p2p-api",
    env: { NODE_ENV: "production", PORT: 3000 },
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: "400M",
    log_date_format: "YYYY-MM-DD HH:mm:ss",
    error_file: "/var/log/binance-p2p-api/error.log",
    out_file: "/var/log/binance-p2p-api/out.log",
    merge_logs: true,
  }],
};
FILEOF

# 5. Install dependencies
echo "[5/7] Installing Node.js dependencies..."
cd $APP_DIR && npm install --production --silent

# 6. Configure firewall
echo "[6/7] Configuring firewall..."
ufw allow OpenSSH
ufw allow 3000
echo "y" | ufw enable

# 7. Start with PM2
echo "[7/7] Starting API with PM2..."
cd $APP_DIR
pm2 delete binance-p2p-api 2>/dev/null || true
pm2 start ecosystem.config.js
pm2 startup systemd -u root --hp /root
pm2 save

# Get public IP
PUBLIC_IP=$(curl -s ifconfig.me)

echo ""
echo "=========================================="
echo "  DEPLOYMENT COMPLETE!"
echo "=========================================="
echo ""
echo "  Your API is live at:"
echo ""
echo "  http://$PUBLIC_IP:3000"
echo "  http://$PUBLIC_IP:3000/api/rate/LKR"
echo "  http://$PUBLIC_IP:3000/api/summary"
echo "  http://$PUBLIC_IP:3000/api/health"
echo ""
echo "  Useful PM2 commands:"
echo "  pm2 status          - Check if running"
echo "  pm2 logs            - View live logs"
echo "  pm2 restart all     - Restart the API"
echo "  pm2 monit           - Monitor CPU/memory"
echo ""
echo "=========================================="
