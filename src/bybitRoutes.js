const express = require("express");
const { FIAT_CURRENCIES } = require("./config");
const { fetchRateForFiat, fetchAllRates } = require("./bybitP2P");
const cache = require("./bybitCache");

const router = express.Router();

// GET /api/bybit/rate/:fiat
router.get("/rate/:fiat", async (req, res) => {
  const fiat = req.params.fiat.toUpperCase();

  if (!FIAT_CURRENCIES.includes(fiat)) {
    return res.status(400).json({
      success: false,
      error: `Unsupported fiat currency: ${fiat}`,
    });
  }

  const cached = cache.get(fiat);
  if (cached) return res.json({ success: true, cached: true, data: cached });

  try {
    const rate = await fetchRateForFiat(fiat);
    if (!rate) {
      return res.status(404).json({ success: false, error: `No Bybit P2P ads found for USDT/${fiat}` });
    }
    cache.set(fiat, rate);
    return res.json({ success: true, cached: false, data: rate });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/bybit/rates
router.get("/rates", (req, res) => {
  const allRates = cache.getAll();
  return res.json({
    success: true,
    exchange: "bybit",
    count: Object.keys(allRates).length,
    lastFullRefresh: cache.getLastRefresh(),
    data: allRates,
  });
});

// GET /api/bybit/rates/refresh
router.get("/rates/refresh", async (req, res) => {
  try {
    const { results, errors } = await fetchAllRates(FIAT_CURRENCIES);
    for (const [fiat, rate] of Object.entries(results)) cache.set(fiat, rate);
    cache.setLastRefresh();
    return res.json({
      success: true,
      exchange: "bybit",
      count: Object.keys(results).length,
      errors: errors.length > 0 ? errors : undefined,
      data: results,
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/bybit/summary
router.get("/summary", (req, res) => {
  const allRates = cache.getAll();
  const summary = {};

  for (const [fiat, rate] of Object.entries(allRates)) {
    summary[fiat] = {
      buyAverage: rate.summary.buyAverage,
      sellAverage: rate.summary.sellAverage,
      midRate: rate.summary.midRate,
      spreadPercent: rate.summary.spreadPercent,
      updatedAt: rate.updatedAt,
    };
  }

  return res.json({
    success: true,
    exchange: "bybit",
    count: Object.keys(summary).length,
    lastFullRefresh: cache.getLastRefresh(),
    data: summary,
  });
});

// GET /api/bybit/health
router.get("/health", (req, res) => {
  return res.json({
    status: "ok",
    exchange: "bybit",
    cachedCurrencies: cache.size(),
    lastFullRefresh: cache.getLastRefresh(),
    uptime: process.uptime(),
  });
});

module.exports = router;
