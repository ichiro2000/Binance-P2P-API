// All fiat currencies supported on Binance P2P
const FIAT_CURRENCIES = [
  "AED", "ARS", "AUD", "BDT", "BHD", "BOB", "BRL", "CAD", "CLP", "CNY",
  "COP", "CRC", "CZK", "DOP", "DZD", "EGP", "EUR", "GBP", "GEL", "GHS",
  "HKD", "HNL", "IDR", "INR", "IQD", "JOD", "JPY", "KES", "KHR", "KRW",
  "KWD", "KZT", "LAK", "LBP", "LKR", "MAD", "MMK", "MXN", "MYR", "NGN",
  "NIO", "NOK", "NPR", "OMR", "PAB", "PEN", "PHP", "PKR", "PLN", "PYG",
  "QAR", "RON", "RUB", "SAR", "SDG", "SEK", "SGD", "THB", "TND", "TRY",
  "TWD", "TZS", "UAH", "UGX", "USD", "UYU", "UZS", "VES", "VND", "ZAR"
];

// Binance P2P API config
const BINANCE_P2P_API = "https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search";

// How many top ads to use for average calculation
const ADS_TO_FETCH = 10;

// Cache TTL in milliseconds (1 minute)
const CACHE_TTL = 1 * 60 * 1000;

// Delay between API calls to avoid rate limiting (ms)
const REQUEST_DELAY = 200;

// Server port
const PORT = process.env.PORT || 3000;

// Background refresh interval (cron: every 1 minute)
const REFRESH_CRON = "* * * * *";

module.exports = {
  FIAT_CURRENCIES,
  BINANCE_P2P_API,
  ADS_TO_FETCH,
  CACHE_TTL,
  REQUEST_DELAY,
  PORT,
  REFRESH_CRON,
};
