// All fiat currencies supported on Binance + Bybit P2P (combined)
const FIAT_CURRENCIES = [
  "AED", "AMD", "AOA", "ARS", "AUD", "AZN", "BDT", "BGN", "BHD", "BOB",
  "BRL", "BSD", "BYN", "CAD", "CDF", "CLP", "CNY", "COP", "CRC", "CZK",
  "DOP", "DZD", "EGP", "EUR", "GBP", "GEL", "GHS", "GTQ", "HKD", "HNL",
  "HUF", "IDR", "ILS", "INR", "IQD", "JOD", "JPY", "KES", "KGS", "KHR",
  "KRW", "KWD", "KZT", "LAK", "LBP", "LKR", "MAD", "MDL", "MMK", "MNT",
  "MXN", "MYR", "NGN", "NIO", "NOK", "NPR", "NZD", "OMR", "PAB", "PEN",
  "PHP", "PKR", "PLN", "PYG", "QAR", "RON", "RSD", "RUB", "RWF", "SAR",
  "SDG", "SEK", "SGD", "THB", "TJS", "TND", "TRY", "TWD", "TZS", "UAH",
  "UGX", "USD", "UYU", "UZS", "VES", "VND", "XAF", "XOF", "YER", "ZAR"
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
