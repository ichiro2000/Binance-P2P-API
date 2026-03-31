const { ADS_TO_FETCH, REQUEST_DELAY } = require("./config");

const BYBIT_P2P_API = "https://api2.bybit.com/fiat/otc/item/online";

/**
 * Fetch P2P ads from Bybit for a given fiat currency and trade type.
 * @param {string} fiat - Fiat currency code (e.g., "LKR")
 * @param {string} side - "1" = Buy, "0" = Sell
 * @param {string} asset - Crypto asset (default: "USDT")
 * @returns {Promise<Array>} Array of ad objects
 */
async function fetchAds(fiat, side, asset = "USDT") {
  const body = {
    tokenId: asset,
    currencyId: fiat,
    side: side,
    payment: [],
    amount: "",
    page: "1",
    size: String(ADS_TO_FETCH),
  };

  const response = await fetch(BYBIT_P2P_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      "Origin": "https://www.bybit.com",
      "Referer": "https://www.bybit.com/",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Bybit API returned ${response.status} for ${fiat} side=${side}`);
  }

  const json = await response.json();

  if (json.ret_code !== 0 || !json.result || !json.result.items) {
    throw new Error(`Bybit API error for ${fiat}: ${json.ret_msg || "Unknown error"}`);
  }

  return json.result.items;
}

/**
 * Parse Bybit ad data into a simplified format
 */
function parseAd(ad) {
  return {
    price: parseFloat(ad.price),
    available: parseFloat(ad.lastQuantity),
    minOrder: parseFloat(ad.minAmount),
    maxOrder: parseFloat(ad.maxAmount),
    advertiser: ad.nickName,
    orders: parseInt(ad.recentOrderNum) || 0,
    completionRate: parseFloat(ad.recentExecuteRate) || 0,
    paymentMethods: (ad.payments || []).map(String),
    isOnline: ad.isOnline,
    verified: (ad.authTag || []).includes("VA"),
  };
}

/**
 * Calculate price statistics from a list of ads
 */
function calculateStats(ads) {
  if (!ads || ads.length === 0) return null;

  const parsed = ads.map(parseAd);
  const prices = parsed.map((a) => a.price);

  const sum = prices.reduce((a, b) => a + b, 0);
  const avg = sum / prices.length;

  const totalAvailable = parsed.reduce((a, b) => a + b.available, 0);
  const weightedAvg = totalAvailable > 0
    ? parsed.reduce((acc, ad) => acc + ad.price * (ad.available / totalAvailable), 0)
    : avg;

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
 * Fetch full rate data for a single fiat currency from Bybit
 */
async function fetchRateForFiat(fiat, asset = "USDT") {
  const [buyAds, sellAds] = await Promise.all([
    fetchAds(fiat, "1", asset).catch(() => []),
    fetchAds(fiat, "0", asset).catch(() => []),
  ]);

  const buyStats = calculateStats(buyAds);
  const sellStats = calculateStats(sellAds);

  if (!buyStats && !sellStats) return null;

  return {
    fiat,
    asset,
    exchange: "bybit",
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch rates for all fiat currencies from Bybit
 */
async function fetchAllRates(fiats, asset = "USDT") {
  const results = {};
  const errors = [];

  for (const fiat of fiats) {
    try {
      const rate = await fetchRateForFiat(fiat, asset);
      if (rate) results[fiat] = rate;
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
