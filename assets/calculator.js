/**
 * calculator.js — Calculation orchestration, gear display helpers
 */

let recalcTimer = null;
let autoCalcPaused = false;

function scheduleRecalc() {
    if (autoCalcPaused) return;
    if (recalcTimer) clearTimeout(recalcTimer);
    updateStatus('Calculating...', 'loading');
    recalcTimer = setTimeout(() => calculateProfits(), 300);
}

function updateTeaLevelDisplay() {
    const el = document.getElementById('teaLevelDisplay');
    if (!el) return;
    const gd = window.GAME_DATA_STATIC || {};
    const config = {
        guzzlingPouchLevel: parseInt(document.getElementById('guzzlingPouchLevel').value) || 0,
        guzzlingPouchEquipped: document.getElementById('guzzlingPouchEquipped').checked,
        enchantedGlovesEquipped: false,
        enhancerTopEquipped: false,
        enhancerBotEquipped: false,
        philoNeckEquipped: false,
        speedNeckEquipped: false,
        enhancerEquipped: false,
        charmEquipped: false,
    };
    const calc = new EnhanceCalculator(gd, config);
    const guzzling = calc.getGuzzlingBonus();
    let teaLevel = 0;
    if (document.getElementById('teaUltraEnhancing').checked) teaLevel = 8;
    else if (document.getElementById('teaSuperEnhancing').checked) teaLevel = 6;
    else if (document.getElementById('teaEnhancing').checked) teaLevel = 3;
    if (teaLevel > 0) {
        const effective = teaLevel * guzzling;
        el.textContent = `(+${effective.toFixed(1)})`;
        el.style.display = '';
    } else {
        el.style.display = 'none';
    }
}

function updateGearIcons() {
    const necklaceType = document.getElementById('necklaceType').value;
    const necklaceIcon = document.getElementById('necklaceIcon');
    if (necklaceIcon) {
        if (necklaceType === 'none') {
            necklaceIcon.style.display = 'none';
        } else {
            const map = { philo: 'Philosophers_necklace', speed: 'Necklace_of_speed' };
            const name = map[necklaceType];
            necklaceIcon.src = 'assets/item_icons/' + name + '.svg';
            necklaceIcon.style.display = '';
        }
    }
    const enhancerVal = document.getElementById('enhancer').value;
    const enhancerIcon = document.getElementById('enhancerIcon');
    if (enhancerIcon && enhancerVal) {
        const fileName = enhancerVal.charAt(0).toUpperCase() + enhancerVal.slice(1) + '.svg';
        enhancerIcon.src = 'assets/item_icons/' + fileName;
        enhancerIcon.style.display = '';
    }
    const capeType = document.getElementById('capeType')?.value;
    const capeIcon = document.getElementById('capeIcon');
    if (capeIcon) {
        capeIcon.src = capeType === 'refined' ? 'assets/item_icons/Chance_cape_refined.svg' : 'assets/item_icons/Chance_cape.svg';
        capeIcon.style.display = '';
    }
    const artificerCapeType = document.getElementById('artificerCapeType')?.value;
    const artificerCapeIcon = document.getElementById('artificerCapeIcon');
    if (artificerCapeIcon) {
        artificerCapeIcon.src = artificerCapeType === 'refined' ? 'assets/item_icons/Artificer_cape_refined.svg' : 'assets/item_icons/Artificer_cape.svg';
        artificerCapeIcon.style.display = '';
    }
    for (const skill of ['cheesesmithing', 'crafting', 'tailoring']) {
        const toolHrid = getCraftingToolHrid(skill);
        const iconId = skill + 'ToolIcon';
        const toolIcon = document.getElementById(iconId);
        if (toolIcon) {
            if (toolHrid) {
                toolIcon.src = hridToIconPath(toolHrid);
                toolIcon.style.display = '';
            } else {
                toolIcon.style.display = 'none';
            }
        }
    }
}

function _parseLevel(id, def) {
    const n = parseInt(document.getElementById(id).value);
    return isNaN(n) ? def : n;
}

