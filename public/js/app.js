// API base URL (same origin)
const API = "/api";

// All supported currencies
const ALL_CURRENCIES = [
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

// State
let binanceData = {};
let bybitData = {};
let ratesData = {};
let currentSort = "fiat";
let searchQuery = "";
let autoRefreshInterval = null;
let selectedCurrency = null;
let currentExchange = "binance"; // "binance", "bybit", "compare"

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
  loadFromCache();
  renderCurrencyTags();
  renderTable();

  loadAllData();
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

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal();
  });
});

// Switch exchange
function switchExchange(exchange) {
  currentExchange = exchange;
  document.querySelectorAll(".exchange-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.exchange === exchange);
  });

  if (exchange === "binance") ratesData = binanceData;
  else if (exchange === "bybit") ratesData = bybitData;
  else ratesData = mergeForCompare(binanceData, bybitData);

  updateStats({ data: ratesData });
  renderCurrencyTags();
  renderTable();
}

// Merge data for compare view
function mergeForCompare(binance, bybit) {
  const allFiats = new Set([...Object.keys(binance), ...Object.keys(bybit)]);
  const merged = {};
  for (const fiat of allFiats) {
    const b = binance[fiat];
    const y = bybit[fiat];
    merged[fiat] = {
      buyAverage: b?.buyAverage || null,
      sellAverage: b?.sellAverage || null,
      midRate: b?.midRate || null,
      spreadPercent: b?.spreadPercent || null,
      bybitBuyAverage: y?.buyAverage || null,
      bybitSellAverage: y?.sellAverage || null,
      bybitMidRate: y?.midRate || null,
      bybitSpreadPercent: y?.spreadPercent || null,
      updatedAt: b?.updatedAt || y?.updatedAt,
    };
  }
  return merged;
}

// Load cached data from localStorage
function loadFromCache() {
  try {
    const cached = localStorage.getItem("p2p_rates_v2");
    if (cached) {
      const parsed = JSON.parse(cached);
      binanceData = parsed.binance || {};
      bybitData = parsed.bybit || {};
      ratesData = binanceData;
      if (Object.keys(ratesData).length > 0) {
        totalCurrenciesEl.textContent = Object.keys(ratesData).length;
        updateStats({ data: ratesData });
        if (parsed.lastRefresh) lastUpdateEl.textContent = `Last refresh: ${timeAgo(parsed.lastRefresh)}`;
        setStatus("online", "Cached");
      }
    }
  } catch (e) {}
}

// Save data to localStorage
function saveToCache(lastRefresh) {
  try {
    localStorage.setItem("p2p_rates_v2", JSON.stringify({
      binance: binanceData,
      bybit: bybitData,
      lastRefresh: lastRefresh,
      savedAt: new Date().toISOString(),
    }));
  } catch (e) {}
}

// Load all data (both exchanges)
async function loadAllData() {
  await Promise.all([loadBinanceSummary(), loadBybitSummary()]);
  loadHealth();
}

// Fetch Binance summary
async function loadBinanceSummary() {
  try {
    const res = await fetch(`${API}/summary`);
    const json = await res.json();
    if (json.success) {
      binanceData = json.data;
      if (currentExchange === "binance") {
        ratesData = binanceData;
        updateStats(json);
        renderCurrencyTags();
        renderTable();
      } else if (currentExchange === "compare") {
        ratesData = mergeForCompare(binanceData, bybitData);
        updateStats({ data: ratesData });
        renderCurrencyTags();
        renderTable();
      }
      setStatus("online", "Live");
      saveToCache(json.lastFullRefresh);
      if (json.lastFullRefresh) lastUpdateEl.textContent = `Last refresh: ${timeAgo(json.lastFullRefresh)}`;
    }
  } catch (err) {
    console.error("Binance failed:", err);
    setStatus("offline", "Offline");
  }
}

// Fetch Bybit summary
async function loadBybitSummary() {
  try {
    const res = await fetch(`${API}/bybit/summary`);
    const json = await res.json();
    if (json.success) {
      bybitData = json.data;
      if (currentExchange === "bybit") {
        ratesData = bybitData;
        updateStats(json);
        renderCurrencyTags();
        renderTable();
      } else if (currentExchange === "compare") {
        ratesData = mergeForCompare(binanceData, bybitData);
        updateStats({ data: ratesData });
        renderCurrencyTags();
        renderTable();
      }
      setStatus("online", "Live");
      saveToCache(null);
    }
  } catch (err) {
    console.error("Bybit failed:", err);
  }
}

