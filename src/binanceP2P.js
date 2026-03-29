const { BINANCE_P2P_API, ADS_TO_FETCH, REQUEST_DELAY } = require("./config");

/**
 * Fetch P2P ads from Binance for a given fiat currency and trade type.
 * @param {string} fiat - Fiat currency code (e.g., "LKR")
 * @param {string} tradeType - "BUY" or "SELL"
 * @param {string} asset - Crypto asset (default: "USDT")
 * @returns {Promise<Array>} Array of ad objects
 */
async function fetchAds(fiat, tradeType, asset = "USDT") {
  const body = {
    page: 1,
    rows: ADS_TO_FETCH,
    payTypes: [],
    asset,
    tradeType,
    fiat,
    publisherType: "merchant",
    merchantCheck: true,
    transAmount: "",
    countries: [],
    proMerchantAds: false,
    shieldMerchantAds: false,
  };

  const response = await fetch(BINANCE_P2P_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Binance API returned ${response.status} for ${fiat} ${tradeType}`);
  }

  const json = await response.json();

  if (json.code !== "000000" || !json.data) {
    throw new Error(`Binance API error for ${fiat}: ${json.message || "Unknown error"}`);
  }

  return json.data;
}

/**
 * Parse ad data into a simplified format
 */
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

/**
 * Calculate price statistics from a list of ads
 */
function calculateStats(ads) {
  if (!ads || ads.length === 0) {
    return null;
  }

  const parsed = ads.map(parseAd);
  const prices = parsed.map((a) => a.price);

  const sum = prices.reduce((a, b) => a + b, 0);
  const avg = sum / prices.length;

  // Weighted average by available amount (more weight to larger orders)
  const totalAvailable = parsed.reduce((a, b) => a + b.available, 0);
  const weightedAvg = totalAvailable > 0
    ? parsed.reduce((acc, ad) => acc + ad.price * (ad.available / totalAvailable), 0)
    : avg;

  // Median
  const sorted = [...prices].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;

  return {
    average: parseFloat(avg.toFixed(4)),
    weightedAverage: parseFloat(weightedAvg.toFixed(4)),
    median: parseFloat(median.toFixed(4)),
    best: prices[0],
    worst: prices[prices.length - 1],
    min: Math.min(...prices),
    max: Math.max(...prices),
    spread: parseFloat((Math.max(...prices) - Math.min(...prices)).toFixed(4)),
    adsCount: ads.length,
    ads: parsed,
  };
}

/**
 * Fetch full rate data for a single fiat currency
 */
async function fetchRateForFiat(fiat, asset = "USDT") {
  const [buyAds, sellAds] = await Promise.all([
    fetchAds(fiat, "BUY", asset).catch(() => []),
    fetchAds(fiat, "SELL", asset).catch(() => []),
  ]);

  const buyStats = calculateStats(buyAds);
  const sellStats = calculateStats(sellAds);

  if (!buyStats && !sellStats) {
    return null;
  }

  return {
    fiat,
    asset,
    buy: buyStats,
    sell: sellStats,
    summary: {
      buyAverage: buyStats?.average || null,
      sellAverage: sellStats?.average || null,
      buyWeightedAvg: buyStats?.weightedAverage || null,
      sellWeightedAvg: sellStats?.weightedAverage || null,
      midRate: buyStats && sellStats
        ? parseFloat(((buyStats.average + sellStats.average) / 2).toFixed(4))
        : null,
      spreadPercent: buyStats && sellStats
        ? parseFloat((((buyStats.average - sellStats.average) / sellStats.average) * 100).toFixed(4))
        : null,
    },
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Sleep helper
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch rates for all fiat currencies (with rate limiting)
 */
async function fetchAllRates(fiats, asset = "USDT") {
  const results = {};
  const errors = [];

  for (const fiat of fiats) {
    try {
      const rate = await fetchRateForFiat(fiat, asset);
      if (rate) {
        results[fiat] = rate;
      }
    } catch (err) {
      errors.push({ fiat, error: err.message });
    }
    await sleep(REQUEST_DELAY);
  }

  return { results, errors };
}

module.exports = {
  fetchAds,
  fetchRateForFiat,
  fetchAllRates,
  calculateStats,
};
