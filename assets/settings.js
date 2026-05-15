/**
 * settings.js — Centralized settings store + gear panel + persistence
 *
 * Architecture:
 *   `settingsStore` is the single source of truth for ALL app state.
 *   Consumers read via `getSettings()`. Only functions in this file write to it.
 *   `updateSetting()` writes → syncs DOM → saves → triggers recalc/render.
 */

const settingsStore = {
    sellMode: 'pessimistic',
    buyMode: 'pessimistic',
    craftBuyMode: 'pessimistic',
    baseItemMode: 'best',
    refineMode: 'auto',
    marketFeePct: 0,
    craftingDepth: -1,
    searchQuery: '',
    costFilters: { '100m': true, '300m': true, '1b': true, '2b': true, '5b': true, 'over5b': true },
    hideInstant: true,
    minVolume: 0,
    activeLevels: [],
    sort: { col: 11, asc: false },
    gear: {},
};

function getSettings() { return settingsStore; }

function _readDom(id) {
    const el = document.getElementById(id);
    if (!el) return null;
    if (el.type === 'checkbox') return el.checked;
    if (el.tagName === 'SELECT') return el.value;
    return el.value;
}

function _writeDom(id, val) {
    const el = document.getElementById(id);
    if (!el) return;
    if (typeof val === 'boolean') el.checked = val;
    else el.value = String(val);
}

function _collectGearFromDom() {
    const fields = [
        'enhancingLevel', 'observatoryLevel', 'enhancer', 'enhancerLevel',
        'enchantedGlovesEquipped', 'enchantedGlovesLevel',
        'enhancerTopEquipped', 'enhancerTopLevel',
        'enhancerBotEquipped', 'enhancerBotLevel',
        'necklaceType', 'necklaceLevel',
        'ringType', 'ringLevel',
        'earringsType', 'earringsLevel',
        'guzzlingPouchEquipped', 'guzzlingPouchLevel',
        'capeEquipped', 'capeType', 'capeLevel',
        'teaEnhancing', 'teaSuperEnhancing', 'teaUltraEnhancing',
        'teaBlessed', 'wisdomTea', 'artisanTea',
        'charmTier', 'charmLevel',
        'enhancingBuffLevel', 'experienceBuffLevel', 'productionEfficiencyBuffLevel',
        'achievementBonus',
        'craftingTeaEfficiency', 'craftingTeaSuperEfficiency', 'craftingTeaUltraEfficiency',
        'craftingEfficiencyTea', 'craftingWisdomTea',
        'eyeWatchEquipped', 'eyeWatchLevel',
        'artificerCapeEquipped', 'artificerCapeType', 'artificerCapeLevel',
        'cheesesmithingLevel', 'cheesesmithingTool', 'cheesesmithingToolLevel',
        'cheesesmithingTopEquipped', 'cheesesmithingTopLevel',
        'cheesesmithingBottomsEquipped', 'cheesesmithingBottomsLevel',
        'craftingLevel', 'craftingTool', 'craftingToolLevel',
        'craftingTopEquipped', 'craftingTopLevel',
        'craftingBottomsEquipped', 'craftingBottomsLevel',
        'tailoringLevel', 'tailoringTool', 'tailoringToolLevel',
        'tailoringTopEquipped', 'tailoringTopLevel',
        'tailoringBottomsEquipped', 'tailoringBottomsLevel',
        'forgeLevel', 'workshopLevel', 'sewing_parlorLevel', 'otherHouseLevel',
        'skipBaseResourceCrafting', 'ignoreCraftEfficiency', 'includeRareFind',
    ];
    const obj = {};
    for (const id of fields) obj[id] = _readDom(id);
    obj.craftingDepth = (() => {
        const v = _readDom('craftingDepth');
        if (v === 'best') return -1;
        if (v === 'all') return 6;
        return parseInt(v) || 0;
    })();
    return obj;
}

