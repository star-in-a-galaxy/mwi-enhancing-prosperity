"""
Preprocess raw game data into a structured, optimized game-data.js for the enhancing tool.

Reads from:
  - references/Enhancelator/init_client_info.json (full game data)
  - init_character_data.js (player-specific data, optional)

Outputs to:
  - assets/game-data.js

Extracted data:
  - Enhanceable items (with enhancementCosts, protectionItems)
  - Equipment stats (all gear pieces with their stat bonuses)
  - Crafting recipes (baseTime, skillId, inputs, upgrade, level)
  - Essence drop rates (per tool/action from essenceDropTable)
  - House room bonuses (per room type, per level: speed, efficiency, wisdom, rareFind)
  - Constants (enhanceBonus, successRate)
  - Action type details (for tea/drink slot mapping)
"""

import json
import re
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
REPO_ROOT = SCRIPT_DIR.parent
CLIENT_INFO = REPO_ROOT / 'references' / 'Enhancelator' / 'init_client_info.json'
CHARACTER_DATA = REPO_ROOT / 'init_character_data.js'
OUTPUT_FILE = REPO_ROOT / 'assets' / 'game-data.js'

# Hardcoded constants (not in game data)
ENHANCE_BONUS = [
    1.000, 1.020, 1.042, 1.066, 1.092,
    1.120, 1.150, 1.182, 1.216, 1.252,
    1.290, 1.334, 1.384, 1.440, 1.502,
    1.570, 1.644, 1.724, 1.810, 1.902,
    2.000
]

SUCCESS_RATE = [
    50, 45, 45, 40, 40, 40, 35, 35, 35, 35,
    30, 30, 30, 30, 30, 30, 30, 30, 30, 30
]

# House room bonus definitions (per level)
# Each room gives: skill-specific efficiency, wisdom (universal exp), rare find
HOUSE_ROOM_BONUSES = {
    # Skill-specific rooms: give efficiency for their skill + wisdom + rare find
    '/house_rooms/forge':          {'skill': 'cheesesmithing', 'efficiency': 0.015, 'wisdom': 0.005, 'rareFind': 0.002},
    '/house_rooms/workshop':       {'skill': 'crafting',       'efficiency': 0.015, 'wisdom': 0.005, 'rareFind': 0.002},
    '/house_rooms/sewing_parlor':  {'skill': 'tailoring',      'efficiency': 0.015, 'wisdom': 0.005, 'rareFind': 0.002},
    '/house_rooms/observatory':    {'skill': 'enhancing',      'efficiency': 0.0,   'wisdom': 0.0005, 'rareFind': 0.002, 'speed': 0.01, 'success': 0.0005},
    '/house_rooms/kitchen':        {'skill': 'cooking',        'efficiency': 0.015, 'wisdom': 0.005, 'rareFind': 0.002},
    '/house_rooms/brewery':        {'skill': 'brewing',        'efficiency': 0.015, 'wisdom': 0.005, 'rareFind': 0.002},
    '/house_rooms/dairy_barn':     {'skill': 'milking',        'efficiency': 0.015, 'wisdom': 0.005, 'rareFind': 0.002},
    '/house_rooms/garden':         {'skill': 'foraging',       'efficiency': 0.015, 'wisdom': 0.005, 'rareFind': 0.002},
    '/house_rooms/log_shed':       {'skill': 'woodcutting',    'efficiency': 0.015, 'wisdom': 0.005, 'rareFind': 0.002},
    '/house_rooms/archery_range':  {'skill': 'ranged',         'efficiency': 0.015, 'wisdom': 0.005, 'rareFind': 0.002},
    '/house_rooms/armory':         {'skill': 'defense',        'efficiency': 0.015, 'wisdom': 0.005, 'rareFind': 0.002},
    '/house_rooms/dojo':           {'skill': 'attack',         'efficiency': 0.015, 'wisdom': 0.005, 'rareFind': 0.002},
    '/house_rooms/gym':            {'skill': 'melee',          'efficiency': 0.015, 'wisdom': 0.005, 'rareFind': 0.002},
    '/house_rooms/library':        {'skill': 'intelligence',   'efficiency': 0.015, 'wisdom': 0.005, 'rareFind': 0.002},
    '/house_rooms/mystical_study': {'skill': 'magic',          'efficiency': 0.015, 'wisdom': 0.005, 'rareFind': 0.002},
    '/house_rooms/dining_room':    {'skill': 'stamina',        'efficiency': 0.015, 'wisdom': 0.005, 'rareFind': 0.002},
    '/house_rooms/laboratory':     {'skill': 'alchemy',        'efficiency': 0.015, 'wisdom': 0.005, 'rareFind': 0.002},
}


