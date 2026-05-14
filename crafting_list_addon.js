// ==UserScript==
// @name         MWI Shopping List and Crafting Helper
// @name:zh-CN   MWI MWI 制作购物助手
// @namespace    http://tampermonkey.net/
// @version      2.8.0
// @description  Shopping list and crafting helper for Milky Way Idle.
// @description:zh-CN Milky Way Idle 购物与制作辅助工具。
// @author       Star
// @license      CC-BY-NC-SA-4.0
// @match        https://www.milkywayidle.com/*
// @match        https://test.milkywayidle.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addStyle
// @grant        unsafeWindow
// @run-at       document-start
// ==/UserScript==
 
/*
 
  ┌──────────────────────────────────────────────────────────────────┐
  │  MWI Shopping List and Crafting Helper                           │
  │                                                                  │
  │  How it works:                                                   │
  │  1. Loads item/action data from game init sources with fallback  │
  │     paths (localStorage/React plus socket listener support).     │
  │  2. Tracks inventory from character payloads, socket item deltas │
  │     and market buys you place from the helper flow.              │
  │  3. You add goal items with target quantity and craft mode.      │
  │  4. The plugin resolves direct/full chains, separating upgrade   │
  │     inputs from regular consumed materials.                      │
  │  5. Regular materials use artisan tea (z-score safety margin);   │
  │     upgrade-chain inputs remain 1:1.                             │
  │  6. Action/Market navigation can prefill Produce/Buy quantities; │
  │     Produce modal can add directly to this shopping list.        │
  │  7. While on market page, a pinned shopping bar is shown.        │
  └──────────────────────────────────────────────────────────────────┘
 
 
  ┌─────────────────────────────────────────────────────────
  │  MWI 购物清单与制作助手
  │
  │  工作原理：
  │  1. 从游戏初始化数据加载物品/制作信息，并支持备用路径
  │     （localStorage / React / socket 监听）。
  │  2. 从角色数据、socket 物品变化以及通过本工具进行的市场购买中
  │     跟踪库存。
  │  3. 添加目标物品、设定目标数量与制作模式。
  │  4. 插件解析直接/完整制作链，并区分升级材料与普通消耗材料。
  │  5. 普通材料使用工匠茶计算（z-score 安全边距）；
  │     升级链材料保持 1:1 消耗。
  │  6. 制作/市场页面可预填生产/购买数量；制作窗口可直接加入清单。
  │  7. 在市场页面时，会显示固定的购物栏。
  └─────────────────────────────────────────────────────────
 
  ## Acknowledgement
 
  Inspired by the quality of tools built by the Milky Way Idle community.
  Special thanks for the amazing tool that is [Toolasha](https://greasyfork.org/en/scripts/562662-toolasha)
  which was a great inspiration.
 
*/
 