async function calculateProfits() {
    try {
        updateStatus('Calculating...', 'loading');

        const necklaceType = document.getElementById('necklaceType').value;
        const charmTier = document.getElementById('charmTier').value;
        const config = {
            enhancingLevel: _parseLevel('enhancingLevel', 110),
            observatoryLevel: _parseLevel('observatoryLevel', 4),
            enhancer: document.getElementById('enhancer').value || 'celestial_enhancer',
            enhancerLevel: _parseLevel('enhancerLevel', 8),

            enchantedGlovesEquipped: document.getElementById('enchantedGlovesEquipped').checked,
            enchantedGlovesLevel: parseInt(document.getElementById('enchantedGlovesLevel').value) || 0,
            guzzlingPouchEquipped: document.getElementById('guzzlingPouchEquipped').checked,
            guzzlingPouchLevel: parseInt(document.getElementById('guzzlingPouchLevel').value) || 0,
            enhancerTopEquipped: document.getElementById('enhancerTopEquipped').checked,
            enhancerTopLevel: parseInt(document.getElementById('enhancerTopLevel').value) || 0,
            enhancerBotEquipped: document.getElementById('enhancerBotEquipped').checked,
            enhancerBotLevel: parseInt(document.getElementById('enhancerBotLevel').value) || 0,

            philoNeckEquipped: necklaceType === 'philo',
            philoNeckLevel: necklaceType === 'philo' ? parseInt(document.getElementById('necklaceLevel').value) || 0 : 0,
            speedNeckEquipped: necklaceType === 'speed',
            speedNeckLevel: necklaceType === 'speed' ? parseInt(document.getElementById('necklaceLevel').value) || 0 : 0,

            capeEquipped: document.getElementById('capeEquipped').checked,
            capeLevel: parseInt(document.getElementById('capeLevel').value) || 0,
            capeRefined: document.getElementById('capeType').value === 'refined',

            artificerCapeEquipped: document.getElementById('artificerCapeEquipped')?.checked ?? true,
            artificerCapeLevel: parseInt(document.getElementById('artificerCapeLevel')?.value || '0'),
            artificerCapeRefined: document.getElementById('artificerCapeType')?.value === 'refined',

            charmEquipped: charmTier !== 'none',
            charmTier: charmTier,
            charmLevel: charmTier !== 'none' ? parseInt(document.getElementById('charmLevel').value) || 0 : 0,

            teaEnhancing: document.getElementById('teaEnhancing').checked,
            teaSuperEnhancing: document.getElementById('teaSuperEnhancing').checked,
            teaUltraEnhancing: document.getElementById('teaUltraEnhancing').checked,
            teaBlessed: document.getElementById('teaBlessed').checked,
            teaWisdom: document.getElementById('wisdomTea').checked,
            artisanTea: document.getElementById('artisanTea').checked,

            achievementSuccessBonus: document.getElementById('achievementBonus').checked ? 0.2 : 0,

            enhancingBuffLevel: parseInt(document.getElementById('enhancingBuffLevel').value) || 0,
            experienceBuffLevel: parseInt(document.getElementById('experienceBuffLevel').value) || 0,
            productionEfficiencyBuffLevel: parseInt(document.getElementById('productionEfficiencyBuffLevel').value) || 0,

            buyMode: document.getElementById('buyMode').value || 'pessimistic',
            craftBuyMode: document.getElementById('craftBuyMode').value || 'pessimistic',
            baseItemMode: document.getElementById('baseItemMode').value || 'best',
            refineMode: document.getElementById('refineMode').value || 'auto',

            cheesesmithingLevel: _parseLevel('cheesesmithingLevel', 100),
            cheesesmithingTool: document.getElementById('cheesesmithingTool').value || 'none',
            cheesesmithingToolLevel: _parseLevel('cheesesmithingToolLevel', 0),
            cheesesmithingTopEquipped: document.getElementById('cheesesmithingTopEquipped').checked,
            cheesesmithingTopLevel: _parseLevel('cheesesmithingTopLevel', 0),
            cheesesmithingBottomsEquipped: document.getElementById('cheesesmithingBottomsEquipped').checked,
            cheesesmithingBottomsLevel: _parseLevel('cheesesmithingBottomsLevel', 0),
            craftingLevel: _parseLevel('craftingLevel', 100),
            craftingTool: document.getElementById('craftingTool').value || 'none',
            craftingToolLevel: _parseLevel('craftingToolLevel', 0),
            craftingTopEquipped: document.getElementById('craftingTopEquipped').checked,
            craftingTopLevel: _parseLevel('craftingTopLevel', 0),
            craftingBottomsEquipped: document.getElementById('craftingBottomsEquipped').checked,
            craftingBottomsLevel: _parseLevel('craftingBottomsLevel', 0),
            tailoringLevel: _parseLevel('tailoringLevel', 100),
            tailoringTool: document.getElementById('tailoringTool').value || 'none',
            tailoringToolLevel: _parseLevel('tailoringToolLevel', 0),
            tailoringTopEquipped: document.getElementById('tailoringTopEquipped').checked,
            tailoringTopLevel: _parseLevel('tailoringTopLevel', 0),
            tailoringBottomsEquipped: document.getElementById('tailoringBottomsEquipped').checked,
            tailoringBottomsLevel: _parseLevel('tailoringBottomsLevel', 0),

            craftingTeaEfficiency: document.getElementById('craftingTeaEfficiency')?.checked ?? false,
            craftingTeaSuperEfficiency: document.getElementById('craftingTeaSuperEfficiency')?.checked ?? false,
            craftingTeaUltraEfficiency: document.getElementById('craftingTeaUltraEfficiency')?.checked ?? false,
            craftingEfficiencyTea: document.getElementById('craftingEfficiencyTea')?.checked ?? false,
            craftingWisdomTea: document.getElementById('craftingWisdomTea')?.checked ?? false,
            eyeWatchEquipped: document.getElementById('eyeWatchEquipped')?.checked ?? false,
            eyeWatchLevel: parseInt(document.getElementById('eyeWatchLevel')?.value || '0'),
            artificerCapeEquipped: document.getElementById('artificerCapeEquipped')?.checked ?? true,
            artificerCapeLevel: parseInt(document.getElementById('artificerCapeLevel')?.value || '0'),
            artificerCapeRefined: document.getElementById('artificerCapeType')?.value === 'refined',

            forgeLevel: parseInt(document.getElementById('forgeLevel')?.value || '0'),
            workshopLevel: parseInt(document.getElementById('workshopLevel')?.value || '0'),
            sewing_parlorLevel: parseInt(document.getElementById('sewing_parlorLevel')?.value || '0'),
            skipBaseResourceCrafting: document.getElementById('skipBaseResourceCrafting')?.checked ?? true,
            ignoreCraftEfficiency: document.getElementById('ignoreCraftEfficiency')?.checked ?? true,
            craftingDepth: getDepth(),
        };

        calculator = new EnhanceCalculator(gameData, config);

        allResults = await calculateAllProfitsAsync(config);

        reSort();
        refreshBonuses();
    } catch (error) {
        console.error('Calculation error:', error);
        updateStatus(`Error: ${error.message}`, 'error');
    }
}