// Fetch health
async function loadHealth() {
  try {
    const res = await fetch(`${API}/health`);
    const json = await res.json();
    if (json.status === "ok") uptimeEl.textContent = formatUptime(json.uptime);
  } catch (err) { uptimeEl.textContent = "N/A"; }
}

// Update stat cards
function updateStats(json) {
  const entries = Object.entries(json.data);
  totalCurrenciesEl.textContent = entries.length;

  const spreads = entries
    .map(([, v]) => v.spreadPercent)
    .filter((s) => s !== null && s !== undefined);

  if (spreads.length > 0) {
    const avgSpread = spreads.reduce((a, b) => a + b, 0) / spreads.length;
    avgSpreadEl.textContent = avgSpread.toFixed(2) + "%";

    let bestVal = Infinity, bestCur = "--";
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

  if (searchQuery) entries = entries.filter(([fiat]) => fiat.includes(searchQuery));

  entries.sort((a, b) => {
    if (currentSort === "fiat") return a[0].localeCompare(b[0]);
    const aVal = a[1][currentSort] ?? 0;
    const bVal = b[1][currentSort] ?? 0;
    if (currentSort === "spreadPercent") return aVal - bVal;
    return bVal - aVal;
  });

  const mobileCards = document.getElementById("mobileCards");
  const tableHead = document.querySelector(".data-table thead tr");

  if (entries.length === 0) {
    const loadingHtml = `<div style="display:flex;flex-direction:column;align-items:center;gap:12px;padding:40px 20px">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2" style="animation:spin 1s linear infinite"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
      <span style="color:#94a3b8">Loading rates... please wait (~30 seconds on first load)</span>
    </div>`;

    if (Object.keys(ratesData).length === 0) {
      ratesBody.innerHTML = `<tr><td colspan="10" class="loading-row">${loadingHtml}</td></tr>`;
      if (mobileCards) mobileCards.innerHTML = loadingHtml;
    } else {
      ratesBody.innerHTML = `<tr><td colspan="10" class="no-results">No currencies found for "${searchQuery}"</td></tr>`;
      if (mobileCards) mobileCards.innerHTML = `<div class="mobile-loading">No currencies found for "${searchQuery}"</div>`;
    }
    return;
  }

  // Compare mode
  if (currentExchange === "compare") {
    if (tableHead) {
      tableHead.innerHTML = `<th>#</th><th>Currency</th>
        <th class="th-binance">Binance Buy</th><th class="th-binance">Binance Sell</th>
        <th class="th-bybit">Bybit Buy</th><th class="th-bybit">Bybit Sell</th>
        <th>Best Buy</th><th>Updated</th><th></th>`;
    }

    ratesBody.innerHTML = entries.map(([fiat, d], i) => {
      const bBuy = d.buyAverage, bSell = d.sellAverage;
      const yBuy = d.bybitBuyAverage, ySell = d.bybitSellAverage;
      const bestBuy = (bBuy && yBuy) ? (bBuy < yBuy ? "Binance" : bBuy > yBuy ? "Bybit" : "Same") : (bBuy ? "Binance" : yBuy ? "Bybit" : "N/A");
      const timeStr = d.updatedAt ? timeAgo(d.updatedAt) : "--";
      const bestClass = bestBuy === "Binance" ? "th-binance" : bestBuy === "Bybit" ? "th-bybit" : "";

      return `<tr onclick="openDetail('${fiat}')">
        <td class="row-num">${i + 1}</td>
        <td><div class="currency-cell"><div class="currency-flag">${fiat.slice(0, 2)}</div>${fiat}</div></td>
        <td class="price-cell ${bBuy && yBuy && bBuy <= yBuy ? 'price-better' : ''}">${formatPrice(bBuy)}</td>
        <td class="price-cell">${formatPrice(bSell)}</td>
        <td class="price-cell ${yBuy && bBuy && yBuy <= bBuy ? 'price-better' : ''}">${formatPrice(yBuy)}</td>
        <td class="price-cell">${formatPrice(ySell)}</td>
        <td><span class="spread-badge ${bestClass}" style="font-weight:700">${bestBuy}</span></td>
        <td class="time-cell">${timeStr}</td>
        <td class="expand-icon">&rsaquo;</td>
      </tr>`;
    }).join("");

    // Mobile compare cards
    if (mobileCards) {
      mobileCards.innerHTML = entries.map(([fiat, d]) => {
        const bBuy = d.buyAverage, yBuy = d.bybitBuyAverage;
        const bestBuy = (bBuy && yBuy) ? (bBuy < yBuy ? "Binance" : "Bybit") : "N/A";
        const timeStr = d.updatedAt ? timeAgo(d.updatedAt) : "--";
        return `<div class="mobile-card" onclick="openDetail('${fiat}')">
          <div class="mobile-card-header">
            <div class="mobile-card-currency"><div class="currency-flag">${fiat.slice(0, 2)}</div><span class="mobile-card-name">USDT / ${fiat}</span></div>
            <span class="spread-badge" style="font-weight:700">${bestBuy}</span>
          </div>
          <div class="mobile-card-prices" style="grid-template-columns:1fr 1fr">
            <div class="mobile-card-price"><div class="mobile-card-price-label" style="color:#f0b90b">Binance Buy</div><div class="mobile-card-price-value ${bBuy && yBuy && bBuy <= yBuy ? 'buy' : ''}">${formatPrice(bBuy)}</div></div>
            <div class="mobile-card-price"><div class="mobile-card-price-label" style="color:#f7a600">Bybit Buy</div><div class="mobile-card-price-value ${yBuy && bBuy && yBuy <= bBuy ? 'buy' : ''}">${formatPrice(yBuy)}</div></div>
          </div>
          <div class="mobile-card-prices" style="grid-template-columns:1fr 1fr;margin-top:6px">
            <div class="mobile-card-price"><div class="mobile-card-price-label" style="color:#f0b90b">Binance Sell</div><div class="mobile-card-price-value sell">${formatPrice(d.sellAverage)}</div></div>
            <div class="mobile-card-price"><div class="mobile-card-price-label" style="color:#f7a600">Bybit Sell</div><div class="mobile-card-price-value sell">${formatPrice(d.bybitSellAverage)}</div></div>
          </div>
          <div class="mobile-card-footer"><span class="mobile-card-time">${timeStr}</span></div>
        </div>`;
      }).join("");
    }
    return;
  }

  // Normal mode (Binance or Bybit)
  if (tableHead) {
    tableHead.innerHTML = `<th>#</th><th>Currency</th><th>Buy Avg</th><th>Sell Avg</th><th>Mid Rate</th><th>Spread %</th><th>Updated</th><th></th>`;
  }

  ratesBody.innerHTML = entries.map(([fiat, data], i) => {
    const spreadClass = getSpreadClass(data.spreadPercent);
    const timeStr = data.updatedAt ? timeAgo(data.updatedAt) : "--";
    return `<tr onclick="openDetail('${fiat}')">
      <td class="row-num">${i + 1}</td>
      <td><div class="currency-cell"><div class="currency-flag">${fiat.slice(0, 2)}</div>${fiat}</div></td>
      <td class="price-cell">${formatPrice(data.buyAverage)}</td>
      <td class="price-cell">${formatPrice(data.sellAverage)}</td>
      <td class="price-cell" style="font-weight:600">${formatPrice(data.midRate)}</td>
      <td><span class="spread-badge ${spreadClass}">${data.spreadPercent !== null ? data.spreadPercent.toFixed(2) + "%" : "N/A"}</span></td>
      <td class="time-cell">${timeStr}</td>
      <td class="expand-icon">&rsaquo;</td>
    </tr>`;
  }).join("");

  if (mobileCards) {
    mobileCards.innerHTML = entries.map(([fiat, data]) => {
      const spreadClass = getSpreadClass(data.spreadPercent);
      const timeStr = data.updatedAt ? timeAgo(data.updatedAt) : "--";
      return `<div class="mobile-card" onclick="openDetail('${fiat}')">
        <div class="mobile-card-header"><div class="mobile-card-currency"><div class="currency-flag">${fiat.slice(0, 2)}</div><span class="mobile-card-name">USDT / ${fiat}</span></div>
        <span class="spread-badge ${spreadClass}">${data.spreadPercent !== null ? data.spreadPercent.toFixed(2) + "%" : "N/A"}</span></div>
        <div class="mobile-card-prices">
          <div class="mobile-card-price"><div class="mobile-card-price-label">Buy</div><div class="mobile-card-price-value buy">${formatPrice(data.buyAverage)}</div></div>
          <div class="mobile-card-price"><div class="mobile-card-price-label">Sell</div><div class="mobile-card-price-value sell">${formatPrice(data.sellAverage)}</div></div>
          <div class="mobile-card-price"><div class="mobile-card-price-label">Mid</div><div class="mobile-card-price-value mid">${formatPrice(data.midRate)}</div></div>
        </div>
        <div class="mobile-card-footer"><span class="mobile-card-time">${timeStr}</span></div>
      </div>`;
    }).join("");
  }
}

// Open detail modal
async function openDetail(fiat) {
  modalOverlay.classList.add("active");
  document.getElementById("modalTitle").textContent = `USDT / ${fiat}`;
  document.getElementById("modalBody").innerHTML = `<div class="loading-row">Loading ${fiat} details...</div>`;

  try {
    const [binanceRes, bybitRes] = await Promise.all([
      fetch(`${API}/rate/${fiat}`).then(r => r.json()).catch(() => null),
      fetch(`${API}/bybit/rate/${fiat}`).then(r => r.json()).catch(() => null),
    ]);

    const bData = binanceRes?.success ? binanceRes.data : null;
    const yData = bybitRes?.success ? bybitRes.data : null;

    if (!bData && !yData) {
      document.getElementById("modalBody").innerHTML = `<div class="loading-row">No data available for ${fiat}</div>`;
      return;
    }

    renderModal(bData, yData, fiat);
  } catch (err) {
    document.getElementById("modalBody").innerHTML = `<div class="loading-row">Failed to load data</div>`;
  }
}

// Render modal content (both exchanges)
function renderModal(bData, yData, fiat) {
  const bSum = bData?.summary || {};
  const ySum = yData?.summary || {};

  let html = `
    <div class="tab-buttons" style="margin-bottom:20px">
      <button class="tab-btn active" onclick="switchModalTab(this, 'modalBinance')">Binance</button>
      <button class="tab-btn" onclick="switchModalTab(this, 'modalBybit')">Bybit</button>
    </div>

    <div id="modalBinance">
      ${bData ? renderExchangeDetail(bData, "Binance") : '<p style="color:#94a3b8;text-align:center;padding:20px">No Binance data for ' + fiat + '</p>'}
    </div>
    <div id="modalBybit" style="display:none">
      ${yData ? renderExchangeDetail(yData, "Bybit") : '<p style="color:#94a3b8;text-align:center;padding:20px">No Bybit data for ' + fiat + '</p>'}
    </div>
  `;

  document.getElementById("modalBody").innerHTML = html;
}

function renderExchangeDetail(data, name) {
  const s = data.summary;
  return `
    <div class="modal-stats">
      <div class="modal-stat"><div class="modal-stat-label">Buy Average</div><div class="modal-stat-value buy">${formatPrice(s.buyAverage)}</div></div>
      <div class="modal-stat"><div class="modal-stat-label">Sell Average</div><div class="modal-stat-value sell">${formatPrice(s.sellAverage)}</div></div>
      <div class="modal-stat"><div class="modal-stat-label">Mid Rate</div><div class="modal-stat-value mid">${formatPrice(s.midRate)}</div></div>
    </div>
    <div class="modal-stats" style="margin-top:-8px">
      <div class="modal-stat"><div class="modal-stat-label">Weighted Buy</div><div class="modal-stat-value" style="font-size:18px">${formatPrice(s.buyWeightedAvg)}</div></div>
      <div class="modal-stat"><div class="modal-stat-label">Weighted Sell</div><div class="modal-stat-value" style="font-size:18px">${formatPrice(s.sellWeightedAvg)}</div></div>
      <div class="modal-stat"><div class="modal-stat-label">Spread</div><div class="modal-stat-value" style="font-size:18px">${s.spreadPercent !== null ? s.spreadPercent.toFixed(2) + "%" : "N/A"}</div></div>
    </div>
    <div class="tab-buttons">
      <button class="tab-btn active" onclick="switchTab(this, '${name}BuyAds')">Buy (${data.buy ? data.buy.adsCount : 0})</button>
      <button class="tab-btn" onclick="switchTab(this, '${name}SellAds')">Sell (${data.sell ? data.sell.adsCount : 0})</button>
    </div>
    <div id="${name}BuyAds">${data.buy ? renderAdsTable(data.buy.ads) : "<p>No buy ads</p>"}</div>
    <div id="${name}SellAds" style="display:none">${data.sell ? renderAdsTable(data.sell.ads) : "<p>No sell ads</p>"}</div>
  `;
}

function switchModalTab(btn, tabId) {
  btn.parentElement.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");
  document.getElementById("modalBinance").style.display = tabId === "modalBinance" ? "block" : "none";
  document.getElementById("modalBybit").style.display = tabId === "modalBybit" ? "block" : "none";
}

// Render ads table
function renderAdsTable(ads) {
  if (!ads || ads.length === 0) return "<p>No ads available</p>";
  return `<table class="ads-table"><thead><tr>
    <th>#</th><th>Advertiser</th><th>Price</th><th>Available</th><th>Order Limit</th><th>Orders</th><th>Rate</th><th>Payment</th>
  </tr></thead><tbody>${ads.map((ad, i) => `<tr>
    <td>${i + 1}</td>
    <td class="advertiser-name" title="${escapeHtml(ad.advertiser)}">${escapeHtml(ad.advertiser)}</td>
    <td style="font-weight:600">${formatPrice(ad.price)}</td>
    <td>${formatNumber(ad.available)} USDT</td>
    <td>${formatNumber(ad.minOrder)} - ${formatNumber(ad.maxOrder)}</td>
    <td>${ad.orders}</td>
    <td><span class="completion-badge ${getCompletionClass(ad.completionRate)}">${(ad.completionRate * 100).toFixed(1)}%</span></td>
    <td>${ad.paymentMethods.map((m) => `<span class="payment-tag">${escapeHtml(m)}</span>`).join("")}</td>
  </tr>`).join("")}</tbody></table>`;
}

// Tab switching
function switchTab(btn, tabId) {
  btn.parentElement.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");
  const parent = btn.closest("#modalBinance, #modalBybit, .modal-body");
  if (parent) {
    parent.querySelectorAll('[id$="BuyAds"], [id$="SellAds"]').forEach((el) => {
      el.style.display = el.id === tabId ? "block" : "none";
    });
  }
}

function closeModal() { modalOverlay.classList.remove("active"); }

async function refreshData() {
  refreshBtn.classList.add("spinning");
  refreshBtn.disabled = true;
  await loadAllData();
  refreshBtn.classList.remove("spinning");
  refreshBtn.disabled = false;
}

function startAutoRefresh() {
  if (autoRefreshInterval) clearInterval(autoRefreshInterval);
  const fastRetry = setInterval(() => {
    if (Object.keys(binanceData).length > 0 || Object.keys(bybitData).length > 0) {
      clearInterval(fastRetry);
      autoRefreshInterval = setInterval(() => loadAllData(), 60000);
    } else {
      loadAllData();
    }
  }, 5000);
}

function setStatus(s, t) { statusBadge.className = `status-badge ${s}`; statusText.textContent = t; }
function getSpreadClass(s) { if (s === null || s === undefined) return "spread-medium"; const a = Math.abs(s); if (a < 1) return "spread-tight"; if (a < 3) return "spread-medium"; return "spread-wide"; }
function getCompletionClass(r) { if (r >= 0.98) return "completion-high"; if (r >= 0.90) return "completion-med"; return "completion-low"; }
function formatPrice(p) { if (p === null || p === undefined) return "N/A"; if (p >= 1000) return p.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); if (p >= 1) return p.toFixed(4); return p.toFixed(6); }
function formatNumber(n) { if (n === null || n === undefined) return "N/A"; if (n >= 1e6) return (n / 1e6).toFixed(1) + "M"; if (n >= 1e3) return (n / 1e3).toFixed(1) + "K"; return n.toLocaleString("en-US", { maximumFractionDigits: 2 }); }
function formatUptime(s) { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); if (h > 24) return Math.floor(h / 24) + "d " + (h % 24) + "h"; if (h > 0) return h + "h " + m + "m"; return m + "m"; }
function timeAgo(t) { const d = (Date.now() - new Date(t).getTime()) / 1000; if (d < 60) return "just now"; if (d < 3600) return Math.floor(d / 60) + "m ago"; if (d < 86400) return Math.floor(d / 3600) + "h ago"; return Math.floor(d / 86400) + "d ago"; }
function escapeHtml(s) { if (!s) return ""; return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
