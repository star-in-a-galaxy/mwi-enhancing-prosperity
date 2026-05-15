// ==UserScript==
// @name         MWI Enhancing Prosperity Companion
// @namespace    http://tampermonkey.net/
// @version      1.0.0
// @description  Reads equipped gear + skill levels from MWI init_character_data and imports into Enhancing Prosperity calculator.
// @author       Star
// @license      CC-BY-NC-SA-4.0
// @match        https://www.milkywayidle.com/*
// @match        https://test.milkywayidle.com/*
// @match        https://star-in-a-galaxy.github.io/mwi-enhancing-prosperity/*
// @match        http://localhost:8000/*
// @match        http://127.0.0.1:8000/*
// @match        file:///*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addStyle
// @grant        unsafeWindow
// @run-at       document-start
// @icon         data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgdmlld0JveD0iMCAwIDEwMCAxMDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHJhZGlhbEdyYWRpZW50IGlkPSJiZyIgY3g9IjUwJSIgY3k9IjUwJSIgcj0iNTAlIj48c3RvcCBvZmZzZXQ9IjAlIiBzdG9wLWNvbG9yPSIjMjUyZDNkIi8+PHN0b3Agb2Zmc2V0PSIxMDAlIiBzdG9wLWNvbG9yPSIjMWEyMDJjIi8+PC9yYWRpYWxHcmFkaWVudD48ZmlsdGVyIGlkPSJnbG93IiB4PSItMjAlIiB5PSItMjAlIiB3aWR0aD0iMTQwJSIgaGVpZ2h0PSIxNDAlIj48ZmVHYXVzc2lhbkJsdXIgc3RkRGV2aWF0aW9uPSIyLjUiLz48L2ZpbHRlcj48L2RlZnM+PGNpcmNsZSBjeD0iNTAiIGN5PSI1MCIgcj0iNDgiIGZpbGw9InVybCgjYmcpIiBzdHJva2U9IiMyNTJkM2QiIHN0cm9rZS13aWR0aD0iMSIvPjxjaXJjbGUgY3g9IjUwIiBjeT0iNTAiIHI9IjQ0IiBmaWxsPSJub25lIiBzdHJva2U9IiMwMGQ5ZmYiIHN0cm9rZS13aWR0aD0iMSIgb3BhY2l0eT0iLjMiIHN0cm9rZS1kYXNoYXJyYXk9IjIgMiIvPjxnIHN0cm9rZT0iIzAwZDlmZiIgc3Ryb2tlLXdpZHRoPSIyLjUiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgb3BhY2l0eT0iLjYiPjxwYXRoIGQ9Ik01MCA1djdNNTAgODh2N001IDUwaDdNODggNTBoNyIvPjwvZz48cmVjdCB4PSIzOCIgeT0iNzIiIHdpZHRoPSI2IiBoZWlnaHQ9IjEwIiByeD0iMSIgZmlsbD0iIzAwZDlmZiIgb3BhY2l0eT0iLjkiLz48cmVjdCB4PSI0NyIgeT0iNzYiIHdpZHRoPSI2IiBoZWlnaHQ9IjYiIHJ4PSIxIiBmaWxsPSIjYzc3ZGZmIiBvcGFjaXR5PSIuOSIvPjxyZWN0IHg9IjU2IiB5PSI2OSIgd2lkdGg9IjYiIGhlaWdodD0iMTMiIHJ4PSIxIiBmaWxsPSIjMmVjYzcxIiBvcGFjaXR5PSIuOSIvPjxwYXRoIGQ9Ik01MCAzMmw0LjEgMTAuMyAxMS4xLjgtOC41IDcuMSAyLjcgMTAuN0w1MCA1NWwtOS40IDUuOSAyLjctMTAuNy04LjUtNy4xIDExLjEtLjh6IiBmaWxsPSIjYzc3ZGZmIiBzdHJva2U9IiNlOGVlZjUiIHN0cm9rZS13aWR0aD0iMS4yIiBmaWx0ZXI9InVybCgjZ2xvdykiLz48Y2lyY2xlIGN4PSIyNCIgY3k9IjM4IiByPSIxLjEiIGZpbGw9IiMwMGQ5ZmYiIG9wYWNpdHk9Ii41Ii8+PGNpcmNsZSBjeD0iODAiIGN5PSIyNCIgcj0iLjkiIGZpbGw9IiNmZmYiIG9wYWNpdHk9Ii43Ii8+PGNpcmNsZSBjeD0iNzYiIGN5PSI3MCIgcj0iMS4yIiBmaWxsPSIjZmZkNzAwIiBvcGFjaXR5PSIuNyIvPjxwYXRoIGQ9Ik0yOCA3OGMxMiAwIDIwLTggMjItMjMgMi0xNSAxNS0zMCAzMi0zNyIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjMmVjYzcxIiBzdHJva2Utd2lkdGg9IjQuNSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBmaWx0ZXI9InVybCgjZ2xvdykiLz48L3N2Zz4=
// ==/UserScript==