def load_client_info():
    print(f"Loading {CLIENT_INFO}...")
    with open(CLIENT_INFO, 'r', encoding='utf-8') as f:
        return json.load(f)


def load_character_data():
    if not CHARACTER_DATA.exists():
        print(f"No character data at {CHARACTER_DATA}, skipping player-specific extraction")
        return None
    print(f"Loading {CHARACTER_DATA}...")
    with open(CHARACTER_DATA, 'r', encoding='utf-8') as f:
        return json.load(f)


def extract_items(item_map):
    """Extract all items, keeping full data for enhanceable items and equipment."""
    items = {}
    enhanceable_count = 0
    equipment_count = 0

    for hrid, item in item_map.items():
        category = item.get('categoryHrid', '')
        enhancement_costs = item.get('enhancementCosts')
        equip_detail = item.get('equipmentDetail', {})

        extracted = {
            'name': item.get('name', hrid.split('/')[-1]),
            'level': item.get('itemLevel', 1),
            'sellPrice': item.get('sellPrice', 0),
            'category': category,
        }

        # Enhancement data
        if enhancement_costs:
            extracted['enhancementCosts'] = [
                {'item': c['itemHrid'], 'count': c['count']}
                for c in enhancement_costs
            ]
            extracted['protectionItems'] = item.get('protectionItemHrids', [])
            enhanceable_count += 1

        # Equipment stats
        noncombat = equip_detail.get('noncombatStats', {})
        if noncombat:
            stats = {}
            for stat_name, value in noncombat.items():
                if value != 0:
                    stats[stat_name] = value
            if stats:
                extracted['stats'] = stats
                equipment_count += 1

        items[hrid] = extracted

    print(f"  Items: {len(items)} total, {enhanceable_count} enhanceable, {equipment_count} with stats")
    return items


def extract_recipes(action_map, item_map):
    """Extract crafting recipes with baseTime, skillId, inputs, upgrade, level."""
    recipes = {}

    for hrid, action in action_map.items():
        if action.get('function') != '/action_functions/production':
            continue

        output_items = action.get('outputItems', [])
        if not output_items:
            continue

        output_hrid = output_items[0].get('itemHrid')
        if not output_hrid:
            continue

        # Only equipment items
        item = item_map.get(output_hrid, {})
        category = item.get('categoryHrid', '')
        if category != '/item_categories/equipment' and output_hrid != '/items/philosophers_mirror':
            continue

        base_time = action.get('baseTimeCost', 0)
        if isinstance(base_time, (int, float)) and base_time > 0:
            base_time_sec = round(base_time / 1_000_000_000, 2)
        else:
            base_time_sec = 0

        level_req = action.get('levelRequirement') or {}
        skill_id = level_req.get('skillHrid', '') or action.get('skillHrid', '')
        if skill_id.startswith('/skills/'):
            skill_id = skill_id.replace('/skills/', '')

        recipe = {
            'inputs': [
                {'item': inp['itemHrid'], 'count': inp['count']}
                for inp in action.get('inputItems', [])
            ],
            'baseTime': base_time_sec,
        }
        if skill_id:
            recipe['skillId'] = skill_id
        if level_req.get('level'):
            recipe['level'] = level_req['level']

        upgrade_hrid = action.get('upgradeItemHrid')
        if upgrade_hrid:
            recipe['upgrade'] = upgrade_hrid

        recipes[output_hrid] = recipe

    print(f"  Recipes: {len(recipes)}")
    return recipes


def extract_essence_drops(action_map):
    """Extract essence drop rates per tool/action."""
    essence_drops = {}

    for hrid, action in action_map.items():
        essence_table = action.get('essenceDropTable')
        if essence_table:
            tool_name = hrid.split('/')[-1]
            drops = []
            for entry in essence_table:
                drops.append({
                    'item': entry['itemHrid'],
                    'rate': entry['dropRate'],
                })
            essence_drops[tool_name] = drops

    print(f"  Essence drop tables: {len(essence_drops)} tools")
    return essence_drops