async function calculateAllProfitsAsync(config) {
    const results = [];
    const priceRes = new PriceResolver(gameData);
    const itemRes = new ItemResolver(gameData);

    const targetLevels = Array.from({ length: 20 }, (_, i) => i + 1);

    const buyMode = config.buyMode || 'pessimistic';
    const craftBuyMode = config.craftBuyMode || 'pessimistic';
    const baseItemMode = config.baseItemMode || 'best';
    const refineMode = config.refineMode || 'auto';
    const modeConfig = { matMode: buyMode, protMode: buyMode, sellMode: 'pessimistic' };

    const sellModes = ['pessimistic', 'pessimistic+', 'midpoint', 'optimistic-', 'optimistic'];

    const artisanMult = calculator.getArtisanTeaMultiplier();

    const isBest = config.craftingDepth === -1;
    const depthsToTry = isBest ? [0, 1, 2, 3, 4, 5, 6] : [Math.max(0, Math.min(config.craftingDepth || 3, 6))];

    const craftCalc = new CraftingTimeCalculator(gameData);
    const craftTimeCache = new Map();

    for (const [hrid, item] of Object.entries(gameData.items)) {
        if (!item.enhancementCosts) continue;

        for (const level of targetLevels) {
            try {
                const shopping = itemRes.resolve(hrid, level);
                if (!shopping) continue;

                let bestResult = null;
                let bestPerDay = -Infinity;

                for (const depth of depthsToTry) {
                    const resolved = priceRes.resolve(shopping, marketData.market, modeConfig, artisanMult, baseItemMode, craftBuyMode, refineMode, depth);

                    if (!resolved.basePrice || resolved.basePrice <= 0) continue;

                    const sellPrices = {};
                    let hasAnySell = false;
                    for (const sm of sellModes) {
                        const sd = priceRes._resolveSellPrice(hrid, level, marketData.market, sm);
                        sellPrices[sm] = { price: sd.price, actualMode: sd.actualMode, bid: sd.bid, ask: sd.ask };
                        if (sd.price > 0) hasAnySell = true;
                    }
                    if (!hasAnySell) continue;

                    const enhance = calculator.simulate(resolved, level, item.level || 1);
                    if (!enhance) continue;

                    let refineStrategy = null;
                    if (hrid.includes('_refined') && resolved.baseSource === 'craft') {
                        const stdHrid = hrid.replace('_refined', '');
                        const craftData = getCraftMaterials(hrid, craftBuyMode, baseItemMode, depth, 0, false, 1, refineMode);
                        if (craftData) {
                            const stdItem = craftData.items.find(m => m.hrid === stdHrid);
                            if (stdItem) {
                                refineStrategy = stdItem.source === 'market' ? 'buy-refine' : 'craft-refine';
                            }
                        }
                    }

                    const totalCost = enhance.totalCost;
                    const durationHours = (enhance.actions * enhance.attemptTime) / 3600;
                    const durationDays = durationHours / 24;

                    let craftingTimeInfo = null;
                    let craftDays = 0;
                    try {
                        const cacheKey = `${hrid}|${depth}`;
                        if (craftTimeCache.has(cacheKey)) {
                            craftingTimeInfo = craftTimeCache.get(cacheKey);
                        } else {
                            const depthConfig = Object.assign({}, config, { craftingDepth: depth });
                            craftingTimeInfo = craftCalc.getCraftingTimeRecursive(hrid, depthConfig);
                            craftTimeCache.set(cacheKey, craftingTimeInfo);
                        }
                        if (craftingTimeInfo) {
                            craftDays = craftingTimeInfo.totalCraftTime / 86400;
                        }
                    } catch (e) { console.warn('Craft time error for', hrid, e.message); }

                    const itemMarket = marketData.market[hrid] || {};
                    const levelData = itemMarket[String(level)] || {};
                    const volume = (typeof levelData.v === 'number' && levelData.v > 0) ? levelData.v : 0;

                    const result = {
                        hrid,
                        itemName: item.name || hrid.split('/').pop(),
                        level,
                        attempts: Math.round(enhance.actions * 100) / 100,
                        protectAt: enhance.protectAt,
                        protectCount: Math.round(enhance.protectCount * 100) / 100,
                        protectPrice: Math.round(enhance.protectPrice || 0),
                        protectHrid: enhance.protectHrid || null,
                        basePrice: Math.round(enhance.basePrice),
                        baseSource: enhance.baseSource || 'market',
                        matCost: Math.round(enhance.matCost),
                        totalCost: Math.round(totalCost),
                        sellPrices,
                        durationHours: Math.round(durationHours * 100) / 100,
                        durationDays,
                        xp: Math.round(enhance.totalXp),
                        attemptTime: enhance.attemptTime,
                        volume,
                        _resolvedPrices: resolved,
                        _buyMode: buyMode,
                        _craftBuyMode: craftBuyMode,
                        _baseItemMode: baseItemMode,
                        _refineMode: refineMode,
                        _refineStrategy: refineStrategy,
                        _craftingTimeInfo: craftingTimeInfo,
                        craftDays,
                        _usedDepth: depth,
                    };

                    if (!isBest) {
                        bestResult = result;
                        break;
                    }

                    const selPrice = sellPrices.pessimistic?.price || sellPrices.optimistic?.price || 0;
                    const profit = selPrice - totalCost;
                    const cmpPerDay = (durationDays + craftDays) > 0 ? profit / (durationDays + craftDays) : 0;
                    const wasBetter = cmpPerDay > bestPerDay;
                    if (wasBetter) {
                        bestPerDay = cmpPerDay;
                        bestResult = result;
                    }
                    console.debug(`[Best] ${hrid}+${level} D${depth}: cost=${formatCoin(Math.round(totalCost))} craftDays=${(craftDays).toFixed(4)} profit=${formatCoin(Math.round(profit))} $/d=${formatCoin(Math.round(cmpPerDay))} pick=${wasBetter ? 'YES' : 'no'}`);
                }

                if (bestResult) results.push(bestResult);
            } catch (error) {
                console.debug(`Error calculating ${hrid} +${level}:`, error.message);
            }
        }
    }

    return results;
}
