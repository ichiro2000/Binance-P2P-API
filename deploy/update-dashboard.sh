#!/bin/bash
set -e

echo "=========================================="
echo "  Updating Binance P2P API + Dashboard"
echo "=========================================="

APP_DIR="/opt/binance-p2p-api"

echo "Creating directories..."
mkdir -p $APP_DIR/public/css $APP_DIR/public/js

# ==========================================
# index.js
# ==========================================
echo "Writing index.js..."
cat > $APP_DIR/index.js << 'FILEOF'
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
FILEOF

# ==========================================
# public/index.html
# ==========================================
echo "Writing public/index.html..."
cat > $APP_DIR/public/index.html << 'FILEOF'
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>P2P Auditor - Binance P2P Rates Dashboard</title>
  <link rel="stylesheet" href="/css/style.css">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
</head>
<body>
  <!-- Header -->
  <header class="header">
    <div class="header-left">
      <div class="logo">
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
          <rect width="32" height="32" rx="8" fill="#2563eb"/>
          <path d="M8 16L16 8L24 16L16 24L8 16Z" fill="white" opacity="0.9"/>
          <path d="M12 16L16 12L20 16L16 20L12 16Z" fill="#2563eb"/>
        </svg>
      </div>
      <div>
        <h1>P2P Auditor</h1>
        <p class="subtitle">Binance P2P USDT Rates</p>
      </div>
    </div>
    <div class="header-right">
      <div class="status-badge" id="statusBadge">
        <span class="status-dot"></span>
        <span id="statusText">Connecting...</span>
      </div>
      <div class="last-update" id="lastUpdate">--</div>
    </div>
  </header>

  <!-- Stats Cards -->
  <div class="stats-grid">
    <div class="stat-card">
      <div class="stat-label">Currencies</div>
      <div class="stat-value" id="totalCurrencies">--</div>
      <div class="stat-sub">Active pairs</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Avg Spread</div>
      <div class="stat-value" id="avgSpread">--</div>
      <div class="stat-sub">Buy-sell gap</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Best Spread</div>
      <div class="stat-value" id="bestSpread">--</div>
      <div class="stat-sub" id="bestSpreadCurrency">--</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">API Uptime</div>
      <div class="stat-value" id="uptime">--</div>
      <div class="stat-sub">Server time</div>
    </div>
  </div>

  <!-- Controls -->
  <div class="controls">
    <div class="search-box">
      <svg class="search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
      <input type="text" id="searchInput" placeholder="Search currency (e.g. LKR, USD, EUR)">
    </div>
    <div class="control-buttons">
      <select id="sortSelect">
        <option value="fiat">Sort by Currency</option>
        <option value="buyAverage">Sort by Buy Price</option>
        <option value="sellAverage">Sort by Sell Price</option>
        <option value="spreadPercent">Sort by Spread %</option>
        <option value="midRate">Sort by Mid Rate</option>
      </select>
      <button class="btn-refresh" id="refreshBtn" onclick="refreshData()">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
        </svg>
        Refresh
      </button>
    </div>
  </div>

  <!-- Currency Tags -->
  <div class="currency-tags-container">
    <div class="currency-tags" id="currencyTags">
      <!-- Populated by JS -->
    </div>
  </div>

  <!-- Data Table (desktop) -->
  <div class="table-container desktop-only">
    <table class="data-table" id="ratesTable">
      <thead>
        <tr>
          <th>#</th>
          <th>Currency</th>
          <th>Buy Avg</th>
          <th>Sell Avg</th>
          <th>Mid Rate</th>
          <th>Spread %</th>
          <th>Updated</th>
          <th></th>
        </tr>
      </thead>
      <tbody id="ratesBody">
        <tr><td colspan="8" class="loading-row">Loading rates...</td></tr>
      </tbody>
    </table>
  </div>

  <!-- Mobile Cards -->
  <div class="mobile-cards mobile-only" id="mobileCards">
    <!-- Populated by JS -->
  </div>

  <!-- Detail Modal -->
  <div class="modal-overlay" id="modalOverlay" onclick="closeModal()">
    <div class="modal" onclick="event.stopPropagation()">
      <div class="modal-header">
        <h2 id="modalTitle">USDT / LKR</h2>
        <button class="modal-close" onclick="closeModal()">&times;</button>
      </div>
      <div class="modal-body" id="modalBody">
        Loading...
      </div>
    </div>
  </div>

  <!-- Footer -->
  <footer class="footer">
    <p>P2P Auditor &mdash; Real-time Binance P2P USDT rates for 70+ currencies</p>
    <p class="footer-sub">Auto-refreshes every 60 seconds &bull; Data from Binance P2P</p>
  </footer>

  <script src="/js/app.js"></script>
