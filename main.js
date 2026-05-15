/**
 * main.js — State globals, initialization
 *
 * Globals are thin aliases into the centralized settingsStore (settings.js).
 * Only `syncGlobals()` writes to these; all other code reads them.
 * Settings mutations happen through `updateSetting()` / `syncDom()` in settings.js.
 */

let gameData = window.GAME_DATA_STATIC || {};
let calculator = null;
let allResults = [];
let marketData = null;
let currentSort = null;
let currentSellMode = null;
let searchQuery = '';
let costFilters = null;
let hideInstant = true;
let minVolume = 0;
let activeLevels = new Set();
let marketFeePct = 0;
let expandedItem = null;
let autoRefreshTimer = null;
let isRefreshing = false;

function syncGlobals() {
    const s = getSettings();
    currentSort = s.sort;
    currentSellMode = s.sellMode;
    searchQuery = s.searchQuery;
    costFilters = s.costFilters;
    hideInstant = s.hideInstant;
    minVolume = s.minVolume;
    activeLevels = new Set(s.activeLevels);
    marketFeePct = s.marketFeePct;
}

function updateStatus(msg, type = '') {
    const el = document.getElementById('status');
    el.textContent = msg;
    el.className = `status ${type}`;
}

function updateDataInfo(md) {
    const el = document.getElementById('dataInfoValue');
    if (!el) return;
    const d = new Date(md.ts * 1000);
    const timeStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
    const sourceLabel = md.source === 'live' ? 'Live' : md.source === 'observatory-hourly' ? 'Obs hourly' : md.source === 'observatory-daily' ? 'Obs daily' : 'Unknown';
    const volNote = md.source === 'live' ? ' (vol: avg past 3 days)' : '';
    const now = new Date();
    const pollStr = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;
    el.textContent = `${timeStr} [${sourceLabel}] | Poll: ${pollStr}${volNote}`;
}

async function initializeApp() {
    try {
        updateStatus('Loading market data...', 'loading');
        marketData = await window.MARKET_DATA_READY;

        if (!marketData || !marketData.market) {
            throw new Error('Failed to load market data');
        }

        console.log(`Market data loaded for ${marketData.dataDate}`, marketData);
        updateDataInfo(marketData);

        populateCraftingToolDropdown();
        populateEnhancerDropdown();
        populateCharmTierDropdown();
        syncDom();
        syncGlobals();

        debugDiagnostics();

        setupAutoCalc();

        updateStatus('Ready, auto-calculating...', 'loading');

        await calculateProfits();
        startAutoRefresh();
    } catch (error) {
        console.error('Initialization error:', error);
        updateStatus(`Error: ${error.message}`, 'error');
    }
}

// Explicit window export for Tampermonkey script (sandbox can't always see function decls)
window.importGearFromStorage = function importGearFromStorage() {
    try {
        const raw = localStorage.getItem('mwi-enhance-settings');
        if (!raw) { updateStatus('No saved settings found in localStorage', 'error'); return; }
        const saved = JSON.parse(raw);
        if (!saved.gear || typeof saved.gear !== 'object') {
            updateStatus('No gear data found in saved settings', 'error'); return;
        }
        Object.assign(settingsStore.gear, saved.gear);
        syncDom();
        saveSettings();
        updateGearIcons();
        updateTeaLevelDisplay();
        scheduleRecalc();
    } catch (e) {
        console.warn('importGearFromStorage error:', e);
        updateStatus('Failed to import gear: ' + e.message, 'error');
    }
}

function startAutoRefresh() {
    if (autoRefreshTimer) clearInterval(autoRefreshTimer);
    autoRefreshTimer = setInterval(async () => {
        if (isRefreshing) return;
        isRefreshing = true;
        try {
            updateStatus('Refreshing market data...', 'loading');
            const fresh = await window.REFRESH_MARKET_DATA();
            if (fresh?.market) {
                marketData = fresh;
                updateDataInfo(marketData);
                await calculateProfits();
                updateStatus('Market data refreshed', 'success');
            }
        } catch (e) {
            console.warn('Auto-refresh failed:', e.message);
        } finally {
            isRefreshing = false;
        }
    }, 10 * 60 * 1000);
}

window.addEventListener('DOMContentLoaded', () => {
    applyTheme(loadTheme());
    populateLevelFilters();
    populateLevelSelects();
    initStore();
    syncDom();
    syncGlobals();
    updateGearIcons();
    updateTeaLevelDisplay();
    setupTooltips();
    initializeApp();
});