function _applyGearToDom(s) {
    const D = DEFAULT_SETTINGS.gear;
    const gearFields = [
        'enhancingLevel', 'observatoryLevel', 'enhancer', 'enhancerLevel',
        'enchantedGlovesEquipped', 'enchantedGlovesLevel',
        'enhancerTopEquipped', 'enhancerTopLevel',
        'enhancerBotEquipped', 'enhancerBotLevel',
        'necklaceType', 'necklaceLevel',
        'ringType', 'ringLevel',
        'earringsType', 'earringsLevel',
        'guzzlingPouchEquipped', 'guzzlingPouchLevel',
        'capeEquipped', 'capeType', 'capeLevel',
        'teaEnhancing', 'teaSuperEnhancing', 'teaUltraEnhancing',
        'teaBlessed', 'wisdomTea', 'artisanTea',
        'charmTier', 'charmLevel',
        'enhancingBuffLevel', 'experienceBuffLevel', 'productionEfficiencyBuffLevel',
        'achievementBonus',
        'craftingTeaEfficiency', 'craftingTeaSuperEfficiency', 'craftingTeaUltraEfficiency',
        'craftingEfficiencyTea', 'craftingWisdomTea',
        'eyeWatchEquipped', 'eyeWatchLevel',
        'artificerCapeEquipped', 'artificerCapeType', 'artificerCapeLevel',
        'cheesesmithingLevel', 'cheesesmithingTool', 'cheesesmithingToolLevel',
        'cheesesmithingTopEquipped', 'cheesesmithingTopLevel',
        'cheesesmithingBottomsEquipped', 'cheesesmithingBottomsLevel',
        'craftingLevel', 'craftingTool', 'craftingToolLevel',
        'craftingTopEquipped', 'craftingTopLevel',
        'craftingBottomsEquipped', 'craftingBottomsLevel',
        'tailoringLevel', 'tailoringTool', 'tailoringToolLevel',
        'tailoringTopEquipped', 'tailoringTopLevel',
        'tailoringBottomsEquipped', 'tailoringBottomsLevel',
        'forgeLevel', 'workshopLevel', 'sewing_parlorLevel', 'otherHouseLevel',
        'skipBaseResourceCrafting', 'ignoreCraftEfficiency', 'includeRareFind',
    ];
    for (const id of gearFields) {
        const val = s[id];
        if (val !== undefined) _writeDom(id, val);
        else _writeDom(id, D[id]);
    }
}

function syncFromDom() {
    settingsStore.sellMode = currentSellMode || 'pessimistic';
    settingsStore.buyMode = _readDom('buyMode') || 'pessimistic';
    settingsStore.craftBuyMode = _readDom('craftBuyMode') || 'pessimistic';
    settingsStore.baseItemMode = _readDom('baseItemMode') || 'best';
    settingsStore.refineMode = _readDom('refineMode') || 'auto';
    settingsStore.craftingDepth = (() => {
        const v = _readDom('craftingDepth');
        if (v === 'best') return -1;
        if (v === 'all') return 6;
        return parseInt(v) || 0;
    })();
    settingsStore.gear = _collectGearFromDom();
}

function syncDom() {
    if (typeof syncGlobals === 'function') syncGlobals();
    _applyGearToDom(settingsStore.gear);

    const s = settingsStore;
    document.querySelectorAll('#sellModeButtons .mode-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === s.sellMode);
    });
    _writeDom('buyMode', s.buyMode);
    document.querySelectorAll('#buyModeButtons .mode-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.mode === s.buyMode);
    });
    _writeDom('craftBuyMode', s.craftBuyMode);
    document.querySelectorAll('#craftBuyModeButtons .mode-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.mode === s.craftBuyMode);
    });
    _writeDom('baseItemMode', s.baseItemMode);
    document.querySelectorAll('#baseItemModeButtons .mode-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.mode === s.baseItemMode);
    });
    _writeDom('refineMode', s.refineMode);
    document.querySelectorAll('#refineModeButtons .mode-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.mode === s.refineMode);
    });

    for (const [key, val] of Object.entries(s.costFilters)) {
        const btn = document.querySelector(`.cost-filter[data-cost="${key}"]`);
        if (btn) btn.classList.toggle('active', val);
    }
    document.getElementById('btn-hide-instant')?.classList.toggle('active', s.hideInstant);
    const volInput = document.getElementById('minVolumeInput');
    if (volInput) volInput.value = s.minVolume;
    const feeCb = document.getElementById('marketFeeToggle');
    if (feeCb) feeCb.checked = s.marketFeePct > 0;

    const depthInput = document.getElementById('craftingDepth');
    if (depthInput) {
        if (s.craftingDepth === -1) depthInput.value = 'best';
        else if (s.craftingDepth >= 6) depthInput.value = 'all';
        else depthInput.value = String(s.craftingDepth);
    }

    document.querySelectorAll('.level-filter').forEach(btn => {
        const lvl = btn.getAttribute('data-level');
        if (lvl === 'all') {
            btn.classList.toggle('active', s.activeLevels.length === 0);
        } else {
            btn.classList.toggle('active', s.activeLevels.includes(parseInt(lvl)));
        }
    });

    const searchInput = document.getElementById('searchInput');
    if (searchInput) searchInput.value = s.searchQuery;
}

