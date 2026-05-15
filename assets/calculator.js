/**
 * calculator.js — Calculation orchestration, gear display helpers
 */

let recalcTimer = null;
let autoCalcPaused = false;
let calcGen = 0;

function scheduleRecalc() {
    if (autoCalcPaused) return;
    if (recalcTimer) clearTimeout(recalcTimer);
    updateStatus('Calculating...', 'loading');
    calcGen++;
    const myGen = calcGen;
    recalcTimer = setTimeout(() => calculateProfits(myGen), 300);
}

async function calculateProfits(gen) {
    try {
        updateStatus('Calculating...', 'loading');

        const config = getGearConfig();

        calculator = new EnhanceCalculator(gameData, config);

        // Calculate rare find from gear
        const gearRareFind = calculator.getRareFindMultiplier() - 1;
        const gearEssenceFind = calculator.getEssenceFindMultiplier() - 1;
        config.rareFindBonus = gearRareFind;
        config.essenceFindBonus = gearEssenceFind;

        const results = await calculateAllProfitsAsync(config);
        if (gen !== undefined && gen !== calcGen) return; // stale result, discard

        allResults = results;

        reSort();
        refreshBonuses();
    } catch (error) {
        console.error('Calculation error:', error);
        updateStatus(`Error: ${error.message}`, 'error');
    }
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
    const ringType = document.getElementById('ringType')?.value;
    const ringIcon = document.getElementById('ringIcon');
    if (ringIcon) {
        if (ringType === 'none') {
            ringIcon.style.display = 'none';
        } else {
            const map = { essence: 'Ring_of_essence_find', rare: 'Ring_of_rare_find', philo: 'Philosophers_ring' };
            ringIcon.src = 'assets/item_icons/' + (map[ringType] || 'Ring_of_essence_find') + '.svg';
            ringIcon.style.display = '';
        }
    }
    const earringsType = document.getElementById('earringsType')?.value;
    const earringsIcon = document.getElementById('earringsIcon');
    if (earringsIcon) {
        if (earringsType === 'none') {
            earringsIcon.style.display = 'none';
        } else {
            const map = { essence: 'Earrings_of_essence_find', rare: 'Earrings_of_rare_find', philo: 'Philosophers_earrings' };
            earringsIcon.src = 'assets/item_icons/' + (map[earringsType] || 'Earrings_of_essence_find') + '.svg';
            earringsIcon.style.display = '';
        }
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



function getArtisansCrateForItem(itemLevel) {
    if (itemLevel >= 70) {
        return { type: 'Large', hrid: '/items/large_artisans_crate' };
    } else if (itemLevel >= 35) {
        return { type: 'Medium', hrid: '/items/medium_artisans_crate' };
    } else if (itemLevel >= 1) {
        return { type: 'Small', hrid: '/items/small_artisans_crate' };
    }
    return null;
}

function getArtisansCrateMultiplier(itemLevel) {
    if (itemLevel < 35) return (itemLevel + 100) / 100;
    if (itemLevel < 70) return (itemLevel + 65) / 150;
    return (itemLevel + 30) / 200;
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
    const depthsToTry = isBest ? [0, 1, 2, 3, 4, 5, 6] : [Math.max(0, Math.min(config.craftingDepth ?? 3, 6))];

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

                    let essenceValue = 0;
                    let crateValue = 0;
                    let essenceChance = 0;
                    let crateChance = 0;
                    let crateType = '';
                    if (config.includeRareFind) {
                        const itemLevel = item.level || 1;
                        const essenceFind = config.essenceFindBonus || 0;
                        const rareFind = config.rareFindBonus || 0;

                        // Essence drop formula from Formulas.md: 10% + (ItemLevel/10)%
                        const essenceBaseRate = 0.10 + (itemLevel / 1000);
                        essenceChance = essenceBaseRate * (1 + essenceFind);
                        const essMarket = marketData?.market?.['/items/enhancing_essence'];
                        let essPrice = 0;
                        if (essMarket) {
                            for (const lv of Object.keys(essMarket)) {
                                const d = essMarket[lv];
                                essPrice = d?.b || d?.a || 0;
                                if (essPrice > 0) break;
                            }
                        }
                        if (essPrice <= 0) essPrice = 50;
                        essenceValue = essenceChance * essPrice;

                        const crateInfo = getArtisansCrateForItem(itemLevel);
                        if (crateInfo) {
                            crateType = crateInfo.type;
                            const multiplier = getArtisansCrateMultiplier(itemLevel);
                            const baseRate = 12 / 14400;
                            crateChance = baseRate * multiplier * (1 + rareFind);
                            let cratePrice = priceRes._resolveBuyPrice(crateInfo.hrid, 0, marketData.market, BuyMode.OPTIMISTIC).price;
                            if (cratePrice <= 0) {
                                const crateMarket = marketData?.market?.[crateInfo.hrid];
                                if (crateMarket) {
                                    for (const lv of Object.keys(crateMarket)) {
                                        cratePrice = priceRes._resolveBuyPrice(crateInfo.hrid, parseInt(lv), marketData.market, BuyMode.OPTIMISTIC).price;
                                        if (cratePrice > 0) break;
                                    }
                                }
                            }
                            crateValue = crateChance * cratePrice;
                        }
                    }

                    const rareFindValuePerAttempt = essenceValue + crateValue;
                    const totalRareFindValue = rareFindValuePerAttempt * enhance.actions;

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
                        essenceChance: essenceChance,
                        essenceValue: Math.round(essenceValue * enhance.actions),
                        crateType: crateType,
                        crateChance: crateChance,
                        crateValue: Math.round(crateValue * enhance.actions),
                        rareFindValue: Math.round(totalRareFindValue),
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

                    const rawPrice = sellPrices.pessimistic?.price || sellPrices.optimistic?.price || 0;
                    const feePct = getSettings().marketFeePct;
                    const selPrice = feePct > 0 ? Math.round(rawPrice * (1 - feePct / 100)) : rawPrice;
                    const profit = selPrice + totalRareFindValue - totalCost;
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
