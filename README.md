# Binance P2P Rate API

Real-time USDT P2P exchange rates from Binance for **70 fiat currencies**.

## Quick Start

```bash
npm install
npm start
```

Server runs on `http://localhost:3000` (configurable via `PORT` env var).

## API Endpoints

### `GET /api/rate/:fiat`
Get USDT P2P rate for a specific fiat currency.

**Example:** `GET /api/rate/LKR`

Returns buy/sell stats including average, weighted average, median, best, worst, spread, and top 10 ads.

### `GET /api/rates`
Get all cached rates. Fast response since it returns from cache.

### `GET /api/rates/refresh`
Force refresh all 70 currencies. Takes ~25 seconds due to rate limiting.

### `GET /api/summary`
Quick summary with just averages for all cached currencies.

**Example response:**
```json
{
  "success": true,
  "data": {
    "LKR": {
      "buyAverage": 326.61,
      "sellAverage": 322.95,
      "midRate": 324.78,
      "spreadPercent": 1.13,
      "updatedAt": "2026-03-28T04:30:00.000Z"
    }
  }
}
```

### `GET /api/currencies`
List all 70 supported fiat currencies.

### `GET /api/health`
Health check with cache stats and uptime.

## How It Works

- On startup, loads rates for all 70 currencies from Binance P2P
- Fetches top 10 buy and sell ads per currency
- Calculates average, weighted average (by volume), median, spread
- Caches results for 5 minutes
- Background refresh every 5 minutes via cron

## Rate Statistics Explained

| Field | Description |
|---|---|
| `average` | Simple average of top 10 ad prices |
| `weightedAverage` | Volume-weighted average (more accurate) |
| `median` | Middle price of the top 10 |
| `best` | Best price (lowest for buy, highest for sell) |
| `midRate` | Average of buy and sell averages |
| `spreadPercent` | Buy-sell spread as percentage |

## Supported Currencies

AED, ARS, AUD, BDT, BHD, BOB, BRL, CAD, CLP, CNY, COP, CRC, CZK, DOP, DZD, EGP, EUR, GBP, GEL, GHS, HKD, HNL, IDR, INR, IQD, JOD, JPY, KES, KHR, KRW, KWD, KZT, LAK, LBP, LKR, MAD, MMK, MXN, MYR, NGN, NIO, NOK, NPR, OMR, PAB, PEN, PHP, PKR, PLN, PYG, QAR, RON, RUB, SAR, SDG, SEK, SGD, THB, TND, TRY, TWD, TZS, UAH, UGX, USD, UYU, UZS, VES, VND, ZAR

## Configuration

Edit `src/config.js` to adjust:

- `ADS_TO_FETCH` - Number of top ads to average (default: 10)
- `CACHE_TTL` - Cache duration in ms (default: 5 min)
- `REQUEST_DELAY` - Delay between API calls in ms (default: 300ms)
- `REFRESH_CRON` - Background refresh schedule (default: every 5 min)
- `PORT` - Server port (default: 3000, or `PORT` env var)
