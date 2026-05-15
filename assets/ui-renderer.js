/**
 * ui-renderer.js — All rendering functions, detail view, sorting
 */

function getProfit(r) {
    const includeRare = document.getElementById('includeRareFind')?.checked ?? true;
    return getSellPrice(r) - r.totalCost + (includeRare ? (r.rareFindValue || 0) : 0);
}

function reSort() {
    const col = currentSort.col;
    const asc = currentSort.asc;
    allResults.sort((a, b) => {
        let aVal, bVal;
        switch (col) {
            case 0: aVal = a.itemName; bVal = b.itemName; break;
            case 1: aVal = a.level; bVal = b.level; break;
            case 2: aVal = getStrategyLabel(a); bVal = getStrategyLabel(b); break;
            case 3: aVal = a.basePrice; bVal = b.basePrice; break;
            case 4: aVal = a.matCost; bVal = b.matCost; break;
            case 5: aVal = a.matCost > 0 ? (getProfit(a) / a.matCost) * 100 : 0; bVal = b.matCost > 0 ? (getProfit(b) / b.matCost) * 100 : 0; break;
            case 6: aVal = getSellPrice(a); bVal = getSellPrice(b); break;
            case 7: aVal = a.volume; bVal = b.volume; break;
            case 8: aVal = getProfit(a); bVal = getProfit(b); break;
            case 9: aVal = a.totalCost > 0 ? (getProfit(a) / a.totalCost) * 100 : 0; bVal = b.totalCost > 0 ? (getProfit(b) / b.totalCost) * 100 : 0; break;
            case 10: aVal = a.durationDays > 0 ? getProfit(a) / a.durationDays : 0; bVal = b.durationDays > 0 ? getProfit(b) / b.durationDays : 0; break;
            case 11: {
                const aCraftDays = (a.craftDays || 0) + a.durationDays;
                const bCraftDays = (b.craftDays || 0) + b.durationDays;
                aVal = aCraftDays > 0 ? getProfit(a) / aCraftDays : 0;
                bVal = bCraftDays > 0 ? getProfit(b) / bCraftDays : 0;
                break;
            }
            case 12: aVal = a.durationHours; bVal = b.durationHours; break;
            case 13: aVal = a.durationDays > 0 ? (a.xp / a.durationDays) : 0; bVal = b.durationDays > 0 ? (b.xp / b.durationDays) : 0; break;
            case 14: {
                const aCraftDays14 = (a.craftDays || 0) + a.durationDays;
                const bCraftDays14 = (b.craftDays || 0) + b.durationDays;
                aVal = aCraftDays14 > 0 ? (a.xp / aCraftDays14) : 0;
                bVal = bCraftDays14 > 0 ? (b.xp / bCraftDays14) : 0;
                break;
            }
            default: aVal = 0; bVal = 0;
        }
        const cmp = typeof aVal === 'string' ? aVal.localeCompare(bVal) : (aVal || 0) - (bVal || 0);
        return asc ? cmp : -cmp;
    });
    renderResults();
}

function updateSortIndicators() {
    const cols = document.querySelectorAll('#resultsTable thead tr th[onclick]');
    for (const th of cols) {
        const m = th.getAttribute('onclick')?.match(/sortTable\((\d+)\)/);
        if (!m) continue;
        const idx = parseInt(m[1]);
        let existing = th.querySelector('.sort-arrow');
        if (existing) existing.remove();
        if (idx === currentSort.col) {
            const arrow = document.createElement('span');
            arrow.className = 'sort-arrow';
            arrow.textContent = ' ' + (currentSort.asc ? '▲' : '▼');
            th.appendChild(arrow);
        }
    }
}

