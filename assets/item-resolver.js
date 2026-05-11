/**
 * item-resolver.js — Extract item metadata for enhancement calculation
 * Returns a "shopping list" of materials needed to enhance an item
 */

class ItemResolver {
    constructor(gameData) {
        this.items = gameData.items || {};
        this.recipes = gameData.recipes || {};
    }

    /**
     * Resolve item requirements for enhancement
     * @param {string} itemHrid - Item HRID to enhance
     * @param {number} targetLevel - Target enhancement level
     * @returns {Object|null} Shopping list
     */
    resolve(itemHrid, targetLevel) {
        const item = this.items[itemHrid];
        if (!item || !item.enhancementCosts) return null;

        const itemLevel = item.level || 1;
        const materials = [];
        let coinCost = 0;

        for (const cost of item.enhancementCosts) {
            if (cost.item === '/items/coin') {
                coinCost = cost.count;
            } else {
                materials.push({ hrid: cost.item, count: cost.count });
            }
        }

        // Protection options (cheapest selected after pricing)
        const protectionOptions = [
            { hrid: '/items/mirror_of_protection', isBaseItem: false },
            { hrid: itemHrid, isBaseItem: true },
        ];

        const protectHrids = item.protectionItems || [];
        for (const phrid of protectHrids) {
            if (!phrid.includes('_refined')) {
                protectionOptions.push({ hrid: phrid, isBaseItem: false });
            }
        }

        // Crafting recipe for base item
        let craftRecipe = null;
        const recipe = this.recipes[itemHrid];
        if (recipe) {
            const category = item.category || '';
            if (category === '/item_categories/equipment' || itemHrid === '/items/philosophers_mirror') {
                craftRecipe = {
                    inputs: (recipe.inputs || []).map(inp => ({ hrid: inp.item, count: inp.count })),
                    upgrade: recipe.upgrade || null,
                };
            }
        }

        return {
            itemHrid,
            itemLevel,
            targetLevel,
            materials,
            coinCost,
            protectionOptions,
            craftRecipe,
        };
    }
}