</body>
</html>
FILEOF

# ==========================================
# public/css/style.css
# ==========================================
echo "Writing public/css/style.css..."
cat > $APP_DIR/public/css/style.css << 'FILEOF'
/* Reset & Base */
*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  background: #f0f4f8;
  color: #1e293b;
  min-height: 100vh;
  line-height: 1.5;
}

/* Header */
.header {
  background: white;
  border-bottom: 1px solid #e2e8f0;
  padding: 16px 32px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  position: sticky;
  top: 0;
  z-index: 100;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 14px;
}

.header-left h1 {
  font-size: 22px;
  font-weight: 700;
  color: #0f172a;
  letter-spacing: -0.5px;
}

.subtitle {
  font-size: 13px;
  color: #64748b;
  font-weight: 400;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 20px;
}

.status-badge {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 14px;
  border-radius: 20px;
  background: #f1f5f9;
  font-size: 13px;
  font-weight: 500;
  color: #64748b;
}

.status-badge.online {
  background: #ecfdf5;
  color: #059669;
}

.status-badge.offline {
  background: #fef2f2;
  color: #dc2626;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #94a3b8;
}

.status-badge.online .status-dot {
  background: #10b981;
  box-shadow: 0 0 6px rgba(16, 185, 129, 0.4);
}

.status-badge.offline .status-dot {
  background: #ef4444;
}

.last-update {
  font-size: 13px;
  color: #94a3b8;
}

/* Stats Grid */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  padding: 24px 32px;
  max-width: 1400px;
  margin: 0 auto;
}

.stat-card {
  background: white;
  border-radius: 12px;
  padding: 20px 24px;
  border: 1px solid #e2e8f0;
  transition: box-shadow 0.2s;
}

.stat-card:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06);
}

.stat-label {
  font-size: 13px;
  font-weight: 500;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.stat-value {
  font-size: 28px;
  font-weight: 700;
  color: #0f172a;
  margin: 6px 0 4px;
}

.stat-sub {
  font-size: 13px;
  color: #94a3b8;
}

/* Controls */
.controls {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 32px 16px;
  max-width: 1400px;
  margin: 0 auto;
  gap: 16px;
}

.search-box {
  position: relative;
  flex: 1;
  max-width: 400px;
}

.search-icon {
  position: absolute;
  left: 14px;
  top: 50%;
  transform: translateY(-50%);
  color: #94a3b8;
}

.search-box input {
  width: 100%;
  padding: 10px 14px 10px 42px;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  font-size: 14px;
  font-family: inherit;
  background: white;
  transition: border-color 0.2s, box-shadow 0.2s;
  outline: none;
}

.search-box input:focus {
  border-color: #2563eb;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
}

.control-buttons {
  display: flex;
  gap: 10px;
  align-items: center;
}

select {
  padding: 10px 14px;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  font-size: 14px;
  font-family: inherit;
  background: white;
  cursor: pointer;
  outline: none;
  color: #475569;
}

.btn-refresh {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 18px;
  background: #2563eb;
  color: white;
  border: none;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 500;
  font-family: inherit;
  cursor: pointer;
  transition: background 0.2s;
}

.btn-refresh:hover {
  background: #1d4ed8;
}

.btn-refresh:disabled {
  background: #94a3b8;
  cursor: not-allowed;
}

.btn-refresh.spinning svg {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  100% { transform: rotate(360deg); }
}

/* Currency Tags */
.currency-tags-container {
  padding: 0 32px 16px;
  max-width: 1400px;
  margin: 0 auto;
}

.currency-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.currency-tag {
  display: inline-block;
  padding: 5px 12px;
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
  color: #475569;
  cursor: pointer;
  transition: all 0.15s;
  letter-spacing: 0.3px;
}

.currency-tag:hover {
  background: #eff6ff;
  border-color: #2563eb;
  color: #2563eb;
}

.currency-tag.active {
  background: #2563eb;
  border-color: #2563eb;
  color: white;
}

.currency-tag.has-data {
  border-color: #d1d5db;
}

.currency-tag.no-data {
  opacity: 0.4;
  border-style: dashed;
}

/* Table */
.table-container {
  padding: 0 32px 32px;
  max-width: 1400px;
  margin: 0 auto;
}

.data-table {
  width: 100%;
  background: white;
  border-radius: 12px;
  border: 1px solid #e2e8f0;
  border-collapse: separate;
  border-spacing: 0;
  overflow: hidden;
}

.data-table thead th {
  background: #f8fafc;
  padding: 14px 18px;
  text-align: left;
  font-size: 12px;
  font-weight: 600;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  border-bottom: 1px solid #e2e8f0;
  white-space: nowrap;
}

.data-table tbody tr {
  cursor: pointer;
  transition: background 0.15s;
}

.data-table tbody tr:hover {
  background: #f8fafc;
}

.data-table tbody td {
  padding: 14px 18px;
  font-size: 14px;
  border-bottom: 1px solid #f1f5f9;
  white-space: nowrap;
}

.data-table tbody tr:last-child td {
  border-bottom: none;
}

.currency-cell {
  display: flex;
  align-items: center;
  gap: 10px;
  font-weight: 600;
}

.currency-flag {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: #e2e8f0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;
  color: #475569;
}

.price-cell {
  font-variant-numeric: tabular-nums;
  font-weight: 500;
}

.spread-badge {
  display: inline-block;
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 600;
}

.spread-tight {
  background: #ecfdf5;
  color: #059669;
}

.spread-medium {
  background: #fffbeb;
  color: #d97706;
}

.spread-wide {
  background: #fef2f2;
  color: #dc2626;
}

.time-cell {
  color: #94a3b8;
  font-size: 13px;
}

.expand-icon {
  color: #cbd5e1;
  font-size: 18px;
  transition: transform 0.2s;
}

.loading-row {
  text-align: center;
  padding: 60px 20px !important;
  color: #94a3b8;
  font-size: 16px;
}

.no-results {
  text-align: center;
  padding: 40px 20px !important;
  color: #94a3b8;
}

/* Row number */
.row-num {
  color: #cbd5e1;
  font-size: 13px;
  font-weight: 500;
}

/* Modal */
.modal-overlay {
  display: none;
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(15, 23, 42, 0.5);
  backdrop-filter: blur(4px);
  z-index: 1000;
  justify-content: center;
  align-items: flex-start;
  padding: 60px 20px;
  overflow-y: auto;
}

.modal-overlay.active {
  display: flex;
}

.modal {
  background: white;
  border-radius: 16px;
  width: 100%;
  max-width: 900px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15);
  animation: modalIn 0.2s ease-out;
}

