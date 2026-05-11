"""
Merge recipe details (baseTime, skillId, output) from init_client_info.json
into the existing game-data.js recipes object.

Reads from references/Enhancelator/init_client_info.json (local),
updates assets/game-data.js in-place.
"""
import json
import re
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
REPO_ROOT = SCRIPT_DIR.parent
SOURCE_FILE = REPO_ROOT / 'references' / 'Enhancelator' / 'init_client_info.json'
GAME_DATA_FILE = REPO_ROOT / 'assets' / 'game-data.js'


def load_init_data():
    print(f"Loading from {SOURCE_FILE}...")
    with open(SOURCE_FILE, 'r', encoding='utf-8') as f:
        return json.load(f)


def load_game_data():
    print(f"Loading game data from {GAME_DATA_FILE}...")
    with open(GAME_DATA_FILE, 'r', encoding='utf-8') as f:
        raw = f.read()
    # Strip window.GAME_DATA_STATIC = prefix and trailing semicolon
    json_str = re.sub(r'^window\.GAME_DATA_STATIC\s*=\s*', '', raw.strip())
    json_str = json_str.rstrip(';')
    return json.loads(json_str)


def save_game_data(data):
    json_content = json.dumps(data, separators=(',', ':'))
    js_content = f"window.GAME_DATA_STATIC = {json_content};"
    with open(GAME_DATA_FILE, 'w', encoding='utf-8') as f:
        f.write(js_content)
    size_kb = len(js_content) / 1024
    print(f"Written to {GAME_DATA_FILE} ({size_kb:.1f} KB)")


def extract_recipe_details(action_map):
    """Extract baseTime, skillId, outputCount from production actions."""
    details = {}
    for hrid, action in action_map.items():
        if action.get('function') != '/action_functions/production':
            continue
        output_items = action.get('outputItems', [])
        if not output_items:
            continue
        output_hrid = output_items[0].get('itemHrid')
        if not output_hrid:
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

        output_count = output_items[0].get('count', 1) if len(output_items) > 0 else 1

        detail = {'baseTime': base_time_sec}
        if skill_id:
            detail['skillId'] = skill_id
        if output_count != 1:
            detail['output'] = output_count
        if level_req.get('level'):
            detail['level'] = level_req['level']

        details[output_hrid] = detail

    return details


def main():
    init_data = load_init_data()
    game_data = load_game_data()

    action_map = init_data.get('actionDetailMap', {})
    details = extract_recipe_details(action_map)
    print(f"Extracted details for {len(details)} production actions")

    # Show examples
    examples = ['/items/pathseeker_boots', '/items/holy_enhancer',
                '/items/celestial_enhancer', '/items/radiant_boots',
                '/items/holy_hammer', '/items/holy_needle', '/items/holy_chisel']
    for ex in examples:
        if ex in details:
            d = details[ex]
            print(f"  {ex}: {d}")

    # Merge into existing recipes
    recipes = game_data.get('recipes', {})
    merged = 0
    added = 0
    for hrid, detail in details.items():
        if hrid in recipes:
            # Merge into existing recipe
            recipes[hrid].update(detail)
            merged += 1
        else:
            # Only add recipes for equipment items (that exist in items)
            if hrid in game_data.get('items', {}):
                recipes[hrid] = detail
                added += 1

    print(f"Merged into {merged} existing recipes, added {added} new recipes")
    print(f"Total recipes: {len(recipes)}")

    game_data['recipes'] = recipes
    save_game_data(game_data)


if __name__ == '__main__':
    main()