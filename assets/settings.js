/**
 * settings.js — Gear panel population, settings persistence
 */

function _collectGearSettings() {
    const g = id => {
        const el = document.getElementById(id);
        if (!el) return null;
        if (el.type === 'checkbox') return el.checked;
        if (el.tagName === 'SELECT') return el.value;
        return el.value;
    };
    return {
        enhancingLevel: g('enhancingLevel'),
        observatoryLevel: g('observatoryLevel'),
        enhancer: g('enhancer'),
        enhancerLevel: g('enhancerLevel'),
        enchantedGlovesEquipped: g('enchantedGlovesEquipped'),
        enchantedGlovesLevel: g('enchantedGlovesLevel'),
        enhancerTopEquipped: g('enhancerTopEquipped'),
        enhancerTopLevel: g('enhancerTopLevel'),
        enhancerBotEquipped: g('enhancerBotEquipped'),
        enhancerBotLevel: g('enhancerBotLevel'),
        necklaceType: g('necklaceType'),
        necklaceLevel: g('necklaceLevel'),
        guzzlingPouchEquipped: g('guzzlingPouchEquipped'),
        guzzlingPouchLevel: g('guzzlingPouchLevel'),
        capeEquipped: g('capeEquipped'),
        capeType: g('capeType'),
        capeLevel: g('capeLevel'),
        teaEnhancing: g('teaEnhancing'),
        teaSuperEnhancing: g('teaSuperEnhancing'),
        teaUltraEnhancing: g('teaUltraEnhancing'),
        teaBlessed: g('teaBlessed'),
        wisdomTea: g('wisdomTea'),
        artisanTea: g('artisanTea'),
        charmTier: g('charmTier'),
        charmLevel: g('charmLevel'),
        enhancingBuffLevel: g('enhancingBuffLevel'),
        experienceBuffLevel: g('experienceBuffLevel'),
        achievementBonus: g('achievementBonus'),
        productionEfficiencyBuffLevel: g('productionEfficiencyBuffLevel'),
        craftingTeaEfficiency: g('craftingTeaEfficiency'),
        craftingTeaSuperEfficiency: g('craftingTeaSuperEfficiency'),
        craftingTeaUltraEfficiency: g('craftingTeaUltraEfficiency'),
        craftingEfficiencyTea: g('craftingEfficiencyTea'),
        craftingWisdomTea: g('craftingWisdomTea'),
        eyeWatchEquipped: g('eyeWatchEquipped'),
        eyeWatchLevel: g('eyeWatchLevel'),
        artificerCapeEquipped: g('artificerCapeEquipped'),
        artificerCapeType: g('artificerCapeType'),
        artificerCapeLevel: g('artificerCapeLevel'),
        cheesesmithingLevel: g('cheesesmithingLevel'),
        cheesesmithingTool: g('cheesesmithingTool'),
        cheesesmithingToolLevel: g('cheesesmithingToolLevel'),
        cheesesmithingTopEquipped: g('cheesesmithingTopEquipped'),
        cheesesmithingTopLevel: g('cheesesmithingTopLevel'),
        cheesesmithingBottomsEquipped: g('cheesesmithingBottomsEquipped'),
        cheesesmithingBottomsLevel: g('cheesesmithingBottomsLevel'),
        craftingLevel: g('craftingLevel'),
        craftingTool: g('craftingTool'),
        craftingToolLevel: g('craftingToolLevel'),
        craftingTopEquipped: g('craftingTopEquipped'),
        craftingTopLevel: g('craftingTopLevel'),
        craftingBottomsEquipped: g('craftingBottomsEquipped'),
        craftingBottomsLevel: g('craftingBottomsLevel'),
        tailoringLevel: g('tailoringLevel'),
        tailoringTool: g('tailoringTool'),
        tailoringToolLevel: g('tailoringToolLevel'),
        tailoringTopEquipped: g('tailoringTopEquipped'),
        tailoringTopLevel: g('tailoringTopLevel'),
        tailoringBottomsEquipped: g('tailoringBottomsEquipped'),
        tailoringBottomsLevel: g('tailoringBottomsLevel'),
        forgeLevel: g('forgeLevel'),
        workshopLevel: g('workshopLevel'),
        sewing_parlorLevel: g('sewing_parlorLevel'),
        skipBaseResourceCrafting: g('skipBaseResourceCrafting'),
        ignoreCraftEfficiency: g('ignoreCraftEfficiency'),
    };
}

