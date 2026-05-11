/**
 * price-resolver.js — Price resolution for items and materials
 * Handles bid/ask pricing with marketplace tick logic
 */

// Buy modes (for acquiring materials and protections)
const BuyMode = {
    PESSIMISTIC: 'pessimistic',         // Ask
    PESSIMISTIC_PLUS: 'pessimistic+',   // Ask - 1 tick
    OPTIMISTIC_MINUS: 'optimistic-',    // Bid + 1 tick
    OPTIMISTIC: 'optimistic',           // Bid
};

// Sell modes
const SellMode = {
    PESSIMISTIC: 'pessimistic',         // Bid
    PESSIMISTIC_PLUS: 'pessimistic+',   // Bid + 1 tick
    MIDPOINT: 'midpoint',               // (Bid + Ask) / 2
    OPTIMISTIC_MINUS: 'optimistic-',    // Ask - 1 tick
    OPTIMISTIC: 'optimistic',           // Ask
};

// MWI marketplace price tiers: [maxPrice, stepSize]
const PRICE_TIERS = [
    [50, 1],
    [100, 2],
    [300, 5],
    [500, 10],
    [1000, 20],
    [3000, 50],
    [5000, 100],
    [10000, 200],
    [30000, 500],
    [50000, 1000],
    [100000, 2000],
    [300000, 5000],
    [500000, 10000],
    [1000000, 20000],
    [3000000, 50000],
    [5000000, 100000],
    [10000000, 200000],
    [30000000, 500000],
    [50000000, 1000000],
    [100000000, 2000000],
    [300000000, 5000000],
    [500000000, 10000000],
    [1000000000, 20000000],
    [3000000000, 50000000],
    [5000000000, 100000000],
    [10000000000, 200000000],
];

function getPriceStep(price) {
    for (const [max, step] of PRICE_TIERS) {
        if (price <= max) return step;
    }
    return 500000000;
}

function getNextPrice(price) {
    if (price <= 0) return 1;
    const step = getPriceStep(price);
    const next = price + step;
    const nextStep = getPriceStep(next);
    if (nextStep !== step) {
        return Math.ceil(next / nextStep) * nextStep;
    }
    return next;
}

function getPrevPrice(price) {
    if (price <= 1) return 0;
    const step = getPriceStep(price);
    const prev = price - step;
    if (prev <= 0) return 0;
    const prevStep = getPriceStep(prev);
    if (prevStep !== step) {
        return Math.floor(prev / prevStep) * prevStep;
    }
    return prev;
}

class PriceResolver {
    constructor(gameData) {
        this.items = gameData.items || {};
        this.recipes = gameData.recipes || {};
    }

    /**
     * Resolve a buy price from market data
     */
    _resolveBuyPrice(hrid, enhLevel, marketPrices, mode) {
        if (hrid === '/items/coin') {
            return { price: 1, mode, actualMode: mode, bid: 1, ask: 1 };
        }

        const itemMarket = marketPrices[hrid] || {};
        const levelData = itemMarket[String(enhLevel)] || {};

        const ask = levelData.a ?? -1;
        const bid = levelData.b ?? -1;

        if (ask === -1 && bid === -1) {
            return { price: 0, mode, actualMode: mode, bid: 0, ask: 0 };
        }

        const validAsk = ask > 0 ? ask : 0;
        const validBid = bid > 0 ? bid : 0;

        const isTight = validAsk > 0 && validBid > 0 &&
            (validAsk <= getNextPrice(validBid));

        let price = 0;
        let actualMode = mode;

        switch (mode) {
            case BuyMode.PESSIMISTIC:
                price = validAsk || validBid || 0;
                if (!validAsk && validBid > 0) actualMode = BuyMode.OPTIMISTIC;
                break;
            case BuyMode.PESSIMISTIC_PLUS:
                if (isTight) {
                    price = validAsk;
                    actualMode = BuyMode.PESSIMISTIC;
                } else if (validAsk > 0) {
                    price = getPrevPrice(validAsk);
                } else {
                    price = validBid || 0;
                    actualMode = BuyMode.OPTIMISTIC;
                }
                break;
            case BuyMode.OPTIMISTIC_MINUS:
                if (isTight) {
                    price = validBid || validAsk;
                    actualMode = BuyMode.OPTIMISTIC;
                } else if (validBid > 0) {
                    price = getNextPrice(validBid);
                } else {
                    price = validAsk || 0;
                }
                break;
            case BuyMode.OPTIMISTIC:
                price = validBid || validAsk || 0;
                break;
            default:
                price = validAsk || validBid || 0;
                actualMode = BuyMode.PESSIMISTIC;
        }

        return { price, mode, actualMode, bid: validBid, ask: validAsk };
    }

