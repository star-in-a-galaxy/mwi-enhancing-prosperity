"""
Extract recipe details (baseTime, skillId, output) from raw game data.
Downloads from Enhancelator source if needed.
"""
import json
import requests
import sys

ENHANCELATOR_URL = 'https://raw.githubusercontent.com/bierilu/MWIData/main/init_client_info.json'
OUTPUT_JS = sys.argv[1] if len(sys.argv) > 1 else None

def download():
    print(f"Downloading from {ENHANCELATOR_URL}...")
    resp = requests.get(ENHANCELATOR_URL, timeout=30)
    resp.raise_for_status()
    return resp.json()

def main():
    data = download()
    action_map = data.get('actionDetailMap', {})
    item_map = data.get('itemDetailMap', {})
    
    # Extract all production action details
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
        
        # Only equipment (for enhancing cost calcs)
        item = item_map.get(output_hrid, {})
        category = item.get('categoryHrid', '')
        if category != '/item_categories/equipment' and output_hrid != '/items/philosophers_mirror':
            continue
        
        base_time = action.get('baseTime', 0)
        # baseTime is in nanoseconds, convert to seconds
        if isinstance(base_time, (int, float)) and base_time > 0:
            base_time_sec = base_time / 1_000_000_000
        else:
            base_time_sec = 0
        
        skill_id = action.get('skillHrid', '')
        output_count = output_items[0].get('count', 1) if len(output_items) > 0 else 1
        
        recipe = {
            'baseTime': round(base_time_sec, 2),
        }
        if skill_id:
            recipe['skillId'] = skill_id
        if output_count != 1:
            recipe['output'] = output_count
        
        recipes[output_hrid] = recipe
    
    print(f"Extracted details for {len(recipes)} recipes")
    
    # Show a few examples
    examples = ['/items/holy_needle', '/items/holy_hammer', '/items/holy_chisel', '/items/pathseeker_boots', '/items/holy_enhancer', '/items/pathbreaker_boots', '/items/holy_boots', '/items/radiant_boots']
    for ex in examples:
        if ex in recipes:
            r = recipes[ex]
            print(f"  {ex}: baseTime={r['baseTime']}s skillId={r.get('skillId','')} output={r.get('output',1)}")
    
    if OUTPUT_JS:
        js_content = f"window.GAME_DATA_RECIPE_DETAILS = {json.dumps(recipes, separators=(',',':'))};"
        with open(OUTPUT_JS, 'w', encoding='utf-8') as f:
            f.write(js_content)
        print(f"Written to {OUTPUT_JS} ({len(js_content)/1024:.1f} KB)")

if __name__ == '__main__':
    main()