function updateSetting(path, value) {
    const parts = path.split('.');
    let obj = settingsStore;
    for (let i = 0; i < parts.length - 1; i++) obj = obj[parts[i]];
    obj[parts[parts.length - 1]] = value;
    syncDom();
    saveSettings();
}

function saveSettings() {
    const s = settingsStore;
    const serialized = {
        sellMode: s.sellMode,
        buyMode: s.buyMode,
        craftBuyMode: s.craftBuyMode,
        baseItemMode: s.baseItemMode,
        refineMode: s.refineMode,
        costFilters: s.costFilters,
        hideInstant: s.hideInstant,
        minVolume: s.minVolume,
        activeLevels: s.activeLevels,
        marketFeePct: s.marketFeePct,
        craftingDepth: s.craftingDepth,
        gear: s.gear,
    };
    try {
        localStorage.setItem('mwi-enhance-settings', JSON.stringify(serialized));
    } catch (e) { /* ignore */ }
}

function initStore() {
    Object.assign(settingsStore, DEFAULT_SETTINGS);
    settingsStore.activeLevels = [];
    settingsStore.sort = { col: 11, asc: false };
    settingsStore.searchQuery = '';
    settingsStore.gear = { ...DEFAULT_SETTINGS.gear };

    try {
        const raw = localStorage.getItem('mwi-enhance-settings');
        if (raw) {
            const saved = JSON.parse(raw);
            if (saved.sellMode) settingsStore.sellMode = saved.sellMode;
            if (saved.buyMode) settingsStore.buyMode = saved.buyMode;
            if (saved.craftBuyMode) settingsStore.craftBuyMode = saved.craftBuyMode;
            if (saved.baseItemMode) settingsStore.baseItemMode = saved.baseItemMode;
            if (saved.refineMode) settingsStore.refineMode = saved.refineMode;
            if (saved.costFilters) settingsStore.costFilters = saved.costFilters;
            if (typeof saved.hideInstant === 'boolean') settingsStore.hideInstant = saved.hideInstant;
            if (typeof saved.minVolume === 'number') settingsStore.minVolume = saved.minVolume;
            if (typeof saved.marketFeePct === 'number') settingsStore.marketFeePct = saved.marketFeePct;
            if (typeof saved.craftingDepth === 'number') settingsStore.craftingDepth = saved.craftingDepth;
            if (saved.activeLevels) settingsStore.activeLevels = saved.activeLevels;
            if (saved.sort) settingsStore.sort = saved.sort;
            if (saved.gear) Object.assign(settingsStore.gear, saved.gear);
        }
    } catch (e) { /* ignore */ }
}

function loadSettings() {
    initStore();
    syncDom();
}

function resetSettings() {
    try { localStorage.removeItem('mwi-enhance-settings'); } catch (e) { /* ignore */ }
    Object.assign(settingsStore, DEFAULT_SETTINGS);
    settingsStore.activeLevels = [];
    settingsStore.sort = { col: 11, asc: false };
    settingsStore.searchQuery = '';
    settingsStore.gear = { ...DEFAULT_SETTINGS.gear };
    syncDom();
    saveSettings();
    scheduleRecalc();
}