def extract_house_rooms(room_map):
    """Extract house room definitions with their bonuses."""
    rooms = {}

    for hrid, room in room_map.items():
        bonus_def = HOUSE_ROOM_BONUSES.get(hrid, {})
        if not bonus_def:
            continue

        rooms[hrid] = {
            'name': room.get('name', hrid.split('/')[-1]),
            'skill': bonus_def.get('skill', ''),
            'maxLevel': 8,
            'bonuses': {
                'efficiency': bonus_def.get('efficiency', 0),
                'wisdom': bonus_def.get('wisdom', 0),
                'rareFind': bonus_def.get('rareFind', 0),
                'speed': bonus_def.get('speed', 0),
                'success': bonus_def.get('success', 0),
            }
        }

    print(f"  House rooms with bonuses: {len(rooms)}")
    return rooms


def extract_player_data(char_data):
    """Extract player-specific data for auto-loading settings."""
    if not char_data:
        return None

    player = {}

    # Character skills
    skills = {}
    for skill in char_data.get('characterSkills', []):
        skill_name = skill['skillHrid'].replace('/skills/', '')
        skills[skill_name] = {
            'level': skill['level'],
            'experience': skill['experience'],
        }
    player['skills'] = skills

    # House rooms
    houses = {}
    for hrid, room in char_data.get('characterHouseRoomMap', {}).items():
        houses[hrid] = room['level']
    player['houseRooms'] = houses

    # Achievements
    achievements = []
    for ach in char_data.get('characterAchievements', []):
        if ach.get('isCompleted'):
            achievements.append(ach['achievementHrid'])
    player['achievements'] = achievements

    # Active drink slots per action type
    drinks = {}
    for action_type, slots in char_data.get('actionTypeDrinkSlotsMap', {}).items():
        active_drinks = []
        for slot in slots:
            if slot and slot.get('isActive') and slot.get('itemHrid'):
                active_drinks.append(slot['itemHrid'])
        if active_drinks:
            drinks[action_type] = active_drinks
    player['drinkSlots'] = drinks

    # Equipped items (from default loadout)
    loadouts = char_data.get('characterLoadoutMap', {})
    default_loadout = None
    for lid, loadout in loadouts.items():
        if loadout.get('isDefault'):
            default_loadout = loadout
            break

    if default_loadout:
        wearables = {}
        for location, item_str in default_loadout.get('wearableMap', {}).items():
            if item_str and '::/items/' in item_str:
                # Parse: "237046::/item_locations/hands::/items/chrono_gloves::12"
                parts = item_str.split('::')
                if len(parts) >= 3:
                    item_hrid = parts[1] if '/items/' in parts[1] else parts[2]
                    enhancement = int(parts[-1]) if parts[-1].isdigit() else 0
                    wearables[location] = {'item': item_hrid, 'enhancement': enhancement}
        player['equipped'] = wearables

    print(f"  Player data: {len(skills)} skills, {len(houses)} houses, {len(achievements)} achievements")
    return player


def main():
    print("=== Game Data Preprocessor ===")

    client_data = load_client_info()
    char_data = load_character_data()

    game_version = client_data.get('gameVersion', 'unknown')
    print(f"Game version: {game_version}")

    item_map = client_data.get('itemDetailMap', {})
    action_map = client_data.get('actionDetailMap', {})
    room_map = client_data.get('houseRoomDetailMap', {})

    # Extract data
    print("\nExtracting items...")
    items = extract_items(item_map)

    print("\nExtracting recipes...")
    recipes = extract_recipes(action_map, item_map)

    print("\nExtracting essence drops...")
    essence_drops = extract_essence_drops(action_map)

    print("\nExtracting house rooms...")
    house_rooms = extract_house_rooms(room_map)

    print("\nExtracting player data...")
    player_data = extract_player_data(char_data)

    # Build output
    output = {
        'version': game_version,
        'items': items,
        'recipes': recipes,
        'constants': {
            'enhanceBonus': ENHANCE_BONUS,
            'successRate': SUCCESS_RATE,
        },
        'essenceDrops': essence_drops,
        'houseRooms': house_rooms,
    }

    if player_data:
        output['playerData'] = player_data

    # Write as JS (pretty-printed, 2-space indent)
    json_content = json.dumps(output, indent=2, ensure_ascii=False)
    js_content = f"window.GAME_DATA_STATIC = {json_content};"

    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        f.write(js_content)

    size_kb = len(js_content) / 1024
    print(f"\nGenerated {OUTPUT_FILE} ({size_kb:.1f} KB)")
    print("Done!")


if __name__ == '__main__':
    main()