    /**
     * Resolve a sell price from market data
     */
    _resolveSellPrice(hrid, enhLevel, marketPrices, mode) {
        if (hrid === '/items/coin') {
            return { price: 1, mode, actualMode: mode, bid: 1, ask: 1 };
        }

        const itemMarket = marketPrices[hrid] || {};
        const levelData = itemMarket[String(enhLevel)] || {};

        const ask = levelData.a ?? -1;
        const bid = levelData.b ?? -1;

        if (ask === -1 && bid === -1) {
            return { price: 0, mode, actualMode: mode, bid: 0, ask: 0 };
        }

        const validAsk = ask > 0 ? ask : 0;
        const validBid = bid > 0 ? bid : 0;

        const isTight = validAsk > 0 && validBid > 0 &&
            (validAsk <= getNextPrice(validBid));

        let price = 0;
        let actualMode = mode;

        switch (mode) {
            case SellMode.PESSIMISTIC:
                price = validBid || 0;
                break;
            case SellMode.PESSIMISTIC_PLUS:
                if (!validBid) {
                    price = 0;
                    actualMode = SellMode.PESSIMISTIC;
                } else if (isTight) {
                    price = validBid;
                    actualMode = SellMode.PESSIMISTIC;
                } else {
                    price = getNextPrice(validBid);
                }
                break;
            case SellMode.MIDPOINT:
                if (validBid > 0 && validAsk > 0) {
                    price = Math.floor((validBid + validAsk) / 2);
                } else if (validBid > 0) {
                    price = validBid;
                    actualMode = SellMode.PESSIMISTIC;
                } else {
                    price = 0;
                    actualMode = SellMode.PESSIMISTIC;
                }
                break;
            case SellMode.OPTIMISTIC_MINUS:
                if (isTight) {
                    price = validAsk || validBid;
                    actualMode = SellMode.OPTIMISTIC;
                } else if (validAsk > 0) {
                    price = getPrevPrice(validAsk);
                } else if (validBid > 0) {
                    price = validBid;
                    actualMode = SellMode.PESSIMISTIC;
                } else {
                    price = 0;
                }
                break;
            case SellMode.OPTIMISTIC:
                if (validAsk > 0) {
                    price = validAsk;
                } else if (validBid > 0) {
                    price = validBid;
                    actualMode = SellMode.PESSIMISTIC;
                } else {
                    price = 0;
                }
                break;
            default:
                price = validBid || 0;
                actualMode = SellMode.PESSIMISTIC;
        }

        return { price, mode, actualMode, bid: validBid, ask: validAsk };
    }

    /**
     * Get vendor sell price for an item
     */
    _getVendorPrice(hrid) {
        const item = this.items[hrid];
        return item?.sellPrice || 0;
    }

