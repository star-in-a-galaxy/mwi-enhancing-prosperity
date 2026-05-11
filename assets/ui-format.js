/**
 * ui-format.js — Formatting and display helpers
 */

function hridToIconPath(hrid) {
    const name = hrid.replace('/items/', '');
    const fileName = name.charAt(0).toUpperCase() + name.slice(1) + '.svg';
    return 'assets/item_icons/' + fileName;
}

function formatDuration(hours) {
    const totalMinutes = Math.round(hours * 60);
    const d = Math.floor(totalMinutes / 1440);
    const h = Math.floor((totalMinutes % 1440) / 60);
    const m = totalMinutes % 60;
    const parts = [];
    if (d > 0) parts.push(`${d}d`);
    if (h > 0) parts.push(`${h}h`);
    if (m > 0 || parts.length === 0) parts.push(`${m}m`);
    return parts.join(' ');
}

function formatCoin(amount) {
    const abs = Math.abs(amount);
    const sign = amount < 0 ? '-' : '';
    if (abs >= 1000000000) {
        return sign + (abs / 1000000000).toFixed(2) + 'B';
    } else if (abs >= 1000000) {
        return sign + (abs / 1000000).toFixed(1) + 'M';
    } else if (abs >= 1000) {
        return sign + (abs / 1000).toFixed(1) + 'K';
    }
    return amount.toLocaleString();
}

function formatCoinExact(amount) {
    const abs = Math.abs(amount);
    const sign = amount < 0 ? '-' : '';
    if (abs >= 1000000000) return sign + (abs / 1000000000).toFixed(2) + 'B';
    if (abs >= 1000000) return sign + (abs / 1000000).toFixed(2) + 'M';
    return amount.toLocaleString();
}

function formatSeconds(seconds) {
    seconds = Math.round(seconds);
    if (seconds < 60) return `${seconds}s`;
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    if (m < 60) return `${m}m ${s}s`;
    const h = Math.floor(m / 60);
    const rm = m % 60;
    return `${h}h ${rm}m`;
}

function getSellPrice(r) {
    const sp = r.sellPrices?.[currentSellMode];
    const raw = sp ? (sp.price || 0) : 0;
    return raw * (1 - marketFeePct / 100);
}

function getSellModeLabel(mode) {
    switch (mode) {
        case 'pessimistic': return 'bid';
        case 'pessimistic+': return 'bid+1';
        case 'midpoint': return '24hr avg';
        case 'optimistic-': return 'ask-1';
        case 'optimistic': return 'ask';
        default: return mode;
    }
}

function getCostBucket(totalCost) {
    if (totalCost < 100e6) return '100m';
    if (totalCost < 300e6) return '300m';
    if (totalCost < 1e9) return '1b';
    if (totalCost < 2e9) return '2b';
    if (totalCost < 5e9) return '5b';
    return 'over5b';
}

function getStrategyLabel(r) {
    const isRefined = r.hrid && r.hrid.includes('_refined');
    const source = r.baseSource || 'market';
    const mode = r._baseItemMode || 'best';
    if (isRefined) {
        if (source === 'market-bid') return 'Buy (R) bid';
        if (source === 'market') return mode === 'bid' ? 'Bid (R)' : 'Buy (R) ask';
        if (source === 'craft') {
            if (r._refineStrategy === 'buy-refine') return 'Buy + refine';
            if (r._refineStrategy === 'craft-refine') return 'Craft + refine';
            return 'Refine';
        }
        return 'Refine';
    }
    if (mode === 'bid') return 'Bid';
    if (source === 'market') return 'Ask';
    if (source === 'craft') return 'Craft';
    if (source === 'vendor') return 'Vendor';
    return 'None';
}

function getStrategyHtml(r) {
    const label = getStrategyLabel(r);
    let color;
    switch (label) {
        case 'Buy (R) ask': case 'Ask': color = '#3b82f6'; break;
        case 'Buy (R) bid': case 'Bid (R)': case 'Bid': color = '#a855f7'; break;
        case 'Buy + refine': case 'Craft + refine': case 'Refine': case 'Craft': color = '#22c55e'; break;
        default: color = 'var(--text-muted)';
    }
    return `<span style="color:${color};font-size:0.82rem;">${label}</span>`;
}
