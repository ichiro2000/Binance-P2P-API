const express = require("express");
const { FIAT_CURRENCIES } = require("./config");
const { fetchRateForFiat, fetchAllRates } = require("./binanceP2P");
const cache = require("./cache");

const router = express.Router();

// GET /api/rate/:fiat - Get USDT rate for a specific fiat currency
router.get("/rate/:fiat", async (req, res) => {
  const fiat = req.params.fiat.toUpperCase();

  if (!FIAT_CURRENCIES.includes(fiat)) {
    return res.status(400).json({
      success: false,
      error: `Unsupported fiat currency: ${fiat}`,
      supported: FIAT_CURRENCIES,
    });
  }

  // Check cache first
  const cached = cache.get(fiat);
  if (cached) {
    return res.json({
      success: true,
      cached: true,
      data: cached,
    });
  }

  try {
    const rate = await fetchRateForFiat(fiat);
    if (!rate) {
      return res.status(404).json({
        success: false,
        error: `No P2P ads found for USDT/${fiat}`,
      });
    }
    cache.set(fiat, rate);
    return res.json({
      success: true,
      cached: false,
      data: rate,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

// GET /api/rates - Get all cached rates (fast, returns whatever is in cache)
router.get("/rates", (req, res) => {
  const allRates = cache.getAll();
  const currencies = Object.keys(allRates);

  return res.json({
    success: true,
    count: currencies.length,
    lastFullRefresh: cache.getLastRefresh(),
    data: allRates,
  });
});

// GET /api/rates/refresh - Force refresh all rates (slow, ~20s for all currencies)
router.get("/rates/refresh", async (req, res) => {
  try {
    const { results, errors } = await fetchAllRates(FIAT_CURRENCIES);
    for (const [fiat, rate] of Object.entries(results)) {
      cache.set(fiat, rate);
    }
    cache.setLastRefresh();

    return res.json({
      success: true,
      count: Object.keys(results).length,
      errors: errors.length > 0 ? errors : undefined,
      data: results,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

// GET /api/summary - Quick summary of all rates (just averages)
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
    count: Object.keys(summary).length,
    lastFullRefresh: cache.getLastRefresh(),
    data: summary,
  });
});

// GET /api/currencies - List all supported fiat currencies
router.get("/currencies", (req, res) => {
  return res.json({
    success: true,
    count: FIAT_CURRENCIES.length,
    currencies: FIAT_CURRENCIES,
  });
});

// GET /api/health - Health check
router.get("/health", (req, res) => {
  return res.json({
    status: "ok",
    cachedCurrencies: cache.size(),
    lastFullRefresh: cache.getLastRefresh(),
    uptime: process.uptime(),
  });
});

module.exports = router;