    /**
     * Calculate crafting cost — width-first upgrade chain depth
     * @param {number} upgradeDepth - How far up the upgrade chain to recurse (0 = buy upgrade, don't craft it)
     */
    _getCraftingCost(hrid, marketPrices, artisanMult, craftBuyMode = BuyMode.PESSIMISTIC, upgradeDepth = 10, _totalDepth = 0) {
        if (_totalDepth > 20) return 0;
        if (hrid === '/items/coin') return 1;

        const item = this.items[hrid];
        if (!item) return 0;

        const category = item.category || '';
        if (category !== '/item_categories/equipment' && hrid !== '/items/philosophers_mirror') {
            return 0;
        }

        const recipe = this.recipes[hrid];
        if (!recipe) return 0;

        let cost = 0;

        // Materials always fully resolved (their own upgrade chains still checked)
        for (const input of (recipe.inputs || [])) {
            const count = input.count * artisanMult;
            let inputPrice = this._resolveBuyPrice(input.item, 0, marketPrices, craftBuyMode).price;
            const inputCraft = this._getCraftingCost(input.item, marketPrices, artisanMult, craftBuyMode, upgradeDepth, _totalDepth + 1);
            
            if (inputPrice > 0 && inputCraft > 0) {
                inputPrice = Math.min(inputPrice, inputCraft);
            } else if (inputPrice <= 0 && inputCraft > 0) {
                inputPrice = inputCraft;
            }
            
            if (inputPrice <= 0) return 0;
            cost += count * inputPrice;
        }

        // Upgrade chain — depth-controlled (width-first)
        if (recipe.upgrade) {
            let upgradePrice = this._resolveBuyPrice(recipe.upgrade, 0, marketPrices, craftBuyMode).price;
            if (upgradeDepth > 0) {
                const upgradeCraft = this._getCraftingCost(recipe.upgrade, marketPrices, artisanMult, craftBuyMode, upgradeDepth - 1, _totalDepth + 1);
                if (upgradePrice > 0 && upgradeCraft > 0) {
                    upgradePrice = Math.min(upgradePrice, upgradeCraft);
                } else if (upgradePrice <= 0 && upgradeCraft > 0) {
                    upgradePrice = upgradeCraft;
                }
            }
            
            if (upgradePrice <= 0) return 0;
            cost += upgradePrice;
        }

        return cost;
    }

    /**
     * Get item price — controlled by baseItemMode ('ask', 'bid', 'craft', 'best')
     */
    _getItemPrice(hrid, enhLevel, marketPrices, artisanMult, baseItemMode = 'best', craftBuyMode = BuyMode.PESSIMISTIC, refineMode = 'auto') {
        if (hrid === '/items/coin') return { price: 1, source: 'fixed' };

        if (hrid.includes('trainee') && hrid.includes('charm')) {
            return { price: 250000, source: 'vendor' };
        }

        const marketRes = this._resolveBuyPrice(hrid, enhLevel, marketPrices, BuyMode.PESSIMISTIC);
        const askPrice = marketRes.ask > 0 ? marketRes.ask : 0;
        const bidPrice = marketRes.bid > 0 ? marketRes.bid : 0;

        if (enhLevel === 0) {
            const craftingCost = this._getCraftingCost(hrid, marketPrices, artisanMult, craftBuyMode);

            // refineMode overrides for (R) items
            if (hrid.includes('_refined') && refineMode === 'refine') {
                if (craftingCost > 0) return { price: craftingCost, source: 'craft' };
            } else if (hrid.includes('_refined') && refineMode === 'buy-r') {
                const askRes = this._resolveBuyPrice(hrid, enhLevel, marketPrices, BuyMode.PESSIMISTIC);
                if (askRes.price > 0) return { price: askRes.price, source: 'market' };
                const bidRes = this._resolveBuyPrice(hrid, enhLevel, marketPrices, BuyMode.OPTIMISTIC);
                if (bidRes.price > 0) return { price: bidRes.price, source: 'market-bid' };
            }

            if (baseItemMode === 'ask') {
                if (askPrice > 0) return { price: askPrice, source: 'market' };
                return { price: 0, source: 'none' };
            } else if (baseItemMode === 'bid') {
                if (bidPrice > 0) return { price: bidPrice, source: 'market' };
                return { price: 0, source: 'none' };
            } else if (baseItemMode === 'craft') {
                if (craftingCost > 0) return { price: craftingCost, source: 'craft' };
            } else { // 'best' — cheapest of ask and craft (excludes bid)
                const options = [];
                if (askPrice > 0) options.push({ price: askPrice, source: 'market' });
                if (craftingCost > 0) options.push({ price: craftingCost, source: 'craft' });
                if (options.length > 0) {
                    options.sort((a, b) => a.price - b.price);
                    return options[0];
                }
            }
        } else {
            const levelRes = this._resolveBuyPrice(hrid, enhLevel, marketPrices, BuyMode.PESSIMISTIC);
            if (levelRes.price > 0) return { price: levelRes.price, source: 'market' };
        }

        return { price: 0, source: 'none' };
    }

