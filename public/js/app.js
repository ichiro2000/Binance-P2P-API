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
  // Load cached data from localStorage first (instant display)
  loadFromCache();
  renderCurrencyTags();
  renderTable();

  // Then fetch fresh data in background
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

// Load cached data from localStorage
function loadFromCache() {
  try {
    const cached = localStorage.getItem("p2p_rates");
    if (cached) {
      const parsed = JSON.parse(cached);
      ratesData = parsed.data || {};
      if (Object.keys(ratesData).length > 0) {
        totalCurrenciesEl.textContent = Object.keys(ratesData).length;
        updateStats({ data: ratesData });
        if (parsed.lastRefresh) {
          lastUpdateEl.textContent = `Last refresh: ${timeAgo(parsed.lastRefresh)}`;
        }
        setStatus("online", "Cached");
      }
    }
  } catch (e) {
    // Ignore cache errors
  }
}

// Save data to localStorage
function saveToCache(data, lastRefresh) {
  try {
    localStorage.setItem("p2p_rates", JSON.stringify({
      data: data,
      lastRefresh: lastRefresh,
      savedAt: new Date().toISOString(),
    }));
  } catch (e) {
    // Ignore storage errors
  }
}

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

      // Save to localStorage for instant load next time
      saveToCache(json.data, json.lastFullRefresh);

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