(function () {
  'use strict';
 
  // Static bundle URLs for bilingual item/skill extraction.
  // Update these hashes when the game updates.
  const TRANSLATION_BUNDLE_URLS = [
    'https://www.milkywayidle.com/static/js/main.3cac92f8.chunk.js',
    'https://www.milkywayidle.com/static/js/10.8be3b319.chunk.js',
  ];
 
  const LOG_REC_MSGSAGES = false;
  const LOGGING_ENABLED = false;
 
  // rewrite console.log to only do it when LOGGING_ENABLED is true, to avoid the overhead of stringifying arguments when logging is disabled.
  const infoLog = (...args) => {
    if (LOGGING_ENABLED) {
      console.log(...args);
    }
  };
  // ═══════════════════════════════════════════════════════════════════
  // CONSTANTS
  // ═══════════════════════════════════════════════════════════════════
 
  const PLUGIN_ID    = 'ShoppingList';
  const DEBUG_RENDER_PATH = true;
  const STORAGE_LIST = 'mwi_sl_list_v1';
  const STORAGE_OPTS    = 'mwi_sl_opts_v1';
  const STORAGE_POS     = 'mwi_sl_pos_v1';
  const STORAGE_TAB     = 'mwi_sl_tab_v1';
  const STORAGE_TASKS   = 'mwi_sl_tasks_v1';
  const STORAGE_LANG    = 'mwi_sl_lang_v1';
 
  /** Skills that produce craftable items — the only task types we surface in the Tasks tab. */
  const PRODUCTION_SKILLS = new Set([
    'cheesesmithing', 'crafting', 'tailoring', 'brewing', 'cooking',
  ]);
 
  /** Standard z-score values offered in the Advanced dropdown. */
  const Z_OPTIONS = [
    { label: 'σ = 0.00  (50%)   ← average (default) ',    value: 0.00 },
    { label: 'σ = 1.00  (84%)',                           value: 1.00 },
    { label: 'σ = 1.65  (95%)   ← recommended',           value: 1.65 },
    { label: 'σ = 2.33  (99%)',                           value: 2.33 },
    { label: 'σ = 3.00  (99.9%)',                         value: 3.00 }
  ];
 
  /** Enhancement bonuses (0% to 78%). Index corresponds to enhancement level (+0 to +20). */
  const ENHANCEMENT_BONUSES = [
    0.00, 0.02, 0.042, 0.066, 0.092, 0.12, 0.15, 0.182, 0.216, 0.255,
    0.29, 0.33, 0.372, 0.416, 0.462, 0.51, 0.56, 0.612, 0.666, 0.722, 0.78
  ];
 
  /**
   * Tokens that identify item families eligible for upgrade-path 1:1 predecessor matching.
   * Matching is done on token boundaries (whitespace/underscore/punctuation split).
   */
  const UPGRADE_PATH_KEYWORD_WORDS = [
    'brush',
    'shears',
    'hatchet',
    'hammer',
    'chisel',
    'needle',
    'spatula',
    'pot',
    'alembic',
    'enhancer',
    'sword',
    'spear',
    'mace',
    'bludgeon',
    'flail',
    'bulwark',
    'buckler',
    'shield',
    'boots',
    'shoes',
    'gauntlets',
    'gloves',
    'helmet',
    'legs',
    'body',
    'crossbow',
    'bow',
    'staff',
    'battlestaff',
    'trident',
    'codex',
    'relic',
    'badge',
    "Philosopher's Mirror",
    'bracers',
    'hood',
    'hat',
    'bottoms',
    'chaps',
    'tunic',
    'top',
    'pouch',
    'cape',
    'coffee',
    'tea',
  ];
 
  const UPGRADE_PATH_KEYWORD_TOKENS = new Set(
    UPGRADE_PATH_KEYWORD_WORDS
      .flatMap(word => String(word || '')
        .toLowerCase()
        .replace(/\(r\)/g, ' ')
        .replace(/_/g, ' ')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
        .split(/\s+/)
        .filter(Boolean)
      )
  );
 
  const BUY_MODAL_FILL_DELAYS = [150, 800];
 
  // ═══════════════════════════════════════════════════════════════════
  // STATE
  // ═══════════════════════════════════════════════════════════════════
 
  /**
   * Game data populated from init client data.
   * Keys are item/action hrids like "/items/holy_hatchet".
   */
  const game = {
    items:   {},   // hrid → { name, … }
    actions: {},   // hrid → { inputItems, outputItems, upgradeItemHrid, … }
  };
 
  /** Flag to prevent double-loading init data from multiple fallbacks. */
  let isDataLoaded = false;
 
  /** Lazily-built lookup tables so we can look up by display name. */
  let itemHridToName = {};   // "/items/holy_hatchet" → "Holy Hatchet"
  let itemNameToHrid = {};   // "holy hatchet" (lower) → "/items/holy_hatchet"
 
  // Bilingual display — populated async from game's JS bundle
  let itemHridToZhName = {};  // "/items/holy_hatchet" → "圣铁镰刀" etc.
  let zhNameToHrid     = {};  // reverse lookup
  let skillEnToZhName = {};
  let chunkTranslationsLoaded = false;
 
  /** Current display language: 'en' or 'zh'. Auto-detected then persisted. */
  const langState = (function() {
    let lang;
    try {
      const stored = GM_getValue(STORAGE_LANG, null);
      if (stored === 'en' || stored === 'zh') { lang = stored; }
      else {
        const gameLang = localStorage.getItem('i18nextLng') || 'en';
        lang = gameLang.startsWith('zh') ? 'zh' : 'en';
        GM_setValue(STORAGE_LANG, lang);
      }
    } catch (_) { lang = 'en'; }
    return { lang };
  })();
 
  // ── Bilingual UI string table ──
  // sl('key') returns the string for the current display language.
  const _UI = {
      panelTitle:        { en: '🛒 Shopping List',         zh: '🛒 购物清单' },
      langBtn:           { en: 'EN ⟷ 中文',                zh: '中文 ⟷ EN' },
      langBtnTitle:      { en: 'Switch to Chinese / 切换为中文', zh: '切换为英文 / Switch to English' },
      minimise:          { en: '−',                        zh: '−' },
      minimiseTitle:     { en: 'Minimise',                 zh: '最小化' },
      close:             { en: '✕',                        zh: '✕' },
      closeTitle:        { en: 'Close',                    zh: '关闭' },
      itemsToCraft:      { en: 'Items to craft',           zh: '待制作清单' },
      addItem:           { en: '＋ Add item',              zh: '＋ 添加物品' },
      goToMarket:        { en: '🏪 Go to Market',          zh: '去市场' },
      materialList:      { en: 'Material List',            zh: '材料清单' },
      modeDirect:        { en: 'Direct',                   zh: '直接制作' },
      modeFull:          { en: 'Full chain',               zh: '全链制作' },
      modeFrom:          { en: 'From',                     zh: '从…开始' },
      actionBtn:         { en: 'Action',                   zh: '执行' },
      actionTitle:       { en: 'Go to crafting action',    zh: '去制作页面' },
      marketTitle:       { en: 'Open in market',           zh: '打开市场' },
      removeTitle:       { en: 'Remove',                   zh: '移除' },
      tagUpgrade:        { en: '⬆ upgrade',               zh: '⬆ 升级' },
      tagUpgradeTitle:   { en: 'Upgrade item - consumed 1:1, not affected by artisan tea',
                          zh: '升级物品（1:1消耗，不受工匠茶加成影响）' },
      settings:          { en: '⚙ Settings',               zh: '⚙ 设置' },
      tasks:             { en: ' Tasks',                   zh: '任务列表' },
      hideSettings:      { en: 'Hide Settings',            zh: '隐藏设置' },
      showSettings:      { en: 'Show Settings',            zh: '显示设置' },
      hideTasks:         { en: 'Hide Tasks',               zh: '隐藏任务列表' },
      showTasks:         { en: 'Show Tasks',               zh: '显示任务列表' },
      prodTasks:         { en: 'Production Tasks',         zh: '生产任务' },
      noTasks:           { en: 'No production tasks loaded.', zh: '暂无生产任务' },
      openTaskBoard:     { en: 'Open Task Board',          zh: '打开任务板' },
      buyNowLabel:       { en: 'Buy Now / Buy Listing',    zh: '立即购买 / 挂牌' },
      pricingStrategy:   { en: 'Pricing Strategy',         zh: '定价策略' },
      useArtisan:        { en: 'Use Artisan Tea',          zh: '使用工匠茶' },
      craftExpansion:    { en: 'Craft Expansion',          zh: '展开制作' },
      guzzlingPouch:     { en: 'Guzzling Pouch',           zh: '饮料袋' },
      advanced:          { en: '⚙ Advanced',               zh: '⚙ 高级设置' },
      defaultQty:        { en: 'Default Quantity',         zh: '默认数量' },
      defaultMode:       { en: 'Default Mode',             zh: '默认模式' },
      safetyMargin:      { en: 'Safety margin (σ)',        zh: '安全边距 (σ)' },
      useOwnedInv:       { en: 'Use Owned Inventory',      zh: '使用已有库存' },
      autoLoadTasks:     { en: 'Auto-load Task Board',     zh: '自动加载任务板' },
      upgradeOnly:       { en: 'Upgrade items only',       zh: '仅升级物品' },
      expandUpgradeable: { en: 'Expand upgradeable gear/coffee', zh: '展开可升级物品' },
      expandAll:         { en: 'Expand all craftables',    zh: '展开所有可制作物' },
      outbid:            { en: 'Outbid (+1)',               zh: '超价 (+1)' },
      matchBest:         { en: 'Match best buy',           zh: '跟随最优' },
      undercut:          { en: 'Undercut (−1)',             zh: '低价 (−1)' },
      pass:              { en: 'Pass',                     zh: '不干预' },
      summaryClaim:      { en: '🎁 Claim',                 zh: '🎁 领取奖励' },
      claimTitle:        { en: 'Claim task reward',        zh: '领取奖励' },
      string_none:       { en: 'None',                     zh: '无' },
      remaining:         { en: 'remaining',                zh: '剩余' },
      addAllTasks:       { en: '🛒 Add All Production Tasks', zh: '🛒 添加所有生产任务' },
      addAllTasksTitle:  { en: 'Add remaining quantities of all production tasks to Shopping List', zh: '将所有生产任务的剩余数量添加到购物清单' },
      addTooltipText:    { en: '🛒 Add to Shopping List', zh: '🛒 加入购物清单' },
      addTooltipTitle:   { en: 'Add {item} to your Shopping List', zh: '将 {item} 加入购物清单' },
      // Add these to the _UI constant
      clearAll:          { en: '🗑 Clear All',                                     zh: '🗑 全部清空' },
      clearAllTitle:     { en: 'Remove all items from your shopping list',        zh: '清空购物清单中的所有物品' },
      confirmClear:      { en: 'Are you sure you want to clear the entire list?', zh: '你确定要清空整个清单吗？' },
  };
 
  function sl(key) {
    const entry = _UI[key];
    if (!entry) return key;
    return entry[langState.lang] || entry.en;
  }
  let specialActionKeyToMeta = new Map();     // "@alchemy:*" → { action, actionHrid, label, kind, inputHrid, inputQty, coinCostPerRun }
  let specialActionKeyToLabel = new Map();    // "@alchemy:*" → "Coinify: Donut"
  let specialActionLabelToKey = new Map();    // "coinify: donut" → "@alchemy:*"
 
  /**
   * User's shopping list. Each entry:
   * { id, itemHrid, rawName, targetQty, craftMode: 'direct' | 'full' }
   */
  let shoppingList = [];
 
  /**
   * Pre-calculated map of childHrid -> parentHrid for upgrade chains.
   * e.g., { '/items/holy_chisel': '/items/rainbow_chisel', ... }
   */
  const upgradeChainMap = new Map();
 
  /**
   * Map of outputHrid -> action definition.
   * Prioritizes actions that are identified as part of an upgrade chain.
   */
  const productToAction = new Map();
 
  /**
   * Plugin settings.
   */
  let opts = {
    useArtisan:    true,      // whether to use artisan tea
    artisanBase:   0.10,      // base artisan proc chance (default 10%)
    guzzlingConc:  1.00,      // drink concentration multiplier from guzzling pouch
    guzzlingLevel: -1,        // manual enhancement level: -1=None, 0-20 for +0..+20
    zScore:        0.00,      // safety margin z
    useBuyListing: false,     // market helper opens Buy Listing tab
    buyPriceStrategy: 'outbid', // 'outbid' | 'match' | 'undercut' | 'none'
    useOwnedInventory: true,  // subtract currently owned inventory from requirements
    craftableMaterialMode: 'upgrade-path', // none | upgrade-path | all
    defaultEntryQty: 1,       // default quantity for newly added entries
    defaultEntryCraftMode: 'direct', // default mode for newly added entries: direct | full
    autoLoadTaskBoard: false,  // navigate to task board on startup to capture Claim buttons
  };
 
  /** Panel position saved between sessions. */
  let panelPos = { x: 20, y: 80 };
 
  /** Currently active panel tab: 'list' | 'settings' */
 
  /** Whether the tasks side-panel is currently open */
  let tasksOpen = false;
 
  /** Whether the settings side-panel is currently open */
  let settingsOpen = false;
 
  /** Cached parsed production tasks — populated by parseTasksFromDOM, updated on action_completed */
  let cachedTasks = [];
 
  /** Cache for computeBuyList to prevent redundant recalculations. */
  let lastCalcState = '';
  let resolvedBuyList = new Map();
  let entrySupplementalCraftRows = new Map();
 
  /** Current inventory counts for unenhanced items in the bag. */
  let inventoryCounts = new Map();
  let inventorySnapshot = '[]';
  let latestCharacterData = null;
  let inventoryDirty = true;
  let inventoryRefreshTimeout = null;
  let attachedGameSockets = new WeakSet();
  let socketListenerInstalled = false;
  let lastActionCompletedMessage = null;
  let actionIntentQueueByHrid = new Map();
  /** Tracks which item is currently open in the marketplace (for buy-order intercept). */
  let currentMarketItemHrid = null;
  /** Ensures the price strategy is applied exactly once per market navigation, regardless of
   * how many fillBuyModal retries are spawned by BUY_MODAL_FILL_DELAYS. */
  let priceStrategyFired = false;
 
  // ═══════════════════════════════════════════════════════════════════
  // GENERIC UTILITIES
  // ═══════════════════════════════════════════════════════════════════
 
  // ── Sprite icon helpers ───────────────────────────────────────────
 
  /** Cached base path of the items sprite sheet, e.g. "/static/media/items_sprite.9c39e2ec.svg" */
  let _spriteUrl = null;
 
  /**
   * Resolves the sprite sheet URL once from a live <use> element in the game DOM.
   * Returns null when the game hasn't rendered any item icons yet (safe to call early).
   */
  function resolveSpriteUrl() {
    if (_spriteUrl) return _spriteUrl;
    const use = document.querySelector('use[href*="items_sprite"]');
    if (!use) return null;
    const href = use.getAttribute('href') || '';
    const hashIdx = href.indexOf('#');
    _spriteUrl = hashIdx >= 0 ? href.slice(0, hashIdx) : href;
    return _spriteUrl || null;
  }
 
  /**
   * Returns an inline SVG <use> string for the given item hrid.
   * e.g. "/items/holy_hatchet" → SVG referencing "#holy_hatchet"
   * Returns '' if the sprite URL isn't available yet.
   * @param {string} hrid
   * @param {string} [cls]  extra class names for the wrapper span
   */
  function itemSpriteHTML(hrid, cls = '') {
    const url = resolveSpriteUrl();
    if (!url || !hrid) return '';
    const slug = String(hrid).split('/').filter(Boolean).pop() || '';
    if (!slug) return '';
    const clsAttr = cls ? ` ${cls}` : '';
    return `<span class="ShoppingList-item-icon${clsAttr}" aria-hidden="true"><svg width="100%" height="100%" viewBox="0 0 64 64"><use href="${url}#${slug}"></use></svg></span>`;
  }
 
  function normalizeText(value) {
    return String(value || '').trim().toLowerCase();
  }
 
  function tokenizeWords(value) {
    return String(value || '')
      .toLowerCase()
      .replace(/\(r\)/g, ' ')
      .replace(/_/g, ' ')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .split(/\s+/)
      .filter(Boolean);
  }
 
  function toPositiveInt(value, fallback = 1) {
    const parsed = parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }
 
  function getDatasetIndex(target) {
    if (!target?.dataset) return -1;
    const parsed = parseInt(target.dataset.index ?? '-1', 10);
    return Number.isFinite(parsed) ? parsed : -1;
  }
 
  function recordActionIntent(itemHrid, entryId) {
    if (!itemHrid || !entryId) return;
 
    const key = String(entryId);
    const queue = actionIntentQueueByHrid.get(itemHrid) || [];
    queue.push(key);
    if (queue.length > 50) queue.shift();
    actionIntentQueueByHrid.set(itemHrid, queue);
  }
 
  function logRenderPath(source, mode) {
    if (!DEBUG_RENDER_PATH) return;
    infoLog(`[ShoppingList] ${source}: ${mode}`);
  }
 
  function getDefaultEntryCraftMode() {
    return ['direct', 'full'].includes(opts.defaultEntryCraftMode) ? opts.defaultEntryCraftMode : 'direct';
  }
 
  /** Returns true when craftMode is a "From X" partial-chain mode. */
  function isFromMode(craftMode) {
    return typeof craftMode === 'string' && craftMode.toLowerCase().startsWith('from:');
  }
 
  /** Extracts the stop-at item HRID from a "From X" craftMode string. */
  function getFromModeHrid(craftMode) {
    if (!isFromMode(craftMode)) return null;
    // Strip the "from:" prefix (case-insensitive) to get the HRID.
    return craftMode.slice('from:'.length) || null;
  }
 
  /** Returns the first word of an item's display name - used as the tier/colour prefix label. */
  function getItemFirstWord(hrid) {
    const name = getItemName(hrid);
    return name.split(' ')[0] || '';
  }
 
  /**
   * Returns the upgrade chain for an item as an ordered array of HRIDs,
   * from the immediate predecessor (depth 1) down to the leaf.
   * e.g. for Holy Shears → [Rainbow Shears, Crimson Shears, …, Cheese Shears]
   */
  function getUpgradeChainItems(itemHrid) {
    const chain = [];
    const visited = new Set();
    let current = itemHrid;
    let depth = 0;
    while (depth < 25) {
      if (visited.has(current)) break;
      visited.add(current);
      const next = upgradeChainMap.get(current);
      if (!next) break;
      chain.push(next);
      current = next;
      depth++;
    }
    return chain;
  }
 
  function createShoppingListEntry(overrides = {}) {
    return {
      id: Date.now(),
      itemHrid: null,
      targetQty: toPositiveInt(opts.defaultEntryQty, 1),
      craftMode: getDefaultEntryCraftMode(),
      ...overrides,
    };
  }
 
  function saveListAndRefresh(useFullRender = false) {
    saveList();
    if (useFullRender) {
      scheduleRender();
    } else {
      refreshPanelForModeChange();
    }
  }
 
  function saveOptsAndRefresh() {
    saveOpts();
    refreshPanelForModeChange();
  }
 
  function setEntryName(index, value) {
    const entry = shoppingList[index];
    if (!entry) return { changed: false, hridChanged: false };
 
    const nextHrid = getItemHrid(value);
    const prevRawName = entry.rawName;
    const prevHrid = entry.itemHrid || null;
 
    entry.rawName = value;
    entry.itemHrid = nextHrid;
 
    return {
      changed: prevRawName !== value || prevHrid !== nextHrid,
      hridChanged: prevHrid !== nextHrid,
    };
  }
 
  function restoreQtyInputFocus(index) {
    const refreshedQtyInput = panel?.querySelector(`.ShoppingList-inp-qty[data-index="${index}"]`);
    if (!refreshedQtyInput) return;
 
    refreshedQtyInput.focus();
    if (typeof refreshedQtyInput.setSelectionRange !== 'function') return;
 
    const valueLen = String(refreshedQtyInput.value || '').length;
    try {
      refreshedQtyInput.setSelectionRange(valueLen, valueLen);
    } catch (_) {}
  }
 
  function getItemUpgradeTokens(hrid) {
    if (!hrid) return new Set();
 
    const nameTokens = tokenizeWords(getItemName(hrid));
    const slugTokens = tokenizeWords(String(hrid).split('/').pop() || '');
 
    // Only the LAST token of the name is eligible as an upgrade-category keyword.
    // This prevents multi-word items like "Arabica Coffee Bean"
    // from being matched by an intermediate token like "coffee".
    const lastSlugToken  = slugTokens.length  ? slugTokens[slugTokens.length - 1]   : null;
    const lastNameToken  = nameTokens.length  ? nameTokens[nameTokens.length - 1]   : null;
    const candidateTokens = new Set([lastSlugToken, lastNameToken].filter(Boolean));
 
    return new Set(
      [...candidateTokens].filter(token => UPGRADE_PATH_KEYWORD_TOKENS.has(token))
    );
  }
 
  function sharesUpgradePathToken(inputHrid, resultHrid) {
    if (!inputHrid || !resultHrid) return false;
 
    const inputTokens = getItemUpgradeTokens(inputHrid);
    const outputTokens = getItemUpgradeTokens(resultHrid);
    if (!inputTokens.size || !outputTokens.size) return false;
 
    for (const token of inputTokens) {
      if (outputTokens.has(token)) return true;
    }
    return false;
  }
 
  function isKnownUpgradeCategoryItem(hrid) {
    return getItemUpgradeTokens(hrid).size > 0;
  }
 
  function getAlchemyActionPrefix(kind) {
    const labels = {
      coinify: '(C)',
      decompose: '(D)',
      transmute: '(T)',
    };
    return labels[kind] || null;
  }
 
  function getSpecialActionMeta(itemHrid) {
    return specialActionKeyToMeta.get(itemHrid) || null;
  }
 
  function isSpecialActionEntry(itemHrid) {
    return Boolean(itemHrid && getSpecialActionMeta(itemHrid));
  }
 
 
  function isCoinsItem(hrid) {
    const normalized = String(hrid || '').toLowerCase();
    return normalized === '/items/coins' || normalized.endsWith('/coins') || normalized.includes('coin');
  }
 
  function getActionExtraCoinCostPerRun(action) {
    if (!action || typeof action !== 'object') return 0;
 
    const directCandidates = [
      action?.coinCost,
      action?.coin_cost,
      action?.coins,
      action?.coinAmount,
      action?.coin_amount,
      action?.coinCostPerAction,
      action?.coin_cost_per_action,
      action?.currencyCost,
      action?.currency_cost,
      action?.goldCost,
      action?.gold_cost,
    ];
 
    for (const candidate of directCandidates) {
      const parsed = Number(candidate || 0);
      if (parsed > 0) return parsed;
    }
 
    const itemCostCollections = [
      action?.costItems,
      action?.cost_items,
      action?.requiredItems,
      action?.required_items,
    ];
 
    for (const collection of itemCostCollections) {
      if (!Array.isArray(collection)) continue;
      for (const entry of collection) {
        const hrid = entry?.itemHrid || entry?.item_hrid;
        if (!isCoinsItem(hrid)) continue;
        const parsed = Number(entry?.count ?? entry?.amount ?? 0) || 0;
        if (parsed > 0) return parsed;
      }
    }
 
    const currencyCostCollections = [
      action?.currencyCosts,
      action?.currency_costs,
    ];
 
    for (const collection of currencyCostCollections) {
      if (!Array.isArray(collection)) continue;
      for (const entry of collection) {
        const hrid = entry?.currencyHrid || entry?.currency_hrid || entry?.itemHrid || entry?.item_hrid;
        if (!isCoinsItem(hrid)) continue;
        const parsed = Number(entry?.count ?? entry?.amount ?? 0) || 0;
        if (parsed > 0) return parsed;
      }
    }
 
    return 0;
  }
 
  const DECOMPOSE_COIN_COST_TABLE = [
    { level: 1, cost: 55 },
    { level: 10, cost: 100 },
    { level: 15, cost: 125 },
    { level: 20, cost: 150 },
    { level: 25, cost: 175 },
    { level: 30, cost: 200 },
    { level: 35, cost: 225 },
    { level: 40, cost: 250 },
    { level: 45, cost: 225 },
    { level: 50, cost: 300 },
    { level: 55, cost: 325 },
    { level: 60, cost: 350 },
    { level: 65, cost: 375 },
    { level: 70, cost: 400 },
    { level: 75, cost: 425 },
    { level: 80, cost: 450 },
    { level: 85, cost: 475 },
    { level: 90, cost: 500 },
    { level: 95, cost: 525 },
  ];
  const DEFAULT_ALCHEMY_LEVEL_FOR_COST = 10;
  const TRANSMUTE_COIN_COST_OVERRIDES = {
    pearl: 800,
    amber: 1200,
    garnet: 1600,
    jade: 1600,
    amethyst: 1600,
    moonstone: 2000,
    sunstone: 6000,
    'star fragment': 11250,
    'crushed pearl': 50,
    'crushed amber': 60,
    'crushed garnet': 80,
    'crushed jade': 80,
    'crushed amethyst': 80,
    'crushed moonstone': 100,
    'crushed sunstone': 200,
    'crushed philosophers stone': 1000,
    'mirror of protection': 40000,
    'catalyst of coinification': 100,
    'catalyst of decomposition': 100,
    'catalyst of transmutation': 100,
    'prime catalyst': 1000,
  };
 
  function getFirstPositiveInt(...candidates) {
    for (const candidate of candidates) {
      const parsed = Number(candidate);
      if (Number.isFinite(parsed) && parsed > 0) return Math.floor(parsed);
    }
    return 0;
  }
 
  function parseSkillLevel(skill) {
    if (!skill || typeof skill !== 'object') return 0;
 
    return getFirstPositiveInt(
      skill.level,
      skill.skillLevel,
      skill.skill_level,
      skill.currentLevel,
      skill.current_level,
      skill.realLevel,
      skill.real_level,
      skill.effectiveLevel,
      skill.effective_level,
      skill.masteryLevel,
      skill.mastery_level,
    );
  }
 
  function isAlchemySkill(skill) {
    const texts = [
      skill?.skillHrid,
      skill?.skill_hrid,
      skill?.hrid,
      skill?.actionTypeHrid,
      skill?.action_type_hrid,
      skill?.name,
      skill?.type,
    ].filter(Boolean).map(value => String(value).toLowerCase());
 
    const haystack = texts.join(' ');
    return haystack.includes('/skills/alchemy')
      || haystack.includes('/action_types/alchemy')
      || haystack === 'alchemy'
      || haystack.includes('alchemy');
  }
 
  function getAlchemyLevel() {
    const skills = latestCharacterData?.characterSkills;
    if (!Array.isArray(skills)) return 0;
 
    let maxLevel = 0;
    for (const skill of skills) {
      if (!isAlchemySkill(skill)) continue;
      maxLevel = Math.max(maxLevel, parseSkillLevel(skill));
    }
    return maxLevel;
  }
 
  function getDecomposeCoinCostFromLevel(alchemyLevel) {
    const level = Math.max(1, Number(alchemyLevel || 0) || 1);
    let selected = DECOMPOSE_COIN_COST_TABLE[0].cost;
 
    for (const row of DECOMPOSE_COIN_COST_TABLE) {
      if (level >= row.level) {
        selected = row.cost;
      } else {
        break;
      }
    }
 
    return selected;
  }
 
  function getItemAlchemyDetail(itemDef) {
    if (!itemDef || typeof itemDef !== 'object') return null;
    return itemDef.alchemyDetail || itemDef.alchemy_detail || null;
  }
 
  function isItemCoinifiable(itemDef) {
    const detail = getItemAlchemyDetail(itemDef);
    if (!detail) return false;
    return detail.isCoinifiable === true || detail.is_coinifiable === true;
  }
 
  function isItemDecomposable(itemDef) {
    const detail = getItemAlchemyDetail(itemDef);
    if (!detail) return false;
    const drops = detail.decomposeItems || detail.decompose_items || [];
    return Array.isArray(drops) && drops.length > 0;
  }
 
  function isItemTransmutable(itemDef) {
    const detail = getItemAlchemyDetail(itemDef);
    if (!detail) return false;
    const dropTable = detail.transmuteDropTable || detail.transmute_drop_table || [];
    const successRate = Number(detail.transmuteSuccessRate ?? detail.transmute_success_rate ?? 0);
    return Array.isArray(dropTable) && dropTable.length > 0 && successRate > 0;
  }
 
  function getItemAlchemyBulkMultiplier(itemDef, kind) {
    const detail = getItemAlchemyDetail(itemDef);
    if (!detail) return 1;
 
    const kindSpecific =
      (kind === 'coinify' ? (detail.coinifyBulkMultiplier ?? detail.coinify_bulk_multiplier) : null)
      ?? (kind === 'decompose' ? (detail.decomposeBulkMultiplier ?? detail.decompose_bulk_multiplier) : null)
      ?? (kind === 'transmute' ? (detail.transmuteBulkMultiplier ?? detail.transmute_bulk_multiplier) : null);
 
    const fallback = detail.bulkMultiplier ?? detail.bulk_multiplier;
    return Math.max(1, getFirstPositiveInt(kindSpecific, fallback, 1));
  }
 
  function getItemAlchemyRecommendedLevel(itemDef, kind) {
    const detail = getItemAlchemyDetail(itemDef);
    if (!detail) return 0;
 
    const kindSpecificCandidates = [
      kind === 'coinify' ? detail.coinifyLevelRequirement : null,
      kind === 'coinify' ? detail.coinify_level_requirement : null,
      kind === 'coinify' ? detail.coinifyRecommendedLevel : null,
      kind === 'coinify' ? detail.coinify_recommended_level : null,
      kind === 'decompose' ? detail.decomposeLevelRequirement : null,
      kind === 'decompose' ? detail.decompose_level_requirement : null,
      kind === 'decompose' ? detail.decomposeRecommendedLevel : null,
      kind === 'decompose' ? detail.decompose_recommended_level : null,
      kind === 'transmute' ? detail.transmuteLevelRequirement : null,
      kind === 'transmute' ? detail.transmute_level_requirement : null,
      kind === 'transmute' ? detail.transmuteRecommendedLevel : null,
      kind === 'transmute' ? detail.transmute_recommended_level : null,
    ];
 
    const genericCandidates = [
      detail.levelRequirement,
      detail.level_requirement,
      detail.recommendedLevel,
      detail.recommended_level,
      detail.alchemyLevelRequirement,
      detail.alchemy_level_requirement,
      detail.alchemyLevel,
      detail.alchemy_level,
      itemDef.itemLevel,
      itemDef.item_level,
      itemDef.level,
    ];
 
    return getFirstPositiveInt(...kindSpecificCandidates, ...genericCandidates);
  }
 
  function getTransmuteCoinCostOverride(itemHrid) {
    if (!itemHrid) return 0;
 
    const slugKey = String(itemHrid)
      .split('/')
      .pop()
      .replace(/_/g, ' ')
      .toLowerCase()
      .trim();
    if (TRANSMUTE_COIN_COST_OVERRIDES[slugKey]) {
      return TRANSMUTE_COIN_COST_OVERRIDES[slugKey];
    }
 
    const nameKey = normalizeText(getItemName(itemHrid));
    return TRANSMUTE_COIN_COST_OVERRIDES[nameKey] || 0;
  }
 
  function getAlchemyLevelForCostFallback() {
    return getFirstPositiveInt(getAlchemyLevel(), DEFAULT_ALCHEMY_LEVEL_FOR_COST);
  }
 
  function getAlchemyCoinCostPerRun(kind, action, itemDef, inputQty, itemHrid = null) {
    if (kind === 'transmute') {
      // Temporary: disable transmute coin costs for now.
      // const overrideCost = getTransmuteCoinCostOverride(itemHrid);
      // if (overrideCost > 0) return overrideCost;
      // const amount = Math.max(1, Number(inputQty || 1) || 1);
      // return amount * 50;
      return 0;
    }
 
    const actionCoinCost = getActionExtraCoinCostPerRun(action);
    if (actionCoinCost > 0) return actionCoinCost;
 
    if (kind === 'coinify') return 0;
    if (kind === 'decompose') {
      const amount = Math.max(1, Number(inputQty || 1) || 1);
      const itemLevel = getItemAlchemyRecommendedLevel(itemDef, kind);
      const levelForCost = itemLevel > 0 ? itemLevel : getAlchemyLevelForCostFallback();
      return amount * getDecomposeCoinCostFromLevel(levelForCost);
    }
    return 0;
  }
 
  function resolveSpecialActionRequirements(actionMeta, runs, craftMode, p, z, inventoryBudget) {
    const out = new Map();
    if (!actionMeta || !runs || runs <= 0) return out;
 
    const inputHrid = actionMeta.inputHrid;
    const inputQtyPerRun = Math.max(1, Number(actionMeta.inputQty || 1) || 1);
    const totalInputQty = inputQtyPerRun * runs;
 
    if (inputHrid && totalInputQty > 0) {
      if (craftMode === 'full' || isFromMode(craftMode)) {
        mergeBuyMaps(out, resolveTree(inputHrid, totalInputQty, 'full', p, z, new Set(), inventoryBudget, true));
      } else {
        bumpBuyMap(out, inputHrid, totalInputQty, false);
      }
    }
 
    const coinCostPerRun = Math.max(0, Number(actionMeta.coinCostPerRun || 0) || 0);
    if (coinCostPerRun > 0) {
      bumpBuyMap(out, '/items/coins', coinCostPerRun * runs, false);
    }
 
    return out;
  }
 
  // ═══════════════════════════════════════════════════════════════════
  // PERSISTENCE
  // ═══════════════════════════════════════════════════════════════════
 
  /** Recomputes guzzlingConc from the stored enhancement level. */
  function syncGuzzlingConc() {
    if (opts.guzzlingLevel < 0) {
      opts.guzzlingConc = 1.0;
    } else {
      // Pouch stat = 0.1 × (1 + enhancement_bonus); concentration multiplier = 1 + stat
      const bonus = ENHANCEMENT_BONUSES[opts.guzzlingLevel] ?? 0;
      opts.guzzlingConc = 1 + (0.1 * (1 + bonus));
    }
  }
 
  function loadAll() {
    try {
      Object.assign(opts, JSON.parse(GM_getValue(STORAGE_OPTS, '{}')));
      opts.defaultEntryQty = toPositiveInt(opts.defaultEntryQty, 1);
      opts.defaultEntryCraftMode = ['direct', 'full'].includes(opts.defaultEntryCraftMode)
        ? opts.defaultEntryCraftMode
        : 'direct';
      syncGuzzlingConc();
    } catch (_) {}
    try { shoppingList =              JSON.parse(GM_getValue(STORAGE_LIST, '[]'));          } catch (_) {}
    try { Object.assign(panelPos,     JSON.parse(GM_getValue(STORAGE_POS,  '{}')));        } catch (_) {}
    try {
      const t = GM_getValue(STORAGE_TAB, 'list');
    } catch (_) {}
    try {
      const saved = JSON.parse(GM_getValue(STORAGE_TASKS, '[]'));
      if (Array.isArray(saved) && saved.length) {
        // Restore without nodeRef — DOM parse will re-attach that when the board is opened
        cachedTasks = saved.map(t => ({ ...t, nodeRef: null }));
      }
    } catch (_) {}
  }
 
  const saveOpts  = () => GM_setValue(STORAGE_OPTS,  JSON.stringify(opts));
  const saveList  = () => GM_setValue(STORAGE_LIST,  JSON.stringify(shoppingList));
  const savePos   = () => GM_setValue(STORAGE_POS,   JSON.stringify(panelPos));
 
  /** Persists cachedTasks without the DOM nodeRef (not serialisable). */
  function saveTasksCache() {
    const serialisable = cachedTasks.map(({ skill, itemName, itemHrid, done, total, remaining, isComplete, characterQuestId }) => ({
      skill, itemName, itemHrid, done, total, remaining,
      isComplete: isComplete ?? false,
      characterQuestId: characterQuestId ?? null,
    }));
    GM_setValue(STORAGE_TASKS, JSON.stringify(serialisable));
  }
 
  // ═══════════════════════════════════════════════════════════════════
  // DATA INGESTION
  // ═══════════════════════════════════════════════════════════════════
 
  // Applies init client payload (items/actions) and primes derived lookup structures.
  function applyInitClientData(payload) {
    if (!payload || typeof payload !== 'object') return false;
 
    const itemMap   = payload.itemDetailMap   || payload.item_detail_map   || {};
    const actionMap = payload.actionDetailMap || payload.action_detail_map || {};
    if (!Object.keys(itemMap).length && !Object.keys(actionMap).length) return false;
 
    Object.assign(game.items, itemMap);
    Object.assign(game.actions, actionMap);
    isDataLoaded = true;
    buildNameMaps();
    precalculateUpgradeChains();
    scheduleRender();
    loadBilingualItemNames();
    return true;
  }
 
  // Normalizes and applies full character payload, then updates inventory cache and UI
  function applyCharacterDataPayload(payload, shouldRender = true) {
    const characterData = normalizeCharacterDataPayload(payload);
    if (!characterData) return false;
 
    latestCharacterData = characterData;
    inventoryDirty = true;
    updateInventoryCounts(characterData);
    inventoryDirty = false;
    if (shouldRender) scheduleRender();
    return true;
  }
 
  // Merges websocket inventory deltas into cached character state and refreshes dependent UI
  function mergeInventoryDeltaFromSocket(items, shouldRender = true) {
    if (!Array.isArray(items) || !items.length || !latestCharacterData) return false;
 
    const currentItems = Array.isArray(latestCharacterData.characterItems)
      ? latestCharacterData.characterItems
      : [];
 
    const itemsById = new Map(currentItems.map(item => [item.id, item]));
 
    for (const delta of items) {
      const previous = itemsById.get(delta.id);
 
      if ((delta.count ?? 0) <= 0) {
        itemsById.delete(delta.id);
        continue;
      }
 
      itemsById.set(delta.id, previous ? { ...previous, ...delta } : delta);
    }
 
    const mergedItems = Array.from(itemsById.values());
 
    latestCharacterData = {
      ...latestCharacterData,
      characterItems: mergedItems,
    };
 
    const changed = updateInventoryCounts(latestCharacterData);
    if (!changed) return false;
 
    lastCalcState = '';
 
    if (shouldRender) {
      if (panelVisible && panel?.isConnected) {
        const patched = patchInventoryDrivenViews();
        if (!patched) {
          logRenderPath('items_updated/panel', 'full-render');
          scheduleRender();
        } else {
          logRenderPath('items_updated/panel', 'patched');
        }
      } else if (document.querySelector('[class*="MarketplacePanel"]')) {
        updateBuyList();
        if (!patchPinnedBarQuantitiesOnly()) {
          logRenderPath('items_updated/market', 'full-render');
          renderMarketPins();
        } else {
          logRenderPath('items_updated/market', 'patched');
        }
      }
    }
 
    return true;
  }
 
  // Applies crafted-progress to top-level goals by reducing quantities for items gained in inventory.
  function applyCraftProgressFromInventory(beforeCounts, afterCounts) {
    if (!shoppingList.length && !cachedTasks.length) return false;
 
    const gainedByHrid = new Map();
    for (const [hrid, after] of afterCounts.entries()) {
      const before = beforeCounts.get(hrid) || 0;
      const gained = after - before;
      if (gained > 0) gainedByHrid.set(hrid, gained);
    }
 
    const fallbackGains = getExpectedActionOutputGains(beforeCounts, afterCounts);
    for (const [hrid, gained] of fallbackGains.entries()) {
      if (gained <= 0) continue;
      if ((gainedByHrid.get(hrid) || 0) > 0) continue;
      gainedByHrid.set(hrid, gained);
    }
 
    if (gainedByHrid.size === 0) return false;
 
    if (!shoppingList.length) return false;
 
    let changed = false;
    const workingList = shoppingList.map(entry => ({ ...entry }));
    const entryById = new Map(workingList.map(entry => [String(entry.id), entry]));
 
    for (const [hrid, gained] of gainedByHrid.entries()) {
      let remainingGain = gained;
      const queue = actionIntentQueueByHrid.get(hrid) || [];
 
      while (remainingGain > 0 && queue.length) {
        const entryId = queue.shift();
        const entry = entryById.get(entryId);
        if (!entry || entry.itemHrid !== hrid) continue;
 
        const currentTarget = entry.targetQty || 0;
        if (currentTarget <= 0) continue;
 
        const usedGain = Math.min(remainingGain, currentTarget);
        if (usedGain <= 0) continue;
 
        entry.targetQty = currentTarget - usedGain;
        remainingGain -= usedGain;
        changed = true;
      }
 
      if (queue.length) {
        actionIntentQueueByHrid.set(hrid, queue);
      } else {
        actionIntentQueueByHrid.delete(hrid);
      }
 
      gainedByHrid.set(hrid, remainingGain);
    }
 
    for (const entry of workingList) {
      const availableGain = gainedByHrid.get(entry.itemHrid) || 0;
      if (!availableGain) continue;
 
      const targetQty = entry.targetQty || 0;
      if (targetQty <= 0) continue;
 
      const usedGain = Math.min(availableGain, targetQty);
      if (usedGain <= 0) continue;
 
      entry.targetQty = targetQty - usedGain;
      gainedByHrid.set(entry.itemHrid, availableGain - usedGain);
      changed = true;
    }
 
    const nextList = workingList.filter(entry => (entry.targetQty || 0) > 0);
 
    if (!changed) return false;
 
    shoppingList = nextList;
    saveList();
    lastCalcState = '';
 
    if (panelVisible && panel?.isConnected) {
      const patched = patchInventoryDrivenViews();
      if (!patched) {
        logRenderPath('action_completed/panel', 'full-render');
        scheduleRender();
      } else {
        logRenderPath('action_completed/panel', 'patched');
      }
    } else if (document.querySelector('[class*="MarketplacePanel"]')) {
      updateBuyList();
      if (!patchPinnedBarQuantitiesOnly()) {
        logRenderPath('action_completed/market', 'full-render');
        renderMarketPins();
      } else {
        logRenderPath('action_completed/market', 'patched');
      }
    }
 
    return true;
  }
 
  // Derives expected crafted outputs from action_completed metadata (queue-safe fallback path).
  function getExpectedActionOutputGains(beforeCounts, afterCounts) {
    const gains = new Map();
    const actionMsg = lastActionCompletedMessage;
    if (!actionMsg || !game.actions || !Object.keys(game.actions).length) return gains;
 
    const actionRef = actionMsg.endCharacterAction || actionMsg.characterAction || actionMsg.action || {};
    const actionHrid =
      actionRef.actionHrid ||
      actionRef.action_hrid ||
      actionRef.hrid ||
      actionMsg.actionHrid ||
      actionMsg.action_hrid ||
      actionMsg.hrid ||
      null;
 
    if (!actionHrid) return gains;
 
    const actionDef =
      game.actions[actionHrid] ||
      Object.values(game.actions).find(def =>
        (def?.hrid || def?.actionHrid || def?.action_hrid) === actionHrid
      );
 
    if (!actionDef) return gains;
 
    const outputs = actionDef.outputItems || actionDef.output_items || [];
    if (!Array.isArray(outputs) || !outputs.length) return gains;
 
    const wantedHrids = new Set(shoppingList.map(entry => entry.itemHrid).filter(Boolean));
 
    for (const output of outputs) {
      const hrid = output.itemHrid || output.item_hrid;
      const count = Number(output.count ?? output.amount ?? 1) || 0;
      if (!hrid || count <= 0) continue;
      if (!wantedHrids.has(hrid)) continue;
 
      const before = beforeCounts.get(hrid) || 0;
      const after = afterCounts.get(hrid) || 0;
      if (after > before) continue;
 
      gains.set(hrid, (gains.get(hrid) || 0) + count);
    }
 
    return gains;
  }
 
  // Coherent object structure
  function normalizeCharacterDataPayload(msg) {
    if (!msg || typeof msg !== 'object') return null;
 
    const base = (msg.character && typeof msg.character === 'object') ? msg.character : {};
    const merged = {
      ...base,
      characterItems: msg.characterItems || base.characterItems || msg.items || base.items || msg.inventory || base.inventory || [],
      characterSkills: msg.characterSkills || base.characterSkills || [],
      characterHouseRoomMap: msg.characterHouseRoomMap || base.characterHouseRoomMap || {},
      myMarketListings: msg.myMarketListings || base.myMarketListings || [],
      actionTypeDrinkSlotsMap: msg.actionTypeDrinkSlotsMap || base.actionTypeDrinkSlotsMap || {},
      personalActionTypeBuffsMap: msg.personalActionTypeBuffsMap || base.personalActionTypeBuffsMap || {},
    };
 
    if (Object.keys(merged).length === 0) return null;
    return merged;
  }
 
  // Routes parsed game websocket messages to the appropriate ingestion/update handler
  function handleGameSocketMessage(msg) {
    if (!msg?.type) return false;
 
    if (msg.type === 'init_client_data') {
      return applyInitClientData(msg);
    }
 
    if (msg.type === 'init_character_data') {
      const result = applyCharacterDataPayload(msg);
      // Also seed cachedTasks quest IDs + progress if we already have tasks cached
      const quests = msg.characterQuests || msg.character_quests || msg.character?.characterQuests || [];
      if (quests.length) applyQuestUpdatesFromSocket(quests);
      return result;
    }
 
    if (msg.type === 'action_completed' || msg.type === 'items_updated') {
      const beforeCounts = msg.type === 'action_completed' ? new Map(inventoryCounts) : null;
      if (msg.type === 'action_completed') {
        lastActionCompletedMessage = msg;
      }
      const didApplyDelta = mergeInventoryDeltaFromSocket(msg.endCharacterItems);
      let didApplyProgress = false;
      // Enhancement action filter: skip shopping list update for enhancing actions
      const isEnhanceAction = msg.type === 'action_completed' &&
        msg.endCharacterAction &&
        (msg.endCharacterAction.actionHrid === '/actions/enhancing/enhance');
      if (msg.type === 'action_completed' && didApplyDelta && beforeCounts && !isEnhanceAction) {
        didApplyProgress = applyCraftProgressFromInventory(beforeCounts, inventoryCounts);
      } else if (msg.type === 'action_completed' && beforeCounts && !isEnhanceAction) {
        didApplyProgress = applyCraftProgressFromInventory(beforeCounts, inventoryCounts);
      }
      if (msg.type === 'action_completed' && !didApplyDelta) {
        scheduleInventoryRefresh();
      }
 
      // Update cached tasks from the authoritative quest data in the message
      if (msg.type === 'action_completed' && msg.endCharacterQuests?.length) {
        const questsChanged = applyQuestUpdatesFromSocket(msg.endCharacterQuests);
        if (questsChanged && tasksOpen && panelVisible && panel?.isConnected) {
          refreshTasksTabDOM();
        }
      }
 
      return didApplyDelta || didApplyProgress;
    }
 
    return false;
  }
 
  // Safely parses raw websocket message text into JSON payload objects
  function parseSocketMessageData(data) {
    if (typeof data !== 'string') return null;
    try {
      return JSON.parse(data);
    } catch (_) {
      return null;
    }
  }
 
  // Parses raw websocket event data and forwards valid messages to the router
  function handleGameSocketEventData(data) {
    const msg = parseSocketMessageData(data);
    if (!msg) return false;
    return handleGameSocketMessage(msg);
  }
 
  // Identifies game websocket connections by matching known production/test endpoints
  function isGameSocket(socket) {
    const url = socket?.url || '';
    return url.includes('api.milkywayidle.com/ws') || url.includes('api-test.milkywayidle.com/ws');
  }
 
 
  // Attaches one message listener per game socket to ingest runtime updates
  function attachSocketListener(socket) {
    if (!isGameSocket(socket) || attachedGameSockets.has(socket)) return;
 
    attachedGameSockets.add(socket);
 
    socket.addEventListener('message', event => {
      if (LOG_REC_MSGSAGES) {
        console.debug('[ShoppingList] ◀ RECV:', event.data);
      }
      if (typeof event?.data === 'string') {
        handleGameSocketEventData(event.data);
      }
    });
  }
 
  // Installs a lightweight websocket wrapper so newly created game sockets are observed
  function installSocketListener() {
    if (socketListenerInstalled) return;
 
    const targetWindow = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
    const OriginalWebSocket = targetWindow?.WebSocket;
    if (!OriginalWebSocket) return;
 
    if (OriginalWebSocket.__shoppingListWrapped) {
      socketListenerInstalled = true;
      return;
    }
 
    class ShoppingListWebSocket extends OriginalWebSocket {
      constructor(...args) {
        super(...args);
        attachSocketListener(this);
      }
    }
 
    ShoppingListWebSocket.__shoppingListWrapped = true;
    ShoppingListWebSocket.__shoppingListOriginal = OriginalWebSocket;
 
    try {
      targetWindow.WebSocket = ShoppingListWebSocket;
      socketListenerInstalled = true;
    } catch (_) {}
  }
 
  // Rebuilds unenhanced inventory counts (bag-only) and updates snapshot for change detection
  function updateInventoryCounts(character) {
    const items = character?.characterItems || character?.items || character?.inventory || [];
    const nextCounts = new Map();
 
    if (Array.isArray(items)) {
      for (const item of items) {
        const hrid = item.itemHrid || item.item_hrid;
        const count = Number(item.count) || 0;
        const location = item.itemLocationHrid || item.item_location_hrid || '';
        const enhancementLevel = item.enhancementLevel || item.enhancement_level || 0;
 
        if (!hrid || count <= 0) continue;
        if (location && location !== '/item_locations/inventory') continue;
        if (enhancementLevel > 0) continue;
 
        nextCounts.set(hrid, (nextCounts.get(hrid) || 0) + count);
      }
    }
 
    const nextSnapshot = JSON.stringify([...nextCounts.entries()].sort((a, b) => a[0].localeCompare(b[0])));
    if (nextSnapshot === inventorySnapshot) {
      return false;
    }
 
    inventoryCounts = nextCounts;
    inventorySnapshot = nextSnapshot;
 
    return true;
  }
 
  // Performs a forced inventory refresh from data sources and triggers UI updates on change
  function runInventoryRefresh() {
    const prevSnapshot = inventorySnapshot;
    const refreshed = tryLoadGameData({ refreshInventory: true });
    if (!refreshed) return false;
    if (inventorySnapshot === prevSnapshot) return false;
 
    lastCalcState = '';
 
    if (panelVisible && panel?.isConnected) {
      scheduleRender();
      return true;
    }
 
    if (document.querySelector('[class*="MarketplacePanel"]')) {
      renderMarketPins();
    }
 
    return true;
  }
 
  // Schedules a delayed inventory refresh with an optional one-time retry fallback
  function scheduleInventoryRefresh(delay = 300, allowRetry = true) {
    clearTimeout(inventoryRefreshTimeout);
    inventoryRefreshTimeout = setTimeout(() => {
      inventoryRefreshTimeout = null;
      const changed = runInventoryRefresh();
      if (!changed && allowRetry) {
        scheduleInventoryRefresh(700, false);
      }
    }, delay);
  }
 
  // Ensures inventory counts are current using cache first, then fallback refresh/load paths
  function refreshInventoryCounts() {
    try {
      if (latestCharacterData) {
        if (!inventoryDirty) return;
        updateInventoryCounts(latestCharacterData);
        inventoryDirty = false;
        return;
      }
 
      if (tryLoadGameData({ refreshInventory: true })) return;
 
      const result = getCharacterData(true);
      if (!result) return;
      applyCharacterDataPayload(result.character, false);
    } catch (_) {}
  }
 
  // ═══════════════════════════════════════════════════════════════════
  // NAME LOOKUP TABLES
  // ═══════════════════════════════════════════════════════════════════
 
  // ═══════════════════════════════════════════════════════════════════
  // BILINGUAL ITEM NAME CHUNK LOADER
  // Fetches the game bundle to extract EN/ZH item name pairs.
  // Populates itemHridToZhName / zhNameToHrid, then re-renders the panel.
  // Adapted from MWI Chat Translator by the same author.
  // ═══════════════════════════════════════════════════════════════════
 
  const _TRANSLATION_DICTS = ['itemNames', 'skillNames', 'abilityNames'];
 
  function _findTranslationChunkUrls() {
    const out = [];
    const seen = new Set();
 
    for (const script of document.querySelectorAll('script[src]')) {
      const s = script.src || '';
      if (!s) continue;
      const isMain = /\/static\/js\/main\.[a-f0-9]+(?:\.chunk)?\.js/.test(s);
      const isNumberedChunk = /\/static\/js\/\d+\.[a-f0-9]+\.chunk\.js/.test(s);
      if (!isMain && !isNumberedChunk) continue;
      if (seen.has(s)) continue;
      seen.add(s);
      out.push(s);
    }
 
    // Prioritize main chunk first, then numbered chunks.
    out.sort((a, b) => {
      const aMain = /\/main\./.test(a) ? 0 : 1;
      const bMain = /\/main\./.test(b) ? 0 : 1;
      return aMain - bMain;
    });
 
    return out;
  }
 
  function _containsCjk(text) {
    return /[\u3400-\u9fff]/.test(String(text || ''));
  }
 
  function _detectMapLanguage(mapObj) {
    if (!mapObj || typeof mapObj !== 'object') return 'unknown';
    const values = Object.values(mapObj).filter(v => typeof v === 'string');
    if (!values.length) return 'unknown';
 
    let cjk = 0;
    const sampleSize = Math.min(values.length, 80);
    for (let i = 0; i < sampleSize; i++) {
      if (_containsCjk(values[i])) cjk++;
    }
    return cjk > 0 ? 'zh' : 'en';
  }
 
  function _extractNamedObject(src, name, startFrom) {
    const rel = src.slice(startFrom).search(new RegExp(name + '\\s*:\\s*\\{'));
    if (rel === -1) return [null, -1];
    const braceStart = src.indexOf('{', startFrom + rel);
    let depth = 0, j = braceStart;
    while (j < src.length) {
      const ch = src[j];
      if (ch === '{') { depth++; j++; }
      else if (ch === '}') {
        depth--;
        if (depth === 0) {
          const o = src.slice(braceStart, j + 1);
          try { return [JSON.parse(o.replace(/\\\\u([0-9a-fA-F]{4})/g, '\\u$1')), j+1]; }
          catch (_) { try { return [JSON.parse(o), j+1]; } catch (_) { return [null, j+1]; } }
        }
        j++;
      } else if (ch === '"' || ch === "'") {
        const q = ch; j++;
        while (j < src.length && src[j] !== q) { if (src[j] === '\\') j++; j++; }
        j++;
      } else { j++; }
    }
    return [null, -1];
  }
 
  function _extractTranslationDictsFromChunk(src) {
    const dicts = {};
    for (const dictName of _TRANSLATION_DICTS) {
      const [obj] = _extractNamedObject(src, dictName, 0);
      if (obj && typeof obj === 'object' && Object.keys(obj).length) {
        dicts[dictName] = obj;
      }
    }
    return dicts;
  }
 
  function loadBilingualItemNames() {
    function attempt(n) {
      const urls = TRANSLATION_BUNDLE_URLS;
      if (!urls.length) { if (n > 0) setTimeout(() => attempt(n-1), 500); return; }
 
      const jobs = urls.map(url =>
        fetch(url)
          .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
          .then(src => ({ url, dicts: _extractTranslationDictsFromChunk(src) }))
      );
 
      Promise.allSettled(jobs)
        .then(results => {
          let enItemNames = null;
          let zhItemNames = null;
          let enSkillNames = null;
          let zhSkillNames = null;
 
          for (const result of results) {
            if (result.status !== 'fulfilled') continue;
            const { dicts } = result.value;
            if (!dicts || !dicts.itemNames) continue;
 
            const itemLang = _detectMapLanguage(dicts.itemNames);
            if (itemLang === 'zh' && !zhItemNames) zhItemNames = dicts.itemNames;
            if (itemLang === 'en' && !enItemNames) enItemNames = dicts.itemNames;
 
            if (dicts.skillNames) {
              const skillLang = _detectMapLanguage(dicts.skillNames);
              if (skillLang === 'zh' && !zhSkillNames) zhSkillNames = dicts.skillNames;
              if (skillLang === 'en' && !enSkillNames) enSkillNames = dicts.skillNames;
            }
          }
 
          if (!zhItemNames || !Object.keys(zhItemNames).length) {
            infoLog('[ShoppingList] Bilingual: no zh itemNames map found in loaded chunks.');
            return;
          }
 
          // Populate hrid->zh directly from the Chinese dictionary.
          itemHridToZhName = {};
          zhNameToHrid = {};
          let matched = 0;
          for (const [hrid, zhName] of Object.entries(zhItemNames)) {
            if (!hrid || typeof zhName !== 'string' || !zhName.trim()) continue;
            itemHridToZhName[hrid] = zhName;
            zhNameToHrid[zhName] = hrid;
            matched++;
          }
 
          // Populate bilingual skill map by joining EN/ZH skill names on hrid.
          if (typeof window.skillEnToZhName !== 'object' || window.skillEnToZhName === null) {
            window.skillEnToZhName = {};
          }
          skillEnToZhName = window.skillEnToZhName;
          if (enSkillNames && zhSkillNames) {
            for (const [hrid, enName] of Object.entries(enSkillNames)) {
              const zhName = zhSkillNames[hrid];
              if (!enName || !zhName || typeof enName !== 'string' || typeof zhName !== 'string') continue;
              window.skillEnToZhName[enName] = zhName;
              window.skillEnToZhName[String(enName).toLowerCase()] = zhName;
            }
          }
 
          chunkTranslationsLoaded = matched > 0;
          if (!chunkTranslationsLoaded) {
            infoLog('[ShoppingList] Bilingual: translation maps detected but no entries were populated.');
            return;
          }
 
          infoLog('[ShoppingList] Bilingual: ' + matched + ' zh item names loaded.');
          if (!enItemNames) {
            infoLog('[ShoppingList] Bilingual: EN itemNames map not found; using game data for EN names.');
          }
          lastCalcState = '';
 
          // Re-resolve any cached tasks whose itemHrid was null because chunks
          // hadn't loaded yet when they were first parsed.
          let tasksResolved = 0;
          for (const task of cachedTasks) {
            if (task.itemHrid) continue;
            const hrid = getItemHrid(task.itemName);
            if (hrid) { task.itemHrid = hrid; tasksResolved++; }
          }
          if (tasksResolved > 0) {
            saveTasksCache();
            infoLog('[ShoppingList] Bilingual: resolved ' + tasksResolved + ' pending task hrids.');
          }
 
          scheduleRender();
        })
        .catch(err => infoLog('[ShoppingList] Bilingual chunk failed: ' + err.message));
    }
    attempt(15);
  }
 
  function buildNameMaps() {
    itemHridToName = {};
    itemNameToHrid = {};
    specialActionKeyToMeta = new Map();
    specialActionKeyToLabel = new Map();
    specialActionLabelToKey = new Map();
 
    // Pre-calculate craftable items (output of any action)
    const craftableHrids = new Set();
    for (const action of Object.values(game.actions)) {
      const outputs = action.outputItems || action.output_items || [];
      for (const o of outputs) {
        const h = o.itemHrid || o.item_hrid;
        if (h) craftableHrids.add(h);
      }
    }
 
    for (const [hrid, def] of Object.entries(game.items)) {
      const name = def.name;
      if (!name || !craftableHrids.has(hrid)) continue;
      itemHridToName[hrid]              = name;
      itemNameToHrid[name.toLowerCase()] = hrid;
    }
 
    const alchemyActionsByKind = {
      coinify: game.actions['/actions/alchemy/coinify'] || null,
      decompose: game.actions['/actions/alchemy/decompose'] || null,
      transmute: game.actions['/actions/alchemy/transmute'] || null,
    };
 
    const addAlchemyOption = (kind, itemHrid, itemDef) => {
      const prefix = getAlchemyActionPrefix(kind);
      if (!prefix || !itemHrid) return;
 
      const actionHrid = `/actions/alchemy/${kind}`;
      const action = alchemyActionsByKind[kind] || null;
      const inputQty = getItemAlchemyBulkMultiplier(itemDef, kind);
      const coinCostPerRun = getAlchemyCoinCostPerRun(kind, action, itemDef, inputQty, itemHrid);
      const specialKey = `@alchemy:${kind}:${itemHrid}`;
 
      let label = `${prefix}: ${getItemName(itemHrid)}`;
      const labelKey = normalizeText(label);
      if (specialActionLabelToKey.has(labelKey)) {
        label = `${label} (${String(itemHrid).split('/').pop()})`;
      }
 
      specialActionKeyToMeta.set(specialKey, {
        action,
        actionHrid,
        label,
        kind,
        inputHrid: itemHrid,
        inputQty,
        coinCostPerRun,
      });
      specialActionKeyToLabel.set(specialKey, label);
      specialActionLabelToKey.set(normalizeText(label), specialKey);
    };
 
    for (const [hrid, itemDef] of Object.entries(game.items || {})) {
      if (isItemCoinifiable(itemDef)) addAlchemyOption('coinify', hrid, itemDef);
      if (isItemDecomposable(itemDef)) addAlchemyOption('decompose', hrid, itemDef);
      if (isItemTransmutable(itemDef)) addAlchemyOption('transmute', hrid, itemDef);
    }
 
  }
 
  /** Return display name for an item HRID, respecting the active display language. */
  function getItemName(hrid) {
    if (!hrid) return '';
    if (specialActionKeyToLabel.has(hrid)) return specialActionKeyToLabel.get(hrid);
    if (langState.lang === 'zh' && itemHridToZhName[hrid]) return itemHridToZhName[hrid];
    if (itemHridToName[hrid]) return itemHridToName[hrid];
    return hrid.split('/').pop().replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }
 
  /** English-only name — used for sorting/grouping so order is language-independent. */
  function getItemNameEn(hrid) {
    if (!hrid) return '';
    if (itemHridToName[hrid]) return itemHridToName[hrid];
    return hrid.split('/').pop().replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }
 
  function getItemHrid(name) {
    if (!name) return null;
    const normalized = normalizeText(name);
    // Try English map first, then alchemy specials, then Chinese name map exact matching
    let match = itemNameToHrid[normalized]
        || specialActionLabelToKey.get(normalized)
        || zhNameToHrid[name]
        || zhNameToHrid[name.trim()];
        
    if (match) return match;
 
    // Robust whitespace-agnostic fallback for Chinese strings
    const cleanTarget = name.replace(/\s+/g, '');
    for (const [zhName, hrid] of Object.entries(zhNameToHrid)) {
      if (zhName.replace(/\s+/g, '') === cleanTarget) {
        return hrid;
      }
    }
    
    return null;
  }
 
  // ═══════════════════════════════════════════════════════════════════
  // UPGRADE CHAIN PRE-CALCULATION
  // ═══════════════════════════════════════════════════════════════════
 
  function precalculateUpgradeChains() {
    upgradeChainMap.clear();
    productToAction.clear();
 
    const allActions = Object.values(game.actions);
 
    // Pass 1: register upgrade actions first (priority over plain crafts).
    for (const action of allActions) {
      const outputs = action.outputItems || action.output_items || [];
      if (!outputs.length) continue;
      const outputHrid = outputs[0].itemHrid || outputs[0].item_hrid;
      const upgradeHrid = getUpgradeHrid(action);
 
      if (upgradeHrid && outputHrid) {
        upgradeChainMap.set(outputHrid, upgradeHrid);
        productToAction.set(outputHrid, action);
      }
    }
 
    // Pass 2: fill in remaining non-upgrade actions not yet mapped.
    for (const action of allActions) {
      const outputs = action.outputItems || action.output_items || [];
      if (!outputs.length) continue;
      for (const output of outputs) {
        const outputHrid = output.itemHrid || output.item_hrid;
        if (!outputHrid) continue;
 
        if (!productToAction.has(outputHrid)) {
          productToAction.set(outputHrid, action);
        }
      }
    }
 
  }
 
  // ═══════════════════════════════════════════════════════════════════
  // CRAFTING TREE RESOLVER
  // ═══════════════════════════════════════════════════════════════════
 
  /**
   * Returns the upgrade-source item hrid for an action - the input consumed 1:1
   * that is not tea-affected (e.g. Holy Hatchet uses Rainbow Hatchet as upgrade source).
   * Prefers the explicit upgradeItemHrid field; falls back to an equipment keyword
   * name-match heuristic when the field is absent.
   */
  /**
   * Returns the upgrade-source item hrid for an action - the input that acts as
   * the base item being upgraded (e.g. Rainbow Shears for Holy Shears).
   *
   * The explicit `upgradeItemHrid` field is trusted if the source and output
   * share an upgrade-path token or are both known upgrade-category items.
   * Items consumed with count > 1 (bulk inputs like Holy Gauntlets in Dodocamel)
   * are still accepted here so they stay in the upgrade chain for the From dropdown
   * but are handled as regular materials (artisan applies) in the resolvers.
   */
  function getUpgradeHrid(action) {
    const inputs  = action.inputItems || action.input_items || [];
    const outputs = action.outputItems || action.output_items || [];
    if (!outputs.length) return null;
 
    const outputHrid = outputs[0].itemHrid || outputs[0].item_hrid;
 
    // Explicit field: trusted if both items share a type token or category.
    // We do NOT filter by count here - bulk items (count > 1) are still valid
    // upgrade-chain entries; artisan vs no-artisan is decided in the resolvers
    // by checking the actual count per craft.
    const explicit = action.upgradeItemHrid || action.upgrade_item_hrid || action.upgradeHrid || null;
    if (explicit && (
      sharesUpgradePathToken(explicit, outputHrid) ||
      (isKnownUpgradeCategoryItem(explicit) && isKnownUpgradeCategoryItem(outputHrid))
    )) return explicit;
 
    // Keyword heuristic fallback: exactly one input shares the type token with the
    // output. Count is intentionally NOT checked here — items consumed in bulk
    // (e.g. Holy Gauntlets x26 in Dodocamel) are still valid upgrade-chain entries
    // for the From dropdown. The resolvers apply artisan vs no-artisan based on
    // the actual count per craft.
    const candidates = inputs.filter(inp => {
      const inpHrid = inp.itemHrid || inp.item_hrid;
      return sharesUpgradePathToken(inpHrid, outputHrid);
    });
 
    if (candidates.length === 1) {
      return candidates[0].itemHrid || candidates[0].item_hrid;
    }
 
    return null;
  }
 
  /**
   * Recursively resolves what to buy to craft `qty` of `targetHrid`.
   *
   * craftMode:
   * 'direct' - one level only; buy the upgrade-source item directly.
   * 'full'   - recurse into the upgrade-source's own recipe.
   *
   * Returns Map<hrid, { qty, isUpgradeChain }>.
   * isUpgradeChain=true  → consumed 1:1, not tea-affected.
   * isUpgradeChain=false → regular material, tea formula applies.
   */
  function resolveTree(targetHrid, qty, craftMode, p, z, _visited = new Set(), inventoryBudget = null, skipTargetOwnedConsumption = false) {
    const out = new Map();
 
    if (_visited.has(targetHrid)) {
      bumpBuyMap(out, targetHrid, qty, false);
      return out;
    }
 
    let remainingQty = qty;
    if (!skipTargetOwnedConsumption) {
      remainingQty = consumeOwnedInventory(targetHrid, qty, inventoryBudget);
    }
 
    if (remainingQty <= 0) return out;
 
    const action = productToAction.get(targetHrid);
    if (!action) {
      bumpBuyMap(out, targetHrid, qty, false); // push GROSS amount
      return out;
    }
 
    const upgradeHrid = upgradeChainMap.get(targetHrid);
    const inputs      = action.inputItems || action.input_items || [];
    const outputs     = action.outputItems || action.output_items || [];
    const primaryOut  = outputs.find(o => (o.itemHrid || o.item_hrid) === targetHrid) || outputs[0];
    const outputCount = primaryOut?.count ?? 1;
    const craftRuns   = Math.ceil(remainingQty / outputCount);
 
    let upgradeHandled = false;
 
    for (const inp of inputs) {
      const inpHrid   = inp.itemHrid || inp.item_hrid;
      const baseAmt   = inp.count    || inp.amount || 1;
      const isUpgrade = upgradeHrid && inpHrid === upgradeHrid;
 
      if (isUpgrade) {
        upgradeHandled = true;
 
        if (baseAmt > 1) {
          bumpBuyMap(out, inpHrid, calcMaterials(baseAmt, craftRuns, p, z), false);
          continue;
        }
 
        const grossNeeded = baseAmt * craftRuns;
 
        if (craftMode === 'full') {
          if (grossNeeded > 0) {
            mergeBuyMaps(out, resolveTree(inpHrid, grossNeeded, craftMode, p, z, new Set([..._visited, targetHrid]), inventoryBudget, false));
          }
        } else if (grossNeeded > 0) {
          bumpBuyMap(out, inpHrid, grossNeeded, true);
        }
      } else {
        bumpBuyMap(out, inpHrid, calcMaterials(baseAmt, craftRuns, p, z), false);
      }
    }
 
    if (upgradeHrid && !upgradeHandled) {
      const grossNeeded = craftRuns;
      if (craftMode === 'full') {
        if (grossNeeded > 0) {
          mergeBuyMaps(out, resolveTree(upgradeHrid, grossNeeded, craftMode, p, z, new Set([..._visited, targetHrid]), inventoryBudget, false));
        }
      } else if (grossNeeded > 0) {
        bumpBuyMap(out, upgradeHrid, grossNeeded, true);
      }
    }
 
    return out;
  }
 
  function resolveCraftableMaterialNode(targetHrid, qty, p, z, inventoryBudget, mode, rowsOut, depth, visited = new Set(), skipTargetOwnedConsumption = false, includeSelfRow = true, coveredCraftableHrids = null, stopAtHrid = null) {
    const out = new Map();
    if (!targetHrid || qty <= 0) return out;
 
    if (visited.has(targetHrid)) {
      bumpBuyMap(out, targetHrid, qty, false);
      return out;
    }
 
    const action = productToAction.get(targetHrid);
    if (!action) {
      bumpBuyMap(out, targetHrid, qty, false); // push GROSS amount
      return out;
    }
 
    if (coveredCraftableHrids instanceof Set) {
      coveredCraftableHrids.add(targetHrid);
    }
 
    let remainingQty = skipTargetOwnedConsumption
      ? qty
      : consumeOwnedInventory(targetHrid, qty, inventoryBudget);
 
    if (remainingQty <= 0) return out;
 
    if (includeSelfRow) {
      rowsOut.push({ hrid: targetHrid, qty: remainingQty, depth }); // UI displays NET
    }
 
    const outputs = action.outputItems || action.output_items || [];
    const primaryOut = outputs.find(o => (o.itemHrid || o.item_hrid) === targetHrid) || outputs[0];
    const outputCount = Math.max(1, Number(primaryOut?.count ?? primaryOut?.amount ?? 1) || 1);
    const craftRuns = Math.ceil(remainingQty / outputCount);
 
    const inputs = action.inputItems || action.input_items || [];
    const upgradeHrid = getUpgradeHrid(action);
    let upgradeHandled = false;
 
    for (const inp of inputs) {
      const inpHrid = inp.itemHrid || inp.item_hrid;
      const baseAmt = inp.count || inp.amount || 1;
      const isUpgrade = !!(upgradeHrid && inpHrid === upgradeHrid);
 
      if (isUpgrade) {
        upgradeHandled = true;
 
        if (baseAmt > 1) {
          const materialQty = calcMaterials(baseAmt, craftRuns, p, z);
          if (materialQty <= 0) continue;
          const upgradeIsAtOrBelowStop = stopAtHrid && upgradePathIncludes(stopAtHrid, inpHrid);
          if (!upgradeIsAtOrBelowStop && isCraftableExpansionEnabled(inpHrid, mode) && !visited.has(inpHrid)) {
            mergeBuyMaps(out, resolveCraftableMaterialNode(
              inpHrid, materialQty, p, z, inventoryBudget, mode, rowsOut, depth + 1,
              new Set([...visited, targetHrid]), false, true, coveredCraftableHrids, stopAtHrid
            ));
          } else {
            bumpBuyMap(out, inpHrid, materialQty, false);
          }
          continue;
        }
 
        const grossNeeded = baseAmt * craftRuns;
        if (grossNeeded <= 0) continue;
 
        const upgradeIsAtOrBelowStop = stopAtHrid && upgradePathIncludes(stopAtHrid, inpHrid);
 
        if (!upgradeIsAtOrBelowStop && productToAction.has(inpHrid)) {
          mergeBuyMaps(
            out,
            resolveCraftableMaterialNode(
              inpHrid, grossNeeded, p, z, inventoryBudget, mode, rowsOut, depth + 1,
              new Set([...visited, targetHrid]), false, true, coveredCraftableHrids, stopAtHrid
            )
          );
        } else {
          bumpBuyMap(out, inpHrid, grossNeeded, true);
        }
        continue;
      }
 
      const materialQty = calcMaterials(baseAmt, craftRuns, p, z);
      if (materialQty <= 0) continue;
 
      if (isCraftableExpansionEnabled(inpHrid, mode)) {
        mergeBuyMaps(
          out,
          resolveCraftableMaterialNode(
            inpHrid, materialQty, p, z, inventoryBudget, mode, rowsOut, depth + 1,
            new Set([...visited, targetHrid]), false, true, coveredCraftableHrids
          )
        );
      } else {
        bumpBuyMap(out, inpHrid, materialQty, false);
      }
    }
 
    if (upgradeHrid && !upgradeHandled) {
      const grossNeeded = craftRuns;
      if (grossNeeded > 0) {
        const upgradeIsAtOrBelowStop = stopAtHrid && upgradePathIncludes(stopAtHrid, upgradeHrid);
 
        if (!upgradeIsAtOrBelowStop && productToAction.has(upgradeHrid)) {
          mergeBuyMaps(
            out,
            resolveCraftableMaterialNode(
              upgradeHrid, grossNeeded, p, z, inventoryBudget, mode, rowsOut, depth + 1,
              new Set([...visited, targetHrid]), false, true, coveredCraftableHrids, stopAtHrid
            )
          );
        } else {
          bumpBuyMap(out, upgradeHrid, grossNeeded, true);
        }
      }
    }
 
    return out;
  }
 
  function resolveFullChainMaterialsWithBudget(targetHrid, targetQty, p, z, inventoryBudget = null, upgradeRowsOut = null, stopAtHrid = null) {
    const out = new Map();
    if (!targetHrid || !targetQty || targetQty <= 0) return out;
 
    const visited = new Set();
    let currentHrid = targetHrid;
    let currentNetQty = targetQty;
    let currentGrossQty = targetQty;
    let depth = 0;
 
    while (depth < 25 && currentNetQty > 0) {
      if (visited.has(currentHrid)) {
        console.warn(`[ShoppingList] Circular dependency at ${currentHrid} - stopping.`);
        bumpBuyMap(out, currentHrid, currentGrossQty, false);
        break;
      }
      visited.add(currentHrid);
 
      const action = productToAction.get(currentHrid);
      if (!action) {
        bumpBuyMap(out, currentHrid, currentGrossQty, false);
        break;
      }
 
      const outputs = action.outputItems || action.output_items || [];
      const primaryOut = outputs.find(o => (o.itemHrid || o.item_hrid) === currentHrid) || outputs[0];
      const outputCount = Math.max(1, Number(primaryOut?.count ?? primaryOut?.amount ?? 1) || 1);
      const craftRuns = Math.ceil(currentNetQty / outputCount);
 
      const inputs = action.inputItems || action.input_items || [];
      const upgradeHrid = getUpgradeHrid(action);
 
      let nextUpgradeHrid = upgradeHrid || null;
      let nextNetQty = 0;
      let nextGrossQty = 0;
      let upgradeHandled = false;
 
      for (const inp of inputs) {
        const inpHrid = inp.itemHrid || inp.item_hrid;
        const baseAmt = inp.count || inp.amount || 1;
        const isUpgrade = !!(upgradeHrid && inpHrid === upgradeHrid);
 
        if (isUpgrade) {
          upgradeHandled = true;
 
          if (baseAmt > 1) {
            bumpBuyMap(out, inpHrid, calcMaterials(baseAmt, craftRuns, p, z), false);
            nextUpgradeHrid = null;
            nextNetQty = 0;
            nextGrossQty = 0;
            continue;
          }
 
          nextGrossQty = baseAmt * craftRuns;
          nextNetQty = consumeOwnedInventory(inpHrid, nextGrossQty, inventoryBudget);
          continue;
        }
 
        bumpBuyMap(out, inpHrid, calcMaterials(baseAmt, craftRuns, p, z), false);
      }
 
      if (nextUpgradeHrid && !upgradeHandled) {
        nextGrossQty = craftRuns;
        nextNetQty = consumeOwnedInventory(nextUpgradeHrid, nextGrossQty, inventoryBudget);
      }
 
      if (stopAtHrid && currentHrid === stopAtHrid) {
        if (nextUpgradeHrid && nextGrossQty > 0) {
          bumpBuyMap(out, nextUpgradeHrid, nextGrossQty, true);
        }
        break;
      }
 
      if (nextUpgradeHrid && nextNetQty > 0 && Array.isArray(upgradeRowsOut)) {
        upgradeRowsOut.push({
          hrid: nextUpgradeHrid,
          qty: nextNetQty,
          grossQty: nextGrossQty,
          depth: depth + 1,
        });
      }
 
      if (opts.craftableMaterialMode !== 'none' && nextUpgradeHrid
          && isCraftableExpansionEnabled(nextUpgradeHrid, opts.craftableMaterialMode)) {
        // Restore inventory here so the material resolver doesn't double-consume
        if (opts.useOwnedInventory && inventoryBudget && nextGrossQty > nextNetQty) {
          const consumed = nextGrossQty - nextNetQty;
          inventoryBudget.set(nextUpgradeHrid, (inventoryBudget.get(nextUpgradeHrid) || 0) + consumed);
        }
        break;
      }
 
      if (!nextUpgradeHrid || nextNetQty <= 0) break;
 
      currentHrid = nextUpgradeHrid;
      currentNetQty = nextNetQty;
      currentGrossQty = nextGrossQty;
      depth += 1;
    }
 
    return out;
  }
 
  function resolveFullChainEntryMaterials(entry, p, z, inventoryBudget, stopAtHrid = null) {
    const upgradeRoots = [];
    const sub = resolveFullChainMaterialsWithBudget(entry.itemHrid, entry.targetQty, p, z, inventoryBudget, upgradeRoots, stopAtHrid);
    const supplementalRows = [];
    const coveredByUpgradeExpansion = new Set();
    const expandedUpgradeRootHrids = new Set();
 
    if (opts.craftableMaterialMode !== 'none') {
      for (const root of getUniqueUpgradeRoots(upgradeRoots)) {
        if (!isCraftableExpansionEnabled(root.hrid, opts.craftableMaterialMode)) continue;
        expandedUpgradeRootHrids.add(root.hrid);
 
        const includeSelfForThisRoot = (stopAtHrid && root.hrid === stopAtHrid);
        const upgradeSub = resolveCraftableMaterialNode(
          root.hrid,
          root.grossQty || root.qty, // Pass GROSS
          p,
          z,
          inventoryBudget,
          opts.craftableMaterialMode,
          supplementalRows,
          root.depth,
          new Set(),
          false,
          includeSelfForThisRoot,
          coveredByUpgradeExpansion,
          stopAtHrid
        );
        mergeBuyMaps(sub, upgradeSub);
      }
    }
 
    expandCraftableMaterialsInMap(
      sub,
      p,
      z,
      inventoryBudget,
      opts.craftableMaterialMode,
      supplementalRows,
      expandedUpgradeRootHrids,
      stopAtHrid
    );
 
    const normalizedSupplementalRows = normalizeSupplementalRows(supplementalRows);
    const representedByExpansion = new Set([
      ...expandedUpgradeRootHrids,
      ...normalizedSupplementalRows.map(row => row.hrid),
    ]);
 
    for (const hrid of representedByExpansion) {
      sub.delete(hrid);
    }
 
    return {
      sub,
      supplementalRows: normalizedSupplementalRows,
    };
  }
 
  function bumpBuyMap(map, hrid, qty, isUpgradeChain) {
    const existing = map.get(hrid);
    if (existing) {
      existing.qty += qty;
      if (isUpgradeChain) existing.isUpgradeChain = true;
    } else {
      map.set(hrid, { qty, isUpgradeChain });
    }
  }
 
  function mergeBuyMaps(target, source) {
    for (const [hrid, entry] of source) {
      bumpBuyMap(target, hrid, entry.qty, entry.isUpgradeChain);
    }
  }
 
  function hasCraftableUpgradePredecessor(itemHrid) {
    if (!itemHrid) return false;
 
    const visited = new Set();
    let current = itemHrid;
    let depth = 0;
 
    while (depth < 25) {
      if (visited.has(current)) break;
      visited.add(current);
 
      const upgradeHrid = upgradeChainMap.get(current);
      if (!upgradeHrid) return false;
      if (productToAction.has(upgradeHrid)) return true;
 
      current = upgradeHrid;
      depth += 1;
    }
 
    return false;
  }
 
  function isCraftableExpansionEnabled(itemHrid, mode) {
    if (!itemHrid || !productToAction.has(itemHrid)) return false;
    if (mode === 'all') return true;
    if (mode === 'upgrade-path') return hasCraftableUpgradePredecessor(itemHrid);
    return false;
  }
 
  function consumeOwnedInventory(itemHrid, neededQty, inventoryBudget) {
    if (!opts.useOwnedInventory || !inventoryBudget || !itemHrid || neededQty <= 0) {
      return neededQty;
    }
 
    const availableOwned = inventoryBudget.get(itemHrid) || 0;
    const consumedOwned = Math.min(availableOwned, neededQty);
    inventoryBudget.set(itemHrid, Math.max(0, availableOwned - consumedOwned));
    return Math.max(0, neededQty - consumedOwned);
  }
 
  function upgradePathIncludes(startHrid, targetHrid) {
    if (!startHrid || !targetHrid || startHrid === targetHrid) return false;
 
    const visited = new Set();
    let current = startHrid;
    let depth = 0;
 
    while (depth < 25) {
      if (visited.has(current)) break;
      visited.add(current);
 
      const next = upgradeChainMap.get(current);
      if (!next) return false;
      if (next === targetHrid) return true;
 
      current = next;
      depth += 1;
    }
 
    return false;
  }
 
  function expandCraftableMaterialsInMap(map, p, z, inventoryBudget, mode, rowsOut, skipRootHrids = null, stopAtHrid = null) {
    if (!map || mode === 'none') return;
 
    const entries = [...map.entries()];
    for (const [hrid, entry] of entries) {
      const qty = Number(entry?.qty || 0);
      if (qty <= 0) continue;
      if (!isCraftableExpansionEnabled(hrid, mode)) continue;
      if (skipRootHrids instanceof Set && skipRootHrids.has(hrid)) continue;
 
      // "From X": never expand items that are at or below the stop point - they are raw buys.
      if (stopAtHrid && upgradePathIncludes(stopAtHrid, hrid)) continue;
 
      map.delete(hrid);
      const sub = resolveCraftableMaterialNode(hrid, qty, p, z, inventoryBudget, mode, rowsOut, 1, new Set(), false, true, null, stopAtHrid);
      mergeBuyMaps(map, sub);
    }
  }
 
  function normalizeSupplementalRows(rows) {
    if (!Array.isArray(rows) || rows.length === 0) return [];
 
    // Merge duplicate hrids: sum quantities, keep deepest (max) depth seen.
    // The deepest occurrence is always the most correct indentation level.
    const merged = new Map(); // hrid -> { qty, depth, order }
    let order = 0;
    for (const row of rows) {
      if (!row || !row.hrid || !(Number(row.qty || 0) > 0)) continue;
      const qty = Number(row.qty || 0);
      const depth = Math.max(1, Number(row.depth) || 1);
      if (merged.has(row.hrid)) {
        const existing = merged.get(row.hrid);
        existing.qty += qty;
        existing.depth = Math.max(existing.depth, depth); // deepest wins
      } else {
        merged.set(row.hrid, { qty, depth, order: order++ });
      }
    }
 
    return [...merged.entries()]
      .sort((a, b) => a[1].order - b[1].order)
      .map(([hrid, { qty, depth }]) => ({ hrid, qty, depth }));
  }
 
  function getUniqueUpgradeRoots(upgradeRows) {
    const uniqueRoots = [];
    const sortedRoots = [...upgradeRows].sort((a, b) => {
      const depthA = Number(a?.depth || 0);
      const depthB = Number(b?.depth || 0);
      if (depthA !== depthB) return depthA - depthB;
      return String(a?.hrid || '').localeCompare(String(b?.hrid || ''));
    });
 
    for (const root of sortedRoots) {
      if (!root?.hrid || !root?.qty || root.qty <= 0) continue;
      if (uniqueRoots.some(prev => upgradePathIncludes(prev.hrid, root.hrid))) continue;
      uniqueRoots.push(root);
    }
 
    return uniqueRoots;
  }
 
  // ═══════════════════════════════════════════════════════════════════
  // QUANTITY MATH
  // ═══════════════════════════════════════════════════════════════════
 
/**
   * Returns materials needed for `n` crafts, accounting for artisan tea procs.
   * In MWI, the game calculates savings per craft: `S = base * p`.
   * It guarantees floor(S) saved materials, with a (S % 1) chance to save 1 extra.
   * * @param {number} base – material cost per craft
   * @param {number} n    – number of crafts
   * @param {number} p    – artisan tea proc chance [0, 1]
   * @param {number} z    – z-score safety margin
   */
  function calcMaterials(base, n, p, z) {
    if (n <= 0) return 0;
    const totalBase = base * n;
    if (p <= 0) return totalBase;
    if (p >= 1) return 0;
 
    // S is the exact expected amount of materials saved PER CRAFT
    const S = base * p;
 
    // The game breaks this into a guaranteed save, plus a fractional chance for 1 more
    const guaranteedSavePerCraft = Math.floor(S);
 
    // Fix minor floating point errors (e.g., 30 * 0.1 might be 3.0000000000000004)
    let fractionalChance = S - guaranteedSavePerCraft;
    if (fractionalChance < 1e-9) fractionalChance = 0;
    if (fractionalChance > 1 - 1e-9) fractionalChance = 1;
 
    // Over 'n' crafts, the fractional chance acts as a Binomial distribution B(n, fractionalChance)
    const expectedFractionalSaves = n * fractionalChance;
    const stdDev = Math.sqrt(n * fractionalChance * (1 - fractionalChance));
 
    // We want a safe LOWER bound for the number of extra fractional saves we get
    const safeFractionalSaves = Math.max(0, expectedFractionalSaves - z * stdDev);
 
    // Total consumed = (total base required) - (guaranteed saves) - (safe fractional saves)
    const totalGuaranteedSaved = n * guaranteedSavePerCraft;
    const safeTotalConsumed = totalBase - totalGuaranteedSaved - safeFractionalSaves;
 
    // Round up to buy whole items, and bound it properly
    return Math.max(0, Math.min(totalBase, Math.ceil(safeTotalConsumed)));
  }
 
  // ═══════════════════════════════════════════════════════════════════
  // FULL SHOPPING LIST COMPUTATION
  // ═══════════════════════════════════════════════════════════════════
 
  /** Recompute flattened material list from current goals. */
  function updateBuyList() {
    if (!isDataLoaded) return;
 
    refreshInventoryCounts();
 
    // Skip if inputs/settings/inventory did not change.
    const currentState = JSON.stringify({ list: shoppingList, o: opts, inv: inventorySnapshot });
    if (lastCalcState === currentState) {
      return;
    }
 
    const { useArtisan, artisanBase, guzzlingConc, zScore: z } = opts;
    // Effective artisan proc chance.
    const p = useArtisan ? (artisanBase * guzzlingConc) : 0;
    const combined = new Map();
    const materialInventoryBudget = opts.useOwnedInventory ? new Map(inventoryCounts) : null;
    entrySupplementalCraftRows = new Map();
 
    for (const entry of shoppingList) {
      const { itemHrid, targetQty, craftMode } = entry;
      if (!itemHrid || !targetQty || targetQty <= 0) continue;
 
      let sub;
      if (isSpecialActionEntry(itemHrid)) {
        const actionMeta = getSpecialActionMeta(itemHrid);
        const runs = Math.max(1, Number(targetQty || 1) || 1);
 
        if ((craftMode === 'full' || isFromMode(craftMode)) && actionMeta?.inputHrid) {
          const inputQtyPerRun = Math.max(1, Number(actionMeta.inputQty || 1) || 1);
          const virtualEntry = {
            itemHrid: actionMeta.inputHrid,
            targetQty: inputQtyPerRun * runs,
          };
          const stopAtHrid = isFromMode(craftMode) ? getFromModeHrid(craftMode) : null;
          const resolvedInput = resolveFullChainEntryMaterials(virtualEntry, p, z, materialInventoryBudget, stopAtHrid);
          sub = resolvedInput.sub;
          entrySupplementalCraftRows.set(String(entry.id), resolvedInput.supplementalRows);
        } else {
          sub = resolveSpecialActionRequirements(actionMeta, runs, craftMode, p, z, materialInventoryBudget);
          entrySupplementalCraftRows.set(String(entry.id), []);
        }
 
        const coinCostPerRun = Math.max(0, Number(actionMeta?.coinCostPerRun || 0) || 0);
        if (coinCostPerRun > 0) {
          bumpBuyMap(sub, '/items/coins', coinCostPerRun * runs, false);
        }
      } else if (craftMode === 'full' || isFromMode(craftMode)) {
        const stopAtHrid = isFromMode(craftMode) ? getFromModeHrid(craftMode) : null;
        const resolvedEntry = resolveFullChainEntryMaterials(entry, p, z, materialInventoryBudget, stopAtHrid);
        sub = resolvedEntry.sub;
        entrySupplementalCraftRows.set(String(entry.id), resolvedEntry.supplementalRows);
      } else {
        sub = resolveTree(itemHrid, targetQty, craftMode, p, z, new Set(), materialInventoryBudget, true);
        entrySupplementalCraftRows.set(String(entry.id), []);
      }
 
      mergeBuyMaps(combined, sub);
    }
 
    // Sort: upgrade-chain items first, then group alphabetically by the last word of the name.
    const sortedEntries = [...combined.entries()].map(([hrid, entry]) => {
      const owned = inventoryCounts.get(hrid) || 0;
      const effectiveOwned = opts.useOwnedInventory ? owned : 0;
      return [hrid, {
        ...entry,
        owned: effectiveOwned,
        missing: Math.max(0, entry.qty - effectiveOwned),
        hasEnough: effectiveOwned >= entry.qty,
      }];
    }).sort((a, b) => {
      if (a[1].hasEnough !== b[1].hasEnough) return a[1].hasEnough ? 1 : -1;
      if (a[1].isUpgradeChain !== b[1].isUpgradeChain) return a[1].isUpgradeChain ? -1 : 1;
      const groupA = getItemNameEn(a[0]).split(' ').pop();
      const groupB = getItemNameEn(b[0]).split(' ').pop();
      return groupA < groupB ? -1 : groupA > groupB ? 1 : 0;
    });
 
    resolvedBuyList = new Map(sortedEntries);
    lastCalcState = currentState;
  }
 
  function getActionMetaForItem(itemHrid) {
    if (!itemHrid) return null;
 
    const specialMeta = getSpecialActionMeta(itemHrid);
    if (specialMeta?.actionHrid) {
      return {
        action: specialMeta.action || null,
        actionHrid: specialMeta.actionHrid,
        outputCount: 1,
      };
    }
 
    const action = productToAction.get(itemHrid);
    if (!action) return null;
 
    const outputs = action.outputItems || action.output_items || [];
    const primaryOut = outputs.find(o => (o.itemHrid || o.item_hrid) === itemHrid) || outputs[0];
    const outputCount = Math.max(1, Number(primaryOut?.count ?? primaryOut?.amount ?? 1) || 1);
    const actionHrid = action.hrid || action.actionHrid || action.action_hrid || null;
 
    return { action, actionHrid, outputCount };
  }
 
  function getFullChainPrecedingCrafts(itemHrid, targetQty, inventoryBudget = null, stopAtHrid = null) {
    const chain = [];
    if (!itemHrid || !targetQty || targetQty <= 0) return chain;
 
    const visited = new Set();
    let currentHrid = itemHrid;
    let neededQty = targetQty;
    let depth = 0;
 
    while (depth < 25) {
      if (visited.has(currentHrid)) break;
      visited.add(currentHrid);
 
      // "From X" applied to the start item itself (alchemy "From Holy"): stop immediately so no
      // predecessor rows are emitted - the alchemy-input anchor is shown on its own.
      if (stopAtHrid && currentHrid === stopAtHrid) break;
 
      const upgradeHrid = upgradeChainMap.get(currentHrid);
      if (!upgradeHrid) break;
 
      const meta = getActionMetaForItem(currentHrid);
      if (!meta) break;
 
      const inputs = meta.action.inputItems || meta.action.input_items || [];
      const upgradeInput = inputs.find(inp => (inp.itemHrid || inp.item_hrid) === upgradeHrid);
      const perCraft = Math.max(1, Number(upgradeInput?.count ?? upgradeInput?.amount ?? 1) || 1);
      const craftRuns = Math.ceil(neededQty / meta.outputCount);
      const requiredQty = perCraft * craftRuns;
      depth += 1;
 
      let availableOwned = 0;
      if (opts.useOwnedInventory) {
        if (inventoryBudget) {
          availableOwned = inventoryBudget.get(upgradeHrid) || 0;
        } else {
          availableOwned = inventoryCounts.get(upgradeHrid) || 0;
        }
      }
 
      const consumedOwned = Math.min(availableOwned, requiredQty);
      const missingQty = Math.max(0, requiredQty - consumedOwned);
 
      if (opts.useOwnedInventory && inventoryBudget) {
        inventoryBudget.set(upgradeHrid, Math.max(0, availableOwned - consumedOwned));
      }
 
      // Bulk upgrade input (perCraft > 1): not a true 1:1 predecessor - stop the
      // chain walk here so it doesn't appear as an upgrade row. The resolver will
      // handle it as a regular material (artisan applies).
      if (perCraft > 1) break;
 
      // "From X" mode: stop BEFORE pushing the stop item.
      // The stop item is still crafted but as a craftable row (via resolveCraftableMaterialNode),
      // not as an upgrade row. Pushing it here then also buying it raw causes double-counting.
      if (stopAtHrid && upgradeHrid === stopAtHrid) break;
 
      if (missingQty > 0) {
        chain.push({
          hrid: upgradeHrid,
          qty: missingQty,
          requiredQty,
          ownedQty: consumedOwned,
          depth,
        });
      }
 
      neededQty = missingQty;
      if (neededQty <= 0) break;
      currentHrid = upgradeHrid;
    }
 
    return chain;
  }
 
  // ═══════════════════════════════════════════════════════════════════
  // MARKET NAVIGATION
  // ═══════════════════════════════════════════════════════════════════
 
  /** Market navigation + buy modal quantity helpers. */
 
  function findQuantityInput(modal) {
    const inputs = Array.from(modal.querySelectorAll('input[type="number"], input[type="text"], input'));
    if (inputs.length === 0) return null;
    if (inputs.length === 1) return inputs[0];
 
    // Labels for quantity and enhancement in both English and Chinese
    const quantityLabels = ['Quantity', '数量'];
    const enhancementLabels = ['Enhancement Level', '强化等级'];
 
    // Handle multi-input modals (e.g. enhancement + quantity).
    const parentDepths = [0, 1, 2, 3];
    for (const depth of parentDepths) {
      for (const input of inputs) {
        let ancestor = input.parentElement;
        let climbed = 0;
        while (ancestor && climbed < depth) {
          ancestor = ancestor.parentElement;
          climbed += 1;
        }
        if (!ancestor) continue;
        const text = ancestor.textContent;
        // Check for quantity label and not enhancement label (any language)
        if (quantityLabels.some(lbl => text.includes(lbl)) && !enhancementLabels.some(lbl => text.includes(lbl))) {
          return input;
        }
      }
    }
 
    // Fallback: exclude inputs whose close ancestors only mention enhancement (any language)
    for (const input of inputs) {
      let parent = input.parentElement;
      let isEnhancement = false;
      for (let j = 0; j < 3 && parent; j++) {
        if (enhancementLabels.some(lbl => parent.textContent.includes(lbl)) && !quantityLabels.some(lbl => parent.textContent.includes(lbl))) {
          isEnhancement = true;
          break;
        }
        parent = parent.parentElement;
      }
      if (!isEnhancement) return input;
    }
 
    // Last fallback: first editable input.
    const generic = inputs.find(input => {
      const type = (input.getAttribute('type') || '').toLowerCase();
      if (type === 'hidden') return false;
      if (input.disabled || input.readOnly) return false;
      return true;
    });
 
    return generic || inputs[0];
  }
 
  /** Open buy modal and schedule quantity fill. */
  function clickPreferredBuyButton(qty) {
    priceStrategyFired = false;  // reset for this new buy flow
    const panel = document.querySelector('[class*="MarketplacePanel"]');
    if (!panel) return;
 
    const buttons = Array.from(panel.querySelectorAll('button'));
    const buyListingBtn = buttons.find(btn => {
      const text = normalizeText(btn.textContent);
      if (text === 'buy listing' || text.includes('buy listing')) return true;
      // Chinese: "新购买挂牌" is the new-buy-listing button; "挂牌" distinguishes it from row buttons
      const zhText = btn.textContent;
      if (zhText.includes('新购买') || zhText.includes('购买挂牌')) return true;
      // Also match if it's inside the newListingButtonsContainer and is a buy-class button
      return false;
    });
 
    const buyNowBtn = buttons.find(btn => {
      const text = normalizeText(btn.textContent);
      if (text === 'buy now') return true;
      // Exclude the buy-listing button we already found
      if (buyListingBtn && btn === buyListingBtn) return false;
      // Exclude the new-listing container buttons (those contain 挂牌)
      if (btn.closest('[class*="newListingButton"]')) return false;
      // Match bare "buy" / "购买" that are inside the action button container (order book rows)
      const zhBuy = btn.textContent.includes('购买') && !btn.textContent.includes('挂');
      return text === 'buy' || zhBuy;
    });
 
    const buyBtn = opts.useBuyListing
      ? (buyListingBtn || buyNowBtn)
      : (buyNowBtn || buyListingBtn);
 
    if (!buyBtn) return;
    buyBtn.click();
    for (const delay of BUY_MODAL_FILL_DELAYS) {
      setTimeout(() => fillBuyModal(qty), delay);
    }
  }
 
  function clickBuyListingToggle(modal) {
    if (!modal) return false;
 
    const clickableEls = Array.from(modal.querySelectorAll('button, [role="button"], [class*="Button"], div, span, a'));
    const listingButton = clickableEls.find(el => {
      const t = normalizeText(el.textContent);
      return t.includes('buy listing') || el.textContent.includes('挂牌') || el.textContent.includes('限价');
    });
    if (!listingButton) return false;
 
    listingButton.click();
    return true;
  }
 
  function clickBestBuyOffer(modal) {
    if (!modal) return false;
 
    const bestPriceEl =
      modal.querySelector('[class*="MarketplacePanel_bestPrice"]') ||
      modal.querySelector('[class*="bestPrice"]');
 
    if (bestPriceEl) {
      const clickable = bestPriceEl.closest('button, [role="button"], div, span') || bestPriceEl;
      clickable.click();
      return true;
    }
 
    const fallback = Array.from(modal.querySelectorAll('span, div')).find(el => {
      const t = normalizeText(el.textContent);
      return t.includes('best buy offer') || el.textContent.includes('最优求购') || el.textContent.includes('最高求购');
    });
    if (!fallback) return false;
 
    fallback.click();
    return true;
  }
 
  function isMarketplaceBuyModal(modal) {
    if (!modal) return false;
    const txt = (modal.textContent || '').toLowerCase();
    // English: "post buy order", "buy now", "buy listing", "best buy offer"
    // Chinese: "发布求购订单", "购买", "挂牌", "最优求购"
    return txt.includes('post buy') || txt.includes('post sell') || txt.includes('best buy offer')
        || txt.includes('buy listing') || txt.includes('sell listing')
        || txt.includes('buy now') || txt.includes('sell now')
        || txt.includes('出售挂牌') || txt.includes('购买挂牌')
        || txt.includes('立即购买') || txt.includes('立即出售')
        || txt.includes('发布出') || txt.includes('发布') || txt.includes('最优求购');
  }
 
  function getMarketplaceBuyModal() {
    const modalCandidates = [
      ...document.querySelectorAll('[class*="Modal_modalContainer"]'),
      ...document.querySelectorAll('[class*="Modal_modal"]')
    ];
 
    return modalCandidates.find(isMarketplaceBuyModal) || null;
  }
 
  /**
   * Click the +/− stepper button inside a modal.
   * Used by applyPriceStrategy for outbid/undercut adjustments.
   */
  function clickPriceStepper(modal, direction) {
    const allButtons = Array.from(modal.querySelectorAll('button'));
    const stepBtn = allButtons.find(btn => {
      const t = btn.textContent.trim();
      return direction === '+' ? t === '+' : (t === '-' || t === '\u2212');
    });
    stepBtn?.click();
  }
 
  /**
   * Apply the buy pricing strategy inside an open Buy Listing modal.
   *
   * 'none'    - do nothing (Buy Listing: game default; Buy Now: already matches)
   * 'match'   - click Best Buy Offer → price = current best bid
   * 'outbid'  - click Best Buy Offer → click "+" → best bid + 1 tick
   * 'undercut'- click Best Buy Offer → click "−" → best bid − 1 tick
   */
  function applyBuyListingPriceStrategy(modal) {
    const strategy = opts.buyPriceStrategy || 'none';
    if (strategy === 'none') return;
 
    const clicked = clickBestBuyOffer(modal);
    if (!clicked || strategy === 'match') return;
 
    // outbid / undercut: wait for price to settle then click the stepper
    setTimeout(() => clickPriceStepper(modal, strategy === 'outbid' ? '+' : '-'), 80);
  }
 
  /**
   * Apply the buy pricing strategy inside an open Buy Now modal.
   *
   * 'none' / 'match' / 'undercut' - do nothing; Buy Now already sits at the
   * best sell price, which IS the match price.
   * Undercutting on a buy order makes no sense.
   * 'outbid' - click "+" once to raise by one tick above the current best sell.
   */
  function applyBuyNowPriceStrategy(modal) {
    if ((opts.buyPriceStrategy || 'none') !== 'outbid') return;
    setTimeout(() => clickPriceStepper(modal, '+'), 80);
  }
 
  /** Fill buy modal quantity and apply pricing strategy when available. */
  function fillBuyModal(qty) {
    const targetQty = toPositiveInt(qty, 0);
    if (!targetQty) return;
 
    let attempts = 0;
    const maxAttempts = 40;
    const timer = setInterval(() => {
      attempts += 1;
 
      const modal = getMarketplaceBuyModal();
      if (!modal) {
        if (attempts >= maxAttempts) clearInterval(timer);
        return;
      }
 
      const header = modal.querySelector('[class*="MarketplacePanel_header"], [class*="header"]');
      const headerText = header?.textContent?.trim() || modal.textContent || '';
 
      if (opts.useBuyListing) {
        // Ensure we're on the Buy Listing tab first.
        if (!headerText.includes('Buy Listing') && !headerText.includes('购买挂牌')) {
          clickBuyListingToggle(modal);
          if (attempts >= maxAttempts) clearInterval(timer);
          return;
        }
        // Apply pricing strategy exactly once across all retry intervals for this buy flow.
        // priceStrategyFired is reset in clickPreferredBuyButton when a new flow starts.
        if (!priceStrategyFired) {
          priceStrategyFired = true;
          applyBuyListingPriceStrategy(modal);
        }
      } else {
        // Buy Now modal - apply once when it first appears.
        if (!priceStrategyFired) {
          priceStrategyFired = true;
          applyBuyNowPriceStrategy(modal);
        }
      }
 
      const input = findQuantityInput(modal);
      if (!input) {
        if (attempts >= maxAttempts) clearInterval(timer);
        return;
      }
 
      setReactInputValue(input, String(targetQty));
      clearInterval(timer);
    }, 150);
  }
 
  function findActionsSearchBox() {
    return (
      document.querySelector('[class*="Action"] input[type="text"]') ||
      document.querySelector('[class*="action"] input[placeholder*="earch" i]') ||
      document.querySelector('[class*="Skills"] input[type="text"]') ||
      null
    );
  }
 
  // ═══════════════════════════════════════════════════════════════════
  // ACTION / PRODUCE INPUT HELPERS
  // ═══════════════════════════════════════════════════════════════════
 
  function findProduceInput(root = document) {
    // Match "Produce" in English or "生产" in Chinese
    const PRODUCE_RE = /produce|生产/i;
 
    const explicitContainer = Array.from(
      root.querySelectorAll('[class*="SkillActionDetail_maxActionCountInput"], [class*="maxActionCountInput"]')
    ).find(el => PRODUCE_RE.test(el.textContent || ''));
 
    if (explicitContainer) {
      const input = explicitContainer.querySelector('input');
      if (input) return input;
    }
 
    const label = Array.from(root.querySelectorAll('div, span, label'))
      .find(el => {
        const t = normalizeText(el.textContent);
        return t === 'produce' || el.textContent.trim() === '生产';
      });
    if (!label) return null;
 
    let parent = label.parentElement;
    for (let depth = 0; depth < 4 && parent; depth++) {
      const input = parent.querySelector('input');
      if (input) return input;
      parent = parent.parentElement;
    }
 
    return null;
  }
 
  function prefillProduceQty(qty) {
    const targetQty = toPositiveInt(qty, 0);
    if (!targetQty) return;
 
    let attempts = 0;
    const maxAttempts = 14;
    const timer = setInterval(() => {
      attempts += 1;
      const input = findProduceInput();
      if (input) {
        setReactInputValue(input, String(targetQty));
        clearInterval(timer);
        return;
      }
      if (attempts >= maxAttempts) clearInterval(timer);
    }, 250);
  }
 
  function getRootFiber() {
    const win = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
    const rootEl = win.document.getElementById('root');
    return rootEl?._reactRootContainer?.current || rootEl?._reactRootContainer?._internalRoot?.current || null;
  }
 
  function getWindowCandidates() {
    const candidates = [];
    if (typeof unsafeWindow !== 'undefined' && unsafeWindow) candidates.push(unsafeWindow);
    candidates.push(window);
    return candidates;
  }
 
  function findNestedObject(root, isMatch, childKeys) {
    if (!root || typeof root !== 'object') return null;
 
    const queue = [root];
    const seen = new Set();
 
    while (queue.length) {
      const current = queue.shift();
      if (!current || typeof current !== 'object' || seen.has(current)) continue;
      seen.add(current);
 
      if (isMatch(current)) return current;
 
      for (const key of childKeys) {
        queue.push(current[key]);
      }
    }
 
    return null;
  }
 
  function findReactFiberData(isMatch, childKeys, resultKey) {
    const rootFiber = getRootFiber();
    if (!rootFiber) return null;
 
    const stack = [rootFiber];
    const visited = new Set();
 
    while (stack.length) {
      const fiber = stack.pop();
      if (!fiber || visited.has(fiber)) continue;
      visited.add(fiber);
 
      const candidates = [fiber.memoizedProps, fiber.memoizedState, fiber.pendingProps, fiber.stateNode];
      for (const candidate of candidates) {
        const match = findNestedObject(candidate, isMatch, childKeys);
        if (match) {
          return { [resultKey]: match, source: 'React fiber state' };
        }
      }
 
      if (fiber.child) stack.push(fiber.child);
      if (fiber.sibling) stack.push(fiber.sibling);
    }
 
    return null;
  }
 
  function getCharacterDataFromReact() {
    return findReactFiberData(
      candidate => !!(
        candidate &&
        typeof candidate === 'object' &&
        (Array.isArray(candidate.characterItems) ||
         Array.isArray(candidate.characterSkills) ||
         candidate.characterHouseRoomMap ||
         candidate.myMarketListings)
      ),
      ['character', 'characterData', 'props', 'state', 'memoizedProps', 'memoizedState'],
      'character'
    );
  }
 
  function getInitClientDataFromReact() {
    return findReactFiberData(
      candidate => !!(
        candidate &&
        typeof candidate === 'object' &&
        ((candidate.itemDetailMap && candidate.actionDetailMap) ||
         (candidate.item_detail_map && candidate.action_detail_map))
      ),
      ['clientData', 'initClientData', 'props', 'state', 'memoizedProps', 'memoizedState', 'data'],
      'data'
    );
  }
 
  function getInitClientData() {
    for (const candidate of getWindowCandidates()) {
      const util = candidate?.localStorageUtil;
      if (typeof util?.getInitClientData !== 'function') continue;
 
      const data = util.getInitClientData();
      if (data && (data.itemDetailMap || data.item_detail_map)) {
        return { data, source: 'localStorageUtil.getInitClientData()' };
      }
    }
 
    return getInitClientDataFromReact();
  }
 
  function getCharacterData(preferFresh = false) {
    if (!preferFresh && latestCharacterData) {
      return { character: latestCharacterData, source: 'cached character data' };
    }
 
    for (const candidate of getWindowCandidates()) {
      const util = candidate?.localStorageUtil;
 
      if (preferFresh && typeof util?.getCharacterData === 'function') {
        const character = util.getCharacterData();
        if (character) return { character, source: 'localStorageUtil.getCharacterData()' };
      }
 
      if (typeof util?.getInitCharacterData === 'function') {
        const character = util.getInitCharacterData();
        if (character) return { character, source: 'localStorageUtil.getInitCharacterData()' };
      }
 
      if (typeof util?.getCharacterData === 'function') {
        const character = util.getCharacterData();
        if (character) return { character, source: 'localStorageUtil.getCharacterData()' };
      }
    }
 
    return getCharacterDataFromReact();
  }
 
  function getGameObject() {
    const rootFiber = getRootFiber();
    if (!rootFiber) return null;
 
    function findByFiberWalk(startFiber) {
      const stack = [startFiber];
      while (stack.length > 0) {
        const current = stack.pop();
        if (!current) continue;
 
        const stateNode = current.stateNode;
        if (stateNode && typeof stateNode.handleGoToMarketplace === 'function') {
          return stateNode;
        }
 
        if (current.sibling) stack.push(current.sibling);
        if (current.child) stack.push(current.child);
      }
      return null;
    }
 
    return findByFiberWalk(rootFiber);
  }
 
  function navigateToAction(itemHrid, qty) {
    if (!itemHrid) return;
 
    const meta = getActionMetaForItem(itemHrid);
    const actionHrid = meta?.actionHrid || null;
    const gameObj = getGameObject();
 
    if (gameObj && typeof gameObj === 'object') {
      const methodNames = [
        'handleGoToAction',
        'handleGoToActions',
        'handleGoToSkillingAction',
      ];
 
      for (const methodName of methodNames) {
        const fn = gameObj[methodName];
        if (typeof fn !== 'function') continue;
 
        const argSets = [
          [actionHrid],
          [actionHrid, 0],
          [itemHrid],
          [itemHrid, 0],
        ];
 
        for (const args of argSets) {
          if (!args[0]) continue;
          try {
            fn.apply(gameObj, args);
            prefillProduceQty(qty);
            return;
          } catch (_) {}
        }
      }
    }
 
    const navButtons = Array.from(document.querySelectorAll('div[class*="NavigationBar_nav"], button, a'));
    let actionBtn = navButtons.find(el => {
      const svg = el.querySelector('svg[aria-label]');
      return /action/i.test(svg?.getAttribute('aria-label') || '');
    });
 
    if (!actionBtn) {
      actionBtn = navButtons.find(el => {
        const t = el.textContent?.trim().toLowerCase();
        return t === 'actions' || t === 'action';
      });
    }
 
    actionBtn?.click();
 
    setTimeout(() => {
      const searchBox = findActionsSearchBox();
      if (searchBox) setReactInputValue(searchBox, getItemName(itemHrid));
      prefillProduceQty(qty);
    }, 450);
  }
 
  function navigateToTaskBoard() {
    // Try React game object first
    const gameObj = getGameObject();
    if (gameObj) {
      const methodNames = ['handleGoToTasks', 'handleGoToQuests', 'handleGoToTask', 'handleGoToRandomTasks'];
      for (const m of methodNames) {
        if (typeof gameObj[m] === 'function') {
          try { gameObj[m](); return; } catch (_) {}
        }
      }
    }
 
    // Fall back to clicking the nav button by aria-label or text
    const navCandidates = Array.from(document.querySelectorAll(
      'button, a, [class*="NavigationBar"] > *, [class*="navItem"], [class*="nav-item"]'
    ));
    const taskBtn = navCandidates.find(el => {
      const label = el.querySelector('svg[aria-label]')?.getAttribute('aria-label') || '';
      const text  = el.textContent?.trim().toLowerCase() || '';
      return /task/i.test(label) || text === 'tasks' || text === 'task';
    });
    taskBtn?.click();
  }
 
  function navigateToMarket(itemHrid, qty) {
    currentMarketItemHrid = itemHrid || null;
 
    // 1. Try the React game object's internal navigation (most reliable).
    if (itemHrid) {
      const gameObj = getGameObject();
      if (gameObj?.handleGoToMarketplace) {
        gameObj.handleGoToMarketplace(itemHrid, 0);
        if (qty) setTimeout(() => clickPreferredBuyButton(qty), 800);
        return;
      }
    }
 
    const name = itemHrid ? getItemName(itemHrid) : '';
 
    // 2. Fallback: click the marketplace nav button by SVG aria-label or text content.
    const navButtons = Array.from(document.querySelectorAll('div[class*="NavigationBar_nav"], button, a'));
    let marketBtn = navButtons.find(el => el.querySelector('svg[aria-label="navigationBar.marketplace"]'));
 
    if (!marketBtn) {
      marketBtn = navButtons.find(el => {
        const t = el.textContent?.trim().toLowerCase();
        return t === 'market' || t === 'marketplace';
      });
    }
 
    if (marketBtn) {
      marketBtn.click();
    } else {
      const navLinks = document.querySelectorAll(
        '[class*="NavigationTab"], [class*="nav-tab"], [class*="navTab"], [class*="SideNav"] a, [class*="sidebar"] a'
      );
      for (const link of navLinks) {
        if (link.textContent.trim().toLowerCase().includes('market')) {
          link.click();
          break;
        }
      }
    }
 
    // 3. After navigation settles, fill the search box, then click the first buy button.
    if (!name) return;
    setTimeout(() => {
      const searchBox = findMarketSearchBox();
      if (searchBox) setReactInputValue(searchBox, name);
      if (qty) setTimeout(() => clickPreferredBuyButton(qty), 800);
    }, 400);
  }
 
  function findMarketSearchBox() {
    return (
      document.querySelector('input[class*="Search"][class*="input" i]')         ||
      document.querySelector('input[class*="search"][placeholder*="earch"]')     ||
      // Chinese UI: placeholder is "物品搜索" (item search)
      document.querySelector('input[placeholder*="搜索"]')                       ||
      document.querySelector('[class*="Marketplace"] input[type="search"]')      ||
      document.querySelector('[class*="Marketplace"] input[type="text"]')        ||
      document.querySelector('[class*="marketplace"] input[type="text"]')        ||
      null
    );
  }
 
  /** Set input value in a React-safe way. */
  function setReactInputValue(input, value) {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    if (setter) setter.call(input, value);
    input.dispatchEvent(new Event('input',  { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }
 
  // ═══════════════════════════════════════════════════════════════════
  // POST BUY ORDER INTERCEPT
  // ═══════════════════════════════════════════════════════════════════
 
  /** Get currently selected marketplace item HRID. */
  function getMarketplaceSelectedItemHrid() {
    if (currentMarketItemHrid) return currentMarketItemHrid;
 
    const panel = document.querySelector('[class*="MarketplacePanel"]');
    if (!panel) return null;
 
    const candidates = Array.from(
      panel.querySelectorAll('[class*="selected" i], [class*="active" i]')
    );
    for (const el of candidates) {
      const text = el.textContent.trim();
      const hrid = getItemHrid(text);
      if (hrid && resolvedBuyList.has(hrid)) return hrid;
    }
    return null;
  }
 
  /**
   * Increment the owned count for `hrid` by `qty`, update the in-memory
   * state and patch the DOM without triggering a full re-render.
   */
  function applyBuyIncrement(hrid, qty) {
    if (!hrid || qty <= 0) return;
 
    const prev = inventoryCounts.get(hrid) || 0;
    const next = prev + qty;
    inventoryCounts.set(hrid, next);
 
    // Keep snapshot in sync so the next updateBuyList() detects no change
    // from the inventory side (the cache key already changed via lastCalcState='').
    inventorySnapshot = JSON.stringify(
      [...inventoryCounts.entries()].sort((a, b) => a[0].localeCompare(b[0]))
    );
 
    // Invalidate cached buy-list.
    lastCalcState = '';
 
    // Update visible counts immediately.
    const entry = resolvedBuyList.get(hrid);
    if (entry) {
      entry.owned = next;
      entry.missing = Math.max(0, entry.qty - next);
      entry.hasEnough = next >= entry.qty;
      updateBuyQtyDOM(hrid);
    }
  }
 
  /** Updates the qty spans and colour class for `hrid` in both the panel and pinned bar. */
  function updateBuyQtyDOM(hrid) {
    const entry = resolvedBuyList.get(hrid);
    if (!entry) return;
 
    const { owned, qty, hasEnough } = entry;
    const cls = hasEnough ? 'enough' : 'missing';
    const escaped = CSS.escape(hrid);
 
    // Floating panel row
    const panelRow = document.querySelector(`.ShoppingList-buy-row[data-hrid="${escaped}"]`);
    if (panelRow) {
      const span = panelRow.querySelector('.ShoppingList-buy-qty');
      if (span) {
        span.textContent = `${owned} / ${qty}`;
        span.className = `ShoppingList-buy-qty ${cls}`;
      }
    }
 
    // Market pinned bar chip
    const chip = document.querySelector(`.ShoppingList-chip[data-hrid="${escaped}"]`);
    if (chip) {
      const span = chip.querySelector('.ShoppingList-chip-qty');
      if (span) {
        span.textContent = `${owned}/${qty}`;
        span.className = `ShoppingList-chip-qty ${cls}`;
      }
    }
  }
 
  function patchInlineChainRowsOnly() {
    const entriesRoot = panel?.querySelector('#ShoppingList-entries');
    if (!entriesRoot) return false;
 
    const wraps = Array.from(entriesRoot.querySelectorAll('.ShoppingList-entry-wrap'));
    if (wraps.length !== shoppingList.length) return false;
 
    const inlineInventoryBudget = new Map(inventoryCounts);
 
    for (let i = 0; i < shoppingList.length; i += 1) {
      const entry = shoppingList[i];
      const wrap = wraps[i];
      if (!entry || !wrap) return false;
 
      const qtyInput = wrap.querySelector('.ShoppingList-inp-qty');
      if (!qtyInput) return false;
      const targetValue = String(entry.targetQty || 1);
      if (qtyInput.value !== targetValue) qtyInput.value = targetValue;
 
      const topActionBtn = wrap.querySelector('.ShoppingList-btn-action');
      if (topActionBtn) {
        topActionBtn.dataset.actionQty = targetValue;
      }
 
      const expectedSteps = getInlineCraftRowsForEntry(entry, inlineInventoryBudget);
 
      const chainContainer = wrap.querySelector('.ShoppingList-inline-chain');
      const rows = chainContainer
        ? Array.from(chainContainer.querySelectorAll('.ShoppingList-goal-row.is-sub'))
        : [];
 
      if (rows.length !== expectedSteps.length) return false;
 
      for (let j = 0; j < expectedSteps.length; j += 1) {
        const row = rows[j];
        const step = expectedSteps[j];
        if (!row || !step) return false;
        if ((row.dataset.itemHrid || '') !== step.hrid) return false;
        if ((row.dataset.rowType || 'upgrade') !== (step.rowType || 'upgrade')) return false;
 
        row.dataset.depth = String(step.depth);
        row.style.setProperty('--sl-depth', String(step.depth));
 
        const qtyEl = row.querySelector('.ShoppingList-goal-qty');
        const actionBtn = row.querySelector('.ShoppingList-goal-action-btn');
        if (!qtyEl || !actionBtn) return false;
 
        qtyEl.textContent = `x${step.qty}`;
        actionBtn.dataset.actionQty = String(step.qty);
      }
    }
 
    return true;
  }
 
  function patchMaterialRowsOnly() {
    const buyListContainer = panel?.querySelector('#ShoppingList-buy-list');
 
    if (resolvedBuyList.size === 0) {
      return !buyListContainer || buyListContainer.children.length === 0;
    }
 
    if (!buyListContainer) return false;
 
    const existingRows = Array.from(buyListContainer.querySelectorAll('.ShoppingList-buy-row'));
    if (existingRows.length !== resolvedBuyList.size) return false;
 
    const rowByHrid = new Map(existingRows.map(row => [row.dataset.hrid, row]));
    const orderedRows = [];
 
    for (const [hrid, entry] of resolvedBuyList.entries()) {
      const row = rowByHrid.get(hrid);
      if (!row) return false;
 
      row.dataset.qty = String(entry.missing);
 
      const qtyEl = row.querySelector('.ShoppingList-buy-qty');
      if (!qtyEl) return false;
 
      qtyEl.textContent = `${entry.owned} / ${entry.qty}`;
      qtyEl.className = `ShoppingList-buy-qty ${entry.hasEnough ? 'enough' : 'missing'}`;
      orderedRows.push(row);
    }
 
    for (const row of orderedRows) buyListContainer.appendChild(row);
    return true;
  }
 
  function patchPinnedBarQuantitiesOnly() {
    if (!document.querySelector('[class*="MarketplacePanel"]')) return true;
    if (!pinnedBar?.isConnected) return false;
 
    if (resolvedBuyList.size === 0) return false;
 
    const chipsContainer = pinnedBar.querySelector('.ShoppingList-chips');
    if (!chipsContainer) return false;
 
    const existingChips = Array.from(chipsContainer.querySelectorAll('.ShoppingList-chip'));
    if (existingChips.length !== resolvedBuyList.size) return false;
 
    const chipByHrid = new Map(existingChips.map(chip => [chip.dataset.hrid, chip]));
    const orderedChips = [];
 
    for (const [hrid, entry] of resolvedBuyList.entries()) {
      const chip = chipByHrid.get(hrid);
      if (!chip) return false;
 
      chip.dataset.qty = String(entry.missing);
 
      const qtyEl = chip.querySelector('.ShoppingList-chip-qty');
      if (!qtyEl) return false;
 
      qtyEl.textContent = `${entry.owned}/${entry.qty}`;
      qtyEl.className = `ShoppingList-chip-qty ${entry.hasEnough ? 'enough' : 'missing'}`;
      orderedChips.push(chip);
    }
 
    for (const chip of orderedChips) chipsContainer.appendChild(chip);
    return true;
  }
 
  function patchInventoryDrivenViews() {
    updateBuyList();
 
    // Tasks panel: the socket handler explicitly calls refreshTasksTabDOM() after
    // updating cachedTasks, so we just signal "patched" here to prevent a full remount.
    if (tasksOpen) return true;
 
    const panelPatched = patchInlineChainRowsOnly() && patchMaterialRowsOnly();
    if (!panelPatched) return false;
 
    if (document.querySelector('[class*="MarketplacePanel"]')) {
      return patchPinnedBarQuantitiesOnly();
    }
 
    return true;
  }
 
  function sortInlineCraftRows(rows) {
    if (!Array.isArray(rows) || rows.length <= 1) return Array.isArray(rows) ? rows : [];
 
    const rowTypePriority = {
      'alchemy-input': 0,
      craftable: 1,
      upgrade: 2,
    };
 
    return rows
      .map((row, index) => ({ row, index }))
      .sort((a, b) => {
        const depthA = Math.max(1, Number(a.row?.depth) || 1);
        const depthB = Math.max(1, Number(b.row?.depth) || 1);
        if (depthA !== depthB) return depthA - depthB;
 
        const typeA = rowTypePriority[a.row?.rowType] ?? 99;
        const typeB = rowTypePriority[b.row?.rowType] ?? 99;
        if (typeA !== typeB) return typeA - typeB;
 
        return a.index - b.index;
      })
      .map(entry => entry.row);
  }
 
  function getInlineCraftRowsForEntry(entry, inlineInventoryBudget) {
    const isFullOrFrom = entry.craftMode === 'full' || isFromMode(entry.craftMode);
    if (!entry || !isFullOrFrom || !entry.itemHrid || entry.targetQty <= 0) return [];
 
    const stopAtHrid = isFromMode(entry.craftMode) ? getFromModeHrid(entry.craftMode) : null;
 
    const specialMeta = getSpecialActionMeta(entry.itemHrid);
    const hasSpecialInput = Boolean(specialMeta?.inputHrid);
 
    const effectiveItemHrid = hasSpecialInput ? specialMeta.inputHrid : entry.itemHrid;
    const effectiveTargetQty = hasSpecialInput
      ? Math.max(1, Number(specialMeta.inputQty || 1) || 1) * entry.targetQty
      : entry.targetQty;
 
    if (!effectiveItemHrid || effectiveTargetQty <= 0) return [];
 
    const depthOffset = hasSpecialInput ? 1 : 0;
 
    const upgradeRows = getFullChainPrecedingCrafts(effectiveItemHrid, effectiveTargetQty, inlineInventoryBudget, stopAtHrid)
      .map(step => ({
        hrid: step.hrid,
        qty: step.qty,
        depth: step.depth + depthOffset,
        rowType: 'upgrade',
      }));
 
    const seenCraftableKeys = new Set();
 
    const supplementalRows = (entrySupplementalCraftRows.get(String(entry.id)) || [])
      .filter(step => step && step.hrid && step.qty > 0)
      .map(step => ({
        hrid: step.hrid,
        qty: Number(step.qty || 0),
        depth: Math.max(1, Number(step.depth) || 1) + depthOffset,
        rowType: 'craftable',
      }))
      .filter(step => {
        // The resolver can emit the same visible row more than once when two passes reach an identical node.
        // Deduplicate by hrid only. The same item can appear at multiple depths
        // when it is needed by both a deep chain (e.g. Holy Gauntlets -> ... -> Azure)
        // AND a shallower material (e.g. Pincer Gloves -> Azure). Rows are in DFS
        // order so the first occurrence is always the deepest / most correct position.
        const key = step.hrid;
        if (seenCraftableKeys.has(key)) return false;
        seenCraftableKeys.add(key);
        return true;
      });
 
    // Once a branch is expanded into craftable rows, keep its anchor and hide the redundant flat descendants.
    const expandedUpgradeRoots = upgradeRows.filter(root =>
      supplementalRows.some(step => step.depth > root.depth && upgradePathIncludes(root.hrid, step.hrid))
    );
 
    const visibleUpgradeRows = upgradeRows.filter(step =>
      !expandedUpgradeRoots.some(root => root.hrid !== step.hrid && upgradePathIncludes(root.hrid, step.hrid))
    );
 
    const actionInputAnchor = hasSpecialInput
      ? [{
        hrid: effectiveItemHrid,
        qty: effectiveTargetQty,
        depth: 1,
        rowType: 'alchemy-input',
      }]
      : [];
 
    // Interleave upgrade rows and supplemental rows in DFS order:
    // each supplemental row is inserted immediately after the upgrade row at (depth - 1).
    // This ensures Beast Leather appears right after Beast Tunic, not at the end.
    const combinedRows = [...actionInputAnchor];
 
    // Build a lookup: parentDepth → supplemental rows that belong at parentDepth+1
    // A supplemental row belongs under the deepest upgrade row whose depth < this row's depth.
    // We process upgrade rows in order and attach supplementals that fit after each one.
    const pendingSupplementals = [...supplementalRows]; // already DFS-ordered within their own group
 
    for (let i = 0; i < visibleUpgradeRows.length; i++) {
      const upgradeRow = visibleUpgradeRows[i];
      combinedRows.push(upgradeRow);
 
      // The next upgrade row's depth tells us when we've "closed" this branch.
      // Insert all supplementals whose depth > upgradeRow.depth and <= nextUpgradeDepth (or end).
      const nextUpgradeDepth = visibleUpgradeRows[i + 1]?.depth ?? Infinity;
      let j = 0;
      while (j < pendingSupplementals.length) {
        const sup = pendingSupplementals[j];
        if (sup.depth > upgradeRow.depth && sup.depth > nextUpgradeDepth - 1) {
          // This supplemental belongs deeper than the next upgrade — defer it
          j++;
          continue;
        }
        if (sup.depth > upgradeRow.depth) {
          combinedRows.push(sup);
          pendingSupplementals.splice(j, 1);
          // Don't increment j — re-check same index
        } else {
          j++;
        }
      }
    }
 
    // Append any remaining supplementals (e.g. non-upgrade-attached craftables)
    combinedRows.push(...pendingSupplementals);
 
    if (combinedRows.length <= 1) return combinedRows;
 
    const groupedRows = new Map();
    const orderedKeys = [];
 
    for (const step of combinedRows) {
      if (!step?.hrid || !step?.rowType) continue;
 
      const key = `${step.rowType}|${step.hrid}`;
      if (!groupedRows.has(key)) {
        groupedRows.set(key, {
          hrid: step.hrid,
          qty: 0,
          depth: Math.max(1, Number(step.depth) || 1),
          rowType: step.rowType,
        });
        orderedKeys.push(key);
      }
 
      const grouped = groupedRows.get(key);
      grouped.qty += Number(step.qty || 0);
      grouped.depth = Math.max(grouped.depth, Math.max(1, Number(step.depth) || 1));
    }
 
    return orderedKeys
      .map(key => groupedRows.get(key))
      .filter(step => step && step.qty > 0);
  }
 
  function buildEntriesHTML() {
    const inlineInventoryBudget = new Map(inventoryCounts);
 
    return shoppingList.map((entry, i) => {
      const val = entry.rawName !== undefined ? entry.rawName : (entry.itemHrid ? getItemName(entry.itemHrid) : '');
      const isTransmuteEntry = getSpecialActionMeta(entry.itemHrid)?.kind === 'transmute';
      const inlineRows = getInlineCraftRowsForEntry(entry, inlineInventoryBudget);
      const inlineChainRows = inlineRows.length
        ? inlineRows.map(step => `
            <div class="ShoppingList-goal-row is-sub" data-row-type="${step.rowType}" data-item-hrid="${step.hrid}" data-depth="${step.depth}" style="--sl-depth:${step.depth};">
              <span class="ShoppingList-goal-name">↳ ${itemSpriteHTML(step.hrid, 'ShoppingList-goal-icon')}${esc(getItemName(step.hrid))}</span>
              <span class="ShoppingList-goal-qty">x${step.qty}</span>
              <div class="ShoppingList-goal-actions">
                <button class="ShoppingList-goal-action-btn" data-item-hrid="${step.hrid}" data-action-qty="${step.qty}" title="${sl('actionTitle')}">${sl('actionBtn')}</button>
                <button class="ShoppingList-goal-market-btn" data-item-hrid="${step.hrid}" title="${sl('marketTitle')}">🏪</button>
              </div>
            </div>`).join('')
        : '';
 
      return `
        <div class="ShoppingList-entry-wrap" data-index="${i}">
          <div class="ShoppingList-entry" data-index="${i}">
            ${itemSpriteHTML(entry.itemHrid, 'ShoppingList-entry-icon')}
            <input class="ShoppingList-inp ShoppingList-inp-name" type="text"
                   id="ShoppingList-entry-name-${entry.id || i}"
                   name="ShoppingList-entry-name-${entry.id || i}"
                   list="ShoppingList-names"
                   placeholder="Item name…"
                   value="${esc(val)}"
                   autocomplete="off"
                   data-index="${i}" />
            ${isTransmuteEntry
              ? '<span class="ShoppingList-entry-warn" title="Transmute coin costs are currently not calculated">⚠</span>'
              : ''}
                 <input class="ShoppingList-inp ShoppingList-inp-qty" type="text"
                   id="ShoppingList-entry-qty-${entry.id || i}"
                   name="ShoppingList-entry-qty-${entry.id || i}"
                   value="${entry.targetQty || 1}"
                   inputmode="numeric" pattern="[0-9]*"
                   data-index="${i}" />
                 <select class="ShoppingList-inp ShoppingList-sel-mode"
                    id="ShoppingList-entry-mode-${entry.id || i}"
                    name="ShoppingList-entry-mode-${entry.id || i}"
                    data-index="${i}">
              <option value="direct" ${entry.craftMode === 'direct' ? 'selected' : ''}>${sl('modeDirect')}</option>
              ${(() => {
                if (!entry.itemHrid) return '';
                // For alchemy entries (Coinify/Decompose/Transmute), the From chain is derived
                // from the input item (e.g. Holy Shears), and the input item itself is also
                // offered as the first From option ("From Holy" = craft only the input item).
                const specialMeta = getSpecialActionMeta(entry.itemHrid);
                const baseHrid = specialMeta?.inputHrid || entry.itemHrid;
                const chain = getUpgradeChainItems(baseHrid);
 
                // For alchemy: prepend the input item itself so the user can stop at "From Holy"
                const fromHrids = specialMeta?.inputHrid
                  ? [specialMeta.inputHrid, ...chain.filter(h => upgradeChainMap.has(h))]
                  : chain.filter(h => upgradeChainMap.has(h));
 
                return fromHrids.map(hrid => {
                  const prefix = getItemFirstWord(hrid);
                  const val = `from:${hrid}`;
                  return `<option value="${val}" ${entry.craftMode === val ? 'selected' : ''}>${sl('modeFrom')} ${esc(prefix)}</option>`;
                }).join('');
              })()}
              <option value="full"   ${entry.craftMode === 'full' ? 'selected' : ''}>${sl('modeFull')}</option>
            </select>
            <div class="ShoppingList-goal-actions">
            <button class="ShoppingList-btn-action" data-item-hrid="${entry.itemHrid || ''}" data-entry-id="${entry.id || ''}" data-action-qty="${entry.targetQty || 1}" ${entry.itemHrid ? '' : 'disabled'} title="${sl('actionTitle')}">${sl('actionBtn')}</button>
            <button class="ShoppingList-btn-x" data-index="${i}" title="${sl('removeTitle')}">✕</button>
            </div>
          </div>
          ${inlineChainRows ? `<div class="ShoppingList-inline-chain">${inlineChainRows}</div>` : ''}
        </div>`;
    }).join('');
  }
 
  function buildMaterialListHTML() {
    if (resolvedBuyList.size <= 0) return '';
 
    const rows = [...resolvedBuyList.entries()].map(([hrid, { qty, owned, missing, hasEnough, isUpgradeChain }]) => {
      const tags = [
        isUpgradeChain ? `<span class="ShoppingList-tag upg" title="${sl('tagUpgradeTitle')}">${sl('tagUpgrade')}</span>` : '',
      ].filter(Boolean).join('');
      return `
          <div class="ShoppingList-buy-row" data-hrid="${hrid}" data-qty="${missing}" title="Click to open in market">
            ${itemSpriteHTML(hrid, 'ShoppingList-buy-icon')}
            <span class="ShoppingList-buy-name">${esc(getItemName(hrid))}</span>
            ${tags}
            <span class="ShoppingList-buy-qty ${hasEnough ? 'enough' : 'missing'}">${owned} / ${qty}</span>
            <span class="ShoppingList-buy-mkt">🏪</span>
          </div>`;
    }).join('');
 
    return `
      <div id="ShoppingList-material-section">
        <div class="ShoppingList-divider"></div>
        <div class="ShoppingList-section-label">${sl('materialList')}</div>
        <div id="ShoppingList-buy-list">${rows}</div>
      </div>`;
  }
 
  function refreshPanelForModeChange() {
    if (!panelVisible || !panel?.isConnected) {
      scheduleRender();
      return;
    }
 
    // Settings is always in the right panel now — no tab-switch remount needed.
    // Just update the list content.
    updateBuyList();
 
    const entriesRoot = panel.querySelector('#ShoppingList-entries');
    if (entriesRoot) {
      entriesRoot.innerHTML = buildEntriesHTML();
    }
 
    const body = panel.querySelector('#ShoppingList-body');
    if (body) {
      const existingSection = body.querySelector('#ShoppingList-material-section');
      const nextMaterialHTML = buildMaterialListHTML().trim();
 
      if (nextMaterialHTML) {
        if (existingSection) {
          existingSection.outerHTML = nextMaterialHTML;
        } else {
          const actionRow = body.querySelector('.ShoppingList-action-row');
          if (actionRow) {
            actionRow.insertAdjacentHTML('afterend', nextMaterialHTML);
          }
        }
      } else if (existingSection) {
        existingSection.remove();
      }
    }
 
    if (document.querySelector('[class*="MarketplacePanel"]')) {
      if (!patchPinnedBarQuantitiesOnly()) renderMarketPins();
    }
  }
 
  /**
   * Attaches a document-level capture listener that intercepts clicks on
   * the "Post Buy Order" button, reads the quantity from the modal input,
   * and applies the increment to inventoryCounts + DOM after the click.
   */
  function installBuyInterceptor() {
    document.addEventListener('click', e => {
      const btn = e.target.closest('button');
      if(!btn) return;
      const _btnText = btn.textContent.trim();
      if (_btnText !== 'Post Buy Order' && _btnText !== '发布求购订单' && !_btnText.includes('发布')) return;
 
      const modal = document.querySelector('[class*="Modal_modalContainer"]');
      if (!modal) return;
 
      const qtyInput = findQuantityInput(modal);
      const qty = toPositiveInt(qtyInput?.value, 0);
      if (qty <= 0) return;
 
      const hrid = getMarketplaceSelectedItemHrid();
      if (!hrid) return;
 
      // Defer so the buy order is submitted before we update counts.
      setTimeout(() => applyBuyIncrement(hrid, qty), 0);
    }, true /* capture */);
  }
 
  // ═══════════════════════════════════════════════════════════════════
  // MARKET PAGE PINNED BAR
  // ═══════════════════════════════════════════════════════════════════
 
  let pinnedBar = null;
 
  function renderMarketPins() {
    if (pinnedBar?.isConnected) pinnedBar.remove();
    pinnedBar = null;
 
    updateBuyList();
    const buyList = resolvedBuyList;
    if (buyList.size === 0) return;
 
    // Find a good insertion point inside the marketplace panel
    const container =
      document.querySelector('[class*="MarketplacePanel"] [class*="ItemList"]') ||
      document.querySelector('[class*="MarketplacePanel"] [class*="itemList"]') ||
      document.querySelector('[class*="MarketplacePanel"] [class*="content"]')  ||
      document.querySelector('[class*="Marketplace"][class*="Panel"]')           ||
      null;
    if (!container) return;
 
    pinnedBar = document.createElement('div');
    pinnedBar.id = 'ShoppingList-pins';
 
    const chips = [...buyList.entries()].map(([hrid, { qty, owned, missing, hasEnough, isUpgradeChain, isTea }]) => {
      const badge = isTea ? '🍵' : isUpgradeChain ? '⬆' : '';
      return `<div class="ShoppingList-chip" data-hrid="${hrid}" data-qty="${missing}" title="Click to open in market with qty pre-filled">
        ${badge ? `<span class="ShoppingList-chip-badge">${badge}</span>` : ''}
        ${itemSpriteHTML(hrid, 'ShoppingList-chip-icon')}
        <span class="ShoppingList-chip-name">${getItemName(hrid)}</span>
        <span class="ShoppingList-chip-qty ${hasEnough ? 'enough' : 'missing'}">${owned}/${qty}</span>
      </div>`;
    }).join('');
 
    pinnedBar.innerHTML = `
      <div class="ShoppingList-pins-header" style="position:relative;text-align:center;">
        <span style="display:inline-block;">📋 Shopping List</span>
        <button id="ShoppingList-pins-toggle" title="Collapse/Expand" style="position:absolute;right:0;top:50%;transform:translateY(-50%);background:none;border:none;color:#7070bb;font-size:16px;cursor:pointer;padding:0 4px;">▼</button>
      </div>
      <div class="ShoppingList-chips">${chips}</div>
    `;
 
    const chipsContainer = pinnedBar.querySelector('.ShoppingList-chips');
    let collapsed = false;
    const toggleBtn = pinnedBar.querySelector('#ShoppingList-pins-toggle');
    toggleBtn.addEventListener('click', () => {
      collapsed = !collapsed;
      chipsContainer.style.display = collapsed ? 'none' : 'flex';
      toggleBtn.textContent = collapsed ? '▲' : '▼';
    });
 
    pinnedBar.querySelectorAll('.ShoppingList-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        navigateToMarket(chip.dataset.hrid, parseInt(chip.dataset.qty, 10) || null);
      });
    });
 
    container.insertBefore(pinnedBar, container.firstChild);
  }
 
  // ═══════════════════════════════════════════════════════════════════
  // FLOATING PANEL - HTML TEMPLATE
  // ═══════════════════════════════════════════════════════════════════
 
  function buildListTabHTML() {
    updateBuyList();
    const entriesHTML    = buildEntriesHTML();
    const materialListHTML = buildMaterialListHTML();
    // Datalist always includes both English and Chinese names so users can type either.
    // Chinese names appear first when in zh mode (better autocomplete UX).
    const _dlNames = new Set([
      ...(langState.lang === 'zh' ? Object.values(itemHridToZhName) : Object.values(itemHridToName)),
      ...Object.values(itemHridToName),
      ...Object.values(itemHridToZhName),
      ...specialActionKeyToLabel.values(),
    ]);
    const datalistOpts = [..._dlNames].map(n => `<option value="${esc(n)}">`).join('');
 
    return `
      <datalist id="ShoppingList-names">${datalistOpts}</datalist>
      <div class="ShoppingList-section-label" style="margin-top:6px">${sl('itemsToCraft')}</div>
      <div id="ShoppingList-entries">${entriesHTML}</div>
      <div class="ShoppingList-action-row">
        <button id="ShoppingList-btn-add" class="ShoppingList-action-btn">${sl('addItem')}</button>
        <button id="ShoppingList-btn-clear" class="ShoppingList-action-btn" style="border-color: #7a3a3a; color: #e07070;" title="${sl('clearAllTitle')}">${sl('clearAll')}</button>
        <button id="ShoppingList-btn-market" class="ShoppingList-action-btn">${sl('goToMarket')}</button>
      </div>
      ${materialListHTML}`;
  }
 
  function buildTasksTabHTML() {
    const tasks = parseTasksFromDOM(); // updates cachedTasks, falls back to cache
    const url = resolveSpriteUrl();
    const taskTokenIcon = url
      ? `<svg width="18" height="18" viewBox="0 0 64 64" style="vertical-align:middle;margin-right:4px"><use href="${url}#task_token"></use></svg>`
      : '';
 
    if (tasks.length === 0) {
      return `
        <div id="ShoppingList-tasks-sidepanel-body">
          <div class="ShoppingList-tasks-empty">
            ${taskTokenIcon}
            <p>${sl('noTasks')}</p>
            <button id="ShoppingList-btn-goto-tasks-empty" style="margin-top:8px;padding:5px 12px;background:#1e2a4a;border:1px solid #4a4a8a;border-radius:5px;color:#a0a0ee;cursor:pointer;font-size:12px">
              ${sl('openTaskBoard')}
            </button>
          </div>
        </div>`;
    }
 
    const rows = tasks.map(task => {
      const { done, total, remaining, itemHrid, itemName, skill } = task;
      const pct = total > 0 ? Math.round((done / total) * 100) : 0;
      const alreadyAdded = shoppingList.some(e => e.itemHrid === itemHrid);
      const isComplete = task.isComplete ?? (remaining <= 0 && total > 0);
 
      // Claim button: always shown when complete; click handler resolves at runtime
      const claimHTML = isComplete
        ? `<button class="ShoppingList-task-claim-btn ShoppingList-tooltip-add-btn" data-item-hrid="${itemHrid}" title="${sl('claimTitle')}" style="background:#1a3a1a;border-color:#3a7a3a;color:#80e080;">${sl('summaryClaim')}</button>`
        : '';
 
      // Show skill name in current language, robust to case/whitespace
      let skillLabel = skill;
      if (langState.lang === 'zh' && typeof skill === 'string') {
        const normSkill = skill.trim().toLowerCase();
        // Try direct, then normalized lookup
        let zhSkill = skillEnToZhName[skill] || skillEnToZhName[normSkill];
        if (!zhSkill && window.skillEnToZhName) {
          zhSkill = window.skillEnToZhName[skill] || window.skillEnToZhName[normSkill];
        }
        if (zhSkill) {
          skillLabel = zhSkill;
        }
      }
      return `
        <div class="ShoppingList-task-row" data-item-hrid="${itemHrid}">
          ${itemSpriteHTML(itemHrid, 'ShoppingList-task-icon')}
          <div class="ShoppingList-task-info">
            <div class="ShoppingList-task-name">${getItemName(itemHrid)}</div>
            <div class="ShoppingList-task-skill">${esc(skillLabel)}</div>
            <div class="ShoppingList-task-progress-bar">
              <div class="ShoppingList-task-progress-fill" style="width:${pct}%"></div>
            </div>
            <div class="ShoppingList-task-progress-label">${done} / ${total} (${sl('remaining')} ${remaining})</div>
          </div>
          <div class="ShoppingList-task-btns">
            <button class="ShoppingList-task-action-btn ShoppingList-goal-action-btn"
              data-item-hrid="${itemHrid}"
              data-action-qty="${remaining}"
              title="${sl('actionTitle')}"
              ${!itemHrid ? 'disabled' : ''}>${sl('actionBtn')}</button>
            <button class="ShoppingList-task-row-add ShoppingList-tooltip-add-btn"
              data-item-hrid="${itemHrid}"
              data-remaining="${remaining}"
              ${alreadyAdded || isComplete ? 'disabled' : ''}>
              ${alreadyAdded || isComplete ? '✓' : '＋'}
            </button>
            ${claimHTML}
          </div>
        </div>`;
    }).join('');
 
    return `
      <div id="ShoppingList-tasks-sidepanel-body">
        <div class="ShoppingList-section-label" style="margin-top:6px">${sl('prodTasks')}</div>
        ${rows}
      </div>`;
  }
 
  function buildSettingsTabHTML(isAdvancedOpen) {
    const {
      useArtisan,
      artisanBase,
      guzzlingLevel,
      zScore,
      useBuyListing,
      buyPriceStrategy,
      useOwnedInventory,
      craftableMaterialMode,
      defaultEntryQty,
      defaultEntryCraftMode,
    } = opts;
 
    const zOpts = Z_OPTIONS.map(o =>
      `<option value="${o.value}" ${zScore === o.value ? 'selected' : ''}>${esc(o.label)}</option>`
    ).join('');
 
    return `
      <div class="ShoppingList-row">
        <label title="${sl('buyNowLabel')}">${sl('buyNowLabel')}</label>
        <label class="ShoppingList-switch">
          <input type="checkbox" id="ShoppingList-use-buy-listing" ${useBuyListing ? 'checked' : ''} />
          <span class="ShoppingList-switch-slider"></span>
        </label>
      </div>
      <div class="ShoppingList-row">
        <label id="ShoppingList-price-strategy-label">${sl('pricingStrategy')}</label>
        ${(!useBuyListing && buyPriceStrategy === 'undercut')
          ? '<span id="ShoppingList-price-warn" class="ShoppingList-entry-warn" title="Undercut has no effect with Buy Now - treated as Match">⚠</span>'
          : '<span id="ShoppingList-price-warn" class="ShoppingList-entry-warn" style="visibility:hidden">⚠</span>'}
        <select id="ShoppingList-buy-price-strategy" class="ShoppingList-inp">
          <option value="outbid"   ${buyPriceStrategy === 'outbid'   ? 'selected' : ''}>${sl('outbid')}</option>
          <option value="match"    ${buyPriceStrategy === 'match'    ? 'selected' : ''}>${sl('matchBest')}</option>
          <option value="undercut" ${buyPriceStrategy === 'undercut' ? 'selected' : ''}>${sl('undercut')}</option>
          <option value="none"     ${buyPriceStrategy === 'none'     ? 'selected' : ''}>${sl('pass')}</option>
        </select>
      </div>
      <div class="ShoppingList-row">
        <label title="${sl('useArtisan')}">${sl('useArtisan')}</label>
        <label class="ShoppingList-switch" title="Calculate assuming Artisan Tea is active">
          <input type="checkbox" id="ShoppingList-use-artisan" ${useArtisan ? 'checked' : ''} />
          <span class="ShoppingList-switch-slider"></span>
        </label>
      </div>
      <div class="ShoppingList-row">
        <label title="${sl('craftExpansion')}">${sl('craftExpansion')}</label>
        <select id="ShoppingList-craftable-material-mode" class="ShoppingList-inp">
          <option value="none" ${craftableMaterialMode === 'none' ? 'selected' : ''}>${sl('upgradeOnly')}</option>
          <option value="upgrade-path" ${craftableMaterialMode === 'upgrade-path' ? 'selected' : ''}>${sl('expandUpgradeable')}</option>
          <option value="all" ${craftableMaterialMode === 'all' ? 'selected' : ''}>${sl('expandAll')}</option>
        </select>
      </div>
      <div class="ShoppingList-row">
        <label title="${sl('guzzlingPouch')}">${sl('guzzlingPouch')}</label>
        <select id="ShoppingList-pouch-level" class="ShoppingList-inp">
          ${[sl('string_none'), ...ENHANCEMENT_BONUSES.map((_, i) => `+${i}`)].map((label, i) =>
            `<option value="${i - 1}" ${guzzlingLevel === i - 1 ? 'selected' : ''}>${label}</option>`
          ).join('')}
        </select>
      </div>
      <details id="ShoppingList-advanced" ${isAdvancedOpen ? 'open' : ''}>
        <summary>${sl('advanced')}</summary>
        <div class="ShoppingList-row" style="margin-top:6px">
          <label title="Used when adding a new item row">${sl('defaultQty')}</label>
          <input id="ShoppingList-default-entry-qty" class="ShoppingList-inp" type="number" min="1" step="1" value="${defaultEntryQty}" />
        </div>
        <div class="ShoppingList-row">
          <label title="Used when adding a new item row">${sl('defaultMode')}</label>
          <select id="ShoppingList-default-entry-mode" class="ShoppingList-inp">
            <option value="direct" ${defaultEntryCraftMode !== 'full' ? 'selected' : ''}>Direct</option>
            <option value="full" ${defaultEntryCraftMode === 'full' ? 'selected' : ''}>${sl('modeFull')}</option>
          </select>
        </div>
        <div class="ShoppingList-row" style="margin-top:6px">
          <label>${sl('safetyMargin')}</label>
          <select id="ShoppingList-z" class="ShoppingList-inp">${zOpts}</select>
        </div>
        <div class="ShoppingList-row">
          <label title="${sl('useOwnedInv')}">${sl('useOwnedInv')}</label>
          <label class="ShoppingList-switch">
            <input type="checkbox" id="ShoppingList-use-owned-inventory" ${useOwnedInventory ? 'checked' : ''} />
            <span class="ShoppingList-switch-slider"></span>
          </label>
        </div>
        <div class="ShoppingList-row">
          <label title="${sl('autoLoadTasks')}">${sl('autoLoadTasks')}</label>
          <label class="ShoppingList-switch" title="On startup, briefly navigate to the Task Board to load Claim buttons, then return">
            <input type="checkbox" id="ShoppingList-auto-load-tasks" ${opts.autoLoadTaskBoard ? 'checked' : ''} />
            <span class="ShoppingList-switch-slider"></span>
          </label>
        </div>
      </details>`;
  }
 
  function buildPanelHTML(isAdvancedOpen) {
    const url = resolveSpriteUrl();
    const taskTokenSvg = url
      ? `<svg width="16" height="16" viewBox="0 0 64 64" style="display:block"><use href="${url}#task_token"></use></svg>`
      : '📋';
 
    const tasksHTML   = tasksOpen   ? buildTasksTabHTML()           : '';
    const settingsHTML = settingsOpen ? buildSettingsTabHTML(isAdvancedOpen) : '';
 
    return `
      <div id="ShoppingList-wrapper">
        <div id="ShoppingList-main">
          <div id="ShoppingList-titlebar">
            <span id="ShoppingList-title">${sl('panelTitle')}</span>
            <span id="ShoppingList-titlebar-btns">
              <button class="ShoppingList-hdr-btn" id="ShoppingList-btn-lang" title="${sl('langBtnTitle')}">${sl('langBtn')}</button>
              <button class="ShoppingList-hdr-btn" id="ShoppingList-btn-min" title="${sl('minimiseTitle')}">${sl('minimise')}</button>
              <button class="ShoppingList-hdr-btn" id="ShoppingList-btn-close" title="${sl('closeTitle')}">${sl('close')}</button>
            </span>
          </div>
          <div id="ShoppingList-body">
            ${buildListTabHTML()}
          </div>
        </div>
 
        <div id="ShoppingList-sidebar-tabs">
          <button class="ShoppingList-sidebar-tab ${tasksOpen ? 'is-active' : ''}" id="ShoppingList-btn-tasks" title="${tasksOpen ? sl('hideTasks') : sl('showTasks')}">${taskTokenSvg}</button>
          <button class="ShoppingList-sidebar-tab ${settingsOpen ? 'is-active' : ''}" id="ShoppingList-btn-settings" title="${settingsOpen ? sl('hideSettings') : sl('showSettings')}">⚙</button>
        </div>
 
        <div id="ShoppingList-right-col" ${(tasksOpen || settingsOpen) ? '' : 'hidden'}>
          ${tasksOpen ? `
          <div id="ShoppingList-tasks-sidepanel">
            <div class="ShoppingList-sidepanel-header">${taskTokenSvg}${sl('tasks')}</div>
            <div id="ShoppingList-tasks-sidepanel-body">${tasksHTML}</div>
          </div>` : ''}
          ${settingsOpen ? `
          <div id="ShoppingList-settings-sidepanel">
            <div class="ShoppingList-sidepanel-header">${sl('settings')}</div>
            <div id="ShoppingList-settings-sidepanel-body">${settingsHTML}</div>
          </div>` : ''}
        </div>
      </div>
      <div id="ShoppingList-resize-handle" title="Resize"></div>`;
  }
 
  // Simple HTML escape to avoid injection from item names
  function esc(str) {
    return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
 
  // ═══════════════════════════════════════════════════════════════════
  // FLOATING PANEL - DOM MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════
 
  let panel    = null;
  let bodyEl   = null;   // the collapsible body div
  let panelVisible = false;
  let minimised = false;
  let isDraggingPanel = false;
  let isResizingPanel = false;
  let dragOffsetX = 0;
  let dragOffsetY = 0;
  let resizeStartX = 0;
  let resizeStartY = 0;
  let resizeStartW = 0;
  let resizeStartH = 0;
  let panelW = 355;
  let panelH = 0;
  let resizeLockedScrollTop = 0;
  let panelDragListenersAttached = false;
 
  function setPanelResizingState(active) {
    isResizingPanel = !!active;
    if (panel) panel.classList.toggle('ShoppingList-is-resizing', isResizingPanel);
    if (bodyEl) {
      if (isResizingPanel) {
        resizeLockedScrollTop = bodyEl.scrollTop;
        bodyEl.style.overflowY = 'scroll';
        bodyEl.scrollTop = resizeLockedScrollTop;
      } else {
        bodyEl.style.overflowY = 'auto';
      }
    }
  }
 
  function clampPanelPositionToViewport() {
    const viewportW = Math.max(320, window.innerWidth || 0);
    const viewportH = Math.max(240, window.innerHeight || 0);
 
    const panelW = panel?.offsetWidth || 445;
    const panelH = panel?.offsetHeight || 300;
 
    const maxX = Math.max(0, viewportW - panelW - 8);
    const maxY = Math.max(0, viewportH - panelH - 8);
 
    if (!Number.isFinite(panelPos.x)) panelPos.x = 20;
    if (!Number.isFinite(panelPos.y)) panelPos.y = 80;
 
    panelPos.x = Math.max(0, Math.min(panelPos.x, maxX));
    panelPos.y = Math.max(0, Math.min(panelPos.y, maxY));
 
    if (panel) {
      panel.style.left = panelPos.x + 'px';
      panel.style.top = panelPos.y + 'px';
    }
  }
 
  function applyPanelVisibility() {
    if (panel) {
      panel.style.display = panelVisible ? '' : 'none';
    }
    const toggle = document.getElementById(`${PLUGIN_ID}-toggle`);
    if (toggle) {
      toggle.style.display = panelVisible ? 'none' : 'flex';
    }
  }
 
  function openPanel() {
    panelVisible = true;
 
    if (!panel || !panel.isConnected) {
      mountPanel();
    }
 
    clampPanelPositionToViewport();
 
    if (panel) {
      panel.style.display = '';
    }
 
    applyPanelVisibility();
  }
 
  function ensurePanelDragListeners() {
    if (panelDragListenersAttached) return;
 
    document.addEventListener('mousemove', e => {
      if (isResizingPanel && panel) {
        const minW = 310;
        const minH = 40;
        const maxW = Math.max(minW, Math.floor((window.innerWidth || 1200) * 0.9));
        const maxH = Math.max(minH, Math.floor((window.innerHeight || 800) * 0.9));
 
        const nextW = Math.max(minW, Math.min(maxW, resizeStartW + (e.clientX - resizeStartX)));
        const nextH = Math.max(minH, Math.min(maxH, resizeStartH + (e.clientY - resizeStartY)));
 
        panelW = nextW;
        panelH = nextH;
        panel.style.width = `${panelW}px`;
        panel.style.height = `${panelH}px`;
        clampPanelPositionToViewport();
        return;
      }
 
      if (!isDraggingPanel || !panel) return;
      panelPos.x = Math.max(0, e.clientX - dragOffsetX);
      panelPos.y = Math.max(0, e.clientY - dragOffsetY);
      panel.style.left = panelPos.x + 'px';
      panel.style.top  = panelPos.y + 'px';
    });
 
    document.addEventListener('mouseup', () => {
      if (isResizingPanel && panel) {
        panelW = panel.offsetWidth || panelW;
        panelH = panel.offsetHeight || panelH;
        setPanelResizingState(false);
      }
 
      if (!isDraggingPanel) return;
      isDraggingPanel = false;
      savePos();
    });
 
    panelDragListenersAttached = true;
  }
 
  function mountPanel() {
    if (!document.body) return;
    ensurePanelDragListeners();
 
    // Preserve the open/closed state of the Advanced section across re-renders.
    const isAdvancedOpen = document.getElementById('ShoppingList-advanced')?.hasAttribute('open') ?? false;
 
    document.getElementById(`${PLUGIN_ID}-panel`)?.remove();
    panel = document.createElement('div');
    panel.id = `${PLUGIN_ID}-panel`;
    panel.innerHTML = buildPanelHTML(isAdvancedOpen);
    document.body.appendChild(panel);
 
    panel.style.left = panelPos.x + 'px';
    panel.style.top  = panelPos.y + 'px';
    panel.style.width = `${panelW}px`;
    if (minimised) {
      panel.style.height = '40px'; // Only show title bar
      panel.style.minHeight = '40px';
    } else {
      panel.style.height = panelH > 0 ? `${panelH}px` : '';
      panel.style.minHeight = '40px';
    }
    clampPanelPositionToViewport();
 
    bodyEl = document.getElementById('ShoppingList-body');
    const resizeHandle = panel.querySelector('#ShoppingList-resize-handle');
    if (minimised) {
      bodyEl.style.display = 'none';
      if (resizeHandle) resizeHandle.style.display = 'none';
    } else {
      bodyEl.style.display = '';
      if (resizeHandle) resizeHandle.style.display = '';
    }
    bodyEl.addEventListener('scroll', () => {
      if (!isResizingPanel) return;
      if (bodyEl.scrollTop !== resizeLockedScrollTop) {
        bodyEl.scrollTop = resizeLockedScrollTop;
      }
    }, { passive: true });
    bodyEl.addEventListener('wheel', e => {
      if (!isResizingPanel) return;
      e.preventDefault();
    }, { passive: false });
    bodyEl.addEventListener('touchmove', e => {
      if (!isResizingPanel) return;
      e.preventDefault();
    }, { passive: false });
 
    // Update minimize button icon
    const minBtn = panel.querySelector('#ShoppingList-btn-min');
    if (minBtn) minBtn.textContent = minimised ? '+' : '−';
 
    applyPanelVisibility();
 
    attachPanelEvents();
  }
 
  function handleActionButtonClick(button) {
    if (!button) return false;
    const hrid = button.dataset.itemHrid;
    const entryId = button.dataset.entryId;
    const qty = toPositiveInt(button.dataset.actionQty, 0) || null;
    if (!hrid) return false;
    if (entryId) recordActionIntent(hrid, entryId);
    navigateToAction(hrid, qty);
    return true;
  }
 
  // ═══════════════════════════════════════════════════════════════════
  // PRODUCE MODAL → SHOPPING LIST HELPERS
  // ═══════════════════════════════════════════════════════════════════
 
  function getSkillActionModal(root = document) {
    return root.querySelector('[class*="Modal_modal"] [class*="SkillActionDetail_skillActionDetail"]')
      || root.querySelector('[class*="SkillActionDetail_skillActionDetail"]')
      || document.querySelector('[class*="Modal_modal"] [class*="SkillActionDetail_skillActionDetail"]')
      || document.querySelector('[class*="SkillActionDetail_skillActionDetail"]');
  }
 
  /**
   * Returns the output item HRID from a skill action modal.
   * Works regardless of game language (English or Chinese).
   * Strategy:
   * 1. Find the "Outputs" / "产出" label — language-agnostic by position fallback.
   * 2. Read the item name text (may be Chinese or English).
   * 3. Resolve to hrid via getItemHrid (handles both EN and ZH names via zhNameToHrid).
   * 4. Fallback: read the sprite <use href> slug directly — always English/hrid-based.
   */
  function getOutputHridFromSkillModal(modal) {
    if (!modal) return null;
 
    const labels = Array.from(modal.querySelectorAll('[class*="SkillActionDetail_label"]'));
 
    // Match "outputs" in any language: English "outputs" or Chinese "产出"
    const OUTPUT_LABELS = new Set(['outputs', '产出', 'output']);
    const outputsLabel = labels.find(el => OUTPUT_LABELS.has(normalizeText(el.textContent)));
 
    // Fallback: if label not matched (e.g. unknown language), try the second label
    // which is conventionally "Outputs" in every known locale
    const valueEl = outputsLabel
      ? outputsLabel.nextElementSibling
      : (labels[1]?.nextElementSibling ?? null);  // "Outputs" is usually the 2nd label
 
    if (!valueEl) return null;
 
    // Primary: resolve via item name text (handles both EN and ZH via getItemHrid)
    const nameEl = valueEl.querySelector('[class*="Item_name"]');
    const rawName = nameEl?.textContent?.trim() || null;
    if (rawName) {
      const hrid = getItemHrid(rawName);
      if (hrid) return hrid;
    }
 
    // Fallback: read the sprite <use href> slug — e.g. "#azure_cheese" → "/items/azure_cheese"
    // This works regardless of display language because sprite slugs are always English.
    const useEl = valueEl.querySelector('use[href*="items_sprite"]');
    const href = useEl?.getAttribute('href') || '';
    const slug = href.split('#').pop();
    if (slug) {
      const hrid = '/items/' + slug;
      if (productToAction.has(hrid) || game.items[hrid]) return hrid;
    }
 
    return null;
  }
 
  function getOutputNameFromSkillModal(modal) {
    const hrid = getOutputHridFromSkillModal(modal);
    if (!hrid) return null;
    // Return the name in the current display language
    return getItemName(hrid) || null;
  }
 
  function isShoppingListEligibleModal(modal) {
    if (!modal) return false;
    return !!getOutputHridFromSkillModal(modal);
  }
 
  function injectAddToShoppingListButton(modalRoot = document) {
    const modal = getSkillActionModal(modalRoot);
    if (!modal) return false;
    if (!isShoppingListEligibleModal(modal)) return false;
 
    const buttonsContainer =
      modal.querySelector('[class*="SkillActionDetail_buttonsContainer"]') ||
      modal.querySelector('[class*="buttonsContainer"]');
    if (!buttonsContainer) return false;
    if (buttonsContainer.querySelector('#ShoppingList-btn-add-from-produce')) return true;
 
    const outputName = getOutputNameFromSkillModal(modal);
    // Use the display name for button title, but resolve via hrid for reliability
    const outputHrid = getOutputHridFromSkillModal(modal);
 
    const wrapper = document.createElement('div');
    wrapper.className = 'ShoppingList-tooltip-inject';
 
    const qtyInput = document.createElement('input');
    qtyInput.id = 'ShoppingList-produce-qty';
    qtyInput.type = 'number';
    qtyInput.min = '1';
    qtyInput.className = 'ShoppingList-inp ShoppingList-tooltip-qty-inp';
    qtyInput.title = 'Quantity to add';
 
    // Seed from the current produce-input value (falls back to defaultEntryQty)
    const produceInput = findProduceInput(modal);
    qtyInput.value = String(toPositiveInt(produceInput?.value, opts.defaultEntryQty || 1));
 
    // Two-way sync: our qty ↔ produce input
    qtyInput.addEventListener('input', e => {
      e.stopPropagation();
      const produceEl = findProduceInput(modal);
      if (produceEl) setReactInputValue(produceEl, e.target.value);
    });
    qtyInput.addEventListener('click',     e => e.stopPropagation());
    qtyInput.addEventListener('mousedown', e => e.stopPropagation());
 
    // If the game's own produce input changes (e.g. user types in it), reflect here
    if (produceInput) {
      produceInput.addEventListener('input', () => {
        const fresh = toPositiveInt(findProduceInput(modal)?.value, 1);
        if (String(fresh) !== qtyInput.value) qtyInput.value = String(fresh);
      });
    }
 
    const btn = document.createElement('button');
    btn.id = 'ShoppingList-btn-add-from-produce';
    btn.className = 'ShoppingList-tooltip-add-btn';
    btn.textContent = sl('addTooltipText');
    btn.title = sl('addTooltipTitle').replace('{item}', outputName);
    btn.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      const qty = toPositiveInt(qtyInput.value, 1);
      // Use hrid directly to avoid language-dependent name resolution failures
      if (outputHrid) {
        const hridName = getItemName(outputHrid);
        addItemToShoppingListFromTooltip(hridName || outputName, qty);
      } else {
        addItemToShoppingListFromTooltip(outputName, qty);
      }
    });
    btn.addEventListener('mousedown', e => e.stopPropagation());
 
    wrapper.appendChild(qtyInput);
    wrapper.appendChild(btn);
    buttonsContainer.insertBefore(wrapper, buttonsContainer.firstChild);
    return true;
  }
 
  let addToShoppingListInjectTimer = null;
  function scheduleInjectAddToShoppingList(root = document, delay = 50, maxAttempts = 8) {
    clearTimeout(addToShoppingListInjectTimer);
 
    let attempts = 0;
    const tryInject = () => {
      attempts += 1;
      const injected = injectAddToShoppingListButton(root);
      if (injected || attempts >= maxAttempts) return;
      addToShoppingListInjectTimer = setTimeout(tryInject, 120);
    };
 
    addToShoppingListInjectTimer = setTimeout(tryInject, delay);
  }
 
  function showConfirmModal(message, onConfirm) {
    const overlay = document.createElement('div');
    overlay.className = 'SL-modal-overlay';
    overlay.innerHTML = `
      <div class="SL-modal">
        <div class="SL-modal-text">${esc(message)}</div>
        <div class="SL-modal-btns">
          <button class="SL-modal-btn" id="SL-modal-cancel">${langState.lang === 'zh' ? '取消' : 'Cancel'}</button>
          <button class="SL-modal-btn SL-modal-btn-confirm" id="SL-modal-confirm">${langState.lang === 'zh' ? '确认清空' : 'Confirm Clear'}</button>
        </div>
      </div>
    `;
    
    overlay.querySelector('#SL-modal-cancel').onclick = () => overlay.remove();
    overlay.querySelector('#SL-modal-confirm').onclick = () => {
      onConfirm();
      overlay.remove();
    };
    
    document.body.appendChild(overlay);
  }
 
  // ═══════════════════════════════════════════════════════════════════
  // SHARED ADD-TO-LIST CORE + ITEM TOOLTIP INJECTION
  // Both the produce-modal button and the item-tooltip button funnel
  // through addItemToShoppingListFromTooltip(itemName, qty).
  // ═══════════════════════════════════════════════════════════════════
 
  /**
   * Reads the item name from an Item_actionMenu node.
   * Looks inside Item_itemInfo → Item_name for the display name.
   */
  function getItemNameFromTooltip(tooltipNode) {
    if (!tooltipNode) return null;
    const nameEl =
      tooltipNode.querySelector('[class*="Item_itemInfo"] [class*="Item_name"]') ||
      tooltipNode.querySelector('[class*="Item_name"]');
    return nameEl?.textContent?.trim() || null;
  }
 
  /**
   * Adds an item to the shopping list directly from a tooltip interaction.
   * qty defaults to 1 when not provided or invalid.
   */
  function addItemToShoppingListFromTooltip(itemName, qty, { silent = false } = {}) {
    if (!itemName) return false;
 
    const itemHrid = getItemHrid(itemName);
    if (!itemHrid) return false;
 
    const targetQty = toPositiveInt(qty, 1);
 
    const existingEntry = shoppingList.find(entry => entry?.itemHrid === itemHrid);
    if (existingEntry) {
      // Item already in list: sum up the quantity
      existingEntry.targetQty += targetQty;
      saveList();
      if (!silent) {
        saveListAndRefresh(true);
        openPanel();
      }
      return true;
    }
 
    shoppingList.push(
      createShoppingListEntry({
        itemHrid,
        rawName: getItemName(itemHrid),
        targetQty,
      })
    );
    saveList();
    if (!silent) {
      saveListAndRefresh(true);
      openPanel();
    }
    return true;
  }
 
  /**
   * Injects a qty input + "Add to Shopping List" button into an Item_actionMenu node.
   * The button uses a teal colour scheme to visually distinguish it from the
   * produce-modal button (which is blue/default).
   */
  function injectItemTooltipButton(tooltipNode) {
    if (!tooltipNode) return false;
    if (tooltipNode.querySelector('#ShoppingList-tooltip-btn')) return true; // already injected
 
    const itemName = getItemNameFromTooltip(tooltipNode);
    if (!itemName) return false;
 
    const itemHrid = getItemHrid(itemName);
    if (!itemHrid) return false; // unknown item — don't inject
 
    const wrapper = document.createElement('div');
    wrapper.id = 'ShoppingList-tooltip-wrapper';
    wrapper.className = 'ShoppingList-tooltip-inject';
 
    const qtyInput = document.createElement('input');
    qtyInput.id = 'ShoppingList-tooltip-qty';
    qtyInput.type = 'number';
    qtyInput.min = '1';
    qtyInput.value = String(opts.defaultEntryQty || 1);
    qtyInput.className = 'ShoppingList-inp ShoppingList-tooltip-qty-inp';
    qtyInput.title = 'Quantity to add';
    // Prevent tooltip clicks from bubbling and closing the tooltip prematurely
    qtyInput.addEventListener('click', e => e.stopPropagation());
    qtyInput.addEventListener('mousedown', e => e.stopPropagation());
 
    const btn = document.createElement('button');
    btn.id = 'ShoppingList-tooltip-btn';
    btn.className = 'ShoppingList-tooltip-add-btn';
    btn.textContent = sl('addTooltipText');
    btn.title = sl('addTooltipTitle').replace('{item}', itemName);
    btn.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      const qty = toPositiveInt(qtyInput.value, 1);
      addItemToShoppingListFromTooltip(itemName, qty);
    });
    btn.addEventListener('mousedown', e => e.stopPropagation());
 
    wrapper.appendChild(qtyInput);
    wrapper.appendChild(btn);
 
    // Insert at the bottom of the actionMenu
    tooltipNode.appendChild(wrapper);
    return true;
  }
 
  let tooltipInjectTimer = null;
  function scheduleInjectItemTooltipButton(node, delay = 50, maxAttempts = 15) {
      clearTimeout(tooltipInjectTimer);
 
      let attempts = 0;
      const tryInject = () => {
        attempts += 1;
 
        // Try the node itself first, then search inside it
        const target =
          (node?.classList && [...node.classList].some(c => c.includes('Item_actionMenu'))) ? node :
          node?.querySelector?.('[class*="Item_actionMenu"]') || null;
 
        const injected = target ? injectItemTooltipButton(target) : false;
        if (injected || attempts >= maxAttempts) return;
        tooltipInjectTimer = setTimeout(tryInject, 120);
      };
 
      tooltipInjectTimer = setTimeout(tryInject, delay);
    }
 
  // ═══════════════════════════════════════════════════════════════════
  // QUEST PROGRESS FROM SOCKET
  // ═══════════════════════════════════════════════════════════════════
 
  /**
   * Resolves the primary output item hrid for a given action hrid.
   * e.g. "/actions/brewing/foraging_tea" → "/items/foraging_tea"
   */
  function actionHridToItemHrid(actionHrid) {
    if (!actionHrid) return null;
    const action = game.actions[actionHrid]
      || Object.values(game.actions).find(a => (a?.hrid || a?.actionHrid || a?.action_hrid) === actionHrid);
    if (!action) return null;
    const outputs = action.outputItems || action.output_items || [];
    if (Array.isArray(outputs) && outputs.length > 0) {
      return outputs[0]?.itemHrid || outputs[0]?.item_hrid || null;
    }
    return null;
  }
 
  /**
   * Applies quest progress from an endCharacterQuests array (from action_completed
   * or init_character_data) into cachedTasks.
   * Matches by characterQuestId first, then falls back to actionHrid → itemHrid.
   * Returns true if any task changed.
   */
  function applyQuestUpdatesFromSocket(quests) {
    if (!Array.isArray(quests) || !quests.length || !cachedTasks.length) return false;
 
    let changed = false;
 
    for (const quest of quests) {
      if (quest.category !== '/quest_category/random_task') continue;
 
      const questId      = quest.id;
      const actionHrid   = quest.actionHrid || quest.action_hrid;
      const goalCount    = Number(quest.goalCount    ?? quest.goal_count    ?? 0);
      const currentCount = Number(quest.currentCount ?? quest.current_count ?? 0);
      const isComplete   = quest.status === '/quest_status/completed';
 
      // Match to a cached task — prefer questId match, fall back to actionHrid→itemHrid
      let task = questId ? cachedTasks.find(t => t.characterQuestId === questId) : null;
      if (!task && actionHrid) {
        const itemHrid = actionHridToItemHrid(actionHrid);
        if (itemHrid) task = cachedTasks.find(t => t.itemHrid === itemHrid);
      }
      if (!task) continue;
 
      // Always store questId — needed for the Claim payload
      if (questId && task.characterQuestId !== questId) {
        task.characterQuestId = questId;
        changed = true;
      }
 
      if (goalCount > 0 && (task.total !== goalCount || task.done !== currentCount || task.isComplete !== isComplete)) {
        task.total      = goalCount;
        task.done       = currentCount;
        task.remaining  = Math.max(0, goalCount - currentCount);
        task.isComplete = isComplete;
        changed = true;
      }
    }
 
    if (changed) saveTasksCache();
    return changed;
  }
 
  // ═══════════════════════════════════════════════════════════════════
  // TASKS BOARD INTEGRATION
  // ═══════════════════════════════════════════════════════════════════
 
  /**
   * Parses all visible RandomTask nodes from the task board DOM.
   * If cachedTasks already has entries, only updates nodeRef (and adds genuinely new tasks).
   * Never overwrites done/total/isComplete/characterQuestId — those come from the socket.
   */
  function parseTasksFromDOM() {
    const taskNodes = document.querySelectorAll('[class*="RandomTask_content"]');
    const seenHrids = new Set();
    let changed = false;
 
    // Create a pool of old tasks to inherit quest IDs so we can handle duplicates safely
    const oldTasks = [...cachedTasks];
    const newTasks = [];
 
    for (const node of taskNodes) {
      const nameDiv = node.querySelector('[class*="RandomTask_name"]');
      if (!nameDiv) continue;
 
      const useEl = nameDiv.querySelector('use[href*="skills_sprite"]');
      const skillSlug = useEl
        ? (useEl.getAttribute('href') || '').split('#').pop().toLowerCase().trim()
        : '';
      if (!PRODUCTION_SKILLS.has(skillSlug)) continue;
 
      const rawText = nameDiv.textContent.trim();
      const dashMatch = rawText.match(/(?:[-—])\s*(.+)$/);
      let itemName = '';
      if (dashMatch) {
          itemName = dashMatch[1].trim();
      } else {
          // If no dash is present, strip the first word (likely the skill name)
          itemName = rawText.replace(/^[^\s]+\s+/, '').trim();
      }
      if (!itemName) continue;
 
      const itemHrid = getItemHrid(itemName);
      if (itemHrid) seenHrids.add(itemHrid);
 
      const allText = Array.from(node.querySelectorAll('div, span'))
        .map(el => el.textContent.trim())
        .find(t => /^(Progress|进度)\s*:\s*\d+\s*\/\s*\d+/.test(t)) || '';
      const progressMatch = allText.match(/(Progress|进度)\s*:\s*(\d+)\s*\/\s*(\d+)/);
      const done  = progressMatch ? parseInt(progressMatch[2], 10) : 0;
      const total = progressMatch ? parseInt(progressMatch[3], 10) : 0;
      const remaining = Math.max(0, total - done);
 
      // Match with old tasks sequentially to preserve characterQuestId for duplicates
      const oldIndex = oldTasks.findIndex(t =>
        (itemHrid && t.itemHrid === itemHrid) ||
        (!itemHrid && t.itemName === itemName)
      );
 
      let questId = null;
      if (oldIndex >= 0) {
        questId = oldTasks[oldIndex].characterQuestId;
        // Check if progress shifted to trigger a save
        if (oldTasks[oldIndex].done !== done || oldTasks[oldIndex].total !== total) {
          changed = true;
        }
        // Remove from the pool so the *next* identical task doesn't steal this data
        oldTasks.splice(oldIndex, 1);
      } else {
        changed = true; // Brand new task found
      }
 
      newTasks.push({
        skill: skillSlug, itemName, itemHrid,
        done, total, remaining,
        isComplete: remaining === 0 && total > 0,
        characterQuestId: questId,
        nodeRef: node,
      });
    }
 
    // If there are left over tasks that weren't matched, they were removed/completed
    if (oldTasks.length > 0) changed = true;
 
    // Replace the cached array entirely
    cachedTasks.length = 0;
    cachedTasks.push(...newTasks);
 
    if (changed || seenHrids.size > 0) {
      hookGameClaimButtons();
      saveTasksCache();
    }
 
    return cachedTasks;
  }
 
  /**
   * Surgically refreshes the tasks tab DOM after an action completes,
   * without a full remount. Re-parses progress from live DOM nodes and
   * updates progress bars, labels, and button states in-place.
   */
  function refreshTasksTabDOM() {
    const body = panel?.querySelector('#ShoppingList-tasks-sidepanel-body');
    if (!body) return false;
 
    // Re-parse live progress (will also update cachedTasks if tasks visible)
    parseTasksFromDOM();
    const tasks = cachedTasks;
    if (!tasks.length) return false;
 
    const rows = Array.from(body.querySelectorAll('.ShoppingList-task-row'));
    if (rows.length !== tasks.length) {
      // Structure mismatch — fall back to full remount of the tab body
      body.innerHTML = buildTasksTabHTML();
      return true;
    }
 
    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];
      const row  = rows[i];
      const pct  = task.total > 0 ? Math.round((task.done / task.total) * 100) : 0;
      const isComplete = task.isComplete ?? (task.remaining <= 0 && task.total > 0);
 
      const fill  = row.querySelector('.ShoppingList-task-progress-fill');
      const label = row.querySelector('.ShoppingList-task-progress-label');
      const addBtn = row.querySelector('.ShoppingList-task-row-add');
      const actBtn = row.querySelector('.ShoppingList-task-action-btn');
 
      if (fill)  fill.style.width = `${pct}%`;
      if (label) label.textContent = `${task.done} / ${task.total} (${task.remaining} remaining)`;
 
      if (addBtn) {
        const alreadyAdded = shoppingList.some(e => e.itemHrid === task.itemHrid);
        addBtn.disabled = alreadyAdded || isComplete;
        addBtn.dataset.remaining = String(task.remaining);
        addBtn.title = alreadyAdded ? 'Already in list'
          : isComplete ? 'Task complete'
          : `Add ${task.remaining}× ${task.itemName}`;
        addBtn.textContent = alreadyAdded ? '✓' : isComplete ? '✓' : '＋';
      }
 
      if (actBtn) {
        actBtn.dataset.actionQty = String(task.remaining);
      }
 
      // Claim Reward: inject or remove based on isComplete
      updateClaimButtonForRow(row, { ...task, isComplete });
    }
 
    return true;
  }
 
  /**
   * Finds the live Claim Reward button for a cached task by searching all
   * RandomTask_content nodes in the DOM and matching by item name.
   * Works even when the task board is on a different sub-tab (React keeps nodes mounted).
   */
  /** Preserved references to live game Claim buttons, keyed by itemHrid. */
 
  function findClaimButtonForTask(task) {
    if (!task) return null;
 
    // Try the cached nodeRef if it's still connected
    if (task.nodeRef?.isConnected) {
      const btn = task.nodeRef.querySelector('[class*="RandomTask_buttonsContainer"] button[class*="Button_buy"]');
      if (btn) {
        return btn;
      }
    }
 
    // Search all visible task nodes by item name match
    const allTaskNodes = document.querySelectorAll('[class*="RandomTask_content"]');
    for (const node of allTaskNodes) {
      const nameDiv = node.querySelector('[class*="RandomTask_name"]');
      if (!nameDiv) continue;
      const rawText = nameDiv.textContent.trim();
      const dashMatch = rawText.match(/(?:[-—])\s*(.+)$/);
      const itemName = dashMatch ? dashMatch[1].trim() : rawText.replace(/^[^\s]+\s+/, '').trim();
      const _candidateHrid = getItemHrid(itemName);
      if (_candidateHrid !== task.itemHrid && !(task.itemHrid && _candidateHrid === task.itemHrid)) continue;
      const btn = node.querySelector('[class*="RandomTask_buttonsContainer"] button[class*="Button_buy"]');
      if (btn) {
        return btn;
      }
    }
 
    // Task board is not in the DOM — button is gone, can't click it
    return null;
  }
 
  /**
   * Removes a claimed task from cachedTasks and refreshes the tasks tab.
   */
  function removeClaimedTask(itemHrid) {
    if (!itemHrid) return;
    const idx = cachedTasks.findIndex(t => t.itemHrid === itemHrid);
    if (idx >= 0) {
      cachedTasks.splice(idx, 1);
      saveTasksCache();
    }
    if (tasksOpen && panelVisible && panel?.isConnected) {
      // Full rebuild since row count changed
      const body = panel.querySelector('#ShoppingList-tasks-sidepanel-body');
      if (body) body.innerHTML = buildTasksTabHTML();
    }
  }
 
  /**
   * Injects a lightweight observer on all live Claim Reward buttons in the task board
   * so that clicking them via the game UI also removes the row from our Tasks tab.
   */
  function hookGameClaimButtons(root = document) {
    const claimBtns = root.querySelectorAll?.('[class*="RandomTask_buttonsContainer"] button[class*="Button_buy"]')
      || [];
    for (const btn of claimBtns) {
      if (btn.dataset.slClaimHooked) continue;
      btn.dataset.slClaimHooked = '1';
 
      btn.addEventListener('click', () => {
        // Find which task this belongs to by walking up to the content node
        const content = btn.closest('[class*="RandomTask_content"]');
        if (!content) return;
        const nameDiv = content.querySelector('[class*="RandomTask_name"]');
        if (!nameDiv) return;
        const rawText = nameDiv.textContent.trim();
        const dashMatch = rawText.match(/(?:[-—])\s*(.+)$/);
        const itemName = dashMatch ? dashMatch[1].trim() : rawText.replace(/^[^\s]+\s+/, '').trim();
        const itemHrid = getItemHrid(itemName);
        if (itemHrid) {
          // Small delay so React processes the claim first, then we clean up
          setTimeout(() => removeClaimedTask(itemHrid), 500);
        }
      });
    }
  }
 
  /**
   * On startup: briefly navigate to the task board to load the DOM (and capture
   * live Claim button references), then navigate back to the original page.
   * Only runs once per session, only if needed.
   */
  function backgroundLoadTaskBoard() {
    // Find the currently active nav element so we can return to it
    const activeNavEl = document.querySelector(
      '[class*="NavigationBar"] [class*="active" i], [class*="NavigationBar"] [class*="selected" i], ' +
      '[class*="navItem"][class*="active" i], [class*="nav-item"][class*="active" i], ' +
      '[class*="SideNav"] [class*="active" i]'
    );
 
    navigateToTaskBoard();
 
    // After task board renders, parse tasks, then navigate back
    setTimeout(() => {
      parseTasksFromDOM();
      if (activeNavEl) activeNavEl.click();
    }, 350);
  }
 
  // Setup listener for reroll payment and MooPass Free Reroll buttons
  function setupTasksRefreshListener() {
    if (window.__slTasksRefreshListenerAttached) return;
    window.__slTasksRefreshListenerAttached = true;
    document.addEventListener('click', function(e) {
      const btn = e.target.closest('.RandomTask_rerollOptionsContainer__3yFjo .Button_button__1Fe9z');
      if (btn) {
        // Pay reroll: cowbell or coin icon
        const hasPayIcon = btn.querySelector('svg use[href*="cowbell"], svg use[href*="coin"]');
        // MooPass Free Reroll: button text
        const isMooPass = btn.textContent.trim().toLowerCase().includes('moopass free reroll');
        if (hasPayIcon || isMooPass) {
          infoLog('[MWI Shopping List] Reroll listener triggered:', btn.textContent.trim());
          setTimeout(() => {
            infoLog('[MWI Shopping List] Running parseTasksFromDOM and mountPanel after reroll');
            parseTasksFromDOM();
            mountPanel();
          }, 350);
        }
      }
    });
  }
 
  // Universal Task Menu nav button listener setup (runs once on script load)
  // MutationObserver to dynamically attach listeners to Tasks nav button and reroll buttons
  const observer = new MutationObserver(() => {
    // Tasks nav button
    const taskNavBtn = document.querySelector('[class*="NavigationBar_nav"] [aria-label*="tasks"]');
    if (taskNavBtn && !taskNavBtn.dataset.slTaskNavHooked) {
      attachTaskPanelRefreshListener(taskNavBtn, 'Task navigation button clicked', 'navigation');
    }
    // Helper for attaching refresh listeners
    function attachTaskPanelRefreshListener(btn, logMsg, refreshReason) {
      if (!btn || btn.dataset.slPanelRefreshHooked) return;
      btn.dataset.slPanelRefreshHooked = '1';
      btn.addEventListener('click', () => {
        infoLog(`[MWI Shopping List] ${logMsg}:`, btn.textContent.trim());
        setTimeout(() => {
          infoLog(`[MWI Shopping List] Running parseTasksFromDOM and mountPanel after ${refreshReason} (observer)`);
          cachedTasks.length = 0;
          parseTasksFromDOM();
          mountPanel();
          if (panelVisible && tasksOpen && panel?.isConnected) {
            const body = panel.querySelector('#ShoppingList-tasks-sidepanel-body');
            if (body) {
              infoLog(`[MWI Shopping List] Forcing full rebuild of tasks tab body after ${refreshReason}`);
              body.innerHTML = buildTasksTabHTML();
            }
          }
        }, 350);
      });
      infoLog(`[MWI Shopping List] Attached listener to ${logMsg} (observer):`, btn.textContent.trim());
    }
 
    // Reroll buttons
    const rerollBtns = document.querySelectorAll('.RandomTask_rerollOptionsContainer__3yFjo .Button_button__1Fe9z');
    rerollBtns.forEach(btn => {
      const hasPayIcon = btn.querySelector('svg use[href*="cowbell"], svg use[href*="coin"]');
      const isMooPass = btn.textContent.trim().toLowerCase().includes('moopass free reroll');
      if (hasPayIcon || isMooPass) {
        attachTaskPanelRefreshListener(btn, 'Reroll button clicked', 'reroll/delete');
      }
    });
 
    // Confirm Discard buttons
    const confirmDiscardBtns = document.querySelectorAll('.Button_button__1Fe9z.Button_warning__1-AMI.Button_fullWidth__17pVU');
    confirmDiscardBtns.forEach(btn => {
      attachTaskPanelRefreshListener(btn, 'Confirm Discard button clicked', 'Confirm Discard');
    });
  });
  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true });
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      observer.observe(document.body, { childList: true, subtree: true });
    });
  }
 
 
  /**
   * Adds a single parsed task's remaining quantity to the shopping list.
   */
  function addTaskToShoppingList(task) {
    if (!task?.itemHrid || task.remaining <= 0) return false;
    return addItemToShoppingListFromTooltip(task.itemName, task.remaining);
  }
 
  /**
   * Injects or removes the Claim Reward button for a task row.
   * Always shown when remaining === 0 — the click handler tries live DOM
   * first, then falls back to a cached socket payload.
   */
  function updateClaimButtonForRow(row, task) {
    const existing = row.querySelector('.ShoppingList-task-claim-btn');
 
    if (task.remaining > 0) {
      existing?.remove();
      return;
    }
 
    if (existing) return; // already injected
 
    const btn = document.createElement('button');
    btn.className = 'ShoppingList-task-claim-btn ShoppingList-tooltip-add-btn';
    btn.textContent = sl('summaryClaim');
    btn.title = sl('claimTitle');
    btn.style.cssText = 'background:#1a3a1a;border-color:#3a7a3a;color:#80e080;';
    btn.dataset.itemHrid = task.itemHrid;
 
    row.querySelector('.ShoppingList-task-btns')?.appendChild(btn);
  }
 
  /**
   * Adds all visible production tasks (with remaining > 0) to the shopping list.
   */
  function addAllTasksToShoppingList() {
    const tasks = parseTasksFromDOM();
    let added = 0;
    for (const task of tasks) {
      if (task.remaining <= 0) continue;
      // Re-attempt hrid resolution for tasks that were parsed before chunk loaded
      const itemHrid = task.itemHrid || getItemHrid(task.itemName);
      if (itemHrid && !task.itemHrid) task.itemHrid = itemHrid;
      if (!itemHrid) continue;
      
      const existingEntry = shoppingList.find(e => e.itemHrid === itemHrid);
      if (existingEntry) {
        // Item already in list: sum up the quantity
        existingEntry.targetQty += task.remaining;
      } else {
        // New item: create entry
        shoppingList.push(createShoppingListEntry({
          itemHrid,
          rawName: getItemName(itemHrid),
          targetQty: task.remaining,
        }));
      }
      added++;
    }
    if (added > 0) {
      saveListAndRefresh(true);
      mountPanel();
      openPanel();
    }
    return added;
  }
 
  /**
   * Injects an "Add to Shopping List" button inside each production task's
   * buttonsContainer, between Reroll and Go.
   */
  function injectTaskButtons(root = document) {
    const taskNodes = (root.nodeType === 1 && root.matches?.('[class*="RandomTask_content"]'))
      ? [root]
      : Array.from(root.querySelectorAll?.('[class*="RandomTask_content"]') || []);
 
    let anyInjected = false;
    for (const node of taskNodes) {
      if (node.querySelector('#ShoppingList-task-btn-' + node.dataset.slInjected)) continue;
 
      const nameDiv = node.querySelector('[class*="RandomTask_name"]');
      if (!nameDiv) continue;
      const useEl = nameDiv.querySelector('use[href*="skills_sprite"]');
      const skillSlug = useEl ? (useEl.getAttribute('href') || '').split('#').pop().toLowerCase() : '';
      if (!PRODUCTION_SKILLS.has(skillSlug)) continue;
 
      const btnContainer = node.querySelector('[class*="RandomTask_buttonsContainer"]');
      if (!btnContainer) continue;
 
      // Guard: already injected?
      if (btnContainer.querySelector('.ShoppingList-task-add-btn')) continue;
 
      // Find the buttonGroup (holds Discard + Reroll) to insert after it
      const btnGroup = btnContainer.querySelector('[class*="RandomTask_buttonGroup"]');
 
      const btn = document.createElement('button');
      btn.className = 'ShoppingList-task-add-btn ShoppingList-tooltip-add-btn';
      btn.textContent = '🛒';
      btn.title = 'Add remaining quantity to Shopping List';
      btn.addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();
        // Re-parse at click time so progress and hrids are fresh
        const tasks = parseTasksFromDOM();
        const rawText = nameDiv.textContent.trim();
        const dashIdx = rawText.indexOf(' - ');
        const itemName = dashIdx >= 0 ? rawText.slice(dashIdx + 3).trim() : '';
 
        // Find by itemName (works whether hrid was resolved or not)
        const task = tasks.find(t => t.itemName === itemName)
          || tasks.find(t => t.itemHrid && t.itemHrid === getItemHrid(itemName));
 
        if (task && task.itemHrid) {
          addTaskToShoppingList(task);
        } else if (task && !task.itemHrid && itemName) {
          // Task found but hrid still null — chunk may not have loaded yet.
          // Try one more time now (chunk may have loaded since last parse).
          const hrid = getItemHrid(itemName);
          if (hrid) {
            task.itemHrid = hrid;
            addTaskToShoppingList(task);
          } else {
            // Last resort: add with qty=1, name lookup will fail gracefully
            addItemToShoppingListFromTooltip(itemName, task.remaining || 1);
          }
        } else if (itemName) {
          // Task not in cache at all — try direct resolution
          const hrid = getItemHrid(itemName);
          if (hrid) {
            addItemToShoppingListFromTooltip(getItemName(hrid), 1);
          } else {
            addItemToShoppingListFromTooltip(itemName, 1);
          }
        }
      });
 
      // Insert after buttonGroup, before the Go button
      if (btnGroup?.nextSibling) {
        btnContainer.insertBefore(btn, btnGroup.nextSibling);
      } else {
        btnContainer.appendChild(btn);
      }
      anyInjected = true;
    }
    return anyInjected;
  }
 
  let taskBtnInjectTimer = null;
  function scheduleInjectTaskButtons(node, delay = 80, maxAttempts = 8) {
    clearTimeout(taskBtnInjectTimer);
    let attempts = 0;
    const tryInject = () => {
      attempts++;
      const injected = injectTaskButtons(node);
      if (injected || attempts >= maxAttempts) return;
      taskBtnInjectTimer = setTimeout(tryInject, 150);
    };
    taskBtnInjectTimer = setTimeout(tryInject, delay);
  }
 
  /**
   * Injects the "Add All Production Tasks" button into the task board info bar.
   */
  function injectTaskBoardButton(root = document) {
    const infoBar = root.querySelector?.('[class*="TasksPanel_taskBoardInfo"]')
      || document.querySelector('[class*="TasksPanel_taskBoardInfo"]');
    if (!infoBar) return false;
    if (infoBar.querySelector('#ShoppingList-tasks-add-all')) return true;
 
    const btn = document.createElement('button');
    btn.id = 'ShoppingList-tasks-add-all';
    btn.className = 'ShoppingList-tasks-add-all-btn';
    btn.textContent = sl('addAllTasks');
    btn.title = sl('addAllTasksTitle');
    btn.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      addAllTasksToShoppingList();
    });
 
    infoBar.appendChild(btn);
    return true;
  }
 
  let taskBoardBtnTimer = null;
  function scheduleInjectTaskBoardButton(node, delay = 80, maxAttempts = 8) {
    clearTimeout(taskBoardBtnTimer);
    let attempts = 0;
    const tryInject = () => {
      attempts++;
      const injected = injectTaskBoardButton(node);
      if (injected || attempts >= maxAttempts) return;
      taskBoardBtnTimer = setTimeout(tryInject, 150);
    };
    taskBoardBtnTimer = setTimeout(tryInject, delay);
  }
 
  function attachPanelEvents() {
    const titlebar = panel.querySelector('#ShoppingList-titlebar');
 
    titlebar.addEventListener('mousedown', e => {
      if (e.target.closest('button')) return;   // don't drag when clicking buttons
      isDraggingPanel = true;
      dragOffsetX = e.clientX - panel.getBoundingClientRect().left;
      dragOffsetY = e.clientY - panel.getBoundingClientRect().top;
      e.preventDefault();
    });
 
    const resizeHandle = panel.querySelector('#ShoppingList-resize-handle');
    resizeHandle?.addEventListener('mousedown', e => {
      resizeStartX = e.clientX;
      resizeStartY = e.clientY;
      resizeStartW = panel.offsetWidth || panelW;
      resizeStartH = panel.offsetHeight || panelH || 300;
      setPanelResizingState(true);
      e.preventDefault();
      e.stopPropagation();
    });
 
    panel.querySelector('#ShoppingList-btn-clear')?.addEventListener('click', () => {
      showConfirmModal(sl('confirmClear'), () => {
        shoppingList = [];        // Empty the array
        saveListAndRefresh(true); // Save and refresh UI
      });
    });
 
    panel.querySelector('#ShoppingList-btn-lang')?.addEventListener('click', () => {
      langState.lang = langState.lang === 'zh' ? 'en' : 'zh';
      try { GM_setValue(STORAGE_LANG, langState.lang); } catch (_) {}
      lastCalcState = '';
      scheduleRender();
    });
 
    panel.querySelector('#ShoppingList-btn-min').addEventListener('click', () => {
      minimised = !minimised;
      mountPanel();
    });
    panel.querySelector('#ShoppingList-btn-close').addEventListener('click', () => {
      panelVisible = false;
      applyPanelVisibility();
    });
 
    panel.querySelector('#ShoppingList-btn-tasks')?.addEventListener('click', () => {
      tasksOpen = !tasksOpen;
      if (tasksOpen) parseTasksFromDOM();
      mountPanel();
    });
 
    panel.querySelector('#ShoppingList-btn-settings')?.addEventListener('click', () => {
      settingsOpen = !settingsOpen;
      mountPanel();
    });
 
    panel.querySelector('#ShoppingList-btn-goto-tasks-empty')?.addEventListener('click', () => {
      navigateToTaskBoard();
    });
 
    panel.querySelector('#ShoppingList-btn-add')?.addEventListener('click', () => {
      // Force change event on any focused input in the panel before adding a new row.
      // This ensures the latest typed value is saved before the list is re-rendered.
      if (panel.contains(document.activeElement) && ['INPUT', 'SELECT'].includes(document.activeElement.tagName)) {
        document.activeElement.blur();
      }
 
      // Use a timeout to allow the change event handler to run and save state.
      setTimeout(() => {
        shoppingList.push(createShoppingListEntry());
        saveListAndRefresh();
      }, 30);
    });
 
    panel.querySelector('#ShoppingList-btn-market')?.addEventListener('click', () => {
      updateBuyList();
      const first = [...resolvedBuyList.entries()].find(([, entry]) => entry.missing > 0) || resolvedBuyList.entries().next().value;
      navigateToMarket(first?.[0] ?? null, first?.[1]?.missing ?? null);
    });
 
    panel.addEventListener('click', e => {
      const row = e.target.closest('.ShoppingList-buy-row');
      if (!row || !panel.contains(row)) return;
      const hrid = row.dataset.hrid;
      const qty = parseInt(row.dataset.qty, 10) || null;
      navigateToMarket(hrid, qty);
    });
 
    panel.addEventListener('click', e => {
      // Handle Remove and Reroll buttons in Task Menu
      const target = e.target.closest('button');
      if (target) {
        // Remove button: has Button_warning__1-AMI and Icon_icon__2LtL_ classes
        if (
          target.classList.contains('Button_warning__1-AMI') &&
          target.querySelector('svg use[href*="remove"]')
        ) {
          setTimeout(() => {
            saveTasksCache();
          }, 100); // Wait for DOM update
        }
        // Reroll button: has text 'Reroll'
        if (
          target.textContent.trim() === 'Reroll'
        ) {
          setTimeout(() => {
            saveTasksCache();
          }, 100); // Wait for DOM update
        }
      }
 
    });
 
    panel.addEventListener('click', e => {
      // Add to shopping list (silent — no remount, patch button in-place)
      const addBtn = e.target.closest('.ShoppingList-task-row-add');
      if (addBtn && !addBtn.disabled && panel.contains(addBtn)) {
        const itemHrid  = addBtn.dataset.itemHrid;
        const remaining = parseInt(addBtn.dataset.remaining, 10) || 1;
        const added = addItemToShoppingListFromTooltip(getItemName(itemHrid), remaining, { silent: true });
        if (added) {
          // Patch button in-place — no scroll reset
          addBtn.disabled = true;
          addBtn.textContent = '✓';
          addBtn.title = 'Added to list';
          // Refresh the material list on the list tab without a full remount
          lastCalcState = '';
          refreshPanelForModeChange();
        }
        return;
      }
 
      // Claim Reward — trigger the live game button (1-to-1 with human click, per ToS)
      const claimBtn = e.target.closest('.ShoppingList-task-claim-btn');
      if (claimBtn && panel.contains(claimBtn)) {
        const taskRow  = claimBtn.closest('.ShoppingList-task-row');
        const itemHrid = taskRow?.dataset.itemHrid || claimBtn.dataset.itemHrid;
        const task     = cachedTasks.find(t => t.itemHrid === itemHrid);
 
        // Forward click to the live game button — works when task board is in the DOM
        const liveSource = findClaimButtonForTask(task);
        if (liveSource) {
          liveSource.click();
          removeClaimedTask(itemHrid);
          return;
        }
 
        // Live button not found — task board isn't open. Navigate there so user can click it directly.
        if (claimBtn.dataset.slWarnShown) {
          navigateToTaskBoard();
          return;
        }
        claimBtn.dataset.slWarnShown = '1';
        claimBtn.textContent = '⚠ Click again → Task Board';
        claimBtn.style.cssText += ';color:#ffaa44;font-size:10px;';
        setTimeout(() => {
          if (claimBtn.isConnected) {
            delete claimBtn.dataset.slWarnShown;
            claimBtn.textContent = sl('summaryClaim');
            claimBtn.style.color = '';
            claimBtn.style.fontSize = '';
          }
        }, 3000);
        return;
      }
 
      // Action button on task rows
      const taskActBtn = e.target.closest('.ShoppingList-task-action-btn');
      if (taskActBtn && panel.contains(taskActBtn)) {
        handleActionButtonClick(taskActBtn);
        return;
      }
    });
 
    panel.querySelector('#ShoppingList-use-artisan')?.addEventListener('change', e => {
      opts.useArtisan = e.target.checked;
      if (opts.useArtisan) {
        const p = opts.artisanBase * opts.guzzlingConc;
        infoLog(`[ShoppingList] Activated Artisan tea with ${(p * 100).toFixed(2)}% Effectiveness`);
      }
      saveOptsAndRefresh();
    });
 
    panel.querySelector('#ShoppingList-use-owned-inventory')?.addEventListener('change', e => {
      opts.useOwnedInventory = e.target.checked;
      saveOptsAndRefresh();
    });
 
    panel.querySelector('#ShoppingList-auto-load-tasks')?.addEventListener('change', e => {
      opts.autoLoadTaskBoard = e.target.checked;
      saveOpts();
    });
 
    panel.querySelector('#ShoppingList-craftable-material-mode')?.addEventListener('change', e => {
      const value = String(e.target.value || 'none');
      opts.craftableMaterialMode = ['none', 'upgrade-path', 'all'].includes(value) ? value : 'none';
      saveOptsAndRefresh();
    });
 
    panel.querySelector('#ShoppingList-artisan-base')?.addEventListener('change', e => {
      opts.artisanBase = Math.max(0, Math.min(1, parseFloat(e.target.value) / 100 || 0));
      saveOptsAndRefresh();
    });
 
    const pouchLevelSelect = panel.querySelector('#ShoppingList-pouch-level');
    if (pouchLevelSelect) {
      pouchLevelSelect.addEventListener('change', e => {
        opts.guzzlingLevel = parseInt(e.target.value);
        syncGuzzlingConc();
        if (opts.useArtisan) {
          const p = opts.artisanBase * opts.guzzlingConc;
          const levelStr = opts.guzzlingLevel >= 0 ? `+${opts.guzzlingLevel}` : 'None';
          infoLog(`[ShoppingList] Updated Guzzling Pouch to ${levelStr}, resulting in ${(p * 100).toFixed(2)}% Artisan Effectiveness`);
        }
        saveOptsAndRefresh();
      });
    }
 
    panel.querySelector('#ShoppingList-z')?.addEventListener('change', e => {
      opts.zScore = parseFloat(e.target.value);
      saveOptsAndRefresh();
    });
 
    panel.querySelector('#ShoppingList-default-entry-qty')?.addEventListener('change', e => {
      opts.defaultEntryQty = toPositiveInt(e.target.value, 1);
      e.target.value = String(opts.defaultEntryQty);
      saveOpts();
    });
 
    panel.querySelector('#ShoppingList-default-entry-mode')?.addEventListener('change', e => {
      const value = String(e.target.value || 'direct');
      opts.defaultEntryCraftMode = ['direct', 'full'].includes(value) ? value : 'direct';
      saveOpts();
    });
 
    panel.querySelector('#ShoppingList-use-buy-listing')?.addEventListener('change', e => {
      opts.useBuyListing = e.target.checked;
      saveOpts();
      updatePriceWarnVisibility();
    });
 
    panel.querySelector('#ShoppingList-buy-price-strategy')?.addEventListener('change', e => {
      const valid = ['outbid', 'match', 'undercut', 'none'];
      opts.buyPriceStrategy = valid.includes(e.target.value) ? e.target.value : 'outbid';
      saveOpts();
      updatePriceWarnVisibility();
    });
 
    function updatePriceWarnVisibility() {
      const warn = panel.querySelector('#ShoppingList-price-warn');
      if (!warn) return;
      const show = !opts.useBuyListing && opts.buyPriceStrategy === 'undercut';
      warn.style.visibility = show ? 'visible' : 'hidden';
    }
 
    const entriesContainer = panel.querySelector('#ShoppingList-entries');
    if (!entriesContainer) return; // not on list tab — skip all entry listeners
 
    // Handle Chinese IME composition: when the user confirms a character from the IME
    // candidate list, compositionend fires with the final value. Treat it the same as
    // an input event so the hrid lookup and mode-select rebuild happen immediately.
    entriesContainer.addEventListener('compositionend', e => {
      if (!e.target.className?.includes('inp-name')) return;
      const i = getDatasetIndex(e.target);
      if (i < 0 || !shoppingList[i]) return;
      const { hridChanged } = setEntryName(i, e.target.value);
      saveList();
      if (hridChanged) refreshPanelForModeChange();
    });
 
    entriesContainer.addEventListener('input', e => {
      const i = getDatasetIndex(e.target);
      const cls = e.target.className;
      if (i < 0 || !shoppingList[i]) return;
 
      if (cls.includes('inp-name')) {
        const { hridChanged } = setEntryName(i, e.target.value);
        saveList();
 
        // When the resolved item HRID changes, update the mode-select options for
        // this row only (surgical update so the name input keeps focus/caret).
        if (hridChanged) {
          const entry = shoppingList[i];
          const sel = entriesContainer.querySelector(`.ShoppingList-sel-mode[data-index="${i}"]`);
          if (sel && entry) {
            // Rebuild option list
            const specMeta = entry.itemHrid ? getSpecialActionMeta(entry.itemHrid) : null;
            const baseHrid = specMeta?.inputHrid || entry.itemHrid;
            const chain = baseHrid ? getUpgradeChainItems(baseHrid) : [];
 
            // For alchemy: include the input item itself as the first From option
            const fromHrids = specMeta?.inputHrid
              ? [specMeta.inputHrid, ...chain.filter(h => upgradeChainMap.has(h))]
              : chain.filter(h => upgradeChainMap.has(h));
 
            const fromOpts = fromHrids.map(hrid => {
              const prefix = getItemFirstWord(hrid);
              const val = `from:${hrid}`;
              const opt = document.createElement('option');
              opt.value = val;
              opt.textContent = `${sl('modeFrom')} ${prefix}`;
              return opt;
            });
 
            // Remove existing From options, keep Direct + Full chain
            Array.from(sel.options).forEach(opt => {
              if (isFromMode(opt.value)) sel.removeChild(opt);
            });
 
            // Insert From options before the "Full chain" option
            const fullOpt = Array.from(sel.options).find(o => o.value === 'full');
            for (const opt of fromOpts) {
              sel.insertBefore(opt, fullOpt || null);
            }
 
            // If the stored craftMode is no longer valid for this item, reset to 'full'
            if (isFromMode(entry.craftMode)) {
              const validFromHrids = new Set(fromHrids);
              const storedHrid = getFromModeHrid(entry.craftMode);
              if (!storedHrid || !validFromHrids.has(storedHrid)) {
                entry.craftMode = 'full';
                saveList();
              }
            }
            sel.value = entry.craftMode;
          }
          // Still refresh materials / inline chain since the item itself changed
          refreshPanelForModeChange();
        }
      } else if (cls.includes('inp-qty')) {
        const nextQty = toPositiveInt(e.target.value, 0);
        if (nextQty <= 0) return;
 
        if (shoppingList[i].targetQty !== nextQty) {
          shoppingList[i].targetQty = nextQty;
          saveList();
 
          // Re-render immediately so quantities/materials update live,
          // then restore focus/caret so typing can continue uninterrupted.
          if (panelVisible && panel?.isConnected) {
            refreshPanelForModeChange();
            restoreQtyInputFocus(i);
          } else {
            scheduleRender();
          }
        }
      }
    });
 
    entriesContainer.addEventListener('change', e => {
      const i   = getDatasetIndex(e.target);
      const cls = e.target.className;
      if (i < 0 || !shoppingList[i]) return;
 
      if (cls.includes('inp-qty')) {
        const nextQty = Math.max(1, parseInt(e.target.value) || 1);
        if (shoppingList[i].targetQty === nextQty) return;
        shoppingList[i].targetQty = nextQty;
      } else if (cls.includes('sel-mode')) {
        const rawVal = e.target.value;
        // Normalise "from:" prefix to lowercase so stored values are consistent.
        const val = isFromMode(rawVal) ? `from:${getFromModeHrid(rawVal)}` : rawVal;
        if (shoppingList[i].craftMode === val) return;
        shoppingList[i].craftMode = val;
      } else {
        return;
      }
      saveList();
 
      if (cls.includes('sel-mode') || cls.includes('inp-qty')) {
        refreshPanelForModeChange();
      } else {
        scheduleRender();
      }
    });
 
    entriesContainer.addEventListener('focusout', e => {
      const i = getDatasetIndex(e.target);
      const cls = e.target.className;
      if (i < 0 || !shoppingList[i] || !cls.includes('inp-name')) return;
 
      if (!setEntryName(i, e.target.value).changed) {
        return;
      }
 
      saveListAndRefresh();
    });
 
    entriesContainer.addEventListener('click', e => {
      const actionBtn = e.target.closest('.ShoppingList-btn-action, .ShoppingList-goal-action-btn');
      if (handleActionButtonClick(actionBtn)) return;
 
      // Market-icon button (still works as before)
      const marketBtn = e.target.closest('.ShoppingList-goal-market-btn');
      if (marketBtn) {
        const hrid = marketBtn.dataset.itemHrid;
        if (hrid) navigateToMarket(hrid, null);
        return;
      }
 
      // Clicking anywhere on a sub-row (but NOT on a button) navigates to market
      const goalRow = e.target.closest('.ShoppingList-goal-row.is-sub');
      if (goalRow && !e.target.closest('button')) {
        const hrid = goalRow.dataset.itemHrid;
        if (hrid) navigateToMarket(hrid, null);
        return;
      }
 
      const btn = e.target.closest('.ShoppingList-btn-x');
      if (!btn) return;
      const i = getDatasetIndex(btn);
      if (i >= 0) {
        const removedHrid = shoppingList[i]?.itemHrid;
        shoppingList.splice(i, 1);
        saveListAndRefresh();
 
        // If the removed item was a task goal, restore the + button in the tasks sidepanel
        if (removedHrid && tasksOpen) {
          const addBtn = panel?.querySelector(
            `.ShoppingList-task-row-add[data-item-hrid="${CSS.escape(removedHrid)}"]`
          );
          if (addBtn) {
            addBtn.disabled = false;
            addBtn.textContent = '＋';
            addBtn.title = `Add to Shopping List`;
          }
        }
      }
    });
 
 
  }
 
  // ── Render scheduling (debounce rapid successive calls) ───────────
  let renderTimer = null;
  function scheduleRender() {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(() => {
      mountPanel();
      // Re-render the pinned marketplace bar if it's currently visible.
      if (document.querySelector('[class*="MarketplacePanel"]')) renderMarketPins();
    }, 50);
  }
 
  // ═══════════════════════════════════════════════════════════════════
  // TOGGLE BUTTON (reopens panel after close)
  // ═══════════════════════════════════════════════════════════════════
 
  function buildToggleButton() {
    const btn    = document.createElement('div');
    btn.id       = `${PLUGIN_ID}-toggle`;
    btn.title    = 'Open Shopping List';
    btn.textContent = '🛒';
    btn.style.cssText = `
      position:fixed; bottom:20px; right:20px; z-index:99998;
      width:42px; height:42px; border-radius:50%;
      background:#16213e; border:2px solid #4a4a7a;
      color:#fff; font-size:20px; cursor:pointer;
      display:flex; align-items:center; justify-content:center;
      box-shadow:0 3px 10px rgba(0,0,0,.5);
    `;
    btn.addEventListener('click', () => {
      openPanel();
    });
    document.body.appendChild(btn);
    btn.style.display = 'none';   // hidden until panel is closed
  }
 
  // ═══════════════════════════════════════════════════════════════════
  // INVENTORY INTEGRATION
  // ═══════════════════════════════════════════════════════════════════
 
  function injectInventoryButton(inventoryNode) {
    if (document.getElementById('ShoppingList-inv-btn')) return;
 
    const btn = document.createElement('div');
    btn.id = 'ShoppingList-inv-btn';
    btn.textContent = '🛒 Open Shopping List';
    btn.style.cssText = `
      margin: 4px 0 8px 8px;
      cursor: pointer;
      color: #9090ee;
      font-weight: 700;
      font-size: 12px;
      display: inline-block;
    `;
    btn.addEventListener('click', () => {
      openPanel();
    });
 
    if (inventoryNode.parentNode) {
      inventoryNode.parentNode.insertBefore(btn, inventoryNode);
    }
  }
 
 
  // ═══════════════════════════════════════════════════════════════════
  // HOUSING INTEGRATION
  // ═══════════════════════════════════════════════════════════════════
  let lastHousingSignature = null;
 
  function getHousingSignature(node) {
    const name = node.querySelector('[class*="HousePanel_header"]')?.textContent?.trim() || '';
 
    const costs = [...node.querySelectorAll('[class*="HousePanel_itemRequirementCell"]')]
      .map(el => el.textContent.trim())
      .join('|');
 
    return name + '::' + costs;
  }
 
  function isHousingPanel(node) {
    return node.querySelector?.('[class*="HousePanel_header"]') &&
          node.querySelector?.('[class*="HousePanel_costs"]') &&
          node.querySelector('button')?.textContent?.trim() === "Build";
  }
 
    // Placeholder for future feature
  function injectHousingShoppingListButton(node) {
    // TODO: implement later
  }
 
  // ═══════════════════════════════════════════════════════════════════
  // DOM MUTATION OBSERVER
  // ═══════════════════════════════════════════════════════════════════
 