    /**
     * Resolve all prices for a shopping list
     */
    resolve(shoppingList, marketPrices, modeConfig, artisanMult = 1.0, baseItemMode = 'best', craftBuyMode, refineMode = 'auto') {
        if (!craftBuyMode) craftBuyMode = matMode;
        const { matMode, protMode, sellMode } = modeConfig;

        const matPrices = [];
        const priceDetails = new Map();

        for (const mat of shoppingList.materials) {
            const detail = this._resolveBuyPrice(mat.hrid, 0, marketPrices, matMode);
            let price = detail.price;
            let source = 'market';
            
            const craftCost = this._getCraftingCost(mat.hrid, marketPrices, artisanMult, craftBuyMode);
            if (price > 0 && craftCost > 0 && craftCost < price) {
                price = craftCost;
                source = 'craft';
            } else if (price <= 0 && craftCost > 0) {
                price = craftCost;
                source = 'craft';
            }
            
            if (price <= 0) {
                const itemDef = this.items[mat.hrid];
                if (itemDef?.sellPrice > 0) {
                    price = itemDef.sellPrice;
                    source = 'vendor';
                }
            }
            
            matPrices.push([mat.count, price, {
                hrid: mat.hrid,
                mode: matMode,
                actualMode: detail.actualMode,
                bid: detail.bid,
                ask: detail.ask,
                source,
            }]);
            priceDetails.set(mat.hrid, { ...detail, price, source });
        }

        const { price: basePrice, source: baseSource } = this._getItemPrice(
            shoppingList.itemHrid, 0, marketPrices, artisanMult, baseItemMode, craftBuyMode, refineMode
        );

        let protectPrice = 0;
        let protectHrid = null;
        const validProtects = [];

        for (const opt of shoppingList.protectionOptions) {
            let price;
            if (opt.isBaseItem) {
                price = basePrice;
            } else {
                const detail = this._resolveBuyPrice(opt.hrid, 0, marketPrices, protMode);
                price = detail.price;
                
                if (price <= 0) {
                    const craftCost = this._getCraftingCost(opt.hrid, marketPrices, artisanMult, craftBuyMode);
                    if (craftCost > 0) {
                        price = craftCost;
                    } else {
                        price = this._getVendorPrice(opt.hrid);
                    }
                }
                priceDetails.set(opt.hrid + ':prot', { ...detail, price });
            }
            
            if (price > 0) {
                validProtects.push({ hrid: opt.hrid, price });
            }
        }

        if (validProtects.length > 0) {
            validProtects.sort((a, b) => a.price - b.price);
            protectPrice = validProtects[0].price;
            protectHrid = validProtects[0].hrid;
        }

        const sellDetail = this._resolveSellPrice(
            shoppingList.itemHrid, shoppingList.targetLevel, marketPrices, sellMode
        );

        let protectActualMode = protMode;
        if (protectHrid) {
            const protDetail = priceDetails.get(protectHrid + ':prot');
            if (protDetail) protectActualMode = protDetail.actualMode;
        }

        return {
            matPrices,
            coinCost: shoppingList.coinCost,
            basePrice,
            baseSource,
            protectPrice,
            protectHrid,
            protectActualMode,
            sellPrice: sellDetail.price,
            sellActualMode: sellDetail.actualMode,
            sellBid: sellDetail.bid,
            sellAsk: sellDetail.ask,
            priceDetails,
        };
    }
}
