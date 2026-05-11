// Minimal test harness - inline the class
const fs = require('fs');
const c = fs.readFileSync('assets/game-data.js', 'utf8');
const jsonStr = c.replace(/^window\.GAME_DATA_STATIC\s*=\s*/, '').replace(/;\s*$/, '');
const GAME_DATA = JSON.parse(jsonStr);

// Load module properly
delete require.cache[require.resolve('./assets/crafting-time.js')];
const { CraftingTimeCalculator } = require('./assets/crafting-time.js');

const calc = new CraftingTimeCalculator(GAME_DATA);

// Pathseeker Boots config
const config1 = {
    tailoringLevel: 103, tailoringTool: 'holy', tailoringToolLevel: 5,
    tailoringTopEquipped: false, tailoringTopLevel: 0,
    tailoringBottomsEquipped: false, tailoringBottomsLevel: 0,
    philoNeckEquipped: true, speedNeckEquipped: false, necklaceLevel: 5,
    artificerCapeEquipped: false, artificerCapeType: 'standard', artificerCapeLevel: 0,
    eyeWatchEquipped: false, eyeWatchLevel: 0,
    guzzlingPouchEquipped: true, guzzlingPouchLevel: 6,
    craftingTeaEfficiency: false, craftingTeaSuperEfficiency: false, craftingTeaUltraEfficiency: false,
    craftingEfficiencyTea: true, craftingWisdomTea: false, artisanTea: true,
    forgeLevel: 0, workshopLevel: 0, sewing_parlorLevel: 1,
    productionEfficiencyBuffLevel: 20,
    cheesesmithingLevel: 0, cheesesmithingTool: 'none', cheesesmithingToolLevel: 0,
    cheesesmithingTopEquipped: false, cheesesmithingTopLevel: 0,
    cheesesmithingBottomsEquipped: false, cheesesmithingBottomsLevel: 0,
    craftingLevel: 0, craftingTool: 'none', craftingToolLevel: 0,
    craftingTopEquipped: false, craftingTopLevel: 0,
    craftingBottomsEquipped: false, craftingBottomsLevel: 0,
};

const r1 = calc.getCraftingTime('/items/pathseeker_boots', config1);
console.log('=== Pathseeker Boots ===');
console.log('Base:', r1.baseTime, '->', r1.adjustedTime.toFixed(2), 's');
console.log('Speed: +' + r1.speedBonus.toFixed(1) + '%');
console.log('  Neck: +' + r1.speedBreakdown.neckSpeed.toFixed(1) + '%, Tool: +' + r1.speedBreakdown.toolSpeed.toFixed(1) + '%');
console.log('Efficiency: +' + r1.efficiency.toFixed(2) + '%, Output: x' + r1.outputMultiplier.toFixed(4));
console.log('  Level: +' + r1.efficiencyBreakdown.levelEfficiency.toFixed(2) + '%');
console.log('  House: +' + r1.efficiencyBreakdown.houseEfficiency.toFixed(2) + '%');
console.log('  Equip: +' + r1.efficiencyBreakdown.equipEfficiency.toFixed(2) + '%');
console.log('  Neck eff: +' + r1.efficiencyBreakdown.neckEfficiency.toFixed(2) + '%');
console.log('  Tea(eff): +' + r1.efficiencyBreakdown.teaEfficiency.toFixed(2) + '%');
console.log('  Tea(skill): +' + r1.efficiencyBreakdown.skillTeaEfficiency.toFixed(2) + '%');
console.log('  Community: +' + r1.efficiencyBreakdown.communityEfficiency.toFixed(2) + '%');
console.log('  TOTAL: +' + r1.efficiencyBreakdown.total.toFixed(2) + '%');
console.log('Expected: 60s -> 28.96s, Speed +107.2%, Eff +41.99%, Output x1.42');
console.log('');

const config2 = {
    cheesesmithingLevel: 118, cheesesmithingTool: 'holy', cheesesmithingToolLevel: 5,
    cheesesmithingTopEquipped: false, cheesesmithingTopLevel: 0,
    cheesesmithingBottomsEquipped: false, cheesesmithingBottomsLevel: 0,
    philoNeckEquipped: true, speedNeckEquipped: false, necklaceLevel: 5,
    artificerCapeEquipped: false, artificerCapeType: 'standard', artificerCapeLevel: 0,
    eyeWatchEquipped: false, eyeWatchLevel: 0,
    guzzlingPouchEquipped: true, guzzlingPouchLevel: 6,
    craftingTeaEfficiency: false, craftingTeaSuperEfficiency: false, craftingTeaUltraEfficiency: false,
    craftingEfficiencyTea: true, craftingWisdomTea: false, artisanTea: true,
    forgeLevel: 3, workshopLevel: 0, sewing_parlorLevel: 0,
    productionEfficiencyBuffLevel: 20,
    tailoringLevel: 0, tailoringTool: 'none', tailoringToolLevel: 0,
    tailoringTopEquipped: false, tailoringTopLevel: 0,
    tailoringBottomsEquipped: false, tailoringBottomsLevel: 0,
    craftingLevel: 0, craftingTool: 'none', craftingToolLevel: 0,
    craftingTopEquipped: false, craftingTopLevel: 0,
    craftingBottomsEquipped: false, craftingBottomsLevel: 0,
};

const r2 = calc.getCraftingTime('/items/holy_enhancer', config2);
console.log('=== Holy Enhancer ===');
console.log('Base:', r2.baseTime, '->', r2.adjustedTime.toFixed(2), 's');
console.log('Speed: +' + r2.speedBonus.toFixed(1) + '%');
console.log('  Neck: +' + r2.speedBreakdown.neckSpeed.toFixed(1) + '%, Tool: +' + r2.speedBreakdown.toolSpeed.toFixed(1) + '%');
console.log('Efficiency: +' + r2.efficiency.toFixed(2) + '%, Output: x' + r2.outputMultiplier.toFixed(4));
console.log('  Level: +' + r2.efficiencyBreakdown.levelEfficiency.toFixed(2) + '%');
console.log('  House: +' + r2.efficiencyBreakdown.houseEfficiency.toFixed(2) + '%');
console.log('  Equip: +' + r2.efficiencyBreakdown.equipEfficiency.toFixed(2) + '%');
console.log('  Neck eff: +' + r2.efficiencyBreakdown.neckEfficiency.toFixed(2) + '%');
console.log('  Tea(eff): +' + r2.efficiencyBreakdown.teaEfficiency.toFixed(2) + '%');
console.log('  Community: +' + r2.efficiencyBreakdown.communityEfficiency.toFixed(2) + '%');
console.log('  TOTAL: +' + r2.efficiencyBreakdown.total.toFixed(2) + '%');
console.log('Expected: 135s -> 65.15s, Speed +107.2%, Eff +64.99%, Output x1.65');