function startObserver() {
  const observer = new MutationObserver(mutations => {
    for (const { addedNodes } of mutations) {
      for (const node of addedNodes) {
        if (node.nodeType !== 1) continue;
 
          const className = (typeof node.className === 'string') ? node.className : '';
 
          // Housing panel detection
          if (isHousingPanel(node)) {
            infoLog('[MWI Shopping List] Detected housing panel opening');
            const signature = getHousingSignature(node);
            if (!signature || signature === lastHousingSignature) continue;
            lastHousingSignature = signature;
            injectHousingShoppingListButton(node); // currently no-op
            infoLog('[MWI Shopping List] Housing panel updated');
            continue; // IMPORTANT: prevents mutation storm from skill injection
          }
 
          // Inventory opened
          if (className.includes('Inventory_items')) {
            infoLog('[MWI Shopping List] Detected inventory opening via class');
            injectInventoryButton(node);
          } else if (node.querySelector) {
            const inv = node.querySelector('[class*="Inventory_items"]');
            if (inv) {
              infoLog('[MWI Shopping List] Detected inventory opening via querySelector');
              injectInventoryButton(inv);
            }
          }
 
          // Market panel opened
          if (className.includes('arket') || node.querySelector?.('[class*="arket"]')) {
            infoLog('[MWI Shopping List] Detected potential market panel opening');
            setTimeout(renderMarketPins, 300);
          }
 
          // Skill action modal
          if (
            className.includes('SkillActionDetail') ||
            node.querySelector?.('[class*="SkillActionDetail_skillActionDetail"]') ||
            node.querySelector?.('[class*="SkillActionDetail_buttonsContainer"]')
          ) {
            infoLog('[MWI Shopping List] Detected potential skill action modal');
            scheduleInjectAddToShoppingList(node, 50);
          }
 
          // Item tooltip
          if (
            className.includes('Item_actionMenu') ||
            node.querySelector?.('[class*="Item_actionMenu"]')
          ) {
            infoLog('[MWI Shopping List] Detected potential item tooltip');
            scheduleInjectItemTooltipButton(node, 50);
          }
 
          // Tasks board
          if (
            className.includes('TasksPanel') ||
            className.includes('RandomTask') ||
            node.querySelector?.('[class*="TasksPanel_taskBoard"]') ||
            node.querySelector?.('[class*="RandomTask_content"]')
          ) {
            infoLog('[MWI Shopping List] Detected potential task board/modal');
            scheduleInjectTaskButtons(node, 80);
            scheduleInjectTaskBoardButton(node, 80);
 
            setTimeout(() => {
              parseTasksFromDOM();
              hookGameClaimButtons(node);
              if (tasksOpen && panelVisible && panel?.isConnected) {
                refreshTasksTabDOM();
              }
            }, 200);
          }
        }
      }
    });
 
    observer.observe(document.body, { childList: true, subtree: true });
 
    // Initial check
    const inv = document.querySelector('[class*="Inventory_items"]');
    if (inv) injectInventoryButton(inv);
 
    scheduleInjectAddToShoppingList(document, 0);
  }
 
  // ═══════════════════════════════════════════════════════════════════
  // STYLES
  // ═══════════════════════════════════════════════════════════════════
 
  function injectStyles() {
    GM_addStyle(`
      /* ───── Floating panel ───── */
      #ShoppingList-panel {
        --sl-delete-slot: 18px;
        --sl-compact-control-width: 90px;
        position: fixed;
        z-index: 99999;
        display: flex;
        flex-direction: column;
        width: 355px;
        min-width: 310px;
        max-width: min(90vw, 900px);
        min-height: 40px;
        max-height: 90vh;
        overflow: visible;
        background: transparent;
        border: none;
        border-radius: 8px;
        font: 13px/1.4 'Segoe UI', system-ui, sans-serif;
        color: #dde;
        box-shadow: none;
        user-select: none;
        isolation: isolate;
      }
 
      /* wrapper is just the main column — full size of the outer panel */
      #ShoppingList-wrapper {
        display: flex;
        flex-direction: column;
        height: 100%;
        min-height: 40px; /* Match panel min-height */
        position: relative;
      }
 
      /* main column — contains titlebar, tabs, body */
      #ShoppingList-main {
        display: flex;
        flex-direction: column;
        flex: 1 1 auto;
        min-height: 40px; /* Match panel min-height */
        overflow: hidden;
        background: #1a1a2e;
        border: 1px solid #3a3a6a;
        border-radius: 8px;
        box-shadow: 0 6px 24px rgba(0,0,0,.6);
        contain: layout style;
      }
 
      /* ── sidebar tab buttons — stacked vertically on the right edge ── */
      #ShoppingList-sidebar-tabs {
        position: absolute;
        top: 8px;
        right: -26px;
        display: flex;
        flex-direction: column;
        gap: 4px;
        z-index: 2;
      }
 
      .ShoppingList-sidebar-tab {
        width: 26px;
        height: 26px;
        padding: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        background: #1a1a2e;
        border: 1px solid #3a3a6a;
        border-left: none;
        border-radius: 0 6px 6px 0;
        color: #7070aa;
        cursor: pointer;
        font-size: 13px;
        transition: background .12s, color .12s;
      }
      .ShoppingList-sidebar-tab:hover { background: #2a2a4a; color: #ccc; }
      .ShoppingList-sidebar-tab.is-active {
        background: #2a3a5a;
        border-color: #6060cc;
        color: #c0c0ff;
      }
 
      /* ── right column ── */
      #ShoppingList-right-col {
        position: absolute;
        top: 0;
        left: calc(100% + 26px);
        display: flex;
        flex-direction: column;
        width: 260px;
        min-width: 200px;
        max-height: min(90vh, 640px);
        overflow-y: auto;
        overflow-x: hidden;
        border-radius: 8px;
        box-shadow: 0 6px 24px rgba(0,0,0,.6);
      }
      #ShoppingList-right-col[hidden] { display: none; }
 
      /* tasks section */
      #ShoppingList-tasks-sidepanel {
        flex: 0 1 auto;
        display: flex;
        flex-direction: column;
        min-height: 60px;
        overflow: hidden;
        background: #1a1a2e;
        border: 1px solid #3a3a6a;
        border-radius: 8px 8px 0 0;
      }
      /* when settings is also open, tasks gets a bottom border seam */
      #ShoppingList-tasks-sidepanel + #ShoppingList-settings-sidepanel {
        border-top: none;
        border-radius: 0 0 8px 8px;
      }
      /* when tasks is alone, round all corners */
      #ShoppingList-tasks-sidepanel:last-child { border-radius: 8px; }
 
      #ShoppingList-tasks-sidepanel-body {
        flex: 1 1 auto;
        padding: 4px 6px 6px;
        overflow-y: auto;
      }
 
      /* settings section */
      #ShoppingList-settings-sidepanel {
        flex: 0 0 auto;
        display: flex;
        flex-direction: column;
        overflow: visible;
        background: #1a1a2e;
        border: 1px solid #3a3a6a;
        border-radius: 8px;
      }
      /* when below tasks, remove top border + radius */
      #ShoppingList-tasks-sidepanel + #ShoppingList-settings-sidepanel {
        border-top: none;
        border-radius: 0 0 8px 8px;
      }
      /* when settings is alone, round all corners */
      #ShoppingList-settings-sidepanel:first-child { border-radius: 8px; }
 
      #ShoppingList-settings-sidepanel-body {
        flex: 1 1 auto;
        padding: 6px 10px 10px;
        overflow-y: auto;
      }
 
      /* shared header for both right panels */
      .ShoppingList-sidepanel-header {
        flex-shrink: 0;
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 7px 10px;
        background: #111228;
        border-bottom: 1px solid #3a3a6a;
        font-size: 13px;
        font-weight: 700;
        color: #9090ee;
        letter-spacing: .3px;
        min-height: 33px;
        box-sizing: border-box;
      }
 
      /* title bar */
      #ShoppingList-titlebar {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 7px 10px;
        background: #111228;
        border-radius: 8px 8px 0 0;
        cursor: grab;
        border-bottom: 1px solid #3a3a6a;
      }
      #ShoppingList-titlebar:active { cursor: grabbing; }
      #ShoppingList-title { font-weight: 700; color: #9090ee; font-size: 13px; }
      #ShoppingList-titlebar-btns { display: flex; gap: 4px; }
 
      .ShoppingList-hdr-btn {
        background: #2a2a4a;
        border: 1px solid #4a4a7a;
        border-radius: 4px;
        color: #aaa;
        cursor: pointer;
        padding: 1px 7px;
        font-size: 13px;
        line-height: 1.5;
      }
      .ShoppingList-hdr-btn:hover { background: #3a3a6a; color: #fff; }
      .ShoppingList-hdr-btn-lang {
        color: #e8c84a; border-color: #6a6a30;
        padding: 1px 6px; font-size: 11px; min-width: 30px;
      }
      .ShoppingList-hdr-btn-lang:hover { background: #3a3a1a; border-color: #a0a040; color: #ffe070; }
 
      /* body */
      #ShoppingList-body {
        flex: 1 1 auto;
        min-height: 0;
        padding: 8px 11px 10px;
        max-height: none;
        overflow-y: auto;
        scrollbar-gutter: stable;
      }
 
      #ShoppingList-resize-handle {
        position: absolute;
        right: 0;
        bottom: 0;
        width: 14px;
        height: 14px;
        cursor: nwse-resize;
        background: linear-gradient(135deg, transparent 0 45%, rgba(190,190,240,.45) 45% 55%, transparent 55% 100%);
      }
 
      .ShoppingList-section-label {
        font-size: 10px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: .6px;
        color: #7070bb;
        margin-bottom: 4px;
      }
 
      .ShoppingList-divider {
        border: none;
        border-top: 1px solid #2a2a4a;
        margin: 8px 0;
      }
 
      /* entry row */
      .ShoppingList-entry {
        display: flex;
        gap: 4px;
        align-items: center;
        margin-bottom: 4px;
      }
 
      /* shared input style */
      .ShoppingList-inp {
        background: #0d2040;
        border: 1px solid #3a3a6a;
        border-radius: 4px;
        color: #dde;
        padding: 3px 6px;
        font-size: 12px;
        outline: none;
      }
      .ShoppingList-inp:focus { border-color: #6666cc; }
 
      .ShoppingList-inp-name  { flex: 1; min-width: 0; }
      .ShoppingList-inp-qty   { width: 52px; text-align: center; }
 
      .ShoppingList-entry-warn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 16px;
        min-width: 16px;
        color: #ffd54a;
        font-size: 13px;
        line-height: 1;
        cursor: help;
      }
 
      select.ShoppingList-inp  { padding: 3px 2px; font-size: 11px; }
 
      .ShoppingList-sel-mode {
        width: 96px;
        min-width: 96px;
        max-width: 96px;
        box-sizing: border-box;
        overflow: hidden;
        text-overflow: ellipsis;
      }
 
      .ShoppingList-btn-x {
        background: none;
        border: none;
        color: #dd6060;
        cursor: pointer;
        font-size: 13px;
        padding: 0;
        width: 24px;
        min-width: 24px;
        max-width: 24px;
        border-radius: 3px;
        line-height: 1;
        text-align: center;
        box-sizing: border-box;
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }
      .ShoppingList-btn-x:hover { background: #3a1a1a; }
 
      .ShoppingList-btn-action,
      .ShoppingList-goal-action-btn {
        background: #2a2a4a;
        border: 1px solid #4a4a7a;
        border-radius: 4px;
        color: #cfd3ff;
        cursor: pointer;
        font-size: 11px;
        padding: 2px 7px;
        line-height: 1.4;
      }
      .ShoppingList-btn-action:hover,
      .ShoppingList-goal-action-btn:hover {
        background: #3a3a6a;
        color: #fff;
      }
      .ShoppingList-btn-action[disabled] {
        opacity: .5;
        cursor: not-allowed;
      }
 
      .ShoppingList-action-row {
        display: flex;
        gap: 6px;
        margin-top: 4px;
      }
      .ShoppingList-action-btn {
        width: 100%;
        background: #0d2040;
        border: 1px dashed #3a6a3a;
        border-radius: 4px;
        color: #70e070;
        cursor: pointer;
        font-size: 12px;
        padding: 5px;
        flex: 1;
        text-align: center;
      }
      .ShoppingList-action-btn:hover { background: #132a20; }
 
      .ShoppingList-entry-wrap {
        margin-bottom: 4px;
      }
 
      .ShoppingList-inline-chain {
        display: flex;
        flex-direction: column;
        gap: 4px;
        margin: 2px 0 0 0;
      }
 
      .ShoppingList-goal-row {
        display: grid;
        grid-template-columns: 1fr auto auto;
        align-items: center;
        gap: 6px;
        padding: 1px 0;
      }
 
      .ShoppingList-goal-name {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
 
      .ShoppingList-goal-qty {
        font-size: 11px;
        color: #a8a8d6;
      }
 
      .ShoppingList-goal-actions {
        display: flex;
        gap: 4px;
        width: 80px;
        justify-content: flex-end;
        margin-left: 8px;
      }
 
      .ShoppingList-goal-row.is-sub {
        color: #9a9ab8;
        font-size: 11px;
        cursor: pointer;
        transition: background .12s;
      }
 
      .ShoppingList-goal-row.is-sub .ShoppingList-goal-name {
        padding-left: calc(var(--sl-depth, 1) * 12px);
      }
 
      .ShoppingList-goal-row.is-sub:hover { background: #1a2a40; }
 
      .ShoppingList-goal-market-btn {
        background: transparent;
        border: none;
        cursor: pointer;
        font-size: 12px;
        opacity: .6;
        padding: 0;
        width: 24px;
        text-align: center;
      }
      .ShoppingList-goal-market-btn:hover { opacity: 1; }
 
 
      /* settings rows */
      .ShoppingList-row {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-bottom: 5px;
        font-size: 12px;
      }
      .ShoppingList-row > label:not(.ShoppingList-switch) { flex: 1; color: #bbc; }
      .ShoppingList-row .ShoppingList-inp {
        width: var(--sl-compact-control-width);
        min-width: var(--sl-compact-control-width);
        max-width: var(--sl-compact-control-width);
        box-sizing: border-box;
      }
      .ShoppingList-row .ShoppingList-inp[type=text][readonly] { background: #111; color: #889; }
 
      .ShoppingList-switch {
        position: relative;
        display: inline-block;
        width: 36px;
        height: 20px;
        flex: 0 0 auto;
      }
      .ShoppingList-switch input {
        opacity: 0;
        width: 0;
        height: 0;
        position: absolute;
      }
      .ShoppingList-switch-slider {
        position: absolute;
        inset: 0;
        border-radius: 999px;
        background: #2a2a4a;
        border: 1px solid #4a4a7a;
        transition: background .15s ease;
        cursor: pointer;
      }
      .ShoppingList-switch-slider::before {
        content: '';
        position: absolute;
        width: 14px;
        height: 14px;
        left: 2px;
        top: 2px;
        border-radius: 50%;
        background: #cfd3ff;
        transition: transform .15s ease;
      }
      .ShoppingList-switch input:checked + .ShoppingList-switch-slider {
        background: #1f4a2f;
        border-color: #3a6a3a;
      }
      .ShoppingList-switch input:checked + .ShoppingList-switch-slider::before {
        transform: translateX(16px);
      }
 
      .ShoppingList-inline-check {
        display: flex;
        align-items: center;
        gap: 3px;
        font-size: 11px;
        color: #99a;
        white-space: nowrap;
      }
 
      /* advanced details */
      #ShoppingList-advanced {
        margin-top: 4px;
        border: none;
        border-radius: 0;
        padding: 4px 0 6px;
      }
      #ShoppingList-advanced summary {
        cursor: pointer;
        font-size: 11px;
        color: #7070aa;
        list-style: none;
      }
      #ShoppingList-advanced summary::-webkit-details-marker { display: none; }
      #ShoppingList-advanced[open] summary::before { content: '▾ '; }
      #ShoppingList-advanced:not([open]) summary::before { content: '▸ '; }
      #ShoppingList-advanced .ShoppingList-row .ShoppingList-inp {
        width: var(--sl-compact-control-width);
        min-width: var(--sl-compact-control-width);
        max-width: var(--sl-compact-control-width);
        box-sizing: border-box;
      }
      #ShoppingList-default-entry-qty {
        width: var(--sl-compact-control-width);
        min-width: var(--sl-compact-control-width);
        max-width: var(--sl-compact-control-width);
        box-sizing: border-box;
        padding: 3px 2px;
      }
 
      /* buy list */
      .ShoppingList-buy-row {
        display: flex;
        align-items: center;
        gap: 5px;
        padding: 4px 6px;
        border-radius: 4px;
        cursor: pointer;
        margin-bottom: 2px;
        transition: background .12s;
      }
      .ShoppingList-buy-row:hover { background: #1a2a40; }
 
      .ShoppingList-buy-name { flex: 1; font-size: 12px; }
      .ShoppingList-buy-qty  { font-weight: 700; font-size: 12px; white-space: nowrap; }
      .ShoppingList-buy-qty.enough { color: #88ee88; }
      .ShoppingList-buy-qty.missing { color: #ff7a7a; }
      .ShoppingList-buy-mkt  { font-size: 12px; opacity: .6; }
 
      .ShoppingList-tag {
        font-size: 9px;
        padding: 1px 4px;
        border-radius: 3px;
        font-weight: 700;
        white-space: nowrap;
      }
      .ShoppingList-tag.tea { background: #1a3a2a; color: #60d090; }
      .ShoppingList-tag.upg { background: #2a2a1a; color: #d0a060; }
 
      /* ───── Market pinned bar ───── */
      #ShoppingList-pins {
        background: #111228;
        border: 1px solid #3a3a6a;
        border-radius: 6px;
        padding: 7px 9px;
        margin-bottom: 8px;
        font: 12px/1.4 'Segoe UI', system-ui, sans-serif;
        color: #dde;
      }
      .ShoppingList-pins-header {
        font-size: 10px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: .6px;
        color: #7070bb;
        margin-bottom: 6px;
      }
      .ShoppingList-chips { display: flex; flex-wrap: wrap; gap: 5px; }
      .ShoppingList-chip {
        display: inline-flex;
        align-items: center;
        gap: 3px;
        background: #0d2040;
        border: 1px solid #3a3a6a;
        border-radius: 4px;
        padding: 3px 8px;
        cursor: pointer;
        transition: background .12s;
        font-size: 12px;
      }
      .ShoppingList-chip:hover { background: #1a3860; border-color: #6060cc; }
      .ShoppingList-chip-badge { font-size: 11px; }
      .ShoppingList-chip-qty   { font-weight: 700; }
      .ShoppingList-chip-qty.enough { color: #88ee88; }
      .ShoppingList-chip-qty.missing { color: #ff7a7a; }
      /* ───── Item sprite icons ───── */
      .ShoppingList-item-icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex: 0 0 auto;
        width: 20px;
        height: 20px;
      }
      .ShoppingList-item-icon svg { display: block; width: 100%; height: 100%; }
 
      /* entry row icon — sits left of the name input */
      .ShoppingList-entry-icon { width: 22px; height: 22px; }
 
      /* inline chain sub-row icon — sits between ↳ and the name, indented with it */
      .ShoppingList-goal-icon { width: 16px; height: 16px; opacity: 0.85; vertical-align: middle; margin: 0 2px 1px; }
 
      /* material list row icon */
      .ShoppingList-buy-icon  { width: 20px; height: 20px; }
 
      /* market bar chip icon */
      .ShoppingList-chip-icon { width: 18px; height: 18px; }
 
      /* ───── Item tooltip inject ───── */
      .ShoppingList-tooltip-inject {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 6px 8px 4px;
        border-top: 1px solid rgba(255,255,255,.08);
        margin-top: 4px;
      }
 
      .ShoppingList-tooltip-qty-inp {
        width: 54px;
        min-width: 54px;
        text-align: center;
        padding: 3px 4px;
        font-size: 12px;
        /* spin-button tidy-up */
        -moz-appearance: textfield;
      }
      .ShoppingList-tooltip-qty-inp::-webkit-inner-spin-button,
      .ShoppingList-tooltip-qty-inp::-webkit-outer-spin-button { opacity: 0.5; }
 
      .ShoppingList-tooltip-add-btn {
        flex: 1;
        padding: 4px 8px;
        border-radius: 4px;
        border: 1px solid #2a7a5a;
        background: #0d3028;
        color: #60e0a0;
        font-size: 12px;
        font-weight: 700;
        cursor: pointer;
        white-space: nowrap;
        transition: background .12s, border-color .12s;
      }
      .ShoppingList-tooltip-add-btn:hover {
        background: #174a38;
        border-color: #40c080;
        color: #90ffcc;
      }
 
      /* ───── Tab bar ───── */
      /* ───── Tasks tab ───── */
      .ShoppingList-task-row {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 4px 4px;
        border-radius: 4px;
        margin-bottom: 3px;
        background: #111228;
        border: 1px solid #2a2a4a;
      }
 
      .ShoppingList-task-icon {
        width: 24px;
        height: 24px;
        flex-shrink: 0;
      }
 
      .ShoppingList-task-info {
        flex: 1;
        min-width: 0;
      }
 
      .ShoppingList-task-name {
        font-size: 12px;
        font-weight: 600;
        color: #dde;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
 
      .ShoppingList-task-skill {
        font-size: 10px;
        color: #7070aa;
        text-transform: capitalize;
        margin-bottom: 3px;
      }
 
      .ShoppingList-task-progress-bar {
        height: 4px;
        background: #2a2a4a;
        border-radius: 2px;
        overflow: hidden;
        margin-bottom: 2px;
      }
 
      .ShoppingList-task-progress-fill {
        height: 100%;
        background: linear-gradient(90deg, #4a7a4a, #70d070);
        border-radius: 2px;
        transition: width .3s ease;
      }
 
      .ShoppingList-task-progress-label {
        font-size: 10px;
        color: #6677aa;
      }
 
      /* button column on the right of each task row */
      .ShoppingList-task-btns {
        display: flex;
        flex-direction: column;
        gap: 4px;
        flex-shrink: 0;
        align-items: stretch;
      }
 
      .ShoppingList-task-action-btn {
        padding: 3px 7px;
        font-size: 11px;
        background: #0d2040;
        border: 1px solid #3a3a6a;
        border-radius: 4px;
        color: #9090ee;
        cursor: pointer;
        white-space: nowrap;
      }
      .ShoppingList-task-action-btn:hover { background: #1a2a4a; color: #fff; }
 
      .ShoppingList-task-row-add {
        padding: 3px 9px;
        font-size: 13px;
        font-weight: 700;
        /* override any inherited full-width */
        width: auto !important;
        flex: none;
      }
      .ShoppingList-task-row-add:disabled {
        background: #0d2a1a;
        border-color: #2a5a2a;
        color: #60a060;
        cursor: default;
        opacity: 0.7;
      }
 
      .ShoppingList-task-claim-btn {
        padding: 3px 7px;
        font-size: 11px;
        width: auto !important;
      }
 
      .ShoppingList-tasks-empty {
        text-align: center;
        padding: 24px 12px;
        color: #667;
      }
 
      /* ───── "Add All" button in task board ───── */
      .ShoppingList-tasks-add-all-btn {
        display: inline-block;
        width: auto;
        margin: 6px 8px 2px;
        padding: 5px 12px;
        border-radius: 4px;
        border: 1px solid #2a7a5a;
        background: #0d3028;
        color: #60e0a0;
        font-size: 12px;
        font-weight: 700;
        cursor: pointer;
        transition: background .12s, border-color .12s;
      }
      .ShoppingList-tasks-add-all-btn:hover {
        background: #174a38;
        border-color: #40c080;
        color: #90ffcc;
      }
 
      /* ───── In-task-card add button (injected into game DOM) ───── */
      .ShoppingList-task-add-btn {
        flex: 0 0 auto !important;
        /* Match the game's standard button height and padding */
        height: 32px; 
        min-width: 40px;
        padding: 0 10px !important;
        margin-left: auto; /* Pushes the button (and the Go button after it) to the right */
        font-size: 16px !important;
        display: flex;
        align-items: center;
        justify-content: center;
      }
 
      .SL-modal-overlay {
        position: fixed; inset: 0; background: rgba(0,0,0,0.7);
        display: flex; align-items: center; justify-content: center; z-index: 100000;
      }
      .SL-modal {
        background: #1a1a2e; border: 1px solid #3a3a6a; border-radius: 8px;
        padding: 16px; width: 280px; box-shadow: 0 8px 32px rgba(0,0,0,0.8);
        text-align: center;
      }
      .SL-modal-text { color: #dde; margin-bottom: 20px; font-size: 14px; }
      .SL-modal-btns { display: flex; gap: 10px; justify-content: center; }
      .SL-modal-btn {
        padding: 6px 16px; border-radius: 4px; cursor: pointer; border: 1px solid #3a3a6a;
        background: #2a2a4a; color: #ccc; font-size: 12px;
      }
      .SL-modal-btn-confirm { background: #4a1a1a; border-color: #7a3a3a; color: #ff7a7a; }
      .SL-modal-btn:hover { filter: brightness(1.2); }
    `);
  }
  // ═══════════════════════════════════════════════════════════════════
 
  // Polls localStorageUtil (populated after login) to read item/action game data.
  // Called on a 1-second interval until data is available.
  function tryLoadGameData({ refreshInventory = false } = {}) {
    if (isDataLoaded && !refreshInventory) return true;
    try {
      if (!isDataLoaded) {
        const initResult = getInitClientData();
        if (!initResult?.data) return false;
        applyInitClientData(initResult.data);
      }
 
      const characterResult = getCharacterData(refreshInventory);
      const hasCharacterData = !!characterResult?.character;
      if (characterResult?.character) {
        applyCharacterDataPayload(characterResult.character, !refreshInventory);
      }
 
      // Initial startup should keep polling until inventory data is also available.
      if (!refreshInventory) {
        return isDataLoaded && hasCharacterData;
      }
 
      return hasCharacterData;
    } catch (e) {
      console.error('[ShoppingList] Error reading localStorageUtil:', e);
      return false;
    }
  }
 
  function init() {
    installSocketListener();
    loadAll();
 
    // Retry until init data is available.
    if (!tryLoadGameData()) {
      const interval = setInterval(() => {
        if (tryLoadGameData()) {
          clearInterval(interval);
        }
      }, 1000);
    }
 
    // Build UI once the body is available
    const ready = () => {
      if (!document.body) { requestAnimationFrame(ready); return; }
      injectStyles();
      mountPanel();
      buildToggleButton();
 
      // Start closed: the panel should only open on explicit user action.
      panelVisible = false;
      applyPanelVisibility();
 
      startObserver();
      installBuyInterceptor();
 
      // Briefly navigate to the task board to load DOM and capture Claim button
      // references, then return. Delayed so the game has fully settled first.
      if (opts.autoLoadTaskBoard) setTimeout(backgroundLoadTaskBoard, 2500);
    };
 
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', ready);
    } else {
      ready();
    }
    console.log('[ShoppingList] Initialized');
  }
 
  init();
 
})();