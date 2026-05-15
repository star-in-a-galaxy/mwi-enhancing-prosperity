/**
 * load-market-data.js — Load market prices from MWI API + daily volume from observatory
 *
 * Priority:
 *   1. Live prices from MWI API (marketplace.json) — always fresh
 *   2. Volume data from mwi-market-observatory daily files (past 3 days)
 *   3. Fallback: daily files from observatory for prices if API fails
 */

const MWI_API_URL = 'https://www.milkywayidle.com/game_data/marketplace.json';
const OBS_RAW = 'https://raw.githubusercontent.com/star-in-a-galaxy/mwi-market-observatory/main/data';
const OBS_API = 'https://api.github.com/repos/star-in-a-galaxy/mwi-market-observatory/contents/data';

async function tryFetchJson(url) {
    try {
        const res = await fetch(url);
        if (res.ok) return await res.json();
    } catch (e) { /* ignore */ }
    return null;
}

function cacheBust(url) {
    const sep = url.includes('?') ? '&' : '?';
    return url + sep + '_t=' + Date.now() + '&_r=' + Math.random().toString(36).slice(2, 8);
}

async function loadLiveMarketData() {
    const url = cacheBust(MWI_API_URL);
    try {
        const res = await fetch(url, { cache: 'no-cache' });
        if (!res.ok) return null;
        const json = await res.json();
        if (!json.marketData || !json.timestamp) return null;

        const market = {};
        for (const [hrid, levels] of Object.entries(json.marketData)) {
            market[hrid] = market[hrid] || {};
            for (const [level, prices] of Object.entries(levels)) {
                if (prices && typeof prices === 'object') {
                    const ask = (typeof prices.a === 'number' && prices.a > 0) ? prices.a : null;
                    const bid = (typeof prices.b === 'number' && prices.b > 0) ? prices.b : null;
                    if (ask || bid) {
                        const entry = { a: ask, b: bid };
                        if (ask && bid) entry.m = (ask + bid) / 2;
                        market[hrid][level] = entry;
                    }
                }
            }
        }

        return { market, ts: json.timestamp, source: 'live' };
    } catch (e) {
        console.warn('Live market data fetch failed:', e.message);
        return null;
    }
}

function convertToMarketPrices(dailyData) {
    const market = {};
    if (!dailyData) return market;

    if (dailyData.data) {
        for (const [hrid, levels] of Object.entries(dailyData.data)) {
            market[hrid] = market[hrid] || {};
            for (const [level, prices] of Object.entries(levels)) {
                if (prices && typeof prices === 'object') {
                    const ask = (typeof prices.a === 'number' && prices.a > 0) ? prices.a : null;
                    const bid = (typeof prices.b === 'number' && prices.b > 0) ? prices.b : null;
                    if (ask || bid) {
                        const entry = { a: ask, b: bid, p: prices.p, v: prices.v };
                        if (ask && bid) entry.m = (ask + bid) / 2;
                        market[hrid][level] = entry;
                    }
                }
            }
        }
        return market;
    }

    if (dailyData.items) {
        for (const [hrid, levels] of Object.entries(dailyData.items)) {
            market[hrid] = market[hrid] || {};
            for (const [level, prices] of Object.entries(levels)) {
                if (prices && typeof prices === 'object') {
                    const ask = prices.ca || prices.ha || prices.la || prices.oa;
                    const bid = prices.cb || prices.hb || prices.lb || prices.ob;
                    const vol = (typeof prices.v === 'number' && prices.v >= 0) ? prices.v : null;
                    if ((typeof ask === 'number' && ask > 0) || (typeof bid === 'number' && bid > 0)) {
                        const entry = { a: ask, b: bid };
                        if (vol !== null) entry.v = vol;
                        if (typeof prices.ca === 'number' && typeof prices.cb === 'number' && prices.ca > 0 && prices.cb > 0) {
                            entry.m = (prices.ca + prices.cb) / 2;
                        }
                        market[hrid][level] = entry;
                    }
                }
            }
        }
    }

    return market;
}

async function loadDailyRemote(dateStr) {
    const url = `${OBS_RAW}/daily/${dateStr}.json`;
    return await tryFetchJson(url);
}

function mergeVolumeFromDaily(market, dailyData) {
    if (!dailyData?.items) return market;
    for (const [hrid, levels] of Object.entries(dailyData.items)) {
        if (!market[hrid]) continue;
        for (const [level, prices] of Object.entries(levels)) {
            if (prices && typeof prices === 'object') {
                if (typeof prices.v === 'number' && prices.v >= 0) {
                    if (!market[hrid][level]) market[hrid][level] = {};
                    market[hrid][level].v = prices.v;
                }
                if (typeof prices.ca === 'number' && typeof prices.cb === 'number' && prices.ca > 0 && prices.cb > 0) {
                    if (!market[hrid][level]) market[hrid][level] = {};
                    market[hrid][level].m = (prices.ca + prices.cb) / 2;
                }
            }
        }
    }
    return market;
}