/*
  How it works:
  1. Intercepts WebSocket messages on milkywayidle.com
  2. On "init_character_data": extracts characterSkills + characterLoadoutMap + actionTypeDrinkSlotsMap
  3. Maps equipped items and skill levels to the calculator gear format
  4. Stores result in GM storage (cross-domain shared)
  5. On the calculator page: injects an "Import from Game" button + auto-imports if fresh data exists
*/

(function () {
    'use strict';

    const STORAGE_KEY = 'mwi_gear_importer_v1';
    const LOG_ENABLED = true;

    function log(...args) {
        if (LOG_ENABLED) console.log('[MWI Gear Importer]', ...args);
    }

    // ── WebSocket interception (same pattern as crafting_list_addon.js) ──

    let attachedGameSockets = new WeakSet();
    let socketListenerInstalled = false;
    let cachedGearData = null;

    function isGameSocket(socket) {
        const url = socket?.url || '';
        return url.includes('api.milkywayidle.com/ws') || url.includes('api-test.milkywayidle.com/ws');
    }

    function parseWearableHash(hash) {
        if (!hash || typeof hash !== 'string') return null;
        const parts = hash.split('::');
        if (parts.length < 4) return null;
        return {
            characterId: parts[0],
            location: parts[1],
            itemHrid: parts[2],
            enhancementLevel: parseInt(parts[3], 10) || 0,
        };
    }

    function getEnhancerSlug(itemHrid) {
        if (!itemHrid) return null;
        const slug = itemHrid.replace('/items/', '');
        if (slug.includes('_enhancer')) return slug;
        return null;
    }

    function getToolSlug(itemHrid) {
        if (!itemHrid) return null;
        const slug = itemHrid.replace('/items/', '');
        return slug;
    }

    function detectSkillTop(slug) {
        if (!slug) return null;
        if (slug.includes('enhancers_top') || slug.includes('enhancer_top')) return 'enhancing';
        if (slug.includes('crafters_top') || slug.includes('crafter_top') || slug.includes('crafting_top')) return 'crafting';
        if (slug.includes('cheesemakers_top') || slug.includes('cheesemaker_top') || slug.includes('cheesesmithing_top')) return 'cheesesmithing';
        if (slug.includes('tailors_top') || slug.includes('tailor_top') || slug.includes('tailoring_top')) return 'tailoring';
        return null;
    }

    function detectSkillBottoms(slug) {
        if (!slug) return null;
        if (slug.includes('enhancers_bottoms') || slug.includes('enhancer_bottoms') || slug.includes('enhancing_bottoms')) return 'enhancing';
        if (slug.includes('crafters_bottoms') || slug.includes('crafter_bottoms') || slug.includes('crafting_bottoms')) return 'crafting';
        if (slug.includes('cheesemakers_bottoms') || slug.includes('cheesemaker_bottoms') || slug.includes('cheesesmithing_bottoms')) return 'cheesesmithing';
        if (slug.includes('tailors_bottoms') || slug.includes('tailor_bottoms') || slug.includes('tailoring_bottoms')) return 'tailoring';
        return null;
    }

    function detectNecklaceType(slug) {
        if (!slug) return 'none';
        if (slug.includes('philosophers_necklace')) return 'philo';
        if (slug.includes('necklace_of_speed') || slug.includes('speed_necklace')) return 'speed';
        return 'none';
    }

    function detectRingType(slug) {
        if (!slug) return 'none';
        if (slug.includes('ring_of_essence_find') || slug.includes('essence_ring')) return 'essence';
        if (slug.includes('ring_of_rare_find') || slug.includes('rare_find_ring')) return 'rare';
        if (slug.includes('philosophers_ring')) return 'philo';
        return 'none';
    }

    function detectEarringsType(slug) {
        if (!slug) return 'none';
        if (slug.includes('earrings_of_essence_find') || slug.includes('essence_earrings')) return 'essence';
        if (slug.includes('earrings_of_rare_find') || slug.includes('rare_find_earrings')) return 'rare';
        if (slug.includes('philosophers_earrings')) return 'philo';
        return 'none';
    }

    function isChanceCape(slug) {
        if (!slug) return false;
        return slug.includes('chance_cape');
    }

    function isArtificerCape(slug) {
        if (!slug) return false;
        return slug.includes('artificer_cape');
    }

    function detectCapeType(slug) {
        if (!slug) return 'standard';
        if (slug.includes('_refined')) return 'refined';
        return 'standard';
    }

    function detectCharmTier(itemHrid) {
        if (!itemHrid) return 'none';
        const slug = itemHrid.replace('/items/', '');
        const match = slug.match(/^(.+?)_enhancing_charm$/);
        if (!match) return 'none';
        return match[1];
    }

    function extractGearConfig(msg) {
        const _log = [];
        function ll(msg) { _log.push(msg); }
        const gear = {
            enhancingLevel: '110',
            observatoryLevel: '4',
            enhancer: 'celestial_enhancer',
            enhancerLevel: '8',
            enchantedGlovesEquipped: false,
            enchantedGlovesLevel: '0',
            enhancerTopEquipped: false,
            enhancerTopLevel: '0',
            enhancerBotEquipped: false,
            enhancerBotLevel: '0',
            necklaceType: 'none',
            necklaceLevel: '0',
            ringType: 'none',
            ringLevel: '0',
            earringsType: 'none',
            earringsLevel: '0',
            guzzlingPouchEquipped: false,
            guzzlingPouchLevel: '0',
            capeEquipped: false,
            capeType: 'standard',
            capeLevel: '0',
            artisanTea: true,
            wisdomTea: true,
            teaEnhancing: false,
            teaSuperEnhancing: false,
            teaUltraEnhancing: false,
            teaBlessed: false,
            charmTier: 'none',
            charmLevel: '0',
            enhancingBuffLevel: '0',
            experienceBuffLevel: '0',
            productionEfficiencyBuffLevel: '0',
            achievementBonus: false,
            craftingTeaEfficiency: false,
            craftingTeaSuperEfficiency: false,
            craftingTeaUltraEfficiency: false,
            craftingEfficiencyTea: false,
            craftingWisdomTea: false,
            eyeWatchEquipped: false,
            eyeWatchLevel: '0',
            artificerCapeEquipped: false,
            artificerCapeType: 'standard',
            artificerCapeLevel: '0',
            cheesesmithingLevel: '100',
            cheesesmithingTool: 'none',
            cheesesmithingToolLevel: '0',
            cheesesmithingTopEquipped: false,
            cheesesmithingTopLevel: '0',
            cheesesmithingBottomsEquipped: false,
            cheesesmithingBottomsLevel: '0',
            craftingLevel: '100',
            craftingTool: 'none',
            craftingToolLevel: '0',
            craftingTopEquipped: false,
            craftingTopLevel: '0',
            craftingBottomsEquipped: false,
            craftingBottomsLevel: '0',
            tailoringLevel: '100',
            tailoringTool: 'none',
            tailoringToolLevel: '0',
            tailoringTopEquipped: false,
            tailoringTopLevel: '0',
            tailoringBottomsEquipped: false,
            tailoringBottomsLevel: '0',
            forgeLevel: '0',
            workshopLevel: '0',
            sewing_parlorLevel: '0',
            otherHouseLevel: '0',
            skipBaseResourceCrafting: true,
            ignoreCraftEfficiency: true,
            includeRareFind: true,
        };

        // ── 1. Skill levels ──
        const skills = msg.characterSkills || [];
        const skillMap = {};
        for (const s of skills) {
            const hrid = s.skillHrid || '';
            const level = s.level || 0;
            const name = hrid.replace('/skills/', '');
            skillMap[name] = level;
        }
        if (skillMap.enhancing) { gear.enhancingLevel = String(skillMap.enhancing); ll(`Skill: Enhancing ${skillMap.enhancing}`); }
        if (skillMap.crafting) { gear.craftingLevel = String(skillMap.crafting); ll(`Skill: Crafting ${skillMap.crafting}`); }
        if (skillMap.cheesesmithing) { gear.cheesesmithingLevel = String(skillMap.cheesesmithing); ll(`Skill: Cheesesmithing ${skillMap.cheesesmithing}`); }
        if (skillMap.tailoring) { gear.tailoringLevel = String(skillMap.tailoring); ll(`Skill: Tailoring ${skillMap.tailoring}`); }

        // ── 2. Loadouts ──
        const loadoutMap = msg.characterLoadoutMap || {};
        let enhancingLoadout = null;
        let allSkillsLoadout = null;
        let craftingLoadout = null;
        let cheesesmithingLoadout = null;
        let tailoringLoadout = null;

        for (const loadout of Object.values(loadoutMap)) {
            const type = loadout.actionTypeHrid || '';
            if (type === '/action_types/enhancing' && loadout.isDefault) {
                enhancingLoadout = loadout;
            } else if (type === '' && loadout.isDefault) {
                allSkillsLoadout = loadout;
            } else if (type === '/action_types/crafting' && loadout.isDefault) {
                craftingLoadout = loadout;
            } else if (type === '/action_types/cheesesmithing' && loadout.isDefault) {
                cheesesmithingLoadout = loadout;
            } else if (type === '/action_types/tailoring' && loadout.isDefault) {
                tailoringLoadout = loadout;
            }
        }

        // Merge function: enhancing loadout gets priority, allSkills as fallback
        function getWearable(location, primary, fallback) {
            const primaryVal = primary?.wearableMap?.[location];
            if (primaryVal) return primaryVal;
            return fallback?.wearableMap?.[location] || '';
        }

        const primary = enhancingLoadout || allSkillsLoadout;
        const fallback = enhancingLoadout ? allSkillsLoadout : null;
        if (enhancingLoadout) ll('Loadout: Enhancing (default)');
        else if (allSkillsLoadout) ll('Loadout: All Skills (default)');
        else ll('Loadout: none found');

        // ── Enhancing gear ──
        const enhToolHash = getWearable('/item_locations/enhancing_tool', primary, fallback);
        if (enhToolHash) {
            const parsed = parseWearableHash(enhToolHash);
            if (parsed) {
                const slug = getEnhancerSlug(parsed.itemHrid);
                if (slug) {
                    gear.enhancer = slug;
                    gear.enhancerLevel = String(parsed.enhancementLevel);
                    ll(`Enhancer: ${slug} +${parsed.enhancementLevel}`);
                }
            }
        } else {
            ll('Enhancer: none');
        }

        // Hands → Enchanted Gloves
        const handsHash = getWearable('/item_locations/hands', primary, fallback);
        if (handsHash) {
            const parsed = parseWearableHash(handsHash);
            if (parsed && parsed.itemHrid.includes('enchanted_gloves')) {
                gear.enchantedGlovesEquipped = true;
                gear.enchantedGlovesLevel = String(parsed.enhancementLevel);
                ll(`Gloves: Enchanted Gloves +${parsed.enhancementLevel}`);
            }
        }

        // Body → skill top
        const bodyHash = getWearable('/item_locations/body', primary, fallback);
        if (bodyHash) {
            const parsed = parseWearableHash(bodyHash);
            if (parsed) {
                const slug = parsed.itemHrid.replace('/items/', '');
                const skill = detectSkillTop(slug);
                const lvl = String(parsed.enhancementLevel);
                if (skill === 'enhancing') { gear.enhancerTopEquipped = true; gear.enhancerTopLevel = lvl; ll(`Top: ${slug} +${parsed.enhancementLevel} (Enhancing)`); }
                else if (skill === 'crafting') { gear.craftingTopEquipped = true; gear.craftingTopLevel = lvl; ll(`Top: ${slug} +${parsed.enhancementLevel} (Crafting)`); }
                else if (skill === 'cheesesmithing') { gear.cheesesmithingTopEquipped = true; gear.cheesesmithingTopLevel = lvl; ll(`Top: ${slug} +${parsed.enhancementLevel} (Cheesesmithing)`); }
                else if (skill === 'tailoring') { gear.tailoringTopEquipped = true; gear.tailoringTopLevel = lvl; ll(`Top: ${slug} +${parsed.enhancementLevel} (Tailoring)`); }
            }
        }

        // Legs → skill bottoms
        const legsHash = getWearable('/item_locations/legs', primary, fallback);
        if (legsHash) {
            const parsed = parseWearableHash(legsHash);
            if (parsed) {
                const slug = parsed.itemHrid.replace('/items/', '');
                const skill = detectSkillBottoms(slug);
                const lvl = String(parsed.enhancementLevel);
                if (skill === 'enhancing') { gear.enhancerBotEquipped = true; gear.enhancerBotLevel = lvl; ll(`Bottoms: ${slug} +${parsed.enhancementLevel} (Enhancing)`); }
                else if (skill === 'crafting') { gear.craftingBottomsEquipped = true; gear.craftingBottomsLevel = lvl; ll(`Bottoms: ${slug} +${parsed.enhancementLevel} (Crafting)`); }
                else if (skill === 'cheesesmithing') { gear.cheesesmithingBottomsEquipped = true; gear.cheesesmithingBottomsLevel = lvl; ll(`Bottoms: ${slug} +${parsed.enhancementLevel} (Cheesesmithing)`); }
                else if (skill === 'tailoring') { gear.tailoringBottomsEquipped = true; gear.tailoringBottomsLevel = lvl; ll(`Bottoms: ${slug} +${parsed.enhancementLevel} (Tailoring)`); }
            }
        }

        // ── Skill-specific loadout tops/bottoms ──
        function readBodyLegs(loadout, topField, botField, topLevelField, botLevelField) {
            if (!loadout?.wearableMap) return;
            const bodyHash2 = loadout.wearableMap['/item_locations/body'];
            if (bodyHash2) {
                const p = parseWearableHash(bodyHash2);
                if (p) {
                    const slug = p.itemHrid.replace('/items/', '');
                    const skill = detectSkillTop(slug);
                    const lvl = String(p.enhancementLevel);
                    if (skill === 'crafting' && topField === 'craftingTopEquipped') { gear[topField] = true; gear[topLevelField] = lvl; }
                    else if (skill === 'cheesesmithing' && topField === 'cheesesmithingTopEquipped') { gear[topField] = true; gear[topLevelField] = lvl; }
                    else if (skill === 'tailoring' && topField === 'tailoringTopEquipped') { gear[topField] = true; gear[topLevelField] = lvl; }
                }
            }
            const legsHash2 = loadout.wearableMap['/item_locations/legs'];
            if (legsHash2) {
                const p = parseWearableHash(legsHash2);
                if (p) {
                    const slug = p.itemHrid.replace('/items/', '');
                    const skill = detectSkillBottoms(slug);
                    const lvl = String(p.enhancementLevel);
                    if (skill === 'crafting' && botField === 'craftingBottomsEquipped') { gear[botField] = true; gear[botLevelField] = lvl; }
                    else if (skill === 'cheesesmithing' && botField === 'cheesesmithingBottomsEquipped') { gear[botField] = true; gear[botLevelField] = lvl; }
                    else if (skill === 'tailoring' && botField === 'tailoringBottomsEquipped') { gear[botField] = true; gear[botLevelField] = lvl; }
                }
            }
        }

        if (craftingLoadout) readBodyLegs(craftingLoadout, 'craftingTopEquipped', 'craftingBottomsEquipped', 'craftingTopLevel', 'craftingBottomsLevel');
        if (cheesesmithingLoadout) readBodyLegs(cheesesmithingLoadout, 'cheesesmithingTopEquipped', 'cheesesmithingBottomsEquipped', 'cheesesmithingTopLevel', 'cheesesmithingBottomsLevel');
        if (tailoringLoadout) readBodyLegs(tailoringLoadout, 'tailoringTopEquipped', 'tailoringBottomsEquipped', 'tailoringTopLevel', 'tailoringBottomsLevel');

        // Neck
        const neckHash = getWearable('/item_locations/neck', primary, fallback);
        if (neckHash) {
            const parsed = parseWearableHash(neckHash);
            if (parsed) {
                const slug = parsed.itemHrid.replace('/items/', '');
                const type = detectNecklaceType(slug);
                if (type !== 'none') {
                    gear.necklaceType = type;
                    gear.necklaceLevel = String(parsed.enhancementLevel);
                    ll(`Necklace: ${slug} +${parsed.enhancementLevel} (${type})`);
                }
            }
        }

        // Ring
        const ringHash = getWearable('/item_locations/ring', primary, fallback);
        if (ringHash) {
            const parsed = parseWearableHash(ringHash);
            if (parsed) {
                const slug = parsed.itemHrid.replace('/items/', '');
                const type = detectRingType(slug);
                if (type !== 'none') {
                    gear.ringType = type;
                    gear.ringLevel = String(parsed.enhancementLevel);
                    ll(`Ring: ${slug} +${parsed.enhancementLevel} (${type})`);
                }
            }
        }

        // Earrings
        const earringsHash = getWearable('/item_locations/earrings', primary, fallback);
        if (earringsHash) {
            const parsed = parseWearableHash(earringsHash);
            if (parsed) {
                const slug = parsed.itemHrid.replace('/items/', '');
                const type = detectEarringsType(slug);
                if (type !== 'none') {
                    gear.earringsType = type;
                    gear.earringsLevel = String(parsed.enhancementLevel);
                    ll(`Earrings: ${slug} +${parsed.enhancementLevel} (${type})`);
                }
            }
        }

        // Pouch
        const pouchHash = getWearable('/item_locations/pouch', primary, fallback);
        if (pouchHash) {
            const parsed = parseWearableHash(pouchHash);
            if (parsed && parsed.itemHrid.includes('guzzling_pouch')) {
                gear.guzzlingPouchEquipped = true;
                gear.guzzlingPouchLevel = String(parsed.enhancementLevel);
                ll(`Pouch: Guzzling Pouch +${parsed.enhancementLevel}`);
            }
        }

        // Off-hand → Eye Watch
        const offHandHash = getWearable('/item_locations/off_hand', primary, fallback);
        if (offHandHash) {
            const parsed = parseWearableHash(offHandHash);
            if (parsed && parsed.itemHrid.includes('eye_watch')) {
                gear.eyeWatchEquipped = true;
                gear.eyeWatchLevel = String(parsed.enhancementLevel);
                ll(`Eye Watch: +${parsed.enhancementLevel}`);
            }
        }

        // Back → Cape (Artificer vs Chance)
        const backHash = getWearable('/item_locations/back', primary, fallback);
        if (backHash) {
            const parsed = parseWearableHash(backHash);
            if (parsed) {
                const slug = parsed.itemHrid.replace('/items/', '');
                if (isArtificerCape(slug)) {
                    gear.artificerCapeEquipped = true;
                    gear.artificerCapeType = detectCapeType(slug);
                    gear.artificerCapeLevel = String(parsed.enhancementLevel);
                    ll(`Cape: ${slug} +${parsed.enhancementLevel} (Artificer)`);
                } else if (isChanceCape(slug)) {
                    gear.capeEquipped = true;
                    gear.capeType = detectCapeType(slug);
                    gear.capeLevel = String(parsed.enhancementLevel);
                    ll(`Cape: ${slug} +${parsed.enhancementLevel} (Chance)`);
                }
            }
        }

        // Charm
        const charmHash = getWearable('/item_locations/charm', primary, fallback);
        if (charmHash) {
            const parsed = parseWearableHash(charmHash);
            if (parsed) {
                const tier = detectCharmTier(parsed.itemHrid);
                if (tier !== 'none') {
                    gear.charmTier = tier;
                    gear.charmLevel = String(parsed.enhancementLevel);
                    ll(`Charm: ${tier} +${parsed.enhancementLevel}`);
                }
            }
        }

        // ── Crafting tools (from skill-specific loadouts, else enhancing/allSkills) ──
        function getTool(location, skillLoadout) {
            const hash = skillLoadout?.wearableMap?.[location]
                || getWearable(location, primary, fallback);
            if (!hash) return { tool: 'none', level: '0' };
            const parsed = parseWearableHash(hash);
            if (!parsed) return { tool: 'none', level: '0' };
            const slug = getToolSlug(parsed.itemHrid);
            // Extract tool quality from slug (e.g. "holy_chisel" → "holy")
            const match = slug.match(/^(\w+)_/);
            const tool = match ? match[1] : 'none';
            return { tool, level: String(parsed.enhancementLevel) };
        }

        const craftTool = getTool('/item_locations/crafting_tool', craftingLoadout);
        gear.craftingTool = craftTool.tool;
        gear.craftingToolLevel = craftTool.level;
        if (craftTool.tool !== 'none') ll(`Crafting Tool: ${craftTool.tool} +${craftTool.level}`);

        const cheeseTool = getTool('/item_locations/cheesesmithing_tool', cheesesmithingLoadout);
        gear.cheesesmithingTool = cheeseTool.tool;
        gear.cheesesmithingToolLevel = cheeseTool.level;
        if (cheeseTool.tool !== 'none') ll(`Cheesesmithing Tool: ${cheeseTool.tool} +${cheeseTool.level}`);

        const tailorTool = getTool('/item_locations/tailoring_tool', tailoringLoadout);
        gear.tailoringTool = tailorTool.tool;
        gear.tailoringToolLevel = tailorTool.level;
        if (tailorTool.tool !== 'none') ll(`Tailoring Tool: ${tailorTool.tool} +${tailorTool.level}`);

        // ── 4. House rooms ──
        const houseRoomMap = msg.characterHouseRoomMap || {};
        for (const [roomHrid, roomData] of Object.entries(houseRoomMap)) {
            const level = String(roomData.level ?? 0);
            if (roomHrid.includes('forge')) { gear.forgeLevel = level; ll(`House: Forge ${level}`); }
            else if (roomHrid.includes('workshop')) { gear.workshopLevel = level; ll(`House: Workshop ${level}`); }
            else if (roomHrid.includes('sewing_parlor')) { gear.sewing_parlorLevel = level; ll(`House: Sewing Parlor ${level}`); }
            else if (roomHrid.includes('house')) { gear.otherHouseLevel = level; ll(`House: Other ${level}`); }
        }

        // ── 5. Observatory level ──
        if (msg.observatoryLevel != null) {
            gear.observatoryLevel = String(msg.observatoryLevel);
            ll(`Observatory: ${msg.observatoryLevel}`);
        }

        // ── 6. Community buffs ──
        const buffs = msg.communityBuffs || [];
        for (const b of buffs) {
            const hrid = b.hrid || '';
            const lvl = String(b.level ?? 0);
            if (hrid.includes('enhancing_speed')) { gear.enhancingBuffLevel = lvl; ll(`Buff: Enhancing Speed ${lvl}`); }
            else if (hrid.includes('experience')) { gear.experienceBuffLevel = lvl; ll(`Buff: Experience ${lvl}`); }
            else if (hrid.includes('production_efficiency')) { gear.productionEfficiencyBuffLevel = lvl; ll(`Buff: Production Efficiency ${lvl}`); }
        }

        // ── 7. Achievement bonus ──
        if (msg.achievementBonus != null) {
            gear.achievementBonus = !!msg.achievementBonus;
            ll(`Achievement Bonus: ${!!msg.achievementBonus}`);
        }

        // ── 8. Teas from actionTypeDrinkSlotsMap ──
        const drinkSlots = msg.actionTypeDrinkSlotsMap || {};
        function hasTea(skillType, teaHrid) {
            const slots = drinkSlots[skillType];
            if (!Array.isArray(slots)) return false;
            return slots.some(slot => slot && slot.itemHrid === teaHrid && slot.isActive);
        }

        // Enhancing teas
        gear.teaBlessed = hasTea('/action_types/enhancing', '/items/blessed_tea');
        gear.wisdomTea = hasTea('/action_types/enhancing', '/items/wisdom_tea');
        gear.teaUltraEnhancing = hasTea('/action_types/enhancing', '/items/ultra_enhancing_tea');
        gear.teaSuperEnhancing = hasTea('/action_types/enhancing', '/items/super_enhancing_tea');
        gear.teaEnhancing = hasTea('/action_types/enhancing', '/items/enhancing_tea');

        const enhTeas = [];
        if (gear.teaBlessed) enhTeas.push('Blessed');
        if (gear.wisdomTea) enhTeas.push('Wisdom');
        if (gear.teaUltraEnhancing) enhTeas.push('Ultra');
        if (gear.teaSuperEnhancing) enhTeas.push('Super');
        if (gear.teaEnhancing) enhTeas.push('Basic');
        ll(`Enhancing Teas: ${enhTeas.length ? enhTeas.join(', ') : 'none'}`);

        // Crafting teas
        gear.artisanTea = hasTea('/action_types/crafting', '/items/artisan_tea');
        gear.craftingWisdomTea = hasTea('/action_types/crafting', '/items/wisdom_tea');
        gear.craftingEfficiencyTea = hasTea('/action_types/crafting', '/items/efficiency_tea');
        gear.craftingTeaUltraEfficiency = hasTea('/action_types/crafting', '/items/ultra_crafting_tea');
        gear.craftingTeaSuperEfficiency = hasTea('/action_types/crafting', '/items/super_crafting_tea');
        gear.craftingTeaEfficiency = hasTea('/action_types/crafting', '/items/crafting_tea');

        const craftTeas = [];
        if (gear.artisanTea) craftTeas.push('Artisan');
        if (gear.craftingWisdomTea) craftTeas.push('Wisdom');
        if (gear.craftingEfficiencyTea) craftTeas.push('Efficiency');
        if (gear.craftingTeaUltraEfficiency) craftTeas.push('Ultra');
        if (gear.craftingTeaSuperEfficiency) craftTeas.push('Super');
        if (gear.craftingTeaEfficiency) craftTeas.push('Basic');
        ll(`Crafting Teas: ${craftTeas.length ? craftTeas.join(', ') : 'none'}`);

        return { gear, log: _log };
    }

    function handleInitCharacterData(msg) {
        log('init_character_data received, extracting gear...');
        try {
            const result = extractGearConfig(msg);
            const gear = result.gear;
            const lines = result.log;
            // Print detailed extraction log
            for (const line of lines) {
                log(line);
            }
            cachedGearData = {
                timestamp: Date.now(),
                gear: gear,
            };
            GM_setValue(STORAGE_KEY, JSON.stringify(cachedGearData));
            log(`Gear data saved to GM storage (${Object.keys(gear).length} fields)`);
        } catch (e) {
            console.warn('[MWI Gear Importer] Failed to extract gear:', e);
        }
    }

    // ── WebSocket interception (from crafting_list_addon.js) ──

    function attachSocketListener(socket) {
        if (!isGameSocket(socket) || attachedGameSockets.has(socket)) return;
        attachedGameSockets.add(socket);
        socket.addEventListener('message', event => {
            if (typeof event?.data !== 'string') return;
            try {
                const msg = JSON.parse(event.data);
                if (msg?.type === 'init_character_data') {
                    handleInitCharacterData(msg);
                }
            } catch (_) { /* ignore non-JSON messages */ }
        });
    }

    function installSocketListener() {
        if (socketListenerInstalled) return;
        const targetWindow = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
        const OriginalWebSocket = targetWindow?.WebSocket;
        if (!OriginalWebSocket) return;
        if (OriginalWebSocket.__gearImporterWrapped) {
            socketListenerInstalled = true;
            return;
        }

        class GearImporterWebSocket extends OriginalWebSocket {
            constructor(...args) {
                super(...args);
                attachSocketListener(this);
            }
        }

        GearImporterWebSocket.__gearImporterWrapped = true;
        try {
            targetWindow.WebSocket = GearImporterWebSocket;
            socketListenerInstalled = true;
            log('WebSocket interception installed');
        } catch (_) { /* ignore */ }
    }

    // ── Calculator page integration ──

    function injectImportButton() {
        const existing = document.getElementById('mwi-gear-import-btn');
        if (existing) return;

        // Find the gear panel header to inject the button there
        const resetGearBtn = document.getElementById('resetGearBtn');
        if (!resetGearBtn) return;

        const btn = document.createElement('button');
        btn.id = 'mwi-gear-import-btn';
        btn.textContent = 'Import';
        btn.title = 'Import gear from MWI game data (captured via Tampermonkey WebSocket)';
        btn.style.cssText = `
            font-size:0.72rem; padding:2px 8px;
            background:var(--accent); color:#fff; border:none;
            border-radius:4px; cursor:pointer;
        `;
        btn.onmouseenter = () => { btn.style.filter = 'brightness(1.1)'; };
        btn.onmouseleave = () => { btn.style.filter = ''; };

        btn.addEventListener('click', () => {
            const raw = GM_getValue(STORAGE_KEY, null);
            if (!raw) {
                log('Import clicked but no data in GM storage');
                btn.textContent = 'No data!';
                setTimeout(() => { btn.textContent = 'Import'; }, 2000);
                return;
            }
            try {
                const data = JSON.parse(raw);
                const age = Date.now() - (data.timestamp || 0);
                const ageMin = Math.round(age / 60000);
                log(`Import clicked — data age: ${ageMin}m, applying gear...`);
                applyGearToCalculator(data.gear);
                btn.textContent = '✅ Done';
                setTimeout(() => { btn.textContent = 'Import'; }, 2000);
            } catch (e) {
                log(`Import failed: ${e.message}`);
                btn.textContent = 'Error';
                setTimeout(() => { btn.textContent = 'Import'; }, 2000);
            }
        });

        // Insert right after resetGearBtn in the gear panel header
        resetGearBtn.parentNode.insertBefore(btn, resetGearBtn.nextSibling);
    }

    function applyGearToCalculator(gear) {
        if (!gear || typeof gear !== 'object') return;

        // Log what we're importing
        const changed = [];
        for (const key of Object.keys(gear)) {
            const val = gear[key];
            if (typeof val === 'boolean') changed.push(`${key}: ${val}`);
            else if (typeof val === 'string' && val !== '0' && val !== 'false' && val !== 'none' && val !== 'celestial_enhancer' && val !== '110' && val !== '4' && val !== '100') changed.push(`${key}: ${val}`);
        }
        log(`Importing ${changed.length} gear fields: ${changed.join(', ')}`);

        const targetWin = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
        let localStorageOk = false;

        // Write gear into localStorage under the settings key the calculator uses
        try {
            const raw = localStorage.getItem('mwi-enhance-settings');
            let settings = raw ? JSON.parse(raw) : {};
            if (!settings.gear) settings.gear = {};
            const oldGear = { ...settings.gear };
            Object.assign(settings.gear, gear);
            localStorage.setItem('mwi-enhance-settings', JSON.stringify(settings));
            localStorageOk = true;

            // Log what actually changed
            const realChanges = [];
            for (const key of Object.keys(gear)) {
                if (String(settings.gear[key]) !== String(oldGear[key] || '')) {
                    realChanges.push(`${key}: ${oldGear[key] ?? '?'} → ${settings.gear[key]}`);
                }
            }
            log(`localStorage updated — ${realChanges.length} fields changed`);
            for (const c of realChanges) log(`  ${c}`);
        } catch (e) {
            log(`localStorage unavailable (${e.message}) — will try direct settingsStore`);
        }

        // Call the calculator's import handler (explicitly on window for TM sandbox compat)
        if (typeof targetWin.importGearFromStorage === 'function') {
            targetWin.importGearFromStorage();
            log('Called importGearFromStorage() — gear applied to settingsStore + DOM, recalc triggered');
            return;
        }

        // Last resort: gear is in localStorage, reload to apply
        log('importGearFromStorage not found on page — reloading to apply gear from localStorage');
        if (localStorageOk) targetWin.location.reload();
    }

    // ── Init ──

    const currentURL = window.location.href;
    const isGame = currentURL.includes('milkywayidle.com') || currentURL.includes('milkywayidle');

    log(`Running on ${currentURL.substring(0, 120)} — ${isGame ? 'game mode (WebSocket interception)' : 'calculator mode (import button)'}`);

    if (isGame) {
        // Game pages: intercept WebSocket
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', installSocketListener);
        } else {
            installSocketListener();
        }
        // Also try immediately (for document-start)
        installSocketListener();
    } else {
        // Calculator page: mark page for detection + inject import button
        document.documentElement.dataset.mwiCompanion = '1';
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', injectImportButton);
        } else {
            injectImportButton();
        }
    }

})();
