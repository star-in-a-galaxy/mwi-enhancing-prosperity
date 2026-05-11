/**
 * main.js — State globals, initialization
 */

let gameData = window.GAME_DATA_STATIC || {};
let calculator = null;
let allResults = [];
let marketData = null;
let currentSort = { col: 10, asc: false };
let currentSellMode = 'pessimistic';
let searchQuery = '';
let costFilters = { '100m': true, '300m': true, '1b': true, '2b': true, '5b': true, 'over5b': true };
let hideInstant = true;
let minVolume = 0;
let activeLevels = new Set();
let marketFeePct = 0;
let expandedItem = null;
let autoRefreshTimer = null;
let isRefreshing = false;

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

        (() => {
            const raw = localStorage.getItem('mwi-enhance-settings');
            if (!raw) return;
            try {
                const s = JSON.parse(raw);
                if (s.gear) {
                    const enhEl = document.getElementById('enhancer');
                    const charmEl = document.getElementById('charmTier');
                    if (s.gear.enhancer && enhEl) {
                        const hasOpt = Array.from(enhEl.options).some(o => o.value === s.gear.enhancer);
                        if (hasOpt) enhEl.value = s.gear.enhancer;
                    }
                    if (s.gear.charmTier && charmEl) {
                        const hasOpt = Array.from(charmEl.options).some(o => o.value === s.gear.charmTier);
                        if (hasOpt) charmEl.value = s.gear.charmTier;
                    }
                }
            } catch (e) { /* ignore */ }
        })();

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
    loadSettings();
    updateGearIcons();
    updateTeaLevelDisplay();
    setupTooltips();
    initializeApp();
});