async function loadLatestDailyVolume() {
    const apiUrl = `${OBS_API}/daily`;
    try {
        const res = await fetch(apiUrl);
        if (res.ok) {
            const files = await res.json();
            if (Array.isArray(files)) {
                const jsonFiles = files
                    .filter(f => f.name.endsWith('.json') && f.download_url)
                    .sort((a, b) => b.name.localeCompare(a.name))
                    .slice(0, 3);
                for (const f of jsonFiles) {
                    const data = await tryFetchJson(f.download_url);
                    if (data?.items) return data;
                }
            }
        }
    } catch (e) { /* ignore */ }
    return null;
}

async function loadFallbackFromObservatory() {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    const hourlyData = await loadHourlyRemote(todayStr);
    if (hourlyData) {
        const market = convertToMarketPrices(hourlyData);
        const ts = hourlyData.timestamp
            ? Math.floor(hourlyData.timestamp)
            : (hourlyData.fetchedAt ? Math.floor(new Date(hourlyData.fetchedAt).getTime() / 1000) : Math.floor(Date.now() / 1000));
        return { market, ts, dataDate: todayStr, source: 'observatory-hourly' };
    }

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];
    const yesterdayHourly = await loadHourlyRemote(yesterdayStr);
    if (yesterdayHourly) {
        const market = convertToMarketPrices(yesterdayHourly);
        const ts = yesterdayHourly.timestamp
            ? Math.floor(yesterdayHourly.timestamp)
            : (yesterdayHourly.fetchedAt ? Math.floor(new Date(yesterdayHourly.fetchedAt).getTime() / 1000) : Math.floor(Date.now() / 1000));
        return { market, ts, dataDate: yesterdayStr, source: 'observatory-hourly' };
    }

    for (let daysAgo = 1; daysAgo < 4; daysAgo++) {
        const date = new Date(today);
        date.setDate(date.getDate() - daysAgo);
        const dateStr = date.toISOString().split('T')[0];
        const dailyData = await loadDailyRemote(dateStr);
        if (dailyData) {
            const market = convertToMarketPrices(dailyData);
            let ts = Math.floor(Date.now() / 1000);
            if (dailyData.timestamp) ts = Math.floor(dailyData.timestamp);
            else if (dailyData.fetchedAt) ts = Math.floor(new Date(dailyData.fetchedAt).getTime() / 1000);
            else if (dailyData.date) ts = Math.floor(new Date(dailyData.date).getTime() / 1000);
            const dataDate = dailyData.date || dailyData.fetchedAt?.split('T')[0] || dateStr;
            return { market, ts, dataDate: dataDate, source: 'observatory-daily' };
        }
    }

    return null;
}

async function loadHourlyRemote(dateStr) {
    const apiUrl = `${OBS_API}/hourly/${dateStr}`;
    try {
        const res = await fetch(apiUrl);
        if (res.ok) {
            const files = await res.json();
            if (Array.isArray(files)) {
                const jsonFiles = files
                    .filter(f => f.name.endsWith('.json') && f.download_url)
                    .sort((a, b) => b.name.localeCompare(a.name));
                for (const f of jsonFiles) {
                    const data = await tryFetchJson(f.download_url);
                    if (data) {
                        console.log(`Loaded hourly data from ${f.download_url}`);
                        return data;
                    }
                }
            }
        }
    } catch (e) { /* ignore */ }
    return null;
}

async function initializeMarketData() {
    let market = {};
    let ts = Math.floor(Date.now() / 1000);
    let dataDate = new Date().toISOString().split('T')[0];
    let source = 'unknown';

    const liveResult = await loadLiveMarketData();
    if (liveResult) {
        market = liveResult.market;
        ts = liveResult.ts;
        source = liveResult.source;
        console.log(`Loaded live market data: ${Object.keys(market).length} items with prices`);

        const volDaily = await loadLatestDailyVolume();
        if (volDaily) {
            mergeVolumeFromDaily(market, volDaily);
            console.log('Merged 24h volume from daily data');
        }
    } else {
        console.warn('Live market data unavailable, falling back to observatory data...');
        const fallbackResult = await loadFallbackFromObservatory();
        if (fallbackResult) {
            market = fallbackResult.market;
            ts = fallbackResult.ts;
            dataDate = fallbackResult.dataDate || dataDate;
            source = fallbackResult.source;

            const volDaily = await loadLatestDailyVolume();
            if (volDaily) {
                mergeVolumeFromDaily(market, volDaily);
                console.log('Merged 24h volume from daily data');
            }
        } else {
            console.warn('No market data found');
        }
    }

    return { market, ts, dataDate, source, history: {} };
}

window.MARKET_DATA_READY = initializeMarketData();
window.REFRESH_MARKET_DATA = initializeMarketData;