function getGearConfig() {
    const g = settingsStore.gear;
    const necklaceType = g.necklaceType || 'speed';
    const charmTier = g.charmTier || 'none';
    const parse = (id, def) => {
        const v = parseInt(g[id]);
        return isNaN(v) ? def : v;
    };
    return {
        enhancingLevel: parse('enhancingLevel', 110),
        observatoryLevel: parse('observatoryLevel', 4),
        enhancer: g.enhancer || 'celestial_enhancer',
        enhancerLevel: parse('enhancerLevel', 8),
        enchantedGlovesEquipped: !!g.enchantedGlovesEquipped,
        enchantedGlovesLevel: parse('enchantedGlovesLevel', 0),
        guzzlingPouchEquipped: !!g.guzzlingPouchEquipped,
        guzzlingPouchLevel: parse('guzzlingPouchLevel', 0),
        enhancerTopEquipped: !!g.enhancerTopEquipped,
        enhancerTopLevel: parse('enhancerTopLevel', 0),
        enhancerBotEquipped: !!g.enhancerBotEquipped,
        enhancerBotLevel: parse('enhancerBotLevel', 0),
        philoNeckEquipped: necklaceType === 'philo',
        philoNeckLevel: necklaceType === 'philo' ? parse('necklaceLevel', 0) : 0,
        speedNeckEquipped: necklaceType === 'speed',
        speedNeckLevel: necklaceType === 'speed' ? parse('necklaceLevel', 0) : 0,
        ringType: g.ringType || 'none',
        ringLevel: parse('ringLevel', 0),
        earringsType: g.earringsType || 'none',
        earringsLevel: parse('earringsLevel', 0),
        capeEquipped: !!g.capeEquipped,
        capeLevel: parse('capeLevel', 0),
        capeRefined: g.capeType === 'refined',
        artificerCapeEquipped: g.artificerCapeEquipped ?? true,
        artificerCapeLevel: parse('artificerCapeLevel', 0),
        artificerCapeRefined: g.artificerCapeType === 'refined',
        charmEquipped: charmTier !== 'none',
        charmTier: charmTier,
        charmLevel: charmTier !== 'none' ? parse('charmLevel', 0) : 0,
        teaEnhancing: !!g.teaEnhancing,
        teaSuperEnhancing: !!g.teaSuperEnhancing,
        teaUltraEnhancing: !!g.teaUltraEnhancing,
        teaBlessed: !!g.teaBlessed,
        teaWisdom: !!g.wisdomTea,
        artisanTea: !!g.artisanTea,
        achievementSuccessBonus: g.achievementBonus ? 0.2 : 0,
        enhancingBuffLevel: parse('enhancingBuffLevel', 0),
        experienceBuffLevel: parse('experienceBuffLevel', 0),
        productionEfficiencyBuffLevel: parse('productionEfficiencyBuffLevel', 0),
        buyMode: settingsStore.buyMode || 'pessimistic',
        craftBuyMode: settingsStore.craftBuyMode || 'pessimistic',
        baseItemMode: settingsStore.baseItemMode || 'best',
        refineMode: settingsStore.refineMode || 'auto',
        cheesesmithingLevel: parse('cheesesmithingLevel', 100),
        cheesesmithingTool: g.cheesesmithingTool || 'none',
        cheesesmithingToolLevel: parse('cheesesmithingToolLevel', 0),
        cheesesmithingTopEquipped: !!g.cheesesmithingTopEquipped,
        cheesesmithingTopLevel: parse('cheesesmithingTopLevel', 0),
        cheesesmithingBottomsEquipped: !!g.cheesesmithingBottomsEquipped,
        cheesesmithingBottomsLevel: parse('cheesesmithingBottomsLevel', 0),
        craftingLevel: parse('craftingLevel', 100),
        craftingTool: g.craftingTool || 'none',
        craftingToolLevel: parse('craftingToolLevel', 0),
        craftingTopEquipped: !!g.craftingTopEquipped,
        craftingTopLevel: parse('craftingTopLevel', 0),
        craftingBottomsEquipped: !!g.craftingBottomsEquipped,
        craftingBottomsLevel: parse('craftingBottomsLevel', 0),
        tailoringLevel: parse('tailoringLevel', 100),
        tailoringTool: g.tailoringTool || 'none',
        tailoringToolLevel: parse('tailoringToolLevel', 0),
        tailoringTopEquipped: !!g.tailoringTopEquipped,
        tailoringTopLevel: parse('tailoringTopLevel', 0),
        tailoringBottomsEquipped: !!g.tailoringBottomsEquipped,
        tailoringBottomsLevel: parse('tailoringBottomsLevel', 0),
        craftingTeaEfficiency: !!g.craftingTeaEfficiency,
        craftingTeaSuperEfficiency: !!g.craftingTeaSuperEfficiency,
        craftingTeaUltraEfficiency: !!g.craftingTeaUltraEfficiency,
        craftingEfficiencyTea: !!g.craftingEfficiencyTea,
        craftingWisdomTea: !!g.craftingWisdomTea,
        eyeWatchEquipped: g.eyeWatchEquipped ?? false,
        eyeWatchLevel: parse('eyeWatchLevel', 0),
        forgeLevel: parse('forgeLevel', 0),
        workshopLevel: parse('workshopLevel', 0),
        sewing_parlorLevel: parse('sewing_parlorLevel', 0),
        otherHouseLevel: parse('otherHouseLevel', 0),
        skipBaseResourceCrafting: g.skipBaseResourceCrafting ?? true,
        ignoreCraftEfficiency: g.ignoreCraftEfficiency ?? true,
        craftingDepth: settingsStore.craftingDepth,
        includeRareFind: g.includeRareFind ?? true,
    };
}