function _applyGearSettings(s) {
    const D = DEFAULT_SETTINGS.gear;
    const set = (id, val) => {
        const el = document.getElementById(id);
        if (!el) return;
        if (typeof val === 'boolean') el.checked = val;
        else el.value = val;
    };
    set('enhancingLevel', s.enhancingLevel ?? D.enhancingLevel);
    set('observatoryLevel', s.observatoryLevel ?? D.observatoryLevel);
    set('enhancer', s.enhancer ?? D.enhancer);
    set('enhancerLevel', s.enhancerLevel ?? D.enhancerLevel);
    set('enchantedGlovesEquipped', s.enchantedGlovesEquipped ?? D.enchantedGlovesEquipped);
    set('enchantedGlovesLevel', s.enchantedGlovesLevel ?? D.enchantedGlovesLevel);
    set('enhancerTopEquipped', s.enhancerTopEquipped ?? D.enhancerTopEquipped);
    set('enhancerTopLevel', s.enhancerTopLevel ?? D.enhancerTopLevel);
    set('enhancerBotEquipped', s.enhancerBotEquipped ?? D.enhancerBotEquipped);
    set('enhancerBotLevel', s.enhancerBotLevel ?? D.enhancerBotLevel);
    set('necklaceType', s.necklaceType ?? D.necklaceType);
    set('necklaceLevel', s.necklaceLevel ?? D.necklaceLevel);
    set('guzzlingPouchEquipped', s.guzzlingPouchEquipped ?? D.guzzlingPouchEquipped);
    set('guzzlingPouchLevel', s.guzzlingPouchLevel ?? D.guzzlingPouchLevel);
    set('capeEquipped', s.capeEquipped ?? D.capeEquipped);
    set('capeType', s.capeType ?? D.capeType);
    set('capeLevel', s.capeLevel ?? D.capeLevel);
    set('teaEnhancing', s.teaEnhancing ?? D.teaEnhancing);
    set('teaSuperEnhancing', s.teaSuperEnhancing ?? D.teaSuperEnhancing);
    set('teaUltraEnhancing', s.teaUltraEnhancing ?? D.teaUltraEnhancing);
    set('teaBlessed', s.teaBlessed ?? D.teaBlessed);
    set('wisdomTea', s.wisdomTea ?? D.wisdomTea);
    set('artisanTea', s.artisanTea ?? D.artisanTea);
    set('charmTier', s.charmTier ?? D.charmTier);
    set('charmLevel', s.charmLevel ?? D.charmLevel);
    set('enhancingBuffLevel', s.enhancingBuffLevel ?? D.enhancingBuffLevel);
    set('experienceBuffLevel', s.experienceBuffLevel ?? D.experienceBuffLevel);
    set('achievementBonus', s.achievementBonus ?? D.achievementBonus);
    set('productionEfficiencyBuffLevel', s.productionEfficiencyBuffLevel ?? D.productionEfficiencyBuffLevel);
    set('craftingTeaEfficiency', s.craftingTeaEfficiency ?? D.craftingTeaEfficiency);
    set('craftingTeaSuperEfficiency', s.craftingTeaSuperEfficiency ?? D.craftingTeaSuperEfficiency);
    set('craftingTeaUltraEfficiency', s.craftingTeaUltraEfficiency ?? D.craftingTeaUltraEfficiency);
    set('craftingEfficiencyTea', s.craftingEfficiencyTea ?? D.craftingEfficiencyTea);
    set('craftingWisdomTea', s.craftingWisdomTea ?? D.craftingWisdomTea);
    set('eyeWatchEquipped', s.eyeWatchEquipped ?? D.eyeWatchEquipped);
    set('eyeWatchLevel', s.eyeWatchLevel ?? D.eyeWatchLevel);
    set('artificerCapeEquipped', s.artificerCapeEquipped ?? D.artificerCapeEquipped);
    set('artificerCapeType', s.artificerCapeType ?? D.artificerCapeType);
    set('artificerCapeLevel', s.artificerCapeLevel ?? D.artificerCapeLevel);
    set('cheesesmithingLevel', s.cheesesmithingLevel ?? D.cheesesmithingLevel);
    set('cheesesmithingTool', s.cheesesmithingTool ?? D.cheesesmithingTool);
    set('cheesesmithingToolLevel', s.cheesesmithingToolLevel ?? D.cheesesmithingToolLevel);
    set('cheesesmithingTopEquipped', s.cheesesmithingTopEquipped ?? D.cheesesmithingTopEquipped);
    set('cheesesmithingTopLevel', s.cheesesmithingTopLevel ?? D.cheesesmithingTopLevel);
    set('cheesesmithingBottomsEquipped', s.cheesesmithingBottomsEquipped ?? D.cheesesmithingBottomsEquipped);
    set('cheesesmithingBottomsLevel', s.cheesesmithingBottomsLevel ?? D.cheesesmithingBottomsLevel);
    set('craftingLevel', s.craftingLevel ?? D.craftingLevel);
    set('craftingTool', s.craftingTool ?? D.craftingTool);
    set('craftingToolLevel', s.craftingToolLevel ?? D.craftingToolLevel);
    set('craftingTopEquipped', s.craftingTopEquipped ?? D.craftingTopEquipped);
    set('craftingTopLevel', s.craftingTopLevel ?? D.craftingTopLevel);
    set('craftingBottomsEquipped', s.craftingBottomsEquipped ?? D.craftingBottomsEquipped);
    set('craftingBottomsLevel', s.craftingBottomsLevel ?? D.craftingBottomsLevel);
    set('tailoringLevel', s.tailoringLevel ?? D.tailoringLevel);
    set('tailoringTool', s.tailoringTool ?? D.tailoringTool);
    set('tailoringToolLevel', s.tailoringToolLevel ?? D.tailoringToolLevel);
    set('tailoringTopEquipped', s.tailoringTopEquipped ?? D.tailoringTopEquipped);
    set('tailoringTopLevel', s.tailoringTopLevel ?? D.tailoringTopLevel);
    set('tailoringBottomsEquipped', s.tailoringBottomsEquipped ?? D.tailoringBottomsEquipped);
    set('tailoringBottomsLevel', s.tailoringBottomsLevel ?? D.tailoringBottomsLevel);
    set('forgeLevel', s.forgeLevel ?? D.forgeLevel);
    set('workshopLevel', s.workshopLevel ?? D.workshopLevel);
    set('sewing_parlorLevel', s.sewing_parlorLevel ?? D.sewing_parlorLevel);
    set('skipBaseResourceCrafting', s.skipBaseResourceCrafting ?? D.skipBaseResourceCrafting);
    set('ignoreCraftEfficiency', s.ignoreCraftEfficiency ?? D.ignoreCraftEfficiency);
}

