/**
 * ui-controls.js — Mode setters, filter handlers, theme, tooltips
 */

function setSellMode(mode) {
    updateSetting('sellMode', mode);
    if (allResults.length > 0) reSort();
}

function setBuyMode(mode) {
    updateSetting('buyMode', mode);
    scheduleRecalc();
}

function setCraftBuyMode(mode) {
    updateSetting('craftBuyMode', mode);
    scheduleRecalc();
}

function setBaseItemMode(mode) {
    updateSetting('baseItemMode', mode);
    scheduleRecalc();
}

function setRefineMode(mode) {
    updateSetting('refineMode', mode);
    scheduleRecalc();
}

function toggleGearPanel() {
    const panel = document.getElementById('gearPanel');
    const wasClosed = panel.style.display === 'none';
    panel.style.display = wasClosed ? 'block' : 'none';
    if (!wasClosed && autoCalcPaused) {
        autoCalcPaused = false;
        updateAutoCalcBtn();
        scheduleRecalc();
    }
}

function toggleAutoCalc() {
    autoCalcPaused = !autoCalcPaused;
    updateAutoCalcBtn();
    if (!autoCalcPaused) scheduleRecalc();
}

function updateAutoCalcBtn() {
    const btn = document.getElementById('pauseAutoCalcBtn');
    if (btn) {
        btn.textContent = autoCalcPaused ? 'Recalc: Paused' : 'Recalc: Immediate';
        btn.classList.toggle('paused', autoCalcPaused);
    }
}

function onSearchInput() {
    const val = document.getElementById('searchInput').value.toLowerCase().trim();
    getSettings().searchQuery = val;
    searchQuery = val;
    renderResults();
}

function toggleCostFilter(cost) {
    getSettings().costFilters[cost] = !getSettings().costFilters[cost];
    costFilters[cost] = getSettings().costFilters[cost];
    document.querySelector(`.cost-filter[data-cost="${cost}"]`).classList.toggle('active', costFilters[cost]);
    saveSettings();
    renderResults();
}

function toggleHideInstant() {
    getSettings().hideInstant = !getSettings().hideInstant;
    hideInstant = getSettings().hideInstant;
    document.getElementById('btn-hide-instant').classList.toggle('active', hideInstant);
    saveSettings();
    renderResults();
}

function onMinVolumeChange() {
    const input = document.getElementById('minVolumeInput');
    const val = parseInt(input.value) || 0;
    getSettings().minVolume = val < 0 ? 0 : val;
    minVolume = getSettings().minVolume;
    if (minVolume < 0) { minVolume = 0; input.value = 0; }
    saveSettings();
    renderResults();
}

function getDepth() {
    const el = document.getElementById('craftingDepth');
    const val = el?.value;
    if (val === 'all') return 6;
    if (val === 'best') return -1;
    const n = parseInt(val);
    return isNaN(n) ? 3 : Math.min(Math.max(n, 0), 6);
}

function isBestDepth() {
    return document.getElementById('craftingDepth')?.value === 'best';
}

function toggleMarketFee() {
    const checked = document.getElementById('marketFeeToggle').checked;
    getSettings().marketFeePct = checked ? 2 : 0;
    marketFeePct = getSettings().marketFeePct;
    saveSettings();
    reSort();
}

function onDepthChange() {
    const v = document.getElementById('craftingDepth')?.value;
    const depth = v === 'best' ? -1 : v === 'all' ? 6 : (parseInt(v) || 0);
    getSettings().craftingDepth = depth;
    saveSettings();
    scheduleRecalc();
}

function populateLevelFilters() {
    const container = document.getElementById('levelFilters');
    if (!container) return;
    for (let lvl = 1; lvl <= 20; lvl++) {
        const btn = document.createElement('button');
        btn.className = 'filter-btn level-filter';
        btn.dataset.level = lvl;
        btn.textContent = `+${lvl}`;
        btn.onclick = () => filterLevel(lvl);
        container.appendChild(btn);
    }
}

function filterLevel(level) {
    const s = getSettings();
    if (level === 'all') {
        s.activeLevels = [];
        activeLevels.clear();
    } else {
        const idx = s.activeLevels.indexOf(level);
        if (idx >= 0) s.activeLevels.splice(idx, 1);
        else s.activeLevels.push(level);
        activeLevels = new Set(s.activeLevels);
    }
    document.querySelectorAll('.level-filter').forEach(b => {
        const btnLevel = b.getAttribute('data-level');
        if (btnLevel === 'all') {
            b.classList.toggle('active', activeLevels.size === 0);
        } else {
            b.classList.toggle('active', activeLevels.has(parseInt(btnLevel)));
        }
    });
    saveSettings();
    renderResults();
}

