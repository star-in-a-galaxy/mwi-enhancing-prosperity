/**
 * crafting-time.js — Crafting time, speed, efficiency, and output calculator
 */

const ENHANCE_BONUS = [
    1.000, 1.020, 1.042, 1.066, 1.092,
    1.120, 1.150, 1.182, 1.216, 1.252,
    1.290, 1.334, 1.384, 1.440, 1.502,
    1.570, 1.644, 1.724, 1.810, 1.902,
    2.000
];

const HOUSE_EFFICIENCY_PER_LEVEL = {
    cheesesmithing: 0.015,
    crafting: 0.015,
    tailoring: 0.015,
};

const COMMUNITY_EFFICIENCY_BASE = 0.14;
const COMMUNITY_EFFICIENCY_PER_LEVEL = 0.003;

const SKILL_ID_TO_HOUSE = {
    cheesesmithing: 'forge',
    crafting: 'workshop',
    tailoring: 'sewing_parlor',
};

const CRAFTING_SKILL_SPEED_STAT = {
    cheesesmithing: 'cheesesmithingSpeed',
    crafting: 'craftingSpeed',
    tailoring: 'tailoringSpeed',
};

const CRAFTING_SKILL_EFFICIENCY_STAT = {
    cheesesmithing: 'cheesesmithingEfficiency',
    crafting: 'craftingEfficiency',
    tailoring: 'tailoringEfficiency',
};

const CRAFTING_SKILL_TOOL_SUFFIX = {
    cheesesmithing: 'hammer',
    crafting: 'chisel',
    tailoring: 'needle',
};

const CRAFTING_SKILL_TOOL_ID = {
    cheesesmithing: 'cheesesmithingTool',
    crafting: 'craftingTool',
    tailoring: 'tailoringTool',
};

const CRAFTING_SKILL_TOOL_LEVEL_ID = {
    cheesesmithing: 'cheesesmithingToolLevel',
    crafting: 'craftingToolLevel',
    tailoring: 'tailoringToolLevel',
};

class CraftingTimeCalculator {
    constructor(gameData) {
        this.items = gameData.items || {};
        this.recipes = gameData.recipes || {};
        this.constants = gameData.constants || {};
    }

    _getItemStat(hrid, statName) {
        const item = this.items[hrid];
        if (!item || !item.stats) return 0;
        return item.stats[statName] || 0;
    }

    _getGuzzlingBonus(config) {
        if (!config.guzzlingPouchEquipped) return 1;
        const base = this._getItemStat('/items/guzzling_pouch', 'drinkConcentration');
        const level = Math.max(0, config.guzzlingPouchLevel || 0);
        const bonus = base * 100 * ENHANCE_BONUS[level];
        return 1 + bonus / 100;
    }

    _getEquipmentStat5x(hrid, statName, level) {
        const base = this._getItemStat(hrid, statName);
        if (!base) return 0;
        return base * 100 * ((ENHANCE_BONUS[level] - 1) * 5 + 1);
    }

    _getEquipmentStat1x(hrid, statName, level) {
        const base = this._getItemStat(hrid, statName);
        if (!base) return 0;
        return base * 100 * ENHANCE_BONUS[level];
    }