@keyframes modalIn {
  from { opacity: 0; transform: translateY(-20px); }
  to { opacity: 1; transform: translateY(0); }
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 24px 28px;
  border-bottom: 1px solid #e2e8f0;
}

.modal-header h2 {
  font-size: 20px;
  font-weight: 700;
}

.modal-close {
  width: 36px;
  height: 36px;
  border: none;
  background: #f1f5f9;
  border-radius: 8px;
  font-size: 22px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #64748b;
  transition: background 0.15s;
}

.modal-close:hover {
  background: #e2e8f0;
}

.modal-body {
  padding: 24px 28px;
}

.modal-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  margin-bottom: 24px;
}

.modal-stat {
  background: #f8fafc;
  padding: 16px;
  border-radius: 10px;
  text-align: center;
}

.modal-stat-label {
  font-size: 12px;
  font-weight: 500;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.modal-stat-value {
  font-size: 22px;
  font-weight: 700;
  margin-top: 4px;
}

.modal-stat-value.buy { color: #059669; }
.modal-stat-value.sell { color: #dc2626; }
.modal-stat-value.mid { color: #2563eb; }

.modal-section-title {
  font-size: 15px;
  font-weight: 600;
  margin: 20px 0 12px;
  color: #475569;
}

.ads-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.ads-table th {
  text-align: left;
  padding: 10px 12px;
  font-weight: 600;
  color: #64748b;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
}

.ads-table td {
  padding: 10px 12px;
  border-bottom: 1px solid #f1f5f9;
}

.ads-table .advertiser-name {
  font-weight: 500;
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ads-table .completion-badge {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 4px;
  font-weight: 500;
}

.completion-high { background: #ecfdf5; color: #059669; }
.completion-med { background: #fffbeb; color: #d97706; }
.completion-low { background: #fef2f2; color: #dc2626; }

.payment-tag {
  display: inline-block;
  padding: 2px 8px;
  background: #eff6ff;
  color: #2563eb;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 500;
  margin: 1px 2px;
}

.tab-buttons {
  display: flex;
  gap: 4px;
  margin-bottom: 16px;
  background: #f1f5f9;
  padding: 4px;
  border-radius: 10px;
  width: fit-content;
}

.tab-btn {
  padding: 8px 20px;
  border: none;
  background: transparent;
  font-size: 14px;
  font-weight: 500;
  font-family: inherit;
  cursor: pointer;
  border-radius: 8px;
  color: #64748b;
  transition: all 0.15s;
}

.tab-btn.active {
  background: white;
  color: #0f172a;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

/* Footer */
.footer {
  text-align: center;
  padding: 24px 32px;
  color: #94a3b8;
  font-size: 14px;
}

.footer-sub {
  font-size: 12px;
  margin-top: 4px;
}

/* Mobile/Desktop toggle */
.mobile-only { display: none; }
.desktop-only { display: block; }

/* Mobile Cards */
.mobile-cards {
  padding: 0 14px 20px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-width: 1400px;
  margin: 0 auto;
}

.mobile-card {
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 14px 16px;
  cursor: pointer;
  transition: box-shadow 0.15s;
}

.mobile-card:active {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.mobile-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.mobile-card-currency {
  display: flex;
  align-items: center;
  gap: 10px;
}

.mobile-card-currency .currency-flag {
  width: 32px;
  height: 32px;
  font-size: 12px;
}

.mobile-card-name {
  font-size: 16px;
  font-weight: 700;
  color: #0f172a;
}

.mobile-card-time {
  font-size: 11px;
  color: #94a3b8;
}

.mobile-card-prices {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 8px;
}

.mobile-card-price {
  text-align: center;
}

.mobile-card-price-label {
  font-size: 10px;
  font-weight: 600;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.mobile-card-price-value {
  font-size: 14px;
  font-weight: 600;
  margin-top: 2px;
  font-variant-numeric: tabular-nums;
}

.mobile-card-price-value.buy { color: #059669; }
.mobile-card-price-value.sell { color: #dc2626; }
.mobile-card-price-value.mid { color: #2563eb; }

.mobile-card-footer {
  display: flex;
  justify-content: flex-end;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid #f1f5f9;
}

.mobile-loading {
  text-align: center;
  padding: 40px 20px;
  color: #94a3b8;
  font-size: 14px;
}

/* Responsive */
@media (max-width: 900px) {
  .stats-grid {
    grid-template-columns: repeat(2, 1fr);
    padding: 16px;
  }
  .header { padding: 12px 16px; }
  .controls { padding: 0 16px 12px; flex-wrap: wrap; }
  .currency-tags-container { padding: 0 16px 12px; }
  .table-container { padding: 0 16px 24px; }
  .search-box { max-width: 100%; }
  .data-table { font-size: 13px; }
  .modal-stats { grid-template-columns: repeat(2, 1fr); }
}

@media (max-width: 600px) {
  /* Header mobile */
  .header {
    padding: 10px 14px;
    flex-direction: row;
    gap: 8px;
  }
  .header-left { gap: 10px; }
  .header-left h1 { font-size: 17px; }
  .subtitle { font-size: 11px; }
  .logo svg { width: 28px; height: 28px; }
  .header-right {
    flex-direction: column;
    gap: 4px;
    align-items: flex-end;
  }
  .status-badge { padding: 4px 10px; font-size: 12px; }
  .last-update { font-size: 11px; }

  /* Stats mobile */
  .stats-grid {
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    padding: 12px 14px;
  }
  .stat-card { padding: 14px 16px; border-radius: 10px; }
  .stat-label { font-size: 11px; }
  .stat-value { font-size: 20px; }
  .stat-sub { font-size: 11px; }

  /* Controls mobile */
  .controls {
    padding: 0 14px 10px;
    flex-direction: column;
    gap: 10px;
  }
  .search-box { max-width: 100%; }
  .search-box input { padding: 10px 14px 10px 38px; font-size: 14px; }
  .control-buttons {
    display: flex;
    width: 100%;
    gap: 8px;
  }
  .control-buttons select {
    flex: 1;
    padding: 10px 10px;
    font-size: 13px;
  }
  .btn-refresh {
    padding: 10px 14px;
    font-size: 13px;
  }

  /* Currency tags mobile - scrollable row */
  .currency-tags-container {
    padding: 0 14px 10px;
    overflow: hidden;
  }
  .currency-tags {
    display: flex;
    flex-wrap: nowrap;
    overflow-x: auto;
    gap: 6px;
    padding-bottom: 6px;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
  }
  .currency-tags::-webkit-scrollbar { display: none; }
  .currency-tag {
    flex-shrink: 0;
    padding: 4px 10px;
    font-size: 11px;
  }

  /* Hide table, show cards on mobile */
  .desktop-only { display: none !important; }
  .mobile-only { display: block !important; }

  /* Modal mobile */
  .modal-overlay { padding: 20px 10px; }
  .modal { border-radius: 12px; }
  .modal-header { padding: 16px 18px; }
  .modal-header h2 { font-size: 17px; }
  .modal-close { width: 32px; height: 32px; font-size: 20px; }
  .modal-body { padding: 16px 18px; }
  .modal-stats {
    grid-template-columns: 1fr;
    gap: 10px;
    margin-bottom: 16px;
  }
  .modal-stat { padding: 12px; }
  .modal-stat-label { font-size: 11px; }
  .modal-stat-value { font-size: 18px; }
  .tab-buttons { width: 100%; }
  .tab-btn { flex: 1; text-align: center; padding: 8px 12px; font-size: 13px; }
  .ads-table { font-size: 12px; min-width: 600px; }
  .ads-table th { padding: 8px 8px; font-size: 10px; }
  .ads-table td { padding: 8px 8px; }
  .modal-body { overflow-x: auto; }

  /* Footer mobile */
  .footer { padding: 16px 14px; font-size: 12px; }
  .footer-sub { font-size: 10px; }
}
FILEOF

# ==========================================
# public/js/app.js
# ==========================================
echo "Writing public/js/app.js..."
cat > $APP_DIR/public/js/app.js << 'FILEOF'
// API base URL (same origin)
const API = "/api";

// All supported currencies
const ALL_CURRENCIES = [
  "AED", "ARS", "AUD", "BDT", "BHD", "BOB", "BRL", "CAD", "CLP", "CNY",
  "COP", "CRC", "CZK", "DOP", "DZD", "EGP", "EUR", "GBP", "GEL", "GHS",
  "HKD", "HNL", "IDR", "INR", "IQD", "JOD", "JPY", "KES", "KHR", "KRW",
  "KWD", "KZT", "LAK", "LBP", "LKR", "MAD", "MMK", "MXN", "MYR", "NGN",
  "NIO", "NOK", "NPR", "OMR", "PAB", "PEN", "PHP", "PKR", "PLN", "PYG",
  "QAR", "RON", "RUB", "SAR", "SDG", "SEK", "SGD", "THB", "TND", "TRY",
  "TWD", "TZS", "UAH", "UGX", "USD", "UYU", "UZS", "VES", "VND", "ZAR"
];

// State
let ratesData = {};
let currentSort = "fiat";
let searchQuery = "";
let autoRefreshInterval = null;
let selectedCurrency = null;

// DOM elements
const ratesBody = document.getElementById("ratesBody");
const searchInput = document.getElementById("searchInput");
const sortSelect = document.getElementById("sortSelect");
const statusBadge = document.getElementById("statusBadge");
const statusText = document.getElementById("statusText");
const lastUpdateEl = document.getElementById("lastUpdate");
const totalCurrenciesEl = document.getElementById("totalCurrencies");
const avgSpreadEl = document.getElementById("avgSpread");
const bestSpreadEl = document.getElementById("bestSpread");
const bestSpreadCurrencyEl = document.getElementById("bestSpreadCurrency");
const uptimeEl = document.getElementById("uptime");
const refreshBtn = document.getElementById("refreshBtn");
const modalOverlay = document.getElementById("modalOverlay");

// Initialize
document.addEventListener("DOMContentLoaded", () => {
  renderCurrencyTags();
  loadSummary();
  loadHealth();
  startAutoRefresh();

  searchInput.addEventListener("input", (e) => {
    searchQuery = e.target.value.toUpperCase();
    selectedCurrency = null;
    renderCurrencyTags();
    renderTable();
  });

  sortSelect.addEventListener("change", (e) => {
    currentSort = e.target.value;
    renderTable();
  });

  // Close modal on Escape
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal();
  });
});

// Fetch summary data
async function loadSummary() {
  try {
    const res = await fetch(`${API}/summary`);
    const json = await res.json();

    if (json.success) {
      ratesData = json.data;
      updateStats(json);
      renderCurrencyTags();
      renderTable();
      setStatus("online", "Live");

      if (json.lastFullRefresh) {
        lastUpdateEl.textContent = `Last refresh: ${timeAgo(json.lastFullRefresh)}`;
      }
    }
  } catch (err) {
    console.error("Failed to load summary:", err);
    setStatus("offline", "Offline");
  }
}

// Fetch health
async function loadHealth() {
  try {
    const res = await fetch(`${API}/health`);
    const json = await res.json();
    if (json.status === "ok") {
      uptimeEl.textContent = formatUptime(json.uptime);
    }
  } catch (err) {
    uptimeEl.textContent = "N/A";
  }
}

// Update stat cards
function updateStats(json) {
  const entries = Object.entries(json.data);
  totalCurrenciesEl.textContent = entries.length;

  // Calculate average spread
  const spreads = entries
    .map(([, v]) => v.spreadPercent)
    .filter((s) => s !== null && s !== undefined);

  if (spreads.length > 0) {
    const avgSpread = spreads.reduce((a, b) => a + b, 0) / spreads.length;
    avgSpreadEl.textContent = avgSpread.toFixed(2) + "%";

    // Best spread (lowest positive)
    let bestVal = Infinity;
    let bestCur = "--";
    for (const [fiat, data] of entries) {
      if (data.spreadPercent !== null && Math.abs(data.spreadPercent) < bestVal) {
        bestVal = Math.abs(data.spreadPercent);
        bestCur = fiat;
      }
    }
    bestSpreadEl.textContent = bestVal === Infinity ? "--" : bestVal.toFixed(2) + "%";
    bestSpreadCurrencyEl.textContent = bestCur;
  }
}

// Render currency tags
function renderCurrencyTags() {
  const tagsContainer = document.getElementById("currencyTags");
  tagsContainer.innerHTML = ALL_CURRENCIES.map((cur) => {
    const hasData = ratesData.hasOwnProperty(cur);
    const isActive = selectedCurrency === cur;
    const classes = ["currency-tag"];
    if (isActive) classes.push("active");
    if (hasData) classes.push("has-data");
    else classes.push("no-data");
    return `<span class="${classes.join(" ")}" onclick="filterByCurrency('${cur}')">${cur}</span>`;
  }).join("");
}

// Filter by clicking a currency tag
function filterByCurrency(cur) {
  if (selectedCurrency === cur) {
    // Deselect
    selectedCurrency = null;
    searchQuery = "";
    searchInput.value = "";
  } else {
    selectedCurrency = cur;
    searchQuery = cur;
    searchInput.value = cur;
  }
  renderCurrencyTags();
  renderTable();
}

// Render table
function renderTable() {
  let entries = Object.entries(ratesData);

  // Filter
  if (searchQuery) {
    entries = entries.filter(([fiat]) => fiat.includes(searchQuery));
  }

  // Sort
  entries.sort((a, b) => {
    if (currentSort === "fiat") return a[0].localeCompare(b[0]);
    const aVal = a[1][currentSort] ?? 0;
    const bVal = b[1][currentSort] ?? 0;
    if (currentSort === "spreadPercent") return aVal - bVal;
    return bVal - aVal;
  });

  const mobileCards = document.getElementById("mobileCards");

  if (entries.length === 0) {
    const loadingHtml = `<div style="display:flex;flex-direction:column;align-items:center;gap:12px;padding:40px 20px">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2" style="animation:spin 1s linear infinite">
        <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
      </svg>
      <span style="color:#94a3b8">Loading rates... please wait (~30 seconds on first load)</span>
    </div>`;

    if (Object.keys(ratesData).length === 0) {
      ratesBody.innerHTML = `<tr><td colspan="8" class="loading-row">${loadingHtml}</td></tr>`;
      if (mobileCards) mobileCards.innerHTML = loadingHtml;
    } else {
      ratesBody.innerHTML = `<tr><td colspan="8" class="no-results">No currencies found for "${searchQuery}"</td></tr>`;
      if (mobileCards) mobileCards.innerHTML = `<div class="mobile-loading">No currencies found for "${searchQuery}"</div>`;
    }
    return;
  }

  // Desktop table
  ratesBody.innerHTML = entries
    .map(([fiat, data], i) => {
      const spreadClass = getSpreadClass(data.spreadPercent);
      const timeStr = data.updatedAt ? timeAgo(data.updatedAt) : "--";

      return `
        <tr onclick="openDetail('${fiat}')">
          <td class="row-num">${i + 1}</td>
          <td>
            <div class="currency-cell">
              <div class="currency-flag">${fiat.slice(0, 2)}</div>
              ${fiat}
            </div>
          </td>
          <td class="price-cell">${formatPrice(data.buyAverage)}</td>
          <td class="price-cell">${formatPrice(data.sellAverage)}</td>
          <td class="price-cell" style="font-weight:600">${formatPrice(data.midRate)}</td>
          <td><span class="spread-badge ${spreadClass}">${data.spreadPercent !== null ? data.spreadPercent.toFixed(2) + "%" : "N/A"}</span></td>
          <td class="time-cell">${timeStr}</td>
          <td class="expand-icon">&rsaquo;</td>
        </tr>
      `;
    })
    .join("");

  // Mobile cards
  if (mobileCards) {
    mobileCards.innerHTML = entries
      .map(([fiat, data]) => {
        const spreadClass = getSpreadClass(data.spreadPercent);
        const timeStr = data.updatedAt ? timeAgo(data.updatedAt) : "--";
        return `
          <div class="mobile-card" onclick="openDetail('${fiat}')">
            <div class="mobile-card-header">
              <div class="mobile-card-currency">
                <div class="currency-flag">${fiat.slice(0, 2)}</div>
                <span class="mobile-card-name">USDT / ${fiat}</span>
              </div>
              <span class="spread-badge ${spreadClass}">${data.spreadPercent !== null ? data.spreadPercent.toFixed(2) + "%" : "N/A"}</span>
            </div>
            <div class="mobile-card-prices">
              <div class="mobile-card-price">
                <div class="mobile-card-price-label">Buy</div>
                <div class="mobile-card-price-value buy">${formatPrice(data.buyAverage)}</div>
              </div>
              <div class="mobile-card-price">
                <div class="mobile-card-price-label">Sell</div>
                <div class="mobile-card-price-value sell">${formatPrice(data.sellAverage)}</div>
              </div>
              <div class="mobile-card-price">
                <div class="mobile-card-price-label">Mid</div>
                <div class="mobile-card-price-value mid">${formatPrice(data.midRate)}</div>
              </div>
            </div>
            <div class="mobile-card-footer">
              <span class="mobile-card-time">${timeStr}</span>
            </div>
          </div>
        `;
      })
      .join("");
  }
}

// Open detail modal
async function openDetail(fiat) {
  modalOverlay.classList.add("active");
  document.getElementById("modalTitle").textContent = `USDT / ${fiat}`;
  document.getElementById("modalBody").innerHTML = `<div class="loading-row">Loading ${fiat} details...</div>`;

  try {
    const res = await fetch(`${API}/rate/${fiat}`);
    const json = await res.json();

    if (json.success && json.data) {
      renderModal(json.data);
    } else {
      document.getElementById("modalBody").innerHTML = `<div class="loading-row">No data available for ${fiat}</div>`;
    }
  } catch (err) {
    document.getElementById("modalBody").innerHTML = `<div class="loading-row">Failed to load data</div>`;
  }
}

// Render modal content
function renderModal(data) {
  const buy = data.buy;
  const sell = data.sell;
  const summary = data.summary;

  let html = `
    <div class="modal-stats">
      <div class="modal-stat">
        <div class="modal-stat-label">Buy Average</div>
        <div class="modal-stat-value buy">${formatPrice(summary.buyAverage)}</div>
      </div>
      <div class="modal-stat">
        <div class="modal-stat-label">Sell Average</div>
        <div class="modal-stat-value sell">${formatPrice(summary.sellAverage)}</div>
      </div>
      <div class="modal-stat">
        <div class="modal-stat-label">Mid Rate</div>
        <div class="modal-stat-value mid">${formatPrice(summary.midRate)}</div>
      </div>
    </div>

    <div class="modal-stats" style="margin-top: -8px;">
      <div class="modal-stat">
        <div class="modal-stat-label">Weighted Avg (Buy)</div>
        <div class="modal-stat-value" style="font-size:18px">${formatPrice(summary.buyWeightedAvg)}</div>
      </div>
      <div class="modal-stat">
        <div class="modal-stat-label">Weighted Avg (Sell)</div>
        <div class="modal-stat-value" style="font-size:18px">${formatPrice(summary.sellWeightedAvg)}</div>
      </div>
      <div class="modal-stat">
        <div class="modal-stat-label">Spread</div>
        <div class="modal-stat-value" style="font-size:18px">${summary.spreadPercent !== null ? summary.spreadPercent.toFixed(2) + "%" : "N/A"}</div>
      </div>
    </div>

    <div class="tab-buttons">
      <button class="tab-btn active" onclick="switchTab(this, 'buyAds')">Buy Ads (${buy ? buy.adsCount : 0})</button>
      <button class="tab-btn" onclick="switchTab(this, 'sellAds')">Sell Ads (${sell ? sell.adsCount : 0})</button>
    </div>

    <div id="buyAds">${buy ? renderAdsTable(buy.ads) : "<p>No buy ads</p>"}</div>
    <div id="sellAds" style="display:none">${sell ? renderAdsTable(sell.ads) : "<p>No sell ads</p>"}</div>
  `;

  document.getElementById("modalBody").innerHTML = html;
}

// Render ads table
function renderAdsTable(ads) {
  if (!ads || ads.length === 0) return "<p>No ads available</p>";

  return `
    <table class="ads-table">
      <thead>
        <tr>
          <th>#</th>
          <th>Advertiser</th>
          <th>Price</th>
          <th>Available</th>
          <th>Order Limit</th>
          <th>Orders</th>
          <th>Rate</th>
          <th>Payment</th>
        </tr>
      </thead>
      <tbody>
        ${ads
          .map(
            (ad, i) => `
          <tr>
            <td>${i + 1}</td>
            <td class="advertiser-name" title="${escapeHtml(ad.advertiser)}">${escapeHtml(ad.advertiser)}</td>
            <td style="font-weight:600">${formatPrice(ad.price)}</td>
            <td>${formatNumber(ad.available)} USDT</td>
            <td>${formatNumber(ad.minOrder)} - ${formatNumber(ad.maxOrder)}</td>
            <td>${ad.orders}</td>
            <td><span class="completion-badge ${getCompletionClass(ad.completionRate)}">${(ad.completionRate * 100).toFixed(1)}%</span></td>
            <td>${ad.paymentMethods.map((m) => `<span class="payment-tag">${escapeHtml(m)}</span>`).join("")}</td>
          </tr>
        `
          )
          .join("")}
      </tbody>
    </table>
  `;
}

// Tab switching
function switchTab(btn, tabId) {
  // Update buttons
  btn.parentElement.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");

  // Show/hide tabs
  document.getElementById("buyAds").style.display = tabId === "buyAds" ? "block" : "none";
  document.getElementById("sellAds").style.display = tabId === "sellAds" ? "block" : "none";
}

// Close modal
function closeModal() {
  modalOverlay.classList.remove("active");
}

// Refresh data
async function refreshData() {
  refreshBtn.classList.add("spinning");
  refreshBtn.disabled = true;
  await loadSummary();
  await loadHealth();
  refreshBtn.classList.remove("spinning");
  refreshBtn.disabled = false;
}

// Auto refresh every 60 seconds (faster during initial load)
function startAutoRefresh() {
  if (autoRefreshInterval) clearInterval(autoRefreshInterval);

  // Retry every 5 seconds until data loads, then switch to 60s
  const fastRetry = setInterval(() => {
    if (Object.keys(ratesData).length > 0) {
      clearInterval(fastRetry);
      autoRefreshInterval = setInterval(() => {
        loadSummary();
        loadHealth();
      }, 60000);
    } else {
      loadSummary();
      loadHealth();
    }
  }, 5000);
}

// Helper: Set status badge
function setStatus(status, text) {
  statusBadge.className = `status-badge ${status}`;
  statusText.textContent = text;
}

// Helper: Spread class
function getSpreadClass(spread) {
  if (spread === null || spread === undefined) return "spread-medium";
  const abs = Math.abs(spread);
  if (abs < 1) return "spread-tight";
  if (abs < 3) return "spread-medium";
  return "spread-wide";
}

// Helper: Completion class
function getCompletionClass(rate) {
  if (rate >= 0.98) return "completion-high";
  if (rate >= 0.90) return "completion-med";
  return "completion-low";
}

// Helper: Format price
function formatPrice(price) {
  if (price === null || price === undefined) return "N/A";
  if (price >= 1000) return price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (price >= 1) return price.toFixed(4);
  return price.toFixed(6);
}

// Helper: Format number
function formatNumber(num) {
  if (num === null || num === undefined) return "N/A";
  if (num >= 1000000) return (num / 1000000).toFixed(1) + "M";
  if (num >= 1000) return (num / 1000).toFixed(1) + "K";
  return num.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

// Helper: Format uptime
function formatUptime(seconds) {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (hrs > 24) return Math.floor(hrs / 24) + "d " + (hrs % 24) + "h";
  if (hrs > 0) return hrs + "h " + mins + "m";
  return mins + "m";
}

// Helper: Time ago
function timeAgo(isoString) {
  const diff = (Date.now() - new Date(isoString).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return Math.floor(diff / 60) + "m ago";
  if (diff < 86400) return Math.floor(diff / 3600) + "h ago";
  return Math.floor(diff / 86400) + "d ago";
}

// Helper: Escape HTML
function escapeHtml(str) {
  if (!str) return "";
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
FILEOF

# ==========================================
# Restart PM2
# ==========================================
echo "Restarting PM2 process..."
pm2 restart binance-p2p-api

echo ""
echo "=========================================="
echo "  Update complete!"
echo "  Dashboard deployed to $APP_DIR"
echo "=========================================="