function resetGearSettings() {
    settingsStore.gear = { ...DEFAULT_SETTINGS.gear };
    syncDom();
    updateGearIcons();
    updateTeaLevelDisplay();
    saveSettings();
    scheduleRecalc();
}

function populateLevelSelects() {
    const selects = [
        'enhancerLevel', 'enchantedGlovesLevel', 'enhancerTopLevel', 'enhancerBotLevel',
        'necklaceLevel', 'ringLevel', 'earringsLevel', 'guzzlingPouchLevel', 'capeLevel', 'charmLevel',
        'cheesesmithingToolLevel', 'cheesesmithingTopLevel', 'cheesesmithingBottomsLevel',
        'craftingToolLevel', 'craftingTopLevel', 'craftingBottomsLevel',
        'tailoringToolLevel', 'tailoringTopLevel', 'tailoringBottomsLevel',
        'eyeWatchLevel', 'artificerCapeLevel',
        'enhancingBuffLevel', 'experienceBuffLevel', 'productionEfficiencyBuffLevel',
        'forgeLevel', 'workshopLevel', 'sewing_parlorLevel',
    ];
    for (const id of selects) {
        const el = document.getElementById(id);
        if (!el || el.tagName !== 'SELECT') continue;
        const current = el.value;
        el.innerHTML = '';
        for (let i = 0; i <= 20; i++) {
            const opt = document.createElement('option');
            opt.value = String(i);
            opt.textContent = String(i);
            el.appendChild(opt);
        }
        const hasCurrent = Array.from(el.options).some(o => o.value === current);
        if (hasCurrent) el.value = current;
    }
}

function populateCraftingToolDropdown() {
    // Already populated as static HTML with quality tiers
}

function populateEnhancerDropdown() {
    const gd = window.GAME_DATA_STATIC || {};
    const select = document.getElementById('enhancer');
    const current = select.value || select.dataset.default || 'celestial_enhancer';

    const enhancers = Object.entries(gd.items || {})
        .filter(([hrid, item]) => hrid.includes('_enhancer') && item.stats?.enhancingSuccess)
        .map(([hrid, item]) => ({
            value: hrid.replace('/items/', ''),
            label: item.name
        }))
        .sort((a, b) => {
            const aLevel = gd.items[`/items/${a.value}`]?.level || 0;
            const bLevel = gd.items[`/items/${b.value}`]?.level || 0;
            return bLevel - aLevel;
        });

    select.innerHTML = '';

    enhancers.forEach(enh => {
        const opt = document.createElement('option');
        opt.value = enh.value;
        opt.textContent = enh.label;
        select.appendChild(opt);
    });

    const hasCurrent = Array.from(select.options).some(o => o.value === current);
    select.value = hasCurrent ? current : (select.dataset.default || 'celestial_enhancer');
    updateGearIcons();
}