    getCraftingSpeedBonus(skillId, config) {
        const speedStat = CRAFTING_SKILL_SPEED_STAT[skillId] || 'craftingSpeed';
        const toolSuffix = CRAFTING_SKILL_TOOL_SUFFIX[skillId] || 'chisel';
        const toolId = CRAFTING_SKILL_TOOL_ID[skillId] || 'craftingTool';
        const toolLevelId = CRAFTING_SKILL_TOOL_LEVEL_ID[skillId] || 'craftingToolLevel';

        const toolTier = config[toolId] || 'none';
        const toolLevel = Math.max(0, parseInt(config[toolLevelId]) || 0);

        let toolSpeed = 0;
        if (toolTier !== 'none') {
            const toolHrid = `/items/${toolTier}_${toolSuffix}`;
            toolSpeed = this._getEquipmentStat1x(toolHrid, speedStat, toolLevel);
        }

        let neckSpeed = 0;
        if (config.philoNeckEquipped) {
            const level = Math.max(0, config.necklaceLevel || 0);
            neckSpeed += this._getEquipmentStat5x('/items/philosophers_necklace', 'skillingSpeed', level);
        } else if (config.speedNeckEquipped) {
            const level = Math.max(0, config.necklaceLevel || 0);
            neckSpeed += this._getEquipmentStat5x('/items/necklace_of_speed', 'skillingSpeed', level);
        }

        let capeSpeed = 0;
        if (config.artificerCapeEquipped !== false) {
            if (config.artificerCapeType === 'refined') {
                const level = Math.max(0, config.artificerCapeLevel || 0);
                capeSpeed += this._getEquipmentStat1x('/items/artificer_cape_refined', speedStat, level);
            } else {
                const level = Math.max(0, config.artificerCapeLevel || 0);
                capeSpeed += this._getEquipmentStat1x('/items/artificer_cape', speedStat, level);
            }
        }

        const guzzling = this._getGuzzlingBonus(config);
        let teaSpeed = 0;
        if (config.craftingTeaEfficiency) teaSpeed = 2 * guzzling;
        else if (config.craftingTeaSuperEfficiency) teaSpeed = 4 * guzzling;
        else if (config.craftingTeaUltraEfficiency) teaSpeed = 6 * guzzling;

        // Skill-specific tea adds speed too
        // Each skill tier has its own tea that gives speed + efficiency
        const skillTeaSpeedMap = {
            cheesesmithing: { standard: 2, super: 4, ultra: 6 },
            crafting: { standard: 2, super: 4, ultra: 6 },
            tailoring: { standard: 2, super: 4, ultra: 6 },
        };
        // Note: craftingTeaEfficiency/Super/Ultra are the SHARED production teas
        // The skill-specific teas (cheesesmithing_tea, etc.) are separate checkboxes
        // For now, the speed formula only uses: tool + necklace + artificer cape + community speed buff
        // Level advantage is NOT a speed bonus for crafting (only for enhancing)

        const communitySpeedLevel = Math.max(0, parseInt(config.communitySpeedBuffLevel || config.enhancingBuffLevel || 0));
        const communitySpeed = 0; // Community speed buff is handled separately (enhancing only for now)

        return { toolSpeed, neckSpeed, capeSpeed, teaSpeed, communitySpeed, total: toolSpeed + neckSpeed + capeSpeed + teaSpeed };
    }