function saveSettings() {
    const settings = {
        sellMode: currentSellMode,
        buyMode: document.getElementById('buyMode').value,
        craftBuyMode: document.getElementById('craftBuyMode').value,
        baseItemMode: document.getElementById('baseItemMode').value,
        refineMode: document.getElementById('refineMode').value,
        costFilters: costFilters,
        hideInstant: hideInstant,
        minVolume: minVolume,
        activeLevels: Array.from(activeLevels),
        marketFeePct: marketFeePct,
        craftingDepth: getDepth(),
        gear: _collectGearSettings(),
    };
    try {
        localStorage.setItem('mwi-enhance-settings', JSON.stringify(settings));
    } catch (e) { /* ignore */ }
}

function loadSettings() {
    try {
        const raw = localStorage.getItem('mwi-enhance-settings');
        if (!raw) return;
        const s = JSON.parse(raw);

        if (s.sellMode) {
            currentSellMode = s.sellMode;
            document.querySelectorAll('#sellModeButtons .mode-btn').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.mode === s.sellMode);
            });
        }

        if (s.buyMode) {
            document.getElementById('buyMode').value = s.buyMode;
            document.querySelectorAll('#buyModeButtons .mode-btn').forEach(b => {
                b.classList.toggle('active', b.dataset.mode === s.buyMode);
            });
        }

        if (s.craftBuyMode) {
            document.getElementById('craftBuyMode').value = s.craftBuyMode;
            document.querySelectorAll('#craftBuyModeButtons .mode-btn').forEach(b => {
                b.classList.toggle('active', b.dataset.mode === s.craftBuyMode);
            });
        }

        if (s.baseItemMode) {
            const modeMap = { 'market': 'ask' };
            const mode = modeMap[s.baseItemMode] || s.baseItemMode;
            document.getElementById('baseItemMode').value = mode;
            document.querySelectorAll('#baseItemModeButtons .mode-btn').forEach(b => {
                b.classList.toggle('active', b.dataset.mode === mode);
            });
        }

        if (s.refineMode) {
            document.getElementById('refineMode').value = s.refineMode;
            document.querySelectorAll('#refineModeButtons .mode-btn').forEach(b => {
                b.classList.toggle('active', b.dataset.mode === s.refineMode);
            });
        }

        if (s.costFilters) {
            costFilters = s.costFilters;
            for (const [key, val] of Object.entries(costFilters)) {
                const btn = document.querySelector(`.cost-filter[data-cost="${key}"]`);
                if (btn) btn.classList.toggle('active', val);
            }
        }

        if (typeof s.hideInstant === 'boolean') {
            hideInstant = s.hideInstant;
            document.getElementById('btn-hide-instant').classList.toggle('active', hideInstant);
        }

        if (typeof s.minVolume === 'number') {
            minVolume = s.minVolume;
            const volInput = document.getElementById('minVolumeInput');
            if (volInput) volInput.value = minVolume;
        }

        if (typeof s.marketFeePct === 'number') {
            marketFeePct = s.marketFeePct;
            const cb = document.getElementById('marketFeeToggle');
            if (cb) cb.checked = marketFeePct > 0;
        }

        if (typeof s.craftingDepth === 'number') {
            const depthInput = document.getElementById('craftingDepth');
            if (depthInput) depthInput.value = s.craftingDepth >= 6 ? 'all' : String(s.craftingDepth);
        }

        if (s.activeLevels && s.activeLevels.length > 0) {
            activeLevels = new Set(s.activeLevels);
            document.querySelectorAll('.level-filter').forEach(b => {
                const lvl = b.getAttribute('data-level');
                if (lvl === 'all') return;
                b.classList.toggle('active', activeLevels.has(parseInt(lvl)));
            });
            const allBtn = document.querySelector('.level-filter[data-level="all"]');
            if (allBtn) allBtn.classList.toggle('active', activeLevels.size === 0);
        }

        if (s.gear) {
            _applyGearSettings(s.gear);
        }
    } catch (e) { /* ignore parse errors */ }
}