function populateCharmTierDropdown() {
    const gd = window.GAME_DATA_STATIC || {};
    const select = document.getElementById('charmTier');
    if (!select) return;

    const current = select.value || 'none';
    const tiers = Object.entries(gd.items || {})
        .filter(([hrid, item]) => hrid.endsWith('_enhancing_charm') && (item.stats?.enhancingExperience || 0) > 0)
        .map(([hrid, item]) => {
            const tier = hrid.replace('/items/', '').replace('_enhancing_charm', '');
            const label = (item.name || tier)
                .replace(/\s*Enhancing\s*Charm\s*$/i, '')
                .trim();
            return { tier, label, level: item.level || 0 };
        })
        .sort((a, b) => a.level - b.level);

    select.innerHTML = '';

    const none = document.createElement('option');
    none.value = 'none';
    none.textContent = 'None';
    select.appendChild(none);

    for (const entry of tiers) {
        const opt = document.createElement('option');
        opt.value = entry.tier;
        opt.textContent = entry.label;
        select.appendChild(opt);
    }

    const hasCurrent = Array.from(select.options).some(o => o.value === current);
    select.value = hasCurrent ? current : 'none';
}

function setupAutoCalc() {
    const selectors = [
        '#enhancingLevel', '#observatoryLevel', '#enhancer', '#enhancerLevel',
        '#enchantedGlovesEquipped', '#enchantedGlovesLevel',
        '#enhancerTopEquipped', '#enhancerTopLevel',
        '#enhancerBotEquipped', '#enhancerBotLevel',
        '#necklaceType', '#necklaceLevel',
        '#ringType', '#ringLevel',
        '#earringsType', '#earringsLevel',
        '#guzzlingPouchEquipped', '#guzzlingPouchLevel',
        '#capeEquipped', '#capeType', '#capeLevel',
        '#charmTier', '#charmLevel',
        '#teaEnhancing', '#teaSuperEnhancing', '#teaUltraEnhancing',
        '#teaBlessed', '#wisdomTea', '#artisanTea',
        '#enhancingBuffLevel', '#experienceBuffLevel', '#productionEfficiencyBuffLevel',
        '#achievementBonus',
        '#craftingTeaEfficiency', '#craftingTeaSuperEfficiency', '#craftingTeaUltraEfficiency',
        '#craftingEfficiencyTea', '#craftingWisdomTea',
        '#eyeWatchEquipped', '#eyeWatchLevel',
        '#artificerCapeEquipped', '#artificerCapeType', '#artificerCapeLevel',
        '#cheesesmithingLevel', '#cheesesmithingTool', '#cheesesmithingToolLevel',
        '#cheesesmithingTopEquipped', '#cheesesmithingTopLevel',
        '#cheesesmithingBottomsEquipped', '#cheesesmithingBottomsLevel',
        '#craftingLevel', '#craftingTool', '#craftingToolLevel',
        '#craftingTopEquipped', '#craftingTopLevel',
        '#craftingBottomsEquipped', '#craftingBottomsLevel',
        '#tailoringLevel', '#tailoringTool', '#tailoringToolLevel',
        '#tailoringTopEquipped', '#tailoringTopLevel',
        '#tailoringBottomsEquipped', '#tailoringBottomsLevel',
        '#forgeLevel', '#workshopLevel', '#sewing_parlorLevel', '#otherHouseLevel',
        '#skipBaseResourceCrafting',
        '#ignoreCraftEfficiency',
        '#includeRareFind',
    ];
    const onChange = () => {
        syncFromDom();
        syncGlobals();
        updateTeaLevelDisplay();
        saveSettings();
        const gd = window.GAME_DATA_STATIC;
        if (gd) calculator = new EnhanceCalculator(gd, getGearConfig());
        refreshBonuses();
        scheduleRecalc();
    };
    const onChangeWithIcons = () => { updateGearIcons(); onChange(); };
    for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (!el) continue;
        const handler = (sel === '#necklaceType' || sel === '#enhancer' || sel === '#capeType' || sel === '#artificerCapeType' || sel === '#cheesesmithingTool' || sel === '#craftingTool' || sel === '#tailoringTool' || sel === '#ringType' || sel === '#earringsType') ? onChangeWithIcons : onChange;
        el.addEventListener('change', handler);
    }

    document.querySelectorAll('.enh-tea').forEach(cb => {
        cb.addEventListener('change', function() {
            if (this.checked) {
                document.querySelectorAll('.enh-tea').forEach(c => { if (c !== this) c.checked = false; });
            }
            onChange();
        });
    });

    document.querySelectorAll('.craft-tea').forEach(cb => {
        cb.addEventListener('change', function() {
            if (this.checked) {
                document.querySelectorAll('.craft-tea').forEach(c => { if (c !== this) c.checked = false; });
            }
            onChange();
        });
    });
}