    getCraftingEfficiencyBonus(skillId, config, itemHrid) {
        const effStat = CRAFTING_SKILL_EFFICIENCY_STAT[skillId] || 'craftingEfficiency';

        const topId = skillId + 'TopEquipped';
        const topLevelId = skillId + 'TopLevel';
        const botId = skillId + 'BottomsEquipped';
        const botLevelId = skillId + 'BottomsLevel';

        const topHridMap = {
            cheesesmithing: '/items/cheesemakers_top',
            crafting: '/items/crafters_top',
            tailoring: '/items/tailors_top',
        };
        const botHridMap = {
            cheesesmithing: '/items/cheesemakers_bottoms',
            crafting: '/items/crafters_bottoms',
            tailoring: '/items/tailors_bottoms',
        };

        let equipEfficiency = 0;
        if (config[topId]) {
            const level = Math.max(0, parseInt(config[topLevelId]) || 0);
            equipEfficiency += this._getEquipmentStat1x(topHridMap[skillId], effStat, level);
        }
        if (config[botId]) {
            const level = Math.max(0, parseInt(config[botLevelId]) || 0);
            equipEfficiency += this._getEquipmentStat1x(botHridMap[skillId], effStat, level);
        }
        if (config.eyeWatchEquipped !== false) {
            const level = Math.max(0, config.eyeWatchLevel || 0);
            equipEfficiency += this._getEquipmentStat1x('/items/eye_watch', effStat, level);
        }

        let neckEfficiency = 0;
        if (config.philoNeckEquipped) {
            const level = Math.max(0, config.necklaceLevel || 0);
            neckEfficiency += this._getEquipmentStat5x('/items/philosophers_necklace', 'skillingEfficiency', level);
        }

        let capeEfficiency = 0;
        if (config.artificerCapeEquipped !== false) {
            if (config.artificerCapeType === 'refined') {
                const level = Math.max(0, config.artificerCapeLevel || 0);
                capeEfficiency += this._getEquipmentStat1x('/items/artificer_cape_refined', effStat, level);
            } else {
                const level = Math.max(0, config.artificerCapeLevel || 0);
                capeEfficiency += this._getEquipmentStat1x('/items/artificer_cape', effStat, level);
            }
        }

        const guzzling = this._getGuzzlingBonus(config);
        const skillLevel = Math.max(0, parseInt(config[skillId + 'Level']) || 0);

        const recipeLevel = this._getRecipeLevel(itemHrid);

        const artisanLevelPenalty = config.artisanTea ? 5 * guzzling : 0;
        const effectiveDelta = Math.max(0, skillLevel - recipeLevel - artisanLevelPenalty);
        const levelEfficiency = effectiveDelta * 1.0;

        const houseId = SKILL_ID_TO_HOUSE[skillId];
        const houseLevel = Math.max(0, parseInt(config[houseId + 'Level']) || 0);
        const houseEfficiency = houseLevel * (HOUSE_EFFICIENCY_PER_LEVEL[skillId] || 0) * 100;

        let teaEfficiency = 0;
        if (config.craftingEfficiencyTea) teaEfficiency += 10 * guzzling;

        const communityLevel = Math.max(0, parseInt(config.productionEfficiencyBuffLevel) || 0);
        const communityEfficiency = (COMMUNITY_EFFICIENCY_BASE - COMMUNITY_EFFICIENCY_PER_LEVEL + communityLevel * COMMUNITY_EFFICIENCY_PER_LEVEL) * 100;

        let skillTeaEfficiency = 0;
        if (config.craftingTeaEfficiency) skillTeaEfficiency += 2 * guzzling;
        else if (config.craftingTeaSuperEfficiency) skillTeaEfficiency += 4 * guzzling;
        else if (config.craftingTeaUltraEfficiency) skillTeaEfficiency += 6 * guzzling;

        const total = levelEfficiency + equipEfficiency + neckEfficiency + capeEfficiency + houseEfficiency + teaEfficiency + communityEfficiency + skillTeaEfficiency;

        return {
            levelEfficiency,
            levelAdvantage: Math.max(0, skillLevel - recipeLevel),
            artisanLevelPenalty,
            guzzlingConcentration: (guzzling - 1) * 100,
            effectiveDelta,
            recipeLevel,
            houseEfficiency,
            equipEfficiency,
            neckEfficiency,
            capeEfficiency,
            teaEfficiency,
            communityEfficiency,
            skillTeaEfficiency,
            total,
            outputMultiplier: 1 + total / 100,
        };
    }

    _getRecipeLevel(itemHrid) {
        const recipe = this.recipes[itemHrid];
        return (recipe && recipe.level) || 1;
    }

    isBaseResource(itemHrid) {
        const recipe = this.recipes[itemHrid];
        if (!recipe || !recipe.baseTime) return false;
        if (!recipe.inputs || recipe.inputs.length === 0) return true;
        for (const inp of recipe.inputs) {
            if (inp.item === '/items/coin') continue;
            const sub = this.recipes[inp.item];
            if (sub && sub.baseTime) return false;
        }
        if (recipe.upgrade) {
            const upg = this.recipes[recipe.upgrade];
            if (upg && upg.baseTime) return false;
        }
        return true;
    }

    isSingleInputUpgrade(itemHrid) {
        const recipe = this.recipes[itemHrid];
        if (!recipe || !recipe.baseTime) return false;
        const skipBase = true;
        let craftInputCount = 0;
        for (const inp of (recipe.inputs || [])) {
            if (inp.item === '/items/coin') continue;
            const sr = this.recipes[inp.item];
            if (sr && sr.baseTime && !(skipBase && this.isBaseResource(inp.item))) {
                craftInputCount++;
            }
        }
        return craftInputCount === 0;
    }