function refreshBonuses() {
    const container = document.getElementById('bonusesContent');
    if (!container || !calculator) return;
    const calc = calculator;
    const cfg = calc.config;
    const eb = calc.enhanceBonus;

    const effectiveLevel = calc.getEffectiveLevel();
    const totalBonus = calc.getTotalBonus(effectiveLevel);
    const speedTime = calc.getAttemptTime(effectiveLevel);
    const baseTime = 12;

    const includeRare = cfg.includeRareFind ?? true;
    const rareFindMult = calc.getRareFindMultiplier();
    const essenceFindMult = calc.getEssenceFindMultiplier();
    const rarePct = ((rareFindMult - 1) * 100).toFixed(1);
    const essPct = ((essenceFindMult - 1) * 100).toFixed(1);

    const enhancer = cfg.enhancer || 'celestial_enhancer';
    const enhLv = Math.max(0, cfg.enhancerLevel || 0);
    const obsLv = cfg.observatoryLevel || 0;
    const guzzling = calc.getGuzzlingBonus();

    // --- Success bonus breakdown ---
    const enhSucc = calc.getEnhancerBonus();
    const achSucc = cfg.achievementSuccessBonus || 0;
    const obsSucc = 0.05 * obsLv;
    const succTipLines = [];
    if (enhSucc > 0) succTipLines.push(`${enhancer.replace(/_/g, ' ')} (Lv ${enhLv})|+${enhSucc.toFixed(2)}%`);
    if (achSucc > 0) succTipLines.push(`Achievements|+${achSucc.toFixed(2)}%`);
    if (obsLv > 0) succTipLines.push(`Observatory (Lv ${obsLv})|+${obsSucc.toFixed(2)}%`);
    succTipLines.push(`Level advantage|not included`);

    // --- Speed bonus breakdown ---
    let teaSpeed = 0; let teaLabel = '';
    if (cfg.teaUltraEnhancing) { teaSpeed = 6 * guzzling; teaLabel = 'Ultra Enhancing Tea'; }
    else if (cfg.teaSuperEnhancing) { teaSpeed = 4 * guzzling; teaLabel = 'Super Enhancing Tea'; }
    else if (cfg.teaEnhancing) { teaSpeed = 2 * guzzling; teaLabel = 'Standard Enhancing Tea'; }

    const spdTipLines = [];
    if (teaSpeed > 0) spdTipLines.push(`${teaLabel}|+${teaSpeed.toFixed(2)}% (conc: ${((guzzling - 1) * 100).toFixed(1)}%)`);

    if (cfg.enchantedGlovesEquipped !== false) {
        const lv = Math.max(0, cfg.enchantedGlovesLevel || 0);
        const base = calc._getNoncombatStat('/items/enchanted_gloves', 'enhancingSpeed');
        if (base > 0) { const val = base * 100 * eb[lv]; spdTipLines.push(`Enchanted Gloves (Lv ${lv})|+${val.toFixed(2)}%`); }
    }
    if (cfg.enhancerTopEquipped) {
        const lv = Math.max(0, cfg.enhancerTopLevel || 0);
        const base = calc._getNoncombatStat('/items/enhancers_top', 'enhancingSpeed');
        if (base > 0) { const val = base * 100 * eb[lv]; spdTipLines.push(`Enhancer Top (Lv ${lv})|+${val.toFixed(2)}%`); }
    }
    if (cfg.enhancerBotEquipped) {
        const lv = Math.max(0, cfg.enhancerBotLevel || 0);
        const base = calc._getNoncombatStat('/items/enhancers_bottoms', 'enhancingSpeed');
        if (base > 0) { const val = base * 100 * eb[lv]; spdTipLines.push(`Enhancer Bottoms (Lv ${lv})|+${val.toFixed(2)}%`); }
    }
    if (cfg.philoNeckEquipped) {
        const lv = Math.max(0, cfg.philoNeckLevel || 0);
        const base = calc._getNoncombatStat('/items/philosophers_necklace', 'skillingSpeed');
        if (base > 0) { const val = base * 100 * (((eb[lv] - 1) * 5) + 1); spdTipLines.push(`Philosopher's Necklace (Lv ${lv})|+${val.toFixed(2)}%`); }
    } else if (cfg.speedNeckEquipped) {
        const lv = Math.max(0, cfg.speedNeckLevel || 0);
        const base = calc._getNoncombatStat('/items/necklace_of_speed', 'skillingSpeed');
        if (base > 0) { const val = base * 100 * (((eb[lv] - 1) * 5) + 1); spdTipLines.push(`Necklace of Speed (Lv ${lv})|+${val.toFixed(2)}%`); }
    }
    if (cfg.capeEquipped !== false && cfg.capeLevel !== undefined) {
        const lv = Math.max(0, cfg.capeLevel || 0);
        const capeHrid = cfg.capeRefined ? '/items/chance_cape_refined' : '/items/chance_cape';
        const base = calc._getNoncombatStat(capeHrid, 'enhancingSpeed');
        if (base > 0) { const val = base * 100 * (((eb[lv] - 1) * 5) + 1); spdTipLines.push(`Chance Cape${cfg.capeRefined ? ' (R)' : ''} (Lv ${lv})|+${val.toFixed(2)}%`); }
    }
    const spdBuffLv = cfg.enhancingBuffLevel || 0;
    if (spdBuffLv > 0) spdTipLines.push(`Community buff (Lv ${spdBuffLv})|+${(19.5 + spdBuffLv * 0.5).toFixed(1)}%`);
    if (obsLv > 0) spdTipLines.push(`Observatory (Lv ${obsLv})|+${obsLv.toFixed(1)}%`);
    spdTipLines.push(`Level advantage|not included`);

    const speedMult = (baseTime / speedTime).toFixed(2);
    const totalSuccPct = ((totalBonus - 1) * 100).toFixed(2);

    // --- Wisdom (XP) bonus breakdown ---
    const wisdTipLines = [];
    let wisdTotal = 0;
    if (cfg.wisdomTea) { const v = 0.12 * guzzling; wisdTipLines.push(`Wisdom Tea|+${(v * 100).toFixed(2)}%`); wisdTotal += v; }
    if (cfg.enhancerEquipped !== false && cfg.enhancer) {
        const base = calc._getNoncombatStat(`/items/${cfg.enhancer}`, 'enhancingExperience');
        if (base > 0) { const lv = Math.max(0, cfg.enhancerLevel || 0); const v = base * eb[lv]; wisdTipLines.push(`${cfg.enhancer.replace(/_/g, ' ')} (Lv ${lv})|+${(v * 100).toFixed(2)}%`); wisdTotal += v; }
    }
    if (cfg.enhancerBotEquipped) {
        const lv = Math.max(0, cfg.enhancerBotLevel || 0);
        const base = calc._getNoncombatStat('/items/enhancers_bottoms', 'enhancingExperience');
        if (base > 0) { const v = base * eb[lv]; wisdTipLines.push(`Enhancer Bottoms (Lv ${lv})|+${(v * 100).toFixed(2)}%`); wisdTotal += v; }
    }
    if (cfg.philoNeckEquipped) {
        const lv = Math.max(0, cfg.philoNeckLevel || 0);
        const base = calc._getNoncombatStat('/items/philosophers_necklace', 'skillingExperience');
        if (base > 0) { const v = base * (((eb[lv] - 1) * 5) + 1); wisdTipLines.push(`Philosopher's Necklace (Lv ${lv})|+${(v * 100).toFixed(2)}%`); wisdTotal += v; }
    }
    if (cfg.charmEquipped && cfg.charmTier && cfg.charmTier !== 'none') {
        const lv = Math.max(0, cfg.charmLevel || 0);
        const base = calc._getNoncombatStat(`/items/${cfg.charmTier}_enhancing_charm`, 'enhancingExperience');
        if (base > 0) { const v = base * (((eb[lv] - 1) * 5) + 1); wisdTipLines.push(`${cfg.charmTier.charAt(0).toUpperCase() + cfg.charmTier.slice(1)} Charm (Lv ${lv})|+${(v * 100).toFixed(2)}%`); wisdTotal += v; }
    }
    if (cfg.capeEquipped !== false && cfg.capeLevel !== undefined) {
        const lv = Math.max(0, cfg.capeLevel || 0);
        const capeHrid = cfg.capeRefined ? '/items/chance_cape_refined' : '/items/chance_cape';
        const base = calc._getNoncombatStat(capeHrid, 'enhancingExperience');
        if (base > 0) { const v = base * (((eb[lv] - 1) * 5) + 1); wisdTipLines.push(`Chance Cape${cfg.capeRefined ? ' (R)' : ''} (Lv ${lv})|+${(v * 100).toFixed(2)}%`); wisdTotal += v; }
    }
    const expBuffLv = cfg.experienceBuffLevel || 0;
    if (expBuffLv > 0) { const v = 0.195 + expBuffLv * 0.005; wisdTipLines.push(`Community buff (Lv ${expBuffLv})|+${(v * 100).toFixed(2)}%`); wisdTotal += v; }

    const houseTotal = (cfg.forgeLevel || 0) + (cfg.workshopLevel || 0) + (cfg.sewing_parlorLevel || 0) + (cfg.otherHouseLevel || 0) + (cfg.observatoryLevel || 0);
    const houseWisd = houseTotal * 0.0005;
    if (houseWisd > 0) { wisdTipLines.push(`House rooms (Lv ${houseTotal})|+${(houseWisd * 100).toFixed(2)}%`); wisdTotal += houseWisd; }

    const wisdPct = (wisdTotal * 100).toFixed(2);

    // --- Rare Find breakdown ---
    const rareTipLines = [];
    if (calc._getNoncombatStat(`/items/${enhancer}`, 'enhancingRareFind') > 0) {
        const lv = Math.max(0, cfg.enhancerLevel || 0);
        const base = calc._getNoncombatStat(`/items/${enhancer}`, 'enhancingRareFind');
        rareTipLines.push(`${enhancer.replace(/_/g, ' ')} (Lv ${lv})|+${(base * eb[lv] * 100).toFixed(2)}%`);
    }
    if (cfg.enhancerTopEquipped) {
        const lv = Math.max(0, cfg.enhancerTopLevel || 0);
        const base = calc._getNoncombatStat('/items/enhancers_top', 'enhancingRareFind');
        if (base > 0) rareTipLines.push(`Enhancer Top (Lv ${lv})|+${(base * eb[lv] * 100).toFixed(2)}%`);
    }
    const ringType = cfg.ringType || 'none';
    if (ringType === 'rare' || ringType === 'philo') {
        const lv = Math.max(0, cfg.ringLevel || 0);
        const mult = (eb[lv] - 1) * 5 + 1;
        const hrid = ringType === 'philo' ? '/items/philosophers_ring' : '/items/ring_of_rare_find';
        const base = calc._getNoncombatStat(hrid, 'skillingRareFind');
        if (base > 0) rareTipLines.push(`${ringType === 'philo' ? "Philosopher's Ring" : 'Ring of Rare Find'} (Lv ${lv})|+${(base * mult * 100).toFixed(2)}%`);
    }
    const earringsType = cfg.earringsType || 'none';
    if (earringsType === 'rare' || earringsType === 'philo') {
        const lv = Math.max(0, cfg.earringsLevel || 0);
        const mult = (eb[lv] - 1) * 5 + 1;
        const hrid = earringsType === 'philo' ? '/items/philosophers_earrings' : '/items/earrings_of_rare_find';
        const base = calc._getNoncombatStat(hrid, 'skillingRareFind');
        if (base > 0) rareTipLines.push(`${earringsType === 'philo' ? "Philosopher's Earrings" : 'Earrings of Rare Find'} (Lv ${lv})|+${(base * mult * 100).toFixed(2)}%`);
    }
    const rareHouseTotal = (cfg.forgeLevel || 0) + (cfg.workshopLevel || 0) + (cfg.sewing_parlorLevel || 0) + (cfg.otherHouseLevel || 0) + (cfg.observatoryLevel || 0);
    const houseRare = rareHouseTotal * 0.002;
    if (houseRare > 0) rareTipLines.push(`House rooms (Lv ${rareHouseTotal})|+${(houseRare * 100).toFixed(2)}%`);

    // --- Essence Find breakdown ---
    const essTipLines = [];
    if (ringType === 'essence' || ringType === 'philo') {
        const lv = Math.max(0, cfg.ringLevel || 0);
        const mult = (eb[lv] - 1) * 5 + 1;
        const hrid = ringType === 'philo' ? '/items/philosophers_ring' : '/items/ring_of_essence_find';
        const base = calc._getNoncombatStat(hrid, 'skillingEssenceFind');
        if (base > 0) essTipLines.push(`${ringType === 'philo' ? "Philosopher's Ring" : 'Ring of Essence Find'} (Lv ${lv})|+${(base * mult * 100).toFixed(2)}%`);
    }
    if (earringsType === 'essence' || earringsType === 'philo') {
        const lv = Math.max(0, cfg.earringsLevel || 0);
        const mult = (eb[lv] - 1) * 5 + 1;
        const hrid = earringsType === 'philo' ? '/items/philosophers_earrings' : '/items/earrings_of_essence_find';
        const base = calc._getNoncombatStat(hrid, 'skillingEssenceFind');
        if (base > 0) essTipLines.push(`${earringsType === 'philo' ? "Philosopher's Earrings" : 'Earrings of Essence Find'} (Lv ${lv})|+${(base * mult * 100).toFixed(2)}%`);
    }

    const esc = s => s.replace(/"/g, '&quot;');

    let html = `<div>Enhance Succ Bonus: +${totalSuccPct}% <span class="info-icon" data-tip="${esc(succTipLines.join('\n'))}">ⓘ</span></div>`;
    html += `<div>Enhance Speed Bonus: ${speedMult}x <span class="info-icon" data-tip="${esc(spdTipLines.join('\n'))}">ⓘ</span></div>`;
    html += `<div>Wisdom (XP) Bonus: +${wisdPct}% <span class="info-icon" data-tip="${esc(wisdTipLines.join('\n'))}">ⓘ</span></div>`;
    if (includeRare) {
        html += `<div style="margin-top:2px;">Rare Find: +${rarePct}% <span class="info-icon" data-tip="${esc(rareTipLines.join('\n'))}">ⓘ</span> | Essence Find: +${essPct}% <span class="info-icon" data-tip="${esc(essTipLines.join('\n'))}">ⓘ</span></div>`;
    }
    html += `<div style="font-size:0.65rem;color:var(--text-muted);margin-top:1px;">* doesn't include level advantage</div>`;

    container.innerHTML = html;
    setupTooltips();
}

function renderShoppingList(r) {
    const resolved = r._resolvedPrices;
    if (!resolved || !resolved.matPrices) return '';
    const materials = resolved.matPrices;
    const gameData = window.GAME_DATA_STATIC || {};

    let rows = '';
    let totalMatCost = 0;

    for (const [count, price, detail] of materials) {
        const totalQty = count * r.attempts;
        const total = totalQty * price;
        totalMatCost += total;
        const itemName = detail?.hrid ? (gameData.items[detail.hrid]?.name || detail.hrid.split('/').pop().replace(/_/g, ' ')) : 'Unknown';
        const iconHtml = detail?.hrid ? `<img src="${hridToIconPath(detail.hrid)}" onerror="this.style.display='none'" style="width:16px;height:16px;vertical-align:middle;margin-right:4px;">` : '';
        rows += `<div class="shop-row">
            <span class="shop-name">${iconHtml}${itemName}</span>
            <span class="shop-qty-text">${Number(totalQty.toFixed(1)).toLocaleString()}x</span>
            <span class="shop-unit">@ ${formatCoinExact(price)}</span>
        </div>`;
    }

    if (r.protectHrid && (r.protectCount || 0) > 0) {
        const protItem = gameData.items[r.protectHrid];
        const protName = protItem?.name || r.protectHrid.split('/').pop().replace(/_/g, ' ');
        const protTotal = (r.protectCount || 0) * (r.protectPrice || 0);
        const protIcon = `<img src="${hridToIconPath(r.protectHrid)}" onerror="this.style.display='none'" style="width:16px;height:16px;vertical-align:middle;margin-right:4px;">`;
        rows += `<div class="shop-row">
            <span class="shop-name">${protIcon}${protName}</span>
            <span class="shop-qty-text">${(r.protectCount || 0).toFixed(1)}x</span>
            <span class="shop-unit">@ ${formatCoinExact(r.protectPrice)}</span>
        </div>`;
    }

    return `<div class="shop-header">
        <span class="shop-col">Item</span>
        <span class="shop-col">Qty</span>
        <span class="shop-col">Unit</span>
    </div>${rows}<div class="shop-row total-row">
        <span class="shop-name">Total Materials</span>
        <span class="shop-qty-text">${formatCoin(Math.round(totalMatCost))}</span>
        <span class="shop-unit"></span>
    </div>`;
}

function renderBaseItemSection(r) {
    const resolved = r._resolvedPrices;
    if (!resolved) return '';

    const hrid = r.hrid;
    const baseItemMode = r._baseItemMode || 'best';
    const refineMode = r._refineMode || 'auto';
    const craftBuyMode = document.getElementById('craftBuyMode')?.value || 'pessimistic';

    const priceRes = new PriceResolver(window.GAME_DATA_STATIC || {});
    const marketAskRes = priceRes._resolveBuyPrice(hrid, 0, marketData.market, 'pessimistic');
    const marketBidRes = priceRes._resolveBuyPrice(hrid, 0, marketData.market, 'optimistic');
    const askPrice = marketAskRes.ask > 0 ? marketAskRes.ask : 0;
    const bidPrice = marketBidRes.bid > 0 ? marketBidRes.bid : 0;

    const cDepth = r._usedDepth !== undefined ? r._usedDepth : getDepth();
    const rMode = r._refineMode || document.getElementById('refineMode')?.value || 'auto';
    const craftData = getCraftMaterials(hrid, craftBuyMode, baseItemMode, cDepth, 0, false, 1, rMode);

    let usedSource, usedPrice;
    if (baseItemMode === 'ask') {
        usedSource = 'ask';
        usedPrice = askPrice;
    } else if (baseItemMode === 'bid') {
        usedSource = 'bid';
        usedPrice = bidPrice;
    } else if (baseItemMode === 'craft') {
        usedSource = 'craft';
        usedPrice = craftData?.total || 0;
    } else { // best
        const candidates = [];
        if (askPrice > 0) candidates.push({ price: askPrice, source: 'ask' });
        if (craftData?.total > 0) candidates.push({ price: craftData.total, source: 'craft' });
        if (candidates.length > 0) {
            candidates.sort((a, b) => a.price - b.price);
            usedSource = candidates[0].source;
            usedPrice = candidates[0].price;
        } else {
            usedSource = 'none';
            usedPrice = 0;
        }
    }

    if (hrid.includes('_refined') && refineMode === 'refine') {
        usedSource = 'craft';
        usedPrice = craftData?.total || 0;
    } else if (hrid.includes('_refined') && refineMode === 'buy-r') {
        if (askPrice > 0) {
            usedSource = 'ask';
            usedPrice = askPrice;
        } else if (bidPrice > 0) {
            usedSource = 'bid';
            usedPrice = bidPrice;
        }
    }

    let html = '';
    if (askPrice > 0) {
        html += `<div class="detail-line">
            <span class="left">Market ask</span>
            <span class="right">${formatCoin(askPrice)}</span>
            <span class="detail-icon"></span>
        </div>`;
    }
    if (bidPrice > 0) {
        html += `<div class="detail-line">
            <span class="left">Market bid</span>
            <span class="right">${formatCoin(bidPrice)}</span>
            <span class="detail-icon"></span>
        </div>`;
    }

    if (craftData) {
        const craftCalc = new CraftingTimeCalculator(window.GAME_DATA_STATIC || {});
        const craftConfig = _collectGearSettings();
        let topCtSeconds = 0;
        let topCraftTimeInfo = null;
        try {
            topCraftTimeInfo = craftCalc.getCraftingTimeRecursive(hrid, craftConfig);
            if (topCraftTimeInfo) topCtSeconds = topCraftTimeInfo.totalCraftTime;
        } catch (e) {}
        const effIgnoredLabel = (topCraftTimeInfo && topCraftTimeInfo.efficiencyIgnored) ? ' <span style="color:#f59e0b;font-size:0.72rem;">no eff.</span>' : '';
        html += `<div class="detail-line">
            <span class="left">Craft price</span>
            <span class="right">${formatCoin(craftData.total)}${topCtSeconds > 0 ? ` <span style="color:var(--text-muted);font-size:0.72rem;">(${formatSeconds(topCtSeconds)})</span>${effIgnoredLabel}` : ''}</span>
            <span class="detail-icon">🔨</span>
        </div>`;
        html += `<div class="craft-breakdown">`;
        const skipBase = craftConfig.skipBaseResourceCrafting !== false;
        function renderCraftItem(item, depth = 0) {
            const itemIcon = item.source === 'craft' ? '🔨' : '💰';
            let nameHtml = item.name;
            const isBase = skipBase && craftCalc.isBaseResource(item.hrid);
            const showDepth = item.depthLevel !== undefined && item.source === 'craft' && !isBase;
            if (showDepth) {
                const dColor = item.depthReached ? '#a855f7' : 'var(--text-muted)';
                nameHtml += ` <span style="color:${dColor};font-size:0.68rem;">[D:${item.depthLevel}]</span>`;
            }
            let totalTime = 0;
            let itemCraftTime = null;
            try { itemCraftTime = craftCalc.getCraftingTime(item.hrid, craftConfig); } catch (e) {}
            if (itemCraftTime && !isBase) {
                const isOneToOne = item.count <= 1.01;
                const suppressEff = craftConfig.ignoreCraftEfficiency === true && isOneToOne;
                const effTime = suppressEff ? itemCraftTime.baseTime / (1 + itemCraftTime.speedBonus / 100) : itemCraftTime.adjustedTime;
                const effMult = suppressEff ? 1 : itemCraftTime.outputMultiplier;
                totalTime = (item.count / effMult) * effTime;
                nameHtml += ` <span style="color:var(--text-muted);font-size:0.68rem;" title="per craft: ${effTime.toFixed(1)}s, ×${effMult.toFixed(2)}">${formatSeconds(totalTime)}</span>`;
                if (suppressEff) nameHtml += ` <span style="color:#f59e0b;font-size:0.68rem;">no eff.</span>`;
            }
            const pad = depth * 18;
            html += `<div class="mat-row" style="${depth > 0 ? 'font-size:0.72rem;color:var(--text-muted);' : ''}padding-left:${pad}px;">
                <span class="mat-name"><img src="${hridToIconPath(item.hrid)}" onerror="this.style.display='none'" style="width:${depth > 0 ? 14 : 16}px;height:${depth > 0 ? 14 : 16}px;vertical-align:middle;margin-right:4px;"> ${nameHtml}</span>
                <span class="mat-count">${item.count.toFixed(2)}x @ ${formatCoin(item.price)}</span>
                <span class="mat-price">${formatCoin(item.total)}</span>
                <span class="mat-icon">${itemIcon}</span>
            </div>`;
            if (item.subItems && item.subItems.length > 0) {
                for (const sub of item.subItems) {
                    renderCraftItem(sub, depth + 1);
                }
            }
        }
        for (const mat of craftData.items) {
            renderCraftItem(mat);
        }
        html += `</div>`;
    }

    if (usedSource !== 'none' && usedPrice > 0) {
        let strategyLabel;
        if (refineMode === 'buy-r' && hrid.includes('_refined')) {
            strategyLabel = usedSource === 'ask' ? 'Buy (R) ask' : 'Buy (R) bid';
        } else if (usedSource === 'ask') {
            strategyLabel = hrid.includes('_refined') ? 'Buy (R)' : 'Market ask';
        } else if (usedSource === 'bid') {
            strategyLabel = hrid.includes('_refined') ? 'Bid (R)' : 'Market bid';
        } else if (usedSource === 'craft' && hrid.includes('_refined') && craftData) {
            const stdHrid = hrid.replace('_refined', '');
            const stdItem = craftData.items.find(m => m.hrid === stdHrid);
            const isStdBought = stdItem && stdItem.source === 'market';
            strategyLabel = isStdBought ? 'Buy + refine' : 'Craft + refine';

            const artisanMult = calculator ? calculator.getArtisanTeaMultiplier() : 1;
            if (stdItem && refineMode === 'auto') {
                const gd = window.GAME_DATA_STATIC || {};
                const altPriceRes = new PriceResolver(gd);
                const altStdPrice = isStdBought
                    ? altPriceRes._getCraftingCost(stdHrid, marketData.market, artisanMult)
                    : altPriceRes._resolveBuyPrice(stdHrid, 0, marketData.market, craftBuyMode).price;
                if (altStdPrice > 0) {
                    const altTotal = craftData.total - stdItem.count * stdItem.price + stdItem.count * altStdPrice;
                    const diff = altTotal - craftData.total;
                    const altLabel = isStdBought ? 'Craft + refine' : 'Buy + refine';
                    const diffColor = diff > 0 ? 'var(--loss)' : 'var(--profit)';
                    html += `<div class="mat-row" style="font-size:0.74rem;color:var(--text-muted);">
                        <span class="mat-name">Alt: ${altLabel}</span>
                        <span class="mat-count"></span>
                        <span class="mat-price">${formatCoin(altTotal)} <span style="color:${diffColor}">(${diff > 0 ? '+' : ''}${formatCoin(diff)})</span></span>
                        <span class="mat-icon"></span>
                    </div>`;
                }
            }
        } else {
            strategyLabel = 'Craft';
        }
        html += `<div class="mat-row total-row" style="color:var(--profit);">
            <span class="mat-name">Using: ${strategyLabel}</span>
            <span class="mat-count"></span>
            <span class="mat-price">${formatCoin(usedPrice)}</span>
            <span class="mat-icon"></span>
        </div>`;
    }

    return html;
}

function _resolveDepthBasePrice(craftData, askPrice, bidPrice, baseItemMode, refineMode, hrid) {
    let price;
    if (baseItemMode === 'ask') {
        price = askPrice;
    } else if (baseItemMode === 'bid') {
        price = bidPrice;
    } else if (baseItemMode === 'craft') {
        price = craftData?.total || 0;
    } else {
        const candidates = [];
        if (askPrice > 0) candidates.push(askPrice);
        if (craftData?.total > 0) candidates.push(craftData.total);
        price = candidates.length > 0 ? Math.min(...candidates) : 0;
    }

    if (hrid.includes('_refined') && refineMode === 'refine') {
        price = craftData?.total || 0;
    } else if (hrid.includes('_refined') && refineMode === 'buy-r') {
        if (askPrice > 0) price = askPrice;
        else if (bidPrice > 0) price = bidPrice;
    }

    return price;
}

function renderDepthComparisons(r, sellPrice) {
    const gd = window.GAME_DATA_STATIC || {};
    const craftBuyMode = document.getElementById('craftBuyMode')?.value || 'pessimistic';
    const baseItemMode = r._baseItemMode || 'best';
    const refineMode = r._refineMode || 'auto';
    const selectedDepth = r._usedDepth !== undefined ? r._usedDepth : getDepth();
    const craftConfig = _collectGearSettings();

    const priceRes = new PriceResolver(gd);
    const askRes = priceRes._resolveBuyPrice(r.hrid, 0, marketData.market, 'pessimistic');
    const askPrice = askRes.ask > 0 ? askRes.ask : 0;
    const bidRes = priceRes._resolveBuyPrice(r.hrid, 0, marketData.market, 'optimistic');
    const bidPrice = bidRes.bid > 0 ? bidRes.bid : 0;

    const maxDepth = 6;
    // Fixed enhancement costs (mat + prot) — invariant across base item depth
    const fixedCosts = r.totalCost - r.basePrice;

    const comparisonRows = [];

    for (let d = 0; d <= maxDepth; d++) {
        const craftData = getCraftMaterials(r.hrid, craftBuyMode, baseItemMode, d, 0, false, 1, refineMode);
        const depthConfig = Object.assign({}, craftConfig, { craftingDepth: d });
        const craftCalc = new CraftingTimeCalculator(gd);

        let craftTimeInfo = null;
        try {
            craftTimeInfo = craftCalc.getCraftingTimeRecursive(r.hrid, depthConfig);
        } catch (e) {}

        const basePrice = _resolveDepthBasePrice(craftData, askPrice, bidPrice, baseItemMode, refineMode, r.hrid);
        const craftTime = craftTimeInfo?.totalCraftTime || 0;

        // Each depth is computed independently
        const totalCost = basePrice + fixedCosts;
        const profit = sellPrice - totalCost + (r.rareFindValue || 0);
        const depthTotalDays = r.durationDays + craftTime / 86400;
        const profitPerDay = depthTotalDays > 0 ? profit / depthTotalDays : 0;

        comparisonRows.push({
            depth: d,
            craftPrice: basePrice,
            craftTime,
            profit,
            profitPerDay,
            isSelected: d === selectedDepth,
            hasData: craftData !== null || craftTimeInfo !== null,
        });
    }

    const anyData = comparisonRows.some(c => c.hasData);
    if (!anyData) return '';
    const uniquePrices = new Set(comparisonRows.map(c => c.craftPrice));
    const uniqueTimes = new Set(comparisonRows.map(c => c.craftTime));
    if (uniquePrices.size <= 1 && uniqueTimes.size <= 1) return '';

    // Reference: selected depth's $/d for diff column
    const selRow = comparisonRows.find(c => c.isSelected);
    const selectedPerDay = selRow ? selRow.profitPerDay : 0;

    let html = `<div class="detail-line" style="font-size:0.68rem;color:var(--text-secondary);border-top:1px solid var(--border);padding-top:3px;margin-top:2px;">
        <span class="left">Craft depth</span>
        <span class="right"></span>
        <span class="detail-icon"></span>
    </div>`;

    for (const c of comparisonRows) {
        const timeStr = c.craftTime > 0 ? formatSeconds(c.craftTime) : '—';
        const priceStr = c.craftPrice > 0 ? formatCoin(Math.round(c.craftPrice)) : '—';

        if (c.isSelected) {
            html += `<div class="detail-line" style="font-size:0.71rem;color:var(--text);padding-left:8px;background:var(--accent-bg);border-left:2px solid var(--accent);border-radius:4px;">
                <span class="left">D${c.depth} (selected): ${priceStr}</span>
                <span class="right">${timeStr} | ${formatCoin(Math.round(c.profitPerDay))} $/d</span>
                <span class="detail-icon"></span>
            </div>`;
        } else {
            const perDayDiff = c.profitPerDay - selectedPerDay;
            const diffStr = perDayDiff >= 0
                ? `<span style="color:var(--profit);">+${formatCoin(Math.round(perDayDiff))}/d</span>`
                : `<span style="color:var(--loss);">${formatCoin(Math.round(perDayDiff))}/d</span>`;
            const marketLabel = c.craftPrice > 0 && c.craftTime === 0 ? ' (market)' : '';
            html += `<div class="detail-line" style="font-size:0.71rem;color:var(--text-muted);padding-left:8px;">
                <span class="left">D${c.depth}${marketLabel}: ${priceStr}</span>
                <span class="right">${timeStr} | ${formatCoin(Math.round(c.profitPerDay))} $/d ${diffStr}</span>
                <span class="detail-icon"></span>
            </div>`;
        }
    }

    return html;
}

function renderStats(filtered) {
    const bar = document.getElementById('statsBar');
    if (!bar) return;
    const total = filtered.length;
    const profitable = filtered.filter(r => getProfit(r) > 0).length;
    let bestRoi = 0, bestRoiItem = '', bestRoiLvl = 0, bestRoiHrid = '';
    let bestPerDay = 0, bestPerDayItem = '', bestPerDayLvl = 0, bestPerDayHrid = '';
    let bestProfit = 0, bestProfitItem = '', bestProfitLvl = 0, bestProfitHrid = '';
    let bestPerDayCraft = 0, bestPerDayCraftItem = '', bestPerDayCraftLvl = 0, bestPerDayCraftHrid = '';
    for (const r of filtered) {
        const profit = getProfit(r);
        const roi = r.totalCost > 0 ? (profit / r.totalCost) * 100 : 0;
        const perDay = r.durationDays > 0 ? profit / r.durationDays : 0;
        const craftDays = r.craftDays || 0;
        const totalDays = r.durationDays + craftDays;
        const perDayCraft = totalDays > 0 ? profit / totalDays : 0;
        if (roi > bestRoi) { bestRoi = roi; bestRoiItem = r.itemName; bestRoiLvl = r.level; bestRoiHrid = r.hrid; }
        if (perDay > bestPerDay) { bestPerDay = perDay; bestPerDayItem = r.itemName; bestPerDayLvl = r.level; bestPerDayHrid = r.hrid; }
        if (profit > bestProfit) { bestProfit = profit; bestProfitItem = r.itemName; bestProfitLvl = r.level; bestProfitHrid = r.hrid; }
        if (perDayCraft > bestPerDayCraft) { bestPerDayCraft = perDayCraft; bestPerDayCraftItem = r.itemName; bestPerDayCraftLvl = r.level; bestPerDayCraftHrid = r.hrid; }
    }
    const roiStr = total > 0 ? `${bestRoiItem} +${bestRoiLvl} (${bestRoi.toFixed(1)}%)` : '—';
    const perDayStr = total > 0 ? `${bestPerDayItem} +${bestPerDayLvl} (${formatCoin(Math.round(bestPerDay))})` : '—';
    const profitStr = total > 0 ? `${bestProfitItem} +${bestProfitLvl} (${formatCoin(Math.round(bestProfit))})` : '—';
    const perDayCraftStr = total > 0 && bestPerDayCraft > 0 ? `${bestPerDayCraftItem} +${bestPerDayCraftLvl} (${formatCoin(Math.round(bestPerDayCraft))})` : '—';
    const makeClick = (hrid, lvl, label, valueStr) => {
        if (!hrid) return `<span class="stat-value positive">${valueStr}</span>`;
        return `<span class="stat-value positive stat-clickable" onclick="scrollToItem('${hrid}', ${lvl})">${valueStr}</span>`;
    };
    bar.innerHTML = `
        <span class="stat-item"><span class="stat-label">Items:</span><span class="stat-value neutral">${total}</span></span>
        <span class="stat-item"><span class="stat-label">Profitable:</span><span class="stat-value positive">${profitable}</span></span>
        <span class="stat-item"><span class="stat-label">Best ROI:</span>${makeClick(bestRoiHrid, bestRoiLvl, 'Best ROI', roiStr)}</span>
        <span class="stat-item"><span class="stat-label">Best Profit:</span>${makeClick(bestProfitHrid, bestProfitLvl, 'Best Profit', profitStr)}</span>
        <span class="stat-item"><span class="stat-label">Best $/day:</span>${makeClick(bestPerDayHrid, bestPerDayLvl, 'Best $/day', perDayStr)}</span>
        <span class="stat-item"><span class="stat-label">Best $/day⚒:</span>${makeClick(bestPerDayCraftHrid, bestPerDayCraftLvl, 'Best $/day with crafting', perDayCraftStr)}</span>
    `;
}

function renderResults() {
    const tbody = document.getElementById('resultsBody');
    const prevExpanded = expandedItem;
    tbody.innerHTML = '';

    const filtered = allResults.filter(r => {
        if (searchQuery && !r.itemName.toLowerCase().includes(searchQuery)) return false;
        if (!costFilters[getCostBucket(r.totalCost)]) return false;
        if (activeLevels.size > 0 && !activeLevels.has(r.level)) return false;
        if (hideInstant && r.durationHours < 0.5) return false;
        if (minVolume > 0 && r.volume < minVolume) return false;
        return true;
    });

    renderStats(filtered);
    const profCount = filtered.filter(r => getProfit(r) > 0).length;
    updateStatus(`${filtered.length} items (${profCount} profitable)`, '');

    for (let i = 0; i < filtered.length; i++) {
        const r = filtered[i];
        const rowId = `row-${i}`;
        const detailId = `detail-${i}`;

        const sellPrice = getSellPrice(r);
        const sellProfit = sellPrice - r.totalCost;
        const includeRareBonus = document.getElementById('includeRareFind')?.checked ?? true;
        const profit = sellProfit + (includeRareBonus ? (r.rareFindValue || 0) : 0);
        const roi = r.totalCost > 0 ? (profit / r.totalCost) * 100 : 0;
        const matRoi = r.matCost > 0 ? (profit / r.matCost) * 100 : 0;
        const profitPerDay = r.durationDays > 0 ? profit / r.durationDays : 0;
        const craftDays = r.craftDays || 0;
        const totalDaysWithCraft = r.durationDays + craftDays;
        const profitPerDayWithCraft = totalDaysWithCraft > 0 ? profit / totalDaysWithCraft : 0;

        const avg24h = (() => {
            const im = marketData?.market?.[r.hrid];
            const ld = im?.[String(r.level)];
            return ld?.m || 0;
        })();
        const showAvg = avg24h > 0 && currentSellMode !== 'midpoint';

        const row = document.createElement('tr');
        row.className = 'expandable';
        row.id = rowId;
        row.onclick = () => toggleDetail(detailId);
        const rowXpPerDay = r.durationDays > 0 ? Math.round(r.xp / r.durationDays) : 0;
        row.innerHTML = `
            <td><span class="expand-indicator">▶</span></td>
            <td class="item-name"><img src="${hridToIconPath(r.hrid)}" onerror="this.style.display='none'" style="width:20px;height:20px;vertical-align:middle;margin-right:4px;" loading="lazy">${r.itemName}</td>
            <td>+${r.level}</td>
            <td>${getStrategyHtml(r)}${isBestDepth() && r._usedDepth !== undefined ? `<span style="color:var(--text-muted);font-size:0.65rem;"> D${r._usedDepth}</span>` : ''}</td>
            <td class="number">${formatCoin(r.basePrice)}</td>
            <td class="number">${formatCoin(r.matCost)}</td>
            <td class="number">${matRoi.toFixed(2)}%</td>
            <td class="number" style="white-space:normal">
                <div class="sell-price-cell">
                    <span>${formatCoin(sellPrice)}</span>
                    ${showAvg ? `<span class="price-diff" title="24h average close price (daily market data)">${formatCoin(avg24h)}</span>` : ''}
                </div>
            </td>
            <td class="number" title="Avg volume over past few days">${r.volume.toLocaleString()}</td>
            <td class="profit ${profit >= 0 ? 'positive' : 'negative'}">${formatCoin(profit)}</td>
            <td class="number">${roi.toFixed(2)}%</td>
            <td class="number">${formatCoin(Math.round(profitPerDay))}</td>
            <td class="number">${craftDays > 0 ? formatCoin(Math.round(profitPerDayWithCraft)) : `<span style="color:var(--text-muted)">${formatCoin(Math.round(profitPerDay))}</span>`}</td>
            <td class="number">${formatDuration(r.durationHours)}</td>
            <td class="number">${formatCoin(rowXpPerDay)}</td>
            <td class="number">${craftDays > 0 ? formatCoin(Math.round(r.xp / totalDaysWithCraft)) : `<span style="color:var(--text-muted)">${formatCoin(rowXpPerDay)}</span>`}</td>
        `;
        tbody.appendChild(row);

        const detailRow = document.createElement('tr');
        detailRow.className = 'detail-row';
        detailRow.id = detailId;

        const resolved = r._resolvedPrices;
        const perAttemptTotal = (resolved?.matPrices || []).reduce((sum, [count, price]) => sum + count * price, 0) + (resolved?.coinCost || 0);
        const protectionTotal = (r.protectPrice || 0) * (r.protectCount || 0);
        const materialOnlyCost = Math.max(0, r.matCost - protectionTotal);
        const xpPerDay = r.durationDays > 0 ? formatCoin(Math.round(r.xp / r.durationDays)) : '0';
        const xpPerDayWithCraft = totalDaysWithCraft > 0 ? formatCoin(Math.round(r.xp / totalDaysWithCraft)) : '0';

        const gd = window.GAME_DATA_STATIC || {};
        const perAttemptMatLines = (resolved?.matPrices || []).map(([count, price, detail]) => {
            const perAttCost = count * price;
            const itemName = detail?.hrid ? (gd.items?.[detail.hrid]?.name || detail.hrid.split('/').pop().replace(/_/g, ' ')) : 'Unknown';
            const iconHtml = detail?.hrid ? `<img src="${hridToIconPath(detail.hrid)}" onerror="this.style.display='none'" style="width:16px;height:16px;vertical-align:middle;margin-right:4px;">` : '';
            return `<div class="mat-row">
                <span class="mat-name">${iconHtml}${itemName}</span>
                <span class="mat-count">${Number.isInteger(count) ? count : count.toFixed(1)}x @ ${formatCoin(price)}</span>
                <span class="mat-price">${formatCoin(Math.round(perAttCost))}</span>
                <span class="mat-icon"></span>
            </div>`;
        }).join('');
        const coinCost = resolved?.coinCost || 0;
        const coinLine = coinCost > 0 ? `<div class="mat-row">
            <span class="mat-name">Coins</span>
            <span class="mat-count">${coinCost.toLocaleString()}x @ 1</span>
            <span class="mat-price">${formatCoinExact(coinCost)}</span>
            <span class="mat-icon"></span>
        </div>` : '';
        const protItemName = r.protectHrid ? (gd.items?.[r.protectHrid]?.name || r.protectHrid.split('/').pop().replace(/_/g, ' ')) : '';
        const protItemIcon = r.protectHrid ? `<img src="${hridToIconPath(r.protectHrid)}" onerror="this.style.display='none'" style="width:16px;height:16px;vertical-align:middle;margin-right:4px;">` : '';

        const sellModeLabel = getSellModeLabel(currentSellMode);
        const sp = r.sellPrices?.[currentSellMode] || {};
        const sellBid = sp.bid || 0;
        const sellAsk = sp.ask || 0;
        const feeAmount = marketFeePct > 0 && sp.price ? Math.round(sp.price * marketFeePct / 100) : 0;
        const sellBidHtml = sellBid > 0 ? `<span style="color:#a855f7">(bid ${formatCoin(sellBid)})</span>` : '';
        const sellAskHtml = sellAsk > 0 ? `<span style="color:#3b82f6">(ask ${formatCoin(sellAsk)})</span>` : '';
        const sellDetail = `${sellBidHtml} ${sellAskHtml}`.trim();

        detailRow.innerHTML = `
            <td colspan="15">
                <div class="detail-content">
                    <div class="detail-grid-sections">
                        <div class="detail-section">
                            <h4><img src="${hridToIconPath(r.hrid)}" onerror="this.style.display='none'" style="width:16px;height:16px;vertical-align:middle;margin-right:4px;"> Base Item</h4>
                            ${renderBaseItemSection(r)}
                        </div>
                        <div class="detail-section">
                            <h4>🛒 Shopping List</h4>
                            ${renderShoppingList(r)}
                        </div>
                        <div class="detail-section enhance-panel">
                            <div class="enhance-header">
                                <h4><img src="assets/item_icons/Enhancing.svg" onerror="this.style.display='none'" style="width:16px;height:16px;vertical-align:middle;margin-right:4px;"> Enhance <span style="color:var(--text-muted);font-weight:400;font-size:0.72rem;">${(r.attemptTime || 0).toFixed(2)}s/att</span></h4>
                            </div>
                            <div class="enhance-prot-row">
                                <span class="protect-label">
                                    <span class="protect-badge">Prot @ ${r.protectAt ?? '-'}</span>
                                    <span class="protect-count">${(r.protectCount || 0).toFixed(1)}</span>
                                    ${(r.protectHrid && (r.protectCount || 0) > 0) ? `<span class="protect-name">${protItemIcon}${protItemName}</span>` : ''}
                                </span>
                                ${(r.protectHrid && (r.protectCount || 0) > 0) ? `<span class="protect-price">${formatCoinExact(r.protectPrice)}</span>` : `<span></span>`}
                                <span class="mat-icon"></span>
                            </div>
                            <div class="enhance-mats">
                                <div class="enhance-mats-label">Cost per attempt:</div>
                                ${perAttemptMatLines}
                                ${coinLine}
                                <div class="mat-row total-row">
                                    <span class="mat-name">${r.attempts.toLocaleString()} attempts</span>
                                    <span class="mat-count"></span>
                                    <span class="mat-price">${formatCoin(Math.round(perAttemptTotal))} / attempt</span>
                                    <span class="mat-icon"></span>
                                </div>
                            </div>
                        </div>
                        <div class="detail-section">
                            <h4>⏱️ Sell &amp; Time</h4>
                            <div class="detail-line">
                                <span class="left">Sell price (${sellModeLabel})</span>
                                <span class="right strong" style="display:inline-flex;align-items:center;gap:4px;">${formatCoin(sp.price || sellPrice)} ${sellDetail}</span>
                                <span class="detail-icon"></span>
                            </div>
                            ${marketFeePct > 0 ? `<div class="detail-line" style="color:#888;font-size:0.72rem;">
                                <span class="left">Market fee (${marketFeePct}%)</span>
                                <span class="right">-${formatCoin(feeAmount)}</span>
                                <span class="detail-icon"></span>
                            </div>` : ''}
                            <div class="detail-line">
                                <span class="left strong">Sell Profit</span>
                                <span class="right ${sellProfit >= 0 ? 'profit-val' : 'loss-val'}">${formatCoin(sellProfit)}</span>
                                <span class="detail-icon"></span>
                            </div>
                            ${r.rareFindValue > 0 ? `<div class="detail-line" style="color:var(--text-muted);font-size:0.72rem;border-top:1px dashed var(--border);padding-top:4px;margin-top:4px;">
                                <span class="left">Bonus Value</span>
                                <span class="right" style="color:var(--profit);">+${formatCoin(r.rareFindValue)}</span>
                                <span class="detail-icon"></span>
                            </div>
                            <div class="detail-line" style="font-size:0.68rem;color:var(--text-muted);padding-left:8px;">
                                <span class="left">Essence drop</span>
                                <span class="right">${(r.essenceChance * 100).toFixed(2)}% → ${formatCoin(r.essenceValue)}</span>
                                <span class="detail-icon"></span>
                            </div>
                            ${r.crateType ? `<div class="detail-line" style="font-size:0.68rem;color:var(--text-muted);padding-left:8px;">
                                <span class="left">${r.crateType} Crate drop</span>
                                <span class="right">${(r.crateChance * 100).toFixed(4)}% → ${formatCoin(r.crateValue)}</span>
                                <span class="detail-icon"></span>
                            </div>` : ''}` : ''}
                            ${includeRareBonus && r.rareFindValue > 0 ? `<div class="detail-line">
                                <span class="left strong">Total Profit</span>
                                <span class="right ${profit >= 0 ? 'profit-val' : 'loss-val'}">${formatCoin(profit)}</span>
                                <span class="detail-icon"></span>
                            </div>` : ''}
                            <div class="detail-line">
                                <span class="left">Enhance Duration</span>
                                <span class="right">${r.durationHours.toFixed(2)}h (${(r.durationHours / 24).toFixed(3)}d)</span>
                                <span class="detail-icon"></span>
                            </div>
                            ${r._craftingTimeInfo ? `<div class="detail-line" style="font-size:0.72rem;color:var(--text-muted);">
                                <span class="left">Craft time</span>
                                <span class="right">${formatSeconds(r._craftingTimeInfo.totalCraftTime)}${r._craftingTimeInfo ? ` (${r._craftingTimeInfo.skillId}, ×${r._craftingTimeInfo.outputMultiplier.toFixed(2)})${r._craftingTimeInfo.efficiencyIgnored ? ' <span style="color:#f59e0b;">no eff.</span>' : ''}` : ''}</span>
                                <span class="detail-icon"></span>
                            </div>
                            <div class="detail-line">
                                <span class="left">Total time</span>
                                <span class="right">${(r.durationHours + craftDays * 24).toFixed(1)}h (${totalDaysWithCraft.toFixed(2)}d)</span>
                                <span class="detail-icon"></span>
                            </div>` : ''}
                            <div class="detail-line">
                                <span class="left strong">$/day</span>
                                <span class="right strong">${formatCoin(Math.round(profitPerDay))}</span>
                                <span class="detail-icon"></span>
                            </div>
                            ${craftDays > 0 ? `<div class="detail-line">
                                <span class="left strong">$/day ⚒</span>
                                <span class="right strong">${formatCoin(Math.round(profitPerDayWithCraft))}</span>
                                <span class="detail-icon"></span>
                            </div>
                            ${renderDepthComparisons(r, sellPrice)}` : ''}
                            <div class="detail-line">
                                <span class="left">Attempts</span>
                                <span class="right">${r.attempts.toLocaleString()}</span>
                                <span class="detail-icon"></span>
                            </div>
                            <div class="detail-line">
                                <span class="left">XP earned</span>
                                <span class="right">${formatCoin(r.xp)}</span>
                                <span class="detail-icon"></span>
                            </div>
                            <div class="detail-line">
                                <span class="left">XP/day</span>
                                <span class="right">${xpPerDay}</span>
                                <span class="detail-icon"></span>
                            </div>
                            ${craftDays > 0 ? `<div class="detail-line">
                                <span class="left">XP/day ⚒</span>
                                <span class="right">${xpPerDayWithCraft}</span>
                                <span class="detail-icon"></span>
                            </div>` : ''}
                            <div class="cost-summary-divider"></div>
                            <h4 style="margin-top:4px;">💰 Cost Summary</h4>
                            <div class="detail-line">
                                <span class="left">Base item</span>
                                <span class="right">${formatCoin(r.basePrice)}</span>
                                <span class="detail-icon"></span>
                            </div>
                            <div class="mat-row">
                                <span class="mat-name">Materials (${r.attempts.toFixed(0)} att × ${formatCoin(Math.round(perAttemptTotal))})</span>
                                <span class="mat-count"></span>
                                <span class="mat-price">${formatCoin(materialOnlyCost)}</span>
                                <span class="mat-icon"></span>
                            </div>
                            ${(r.protectCount || 0) > 0 ? `<div class="mat-row">
                                <span class="mat-name">Protection (${(r.protectCount || 0).toFixed(1)} × ${formatCoin(r.protectPrice || 0)})</span>
                                <span class="mat-count"></span>
                                <span class="mat-price">${formatCoin(protectionTotal)}</span>
                                <span class="mat-icon"></span>
                            </div>` : ''}
                            <div class="mat-row total-row">
                                <span class="mat-name">Total Cost</span>
                                <span class="mat-count"></span>
                                <span class="mat-price">${formatCoin(r.totalCost)}</span>
                                <span class="mat-icon"></span>
                            </div>
                        </div>
                    </div>
                </div>
            </td>
        `;
        tbody.appendChild(detailRow);
    }
    if (prevExpanded) {
        const targetId = `detail-${filtered.findIndex(r => r.hrid === prevExpanded.hrid && r.level === prevExpanded.level)}`;
        const targetRow = document.getElementById(targetId);
        if (targetRow && targetId !== 'detail--1') {
            targetRow.classList.add('expanded');
            const rowIdx = targetId.replace('detail-', '');
            const mainRow = document.getElementById(`row-${rowIdx}`);
            if (mainRow) mainRow.querySelector('.expand-indicator').textContent = '▼';
        }
    }
    updateSortIndicators();
}

function toggleDetail(detailId) {
    const detailRow = document.getElementById(detailId);
    const isExpanded = detailRow.classList.contains('expanded');

    document.querySelectorAll('tr.detail-row.expanded').forEach(row => {
        if (row.id !== detailId) {
            row.classList.remove('expanded');
            const rowIdx = row.id.replace('detail-', '');
            const mainRow = document.getElementById(`row-${rowIdx}`);
            if (mainRow) mainRow.querySelector('.expand-indicator').textContent = '▶';
        }
    });

    if (isExpanded) {
        detailRow.classList.remove('expanded');
        const rowIdx = detailId.replace('detail-', '');
        const mainRow = document.getElementById(`row-${rowIdx}`);
        if (mainRow) mainRow.querySelector('.expand-indicator').textContent = '▶';
        expandedItem = null;
    } else {
        detailRow.classList.add('expanded');
        const rowIdx = detailId.replace('detail-', '');
        const mainRow = document.getElementById(`row-${rowIdx}`);
        if (mainRow) mainRow.querySelector('.expand-indicator').textContent = '▼';
        expandedItem = getRowItem(rowIdx);
    }
}

function scrollToItem(hrid, level) {
    const filtered = allResults.filter(r => {
        if (searchQuery && !r.itemName.toLowerCase().includes(searchQuery)) return false;
        if (!costFilters[getCostBucket(r.totalCost)]) return false;
        if (activeLevels.size > 0 && !activeLevels.has(r.level)) return false;
        if (hideInstant && r.durationHours < 0.5) return false;
        if (minVolume > 0 && r.volume < minVolume) return false;
        return true;
    });
    const idx = filtered.findIndex(r => r.hrid === hrid && r.level === level);
    if (idx === -1) return;
    const detailId = `detail-${idx}`;
    document.querySelectorAll('tr.detail-row.expanded').forEach(row => {
        row.classList.remove('expanded');
        const rowIdx = row.id.replace('detail-', '');
        const mainRow = document.getElementById(`row-${rowIdx}`);
        if (mainRow) mainRow.querySelector('.expand-indicator').textContent = '▶';
    });
    const detailRow = document.getElementById(detailId);
    if (detailRow) {
        detailRow.classList.add('expanded');
        const mainRow = document.getElementById(`row-${idx}`);
        if (mainRow) mainRow.querySelector('.expand-indicator').textContent = '▼';
        expandedItem = { hrid, level };
        setTimeout(() => {
            mainRow?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 50);
    }
}

function getRowItem(rowIdx) {
    const idx = parseInt(rowIdx);
    const filtered = allResults.filter(r => {
        if (searchQuery && !r.itemName.toLowerCase().includes(searchQuery)) return false;
        if (!costFilters[getCostBucket(r.totalCost)]) return false;
        if (activeLevels.size > 0 && !activeLevels.has(r.level)) return false;
        if (hideInstant && r.durationHours < 0.5) return false;
        if (minVolume > 0 && r.volume < minVolume) return false;
        return true;
    });
    if (idx >= 0 && idx < filtered.length) {
        return { hrid: filtered[idx].hrid, level: filtered[idx].level };
    }
    return null;
}
