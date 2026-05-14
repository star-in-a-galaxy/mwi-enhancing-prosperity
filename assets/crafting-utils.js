/**
 * crafting-utils.js — Crafting-related helpers
 */

function getCraftingToolHrid(skillType) {
    const toolId = CRAFTING_SKILL_TOOL_ID[skillType] || 'craftingTool';
    const tier = document.getElementById(toolId)?.value || 'none';
    if (tier === 'none') return null;
    const suffix = CRAFTING_SKILL_TOOL_SUFFIX[skillType] || 'chisel';
    return '/items/' + tier + '_' + suffix;
}

function getItemCraftingSkill(hrid) {
    const gd = window.GAME_DATA_STATIC || {};
    const recipe = gd.recipes?.[hrid];
    if (!recipe || !recipe.inputs) return 'crafting';
    for (const inp of recipe.inputs) {
        const item = inp.item;
        if (item.includes('_chisel') || item.includes('_cheese') || item.includes('_bar') || item.includes('_ore')) return 'cheesesmithing';
        if (item.includes('_needle') || item.includes('_leather') || item.includes('_fabric') || item.includes('_thread')) return 'tailoring';
        if (item.includes('_plank') || item.includes('_lumber')) return 'crafting';
    }
    if (recipe.upgrade) return getItemCraftingSkill(recipe.upgrade);
    return 'crafting';
}

function getCraftMaterials(hrid, buyMode, baseItemMode, upgradeDepth = 0, depthLevel = 0, skipFilter = false, multiplier = 1, refineMode = 'auto') {
    const gd = window.GAME_DATA_STATIC || {};
    const recipe = gd.recipes?.[hrid];
    if (!recipe || !recipe.inputs) return null;
    const priceRes = new PriceResolver(gd);
    const artisanMult = calculator ? calculator.getArtisanTeaMultiplier() : 1;
    const items = [];
    let total = 0;
    const allowCraftPricing = upgradeDepth > 0;
    const skipBaseE = document.getElementById('skipBaseResourceCrafting');
    const skipBase = skipBaseE ? skipBaseE.checked : true;
    const craftCalc = new CraftingTimeCalculator(gd);
    for (const input of recipe.inputs) {
        const marketRes = priceRes._resolveBuyPrice(input.item, 0, marketData.market, buyMode);
        let price = marketRes.price;
        let source = 'market';
        if (allowCraftPricing && !(skipBase && craftCalc.isBaseResource(input.item))) {
            const craftCost = priceRes._getCraftingCost(input.item, marketData.market, artisanMult, buyMode, Math.max(0, upgradeDepth - 1));
            if ((price > 0 && craftCost > 0 && craftCost < price) || (price <= 0 && craftCost > 0)) {
                price = craftCost;
                source = 'craft';
            }
        }
        if (price <= 0) {
            const vendor = priceRes._getVendorPrice(input.item);
            if (vendor > 0) { price = vendor; source = 'vendor'; }
        }
        const name = gd.items[input.item]?.name || input.item.split('/').pop().replace(/_/g, ' ');
        const count = input.count * (input.count > 1 ? artisanMult : 1) * multiplier;
        const line = count * price;
        total += line;
        const showAsLine = skipFilter || upgradeDepth > 0 || depthLevel === 0;
        if (showAsLine) {
            let subItems = null;
            const inputDepthLevel = depthLevel + 1;
            const inputDepthReached = upgradeDepth <= 1;
            if (source === 'craft' && upgradeDepth > 0) {
                const subCraft = getCraftMaterials(input.item, buyMode, baseItemMode, upgradeDepth - 1, depthLevel + 1, true, count, refineMode);
                subItems = subCraft?.items || null;
            }
            items.push({ hrid: input.item, name, count, price, total: line, source, subItems, depthReached: inputDepthReached, depthLevel: inputDepthLevel });
        }
    }
    if (recipe.upgrade) {
        const depthReached = upgradeDepth <= 0;
        const resolved = depthReached
            ? priceRes._resolveBuyPrice(recipe.upgrade, 0, marketData.market, buyMode)
            : priceRes._getItemPrice(recipe.upgrade, 0, marketData.market, artisanMult, baseItemMode, buyMode, refineMode, Math.max(0, upgradeDepth - 1));
        const name = gd.items[recipe.upgrade]?.name || recipe.upgrade.split('/').pop().replace(/_/g, ' ');
        const upgradeCount = multiplier;
        total += resolved.price * upgradeCount;
        let subItems = null;
        if (!depthReached) {
            const subCraft = getCraftMaterials(recipe.upgrade, buyMode, baseItemMode, upgradeDepth - 1, depthLevel + 1, true, upgradeCount, refineMode);
            subItems = subCraft?.items || null;
        }
        items.push({ hrid: recipe.upgrade, name, count: upgradeCount, price: resolved.price, total: resolved.price * upgradeCount, source: resolved.source, subItems, depthReached, depthLevel });
    }
    return { items, total };
}