    getCraftingTime(itemHrid, config) {
        const recipe = this.recipes[itemHrid];
        if (!recipe || !recipe.baseTime) return null;

        const skillId = recipe.skillId || 'crafting';
        const baseTime = recipe.baseTime;
        const itemLevel = recipe.level || 1;

        const speed = this.getCraftingSpeedBonus(skillId, config);

        const totalSpeedPct = speed.total;
        const adjustedTime = baseTime / (1 + totalSpeedPct / 100);

        const efficiency = this.getCraftingEfficiencyBonus(skillId, config, itemHrid);
        const outputMultiplier = efficiency.outputMultiplier;

        const craftsPerHour = (3600 / adjustedTime) * outputMultiplier;

        return {
            baseTime,
            adjustedTime,
            speedBonus: totalSpeedPct,
            speedBreakdown: speed,
            efficiency: efficiency.total,
            efficiencyBreakdown: efficiency,
            outputMultiplier,
            craftsPerHour,
            itemLevel,
            skillId,
        };
    }

    getCraftingTimeRecursive(itemHrid, config, visited = new Set(), ignoreEfficiency = false) {
        if (visited.has(itemHrid)) return null;
        visited.add(itemHrid);

        const recipe = this.recipes[itemHrid];
        if (!recipe || !recipe.baseTime) return null;

        const skipBase = config.skipBaseResourceCrafting !== false;
        if (skipBase && this.isBaseResource(itemHrid)) return null;

        const craftInfo = this.getCraftingTime(itemHrid, config);
        if (!craftInfo) return null;

        const shouldIgnoreEff = config.ignoreCraftEfficiency === true && (ignoreEfficiency || this.isSingleInputUpgrade(itemHrid));
        const effectiveTime = shouldIgnoreEff
            ? (craftInfo.baseTime / (1 + craftInfo.speedBonus / 100))
            : craftInfo.adjustedTime;
        const effectiveMultiplier = shouldIgnoreEff ? 1 : craftInfo.outputMultiplier;

        const artisanMult = config.artisanTea ? 1 - 0.10 * this._getGuzzlingBonus(config) : 1;

        let subCraftTime = 0;
        const subItems = [];

        for (const input of (recipe.inputs || [])) {
            if (input.item === '/items/coin') continue;
            const subRecipe = this.recipes[input.item];
            if (subRecipe && subRecipe.baseTime) {
                if (skipBase && this.isBaseResource(input.item)) continue;
                const propIgnoreEff = shouldIgnoreEff || this.isSingleInputUpgrade(input.item);
                const subInfo = this.getCraftingTimeRecursive(input.item, config, new Set(visited), config.ignoreCraftEfficiency && propIgnoreEff);
                if (subInfo) {
                    const count = input.count * artisanMult;
                    const needs = Math.ceil(count) / (subInfo.outputMultiplier || 1);
                    const time = needs * subInfo.adjustedTime;
                    subCraftTime += time;
                    subItems.push({
                        hrid: input.item,
                        count: Math.ceil(count),
                        neededCrafts: needs,
                        craftTime: subInfo.adjustedTime,
                        totalSubTime: time,
                        skillId: subInfo.skillId,
                    });
                }
            }
        }

        if (recipe.upgrade) {
            const upgradeRecipe = this.recipes[recipe.upgrade];
            if (upgradeRecipe && upgradeRecipe.baseTime) {
                if (!(skipBase && this.isBaseResource(recipe.upgrade))) {
                    const upgradeInfo = this.getCraftingTimeRecursive(recipe.upgrade, config, new Set(visited), config.ignoreCraftEfficiency && shouldIgnoreEff);
                    if (upgradeInfo) {
                        subCraftTime += upgradeInfo.totalCraftTime;
                    }
                }
            }
        }

        const totalCraftTime = effectiveTime + subCraftTime;

        return {
            ...craftInfo,
            adjustedTime: effectiveTime,
            outputMultiplier: effectiveMultiplier,
            subCraftTime,
            totalCraftTime,
            subItems,
            efficiencyIgnored: shouldIgnoreEff,
        };
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { CraftingTimeCalculator, ENHANCE_BONUS };
} else if (typeof window !== 'undefined') {
    window.CraftingTimeCalculator = CraftingTimeCalculator;
}