function sortTable(colIndex) {
    const s = getSettings();
    if (s.sort.col === colIndex) {
        s.sort.asc = !s.sort.asc;
    } else {
        s.sort.col = colIndex;
        s.sort.asc = false;
    }
    currentSort = s.sort;
    reSort();
}

function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    const btn = document.getElementById('themeToggle');
    if (btn) btn.textContent = theme === 'dark' ? '☀' : '☾';
    try { localStorage.setItem('mwi-enhance-theme', theme); } catch (e) { /* ignore */ }
}

function loadTheme() {
    try {
        const saved = localStorage.getItem('mwi-enhance-theme');
        if (saved === 'light' || saved === 'dark') return saved;
    } catch (e) { /* ignore */ }
    return 'dark';
}

function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    applyTheme(current === 'dark' ? 'light' : 'dark');
}

function setupTooltips() {
    const tip = document.getElementById('tooltip');
    if (!tip) return;
    document.querySelectorAll('.info-icon:not([data-bound])').forEach(icon => {
        icon.setAttribute('data-bound', 'true');
        icon.addEventListener('mouseenter', () => {
            const text = icon.getAttribute('data-tip');
            if (!text) { tip.style.display = 'none'; return; }
            tip.innerHTML = '';
            for (const line of text.split('\n')) {
                const parts = line.split('|');
                const row = document.createElement('div');
                row.className = 'tip-row';
                const span = document.createElement('span');
                if (parts.length === 2) {
                    span.className = 'tip-label';
                    span.textContent = parts[0].trim();
                    const desc = document.createElement('span');
                    desc.className = 'tip-desc';
                    desc.textContent = parts[1].trim();
                    row.appendChild(span);
                    row.appendChild(desc);
                } else {
                    span.className = 'tip-desc';
                    span.textContent = line;
                    span.style.gridColumn = 'span 2';
                    row.appendChild(span);
                }
                tip.appendChild(row);
            }
            tip.style.display = 'block';
            const rect = icon.getBoundingClientRect();
            let left = rect.left + rect.width / 2;
            let top = rect.top - 12;
            const tw = tip.offsetWidth;
            const pad = 10;
            if (left - tw / 2 < pad) left = pad + tw / 2;
            if (left + tw / 2 > window.innerWidth - pad) left = window.innerWidth - pad - tw / 2;
            tip.style.left = left + 'px';
            tip.style.top = top + 'px';
            tip.style.transform = 'translateX(-50%) translateY(-100%)';
        });
        icon.addEventListener('mouseleave', () => {
            tip.style.display = 'none';
        });
    });
}

function debugDiagnostics() {
    try {
        console.groupCollapsed('MWI Debug Diagnostics');
        console.log('window.GAME_DATA_STATIC defined:', typeof window.GAME_DATA_STATIC !== 'undefined');
        if (typeof window.GAME_DATA_STATIC !== 'undefined') {
            const gd = window.GAME_DATA_STATIC;
            console.log('Game data version:', gd.version || '(no version)');
            console.log('Number of items:', gd.items ? Object.keys(gd.items).length : 0);
            console.log('Number of recipes:', gd.recipes ? Object.keys(gd.recipes).length : 0);
            console.log('Constants present:', gd.constants ? Object.keys(gd.constants) : []);
        }

        console.log('marketData present:', !!marketData, marketData && Object.keys(marketData.market || {}).length);

        console.log('PriceResolver:', typeof PriceResolver !== 'undefined');
        console.log('ItemResolver:', typeof ItemResolver !== 'undefined');
        console.log('EnhanceCalculator:', typeof EnhanceCalculator !== 'undefined');

        if (typeof PriceResolver !== 'undefined' && typeof ItemResolver !== 'undefined' && typeof EnhanceCalculator !== 'undefined') {
            try {
                const gd = window.GAME_DATA_STATIC || {};
                const firstHrid = gd.items ? Object.keys(gd.items).find(h => gd.items[h].enhancementCosts) : null;
                if (firstHrid) {
                    console.log('Found enhanceable item for test:', firstHrid);
                    const item = gd.items[firstHrid];
                    const itemRes = new ItemResolver(gd);
                    const priceRes = new PriceResolver(gd);
                    const shopping = itemRes.resolve(firstHrid, 8);
                    console.log('Shopping list sample:', shopping);
                    const resolved = priceRes.resolve(shopping, marketData.market || {}, { matMode: 'pessimistic', protMode: 'pessimistic', sellMode: 'midpoint' }, 1.0);
                    console.log('Resolved prices sample:', resolved);
                    const calc = new EnhanceCalculator(gd, {});
                    const sim = calc.simulate(resolved, 8, item.level || 1);
                    console.log('Simulation result sample:', sim);
                } else {
                    console.warn('No enhanceable item found in game data for headless test.');
                }
            } catch (err) {
                console.error('Headless test error:', err);
            }
        }

        console.groupEnd();
    } catch (e) {
        console.error('Diagnostics failed:', e);
    }
}
