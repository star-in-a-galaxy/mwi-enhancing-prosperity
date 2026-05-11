/**
 * ui-renderer.js — All rendering functions, detail view, sorting
 */

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
            case 5: aVal = a.matCost > 0 ? ((getSellPrice(a) - a.totalCost) / a.matCost) * 100 : 0; bVal = b.matCost > 0 ? ((getSellPrice(b) - b.totalCost) / b.matCost) * 100 : 0; break;
            case 6: aVal = getSellPrice(a); bVal = getSellPrice(b); break;
            case 7: aVal = a.volume; bVal = b.volume; break;
            case 8: aVal = getSellPrice(a) - a.totalCost; bVal = getSellPrice(b) - b.totalCost; break;
            case 9: aVal = a.totalCost > 0 ? ((getSellPrice(a) - a.totalCost) / a.totalCost) * 100 : 0; bVal = b.totalCost > 0 ? ((getSellPrice(b) - b.totalCost) / b.totalCost) * 100 : 0; break;
            case 10: aVal = a.durationDays > 0 ? (getSellPrice(a) - a.totalCost) / a.durationDays : 0; bVal = b.durationDays > 0 ? (getSellPrice(b) - b.totalCost) / b.durationDays : 0; break;
            case 11: {
                const aCraftDays = (a.craftDays || 0) + a.durationDays;
                const bCraftDays = (b.craftDays || 0) + b.durationDays;
                aVal = aCraftDays > 0 ? (getSellPrice(a) - a.totalCost) / aCraftDays : 0;
                bVal = bCraftDays > 0 ? (getSellPrice(b) - b.totalCost) / bCraftDays : 0;
                break;
            }
            case 12: aVal = a.durationHours; bVal = b.durationHours; break;
            case 13: aVal = a.durationDays > 0 ? (a.xp / a.durationDays) : 0; bVal = b.durationDays > 0 ? (b.xp / b.durationDays) : 0; break;
            default: aVal = 0; bVal = 0;
        }
        const cmp = typeof aVal === 'string' ? aVal.localeCompare(bVal) : (aVal || 0) - (bVal || 0);
        return asc ? cmp : -cmp;
    });
    renderResults();
}

function refreshBonuses() {
    const container = document.getElementById('bonusesContent');
    if (!container || !calculator) return;
    const gd = window.GAME_DATA_STATIC || {};
    const effectiveLevel = calculator.getEffectiveLevel();
    const totalBonus = calculator.getTotalBonus(effectiveLevel);
    const speedBonus = calculator.getAttemptTime(effectiveLevel);
    const baseTime = 12 / (1 + 0 / 100);

    container.innerHTML = `
        <div>Enhance Succ Bonus: +${((totalBonus - 1) * 100).toFixed(2)}%</div>
        <div>Enhance Speed Bonus: ${(baseTime / speedBonus).toFixed(2)}x</div>
        <div style="font-size:0.65rem;color:var(--text-muted);margin-top:1px;">* doesn't include level advantage</div>
    `;
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

    const cDepth = getDepth();
    const craftData = getCraftMaterials(hrid, craftBuyMode, baseItemMode, cDepth);

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
            if (item.depthLevel !== undefined) {
                nameHtml += ` <span style="color:var(--text-muted);font-size:0.68rem;">[D:${item.depthLevel}]</span>`;
            }
            if (item.depthReached) {
                nameHtml += ` <span style="color:#a855f7;font-size:0.68rem;">(depth reached)</span>`;
            }
            let totalTime = 0;
            let itemCraftTime = null;
            const isBase = skipBase && craftCalc.isBaseResource(item.hrid);
            try { itemCraftTime = craftCalc.getCraftingTime(item.hrid, craftConfig); } catch (e) {}
            if (itemCraftTime && !isBase) {
                totalTime = (item.count / itemCraftTime.outputMultiplier) * itemCraftTime.adjustedTime;
                nameHtml += ` <span style="color:var(--text-muted);font-size:0.68rem;" title="per craft: ${itemCraftTime.adjustedTime.toFixed(1)}s, ×${itemCraftTime.outputMultiplier.toFixed(2)}">${formatSeconds(totalTime)}</span>`;
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

function renderStats(filtered) {
    const bar = document.getElementById('statsBar');
    if (!bar) return;
    const total = filtered.length;
    const profitable = filtered.filter(r => (getSellPrice(r) - r.totalCost) > 0).length;
    let bestRoi = 0, bestRoiItem = '', bestRoiLvl = 0, bestRoiHrid = '';
    let bestPerDay = 0, bestPerDayItem = '', bestPerDayLvl = 0, bestPerDayHrid = '';
    let bestProfit = 0, bestProfitItem = '', bestProfitLvl = 0, bestProfitHrid = '';
    let bestPerDayCraft = 0, bestPerDayCraftItem = '', bestPerDayCraftLvl = 0, bestPerDayCraftHrid = '';
    for (const r of filtered) {
        const sellPrice = getSellPrice(r);
        const profit = sellPrice - r.totalCost;
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

    for (let i = 0; i < filtered.length; i++) {
        const r = filtered[i];
        const rowId = `row-${i}`;
        const detailId = `detail-${i}`;

        const sellPrice = getSellPrice(r);
        const profit = sellPrice - r.totalCost;
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
            <td>${getStrategyHtml(r)}</td>
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
            <td colspan="14">
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
                                <span class="left strong">Profit</span>
                                <span class="right ${profit >= 0 ? 'profit-val' : 'loss-val'}">${formatCoin(profit)}</span>
                                <span class="detail-icon"></span>
                            </div>
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
                            <div class="detail-line" style="font-size:0.72rem;color:var(--text-muted);">
                                <span class="left">Craft time</span>
                                <span class="right">${formatSeconds(r._craftingTimeInfo.totalCraftTime)}${r._craftingTimeInfo ? ` (${r._craftingTimeInfo.skillId}, ×${r._craftingTimeInfo.outputMultiplier.toFixed(2)})${r._craftingTimeInfo.efficiencyIgnored ? ' <span style="color:#f59e0b;">no eff.</span>' : ''}` : ''}</span>
                                <span class="detail-icon"></span>
                            </div>` : ''}
                            <div class="detail-line">
                                <span class="left">Duration</span>
                                <span class="right">${r.durationHours.toFixed(1)}h (${r.durationDays.toFixed(2)}d)</span>
                                <span class="detail-icon"></span>
                            </div>
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