function resetSettings() {
    try {
        localStorage.removeItem('mwi-enhance-settings');
    } catch (e) { /* ignore */ }

    const D = DEFAULT_SETTINGS;

    currentSellMode = D.sellMode;
    hideInstant = D.hideInstant;
    minVolume = D.minVolume;
    marketFeePct = D.marketFeePct;
    costFilters = { ...D.costFilters };
    activeLevels = new Set();

    document.querySelectorAll('#sellModeButtons .mode-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === D.sellMode);
    });
    document.getElementById('buyMode').value = D.buyMode;
    document.querySelectorAll('#buyModeButtons .mode-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.mode === D.buyMode);
    });
    document.getElementById('craftBuyMode').value = D.craftBuyMode;
    document.querySelectorAll('#craftBuyModeButtons .mode-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.mode === D.craftBuyMode);
    });
    document.getElementById('baseItemMode').value = D.baseItemMode;
    document.querySelectorAll('#baseItemModeButtons .mode-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.mode === D.baseItemMode);
    });
    document.getElementById('refineMode').value = D.refineMode;
    document.querySelectorAll('#refineModeButtons .mode-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.mode === D.refineMode);
    });

    for (const [key, val] of Object.entries(D.costFilters)) {
        const btn = document.querySelector(`.cost-filter[data-cost="${key}"]`);
        if (btn) btn.classList.toggle('active', val);
    }

    document.getElementById('btn-hide-instant').classList.toggle('active', D.hideInstant);
    const volInput = document.getElementById('minVolumeInput');
    if (volInput) volInput.value = D.minVolume;

    const feeCb = document.getElementById('marketFeeToggle');
    if (feeCb) feeCb.checked = D.marketFeePct > 0;

    const depthInput = document.getElementById('craftingDepth');
    if (depthInput) depthInput.value = D.craftingDepth >= 6 ? 'all' : String(D.craftingDepth);

    document.querySelectorAll('.level-filter').forEach(b => {
        const lvl = b.getAttribute('data-level');
        if (lvl === 'all') {
            b.classList.toggle('active', true);
        } else {
            b.classList.remove('active');
        }
    });

    _applyGearSettings(D.gear);
    updateGearIcons();
    updateTeaLevelDisplay();
    saveSettings();
    scheduleRecalc();
}

function populateLevelSelects() {
    const selects = [
        'enhancerLevel', 'enchantedGlovesLevel', 'enhancerTopLevel', 'enhancerBotLevel',
        'necklaceLevel', 'guzzlingPouchLevel', 'capeLevel', 'charmLevel',
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
        '#forgeLevel', '#workshopLevel', '#sewing_parlorLevel',
        '#skipBaseResourceCrafting',
        '#ignoreCraftEfficiency',
    ];
    const onChange = () => { updateTeaLevelDisplay(); saveSettings(); scheduleRecalc(); };
    const onChangeWithIcons = () => { updateGearIcons(); onChange(); };
    for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (!el) continue;
        const handler = (sel === '#necklaceType' || sel === '#enhancer' || sel === '#capeType' || sel === '#artificerCapeType' || sel === '#cheesesmithingTool' || sel === '#craftingTool' || sel === '#tailoringTool') ? onChangeWithIcons : onChange;
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
