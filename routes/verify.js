const express = require('express');
const https = require('https');
const http = require('http');
const { db, updateUserGamerscore } = require('../db');
const { authenticate } = require('./middleware');

const router = express.Router();

const RIOT_API_KEY = process.env.RIOT_API_KEY || '';
const CLASH_ROYALE_API_KEY = process.env.CLASH_ROYALE_API_KEY || '';
const TRACKER_GG_API_KEY = process.env.TRACKER_GG_API_KEY || '';

// ─── TRACKER.GG GAME CONFIG ───────────────────────────────────────────────────
// trnSlug: the game slug used by tracker.gg API
// segType: 'overview' or 'playlist' — which segment type has rank data
// segAttr: for playlist segments, match these attributes
// rankStat: the stats key that holds current rank info
// peakStat: the stats key that holds peak rank info (null if none)
// divStat: a secondary stat to combine with rankStat (e.g., Rocket League tier+division)
const TRACKER_GG_GAMES = {
  'fortnite':         { trnSlug: 'fortnite',      segType: 'playlist', segAttr: { playlist: 'ranked-br' }, rankStat: 'rank',       peakStat: null,        divStat: null },
  'valorant':         { trnSlug: 'valorant',       segType: 'overview', segAttr: {},                        rankStat: 'rank',       peakStat: 'peakRank',  divStat: null },
  'r6s':              { trnSlug: 'r6s',            segType: 'overview', segAttr: {},                        rankStat: 'rank',       peakStat: 'maxRank',   divStat: null },
  'marvel-rivals':    { trnSlug: 'marvel-rivals',  segType: 'overview', segAttr: {},                        rankStat: 'rank',       peakStat: null,        divStat: null },
  'apex-legends':     { trnSlug: 'apex',           segType: 'overview', segAttr: {},                        rankStat: 'rankScore',  peakStat: null,        divStat: null },
  'rocket-league':    { trnSlug: 'rocket-league',  segType: 'playlist', segAttr: { playlist: 'ranked-standard' }, rankStat: 'tier', peakStat: null,        divStat: 'division' },
  'lol':              { trnSlug: 'lol',            segType: 'overview', segAttr: {},                        rankStat: 'rank',       peakStat: null,        divStat: null },
  'cs2':              { trnSlug: 'csgo',           segType: 'overview', segAttr: {},                        rankStat: 'rank',       peakStat: null,        divStat: null },
  'halo-infinite':    { trnSlug: 'halo-infinite',  segType: 'playlist', segAttr: null,                      rankStat: 'csr',        peakStat: null,        divStat: null },
  'overwatch-2':      { trnSlug: 'overwatch-2',    segType: 'overview', segAttr: {},                        rankStat: 'rank',       peakStat: null,        divStat: null },
  'cod-bo6':          { trnSlug: 'cod',            segType: 'overview', segAttr: {},                        rankStat: 'rank',       peakStat: null,        divStat: null },
  'pubg':             { trnSlug: 'pubg',           segType: 'overview', segAttr: {},                        rankStat: 'rankPoints', peakStat: null,        divStat: null },
  'destiny-2':        { trnSlug: 'destiny-2',      segType: 'overview', segAttr: {},                        rankStat: 'rank',       peakStat: null,        divStat: null },
  'smite-2':          { trnSlug: 'smite-2',        segType: 'overview', segAttr: {},                        rankStat: 'rank',       peakStat: null,        divStat: null },
  'splitgate-2':      { trnSlug: 'splitgate-2',    segType: 'overview', segAttr: {},                        rankStat: 'rank',       peakStat: null,        divStat: null },
  'battlefield-2042': { trnSlug: 'bf2042',         segType: 'overview', segAttr: {},                        rankStat: 'rank',       peakStat: null,        divStat: null },
  'roblox':           { trnSlug: 'roblox',         segType: 'overview', segAttr: {},                        rankStat: 'rank',       peakStat: null,        divStat: null },
};

// ─── LEGACY API CONFIGURATION (non-tracker.gg games) ─────────────────────────
const GAME_API_CONFIG = {
  dota2: {
    label: 'Steam Account ID or Profile URL',
    placeholder: '123456789 or steamcommunity.com/id/...',
    help: 'Enter your Steam32 account ID or full Steam profile URL. Your Dota 2 profile must be public.',
    method: 'opendota',
    requiresKey: false,
    showRegion: false,
  },
  'chess-rapid': {
    label: 'Chess.com Username',
    placeholder: 'YourChessUsername',
    help: 'Enter your Chess.com username exactly as it appears on your profile.',
    method: 'chesscom',
    subtype: 'rapid',
    requiresKey: false,
    showRegion: false,
  },
  'chess-blitz': {
    label: 'Chess.com Username',
    placeholder: 'YourChessUsername',
    help: 'Enter your Chess.com username exactly as it appears on your profile.',
    method: 'chesscom',
    subtype: 'blitz',
    requiresKey: false,
    showRegion: false,
  },
  'clash-royale': {
    label: 'Player Tag',
    placeholder: '#ABC123DEF',
    help: 'Enter your Clash Royale player tag (found in your profile, starts with #).',
    method: 'clashroyale',
    requiresKey: true,
    showRegion: false,
  },
};

// ─── HTTP HELPER ──────────────────────────────────────────────────────────────
function fetchJson(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, { headers }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { reject(new Error(`Invalid JSON from ${url}`)); }
      });
    });
    req.on('error', reject);
    req.setTimeout(9000, () => { req.destroy(); reject(new Error('API timeout')); });
  });
}

// ─── RANK MAPPING HELPERS ─────────────────────────────────────────────────────

// Normalize rank name for comparison: lowercase, roman numerals → numbers, strip "Division"
function normalizeRankName(name) {
  if (!name) return '';
  return name.toLowerCase()
    .replace(/\bdivision\s*/gi, '')
    .replace(/\bvii\b/g, '7').replace(/\bvi\b/g, '6').replace(/\biv\b/g, '4')
    .replace(/\biii\b/g, '3').replace(/\bii\b/g, '2')
    .replace(/\bv\b/g, '5').replace(/\bi\b/g, '1')
    .replace(/\s+/g, ' ')
    .trim();
}

// Find the best-matching rank index by name
function findRankIndex(ranks, rankName) {
  if (!rankName || !ranks.length) return 0;
  const norm = normalizeRankName(rankName);
  // Exact match
  let idx = ranks.findIndex(r => normalizeRankName(r.name) === norm);
  if (idx >= 0) return idx;
  // Starts-with match
  idx = ranks.findIndex(r => norm.startsWith(normalizeRankName(r.name)) || normalizeRankName(r.name).startsWith(norm));
  return idx >= 0 ? idx : 0;
}

// Riot region → routing cluster for account-v1
function riotCluster(region) {
  const map = {
    na1: 'americas', br1: 'americas', la1: 'americas', la2: 'americas',
    euw1: 'europe', eun1: 'europe', tr1: 'europe', ru: 'europe',
    kr: 'asia', jp1: 'asia',
    oc1: 'sea', sg2: 'sea', ph2: 'sea', th2: 'sea', tw2: 'sea', vn2: 'sea',
  };
  return map[region] || 'americas';
}

// Maps Riot tier+division → our rank index for LoL
function lolRankIndex(tier, rank) {
  const tierBase = {
    IRON: 0, BRONZE: 4, SILVER: 8, GOLD: 12, PLATINUM: 16,
    EMERALD: 20, DIAMOND: 24,
  };
  const divOffset = { IV: 0, III: 1, II: 2, I: 3 };
  if (tier === 'MASTER') return 28;
  if (tier === 'GRANDMASTER') return 29;
  if (tier === 'CHALLENGER') return 30;
  const base = tierBase[tier];
  if (base === undefined) return 0;
  return base + (divOffset[rank] ?? 0);
}

// Maps Riot tier+division → our rank index for TFT
function tftRankIndex(tier, rank) {
  const tierBase = {
    IRON: 0, BRONZE: 4, SILVER: 8, GOLD: 12, PLATINUM: 16,
    DIAMOND: 20,
  };
  const divOffset = { IV: 0, III: 1, II: 2, I: 3 };
  if (tier === 'MASTER') return 24;
  if (tier === 'GRANDMASTER') return 25;
  if (tier === 'CHALLENGER') return 26;
  const base = tierBase[tier];
  if (base === undefined) return 0;
  return base + (divOffset[rank] ?? 0);
}

// OpenDota rank_tier → our Dota 2 rank index
function dota2RankIndex(rank_tier) {
  if (!rank_tier) return 0;
  if (rank_tier >= 80) return 35; // Immortal
  const medal = Math.floor(rank_tier / 10); // 1-7
  const stars = rank_tier % 10;             // 1-5
  if (medal < 1 || medal > 7) return 0;
  return (medal - 1) * 5 + Math.max(0, stars - 1);
}

// Chess.com rating → our rapid rank index
function chessRapidIndex(rating) {
  if (rating < 400) return 0;
  if (rating < 600) return 1;
  if (rating < 800) return 2;
  if (rating < 1000) return 3;
  if (rating < 1200) return 4;
  if (rating < 1400) return 5;
  if (rating < 1600) return 6;
  if (rating < 1800) return 7;
  if (rating < 2000) return 8;
  if (rating < 2200) return 9;
  if (rating < 2400) return 10;
  if (rating < 2600) return 11;
  if (rating < 2800) return 12;
  return 13;
}

// Chess.com rating → our blitz rank index
function chessBlitzIndex(rating) {
  if (rating < 400) return 0;
  if (rating < 800) return 1;
  if (rating < 1000) return 2;
  if (rating < 1200) return 3;
  if (rating < 1400) return 4;
  if (rating < 1600) return 5;
  if (rating < 1800) return 6;
  if (rating < 2000) return 7;
  if (rating < 2200) return 8;
  if (rating < 2400) return 9;
  if (rating < 2600) return 10;
  return 11;
}

// Clash Royale trophies → our rank index
function clashRoyaleIndex(trophies) {
  if (trophies < 300) return 0;
  if (trophies < 600) return 1;
  if (trophies < 1000) return 2;
  if (trophies < 1400) return 3;
  if (trophies < 1800) return 4;
  if (trophies < 2300) return 5;
  if (trophies < 2800) return 6;
  if (trophies < 3300) return 7;
  if (trophies < 3800) return 8;
  if (trophies < 4600) return 9;
  if (trophies < 5000) return 10;
  if (trophies < 5300) return 11;
  if (trophies < 5600) return 12;
  if (trophies < 6000) return 13;
  if (trophies < 6300) return 14;
  if (trophies < 7000) return 15;
  if (trophies < 7500) return 16;
  if (trophies < 8000) return 17;
  if (trophies < 8500) return 18;
  return 19;
}

// ─── TRACKER.GG LOOKUP ────────────────────────────────────────────────────────
async function lookupTrackerGG(slug, trnUrl) {
  if (!TRACKER_GG_API_KEY) throw new Error('Tracker.gg API key not configured on this server');

  const cfg = TRACKER_GG_GAMES[slug];
  if (!cfg) throw new Error('This game is not configured for tracker.gg lookup');

  // Parse tracker.gg URL: https://tracker.gg/{game}/profile/{platform}/{username}/...
  const match = trnUrl.match(/tracker\.gg\/[^/]+\/profile\/([^/]+)\/([^/?#]+)/);
  if (!match) {
    throw new Error('Invalid tracker.gg URL. Expected format: https://tracker.gg/{game}/profile/{platform}/{username}');
  }

  const platform = match[1];
  const username = decodeURIComponent(match[2]);

  const apiUrl = `https://public-api.tracker.gg/v2/${cfg.trnSlug}/standard/profile/${platform}/${encodeURIComponent(username)}`;
  const res = await fetchJson(apiUrl, {
    'TRN-Api-Key': TRACKER_GG_API_KEY,
    'Accept': 'application/json',
  });

  if (res.status === 404) throw new Error('Profile not found on tracker.gg');
  if (res.status === 403) throw new Error('Tracker.gg API key invalid or unauthorized');
  if (res.status === 429) throw new Error('Rate limited by tracker.gg — please try again in a moment');
  if (res.status !== 200) throw new Error(`Tracker.gg API error (${res.status})`);

  const data = res.body?.data;
  if (!data) throw new Error('No data returned from tracker.gg');

  const displayName = data.platformInfo?.platformUserHandle || username;
  const segments = data.segments || [];

  // Find the right segment
  let segment = null;
  if (cfg.segType === 'overview') {
    segment = segments.find(s => s.type === 'overview');
  } else if (cfg.segType === 'playlist') {
    if (cfg.segAttr && Object.keys(cfg.segAttr).length > 0) {
      segment = segments.find(s =>
        s.type === 'playlist' &&
        Object.entries(cfg.segAttr).every(([k, v]) => s.attributes?.[k] === v)
      );
    }
    // Fall back to first playlist, then first overview
    if (!segment) segment = segments.find(s => s.type === 'playlist');
    if (!segment) segment = segments.find(s => s.type === 'overview');
  }

  // Fall back to very first segment
  if (!segment) segment = segments[0];

  const stats = segment?.stats || {};

  // Extract rank display name
  let currentRankName = null;
  let peakRankName = null;

  const rankStat = stats[cfg.rankStat];
  if (rankStat) {
    if (cfg.divStat && stats[cfg.divStat]) {
      // Rocket League: combine tier name + division (e.g., "Diamond" + "Division I" → "Diamond I")
      const tierName = rankStat.metadata?.tierName || rankStat.displayValue || '';
      const divRaw = stats[cfg.divStat].displayValue || '';
      const divShort = divRaw.replace(/^Division\s*/i, '').trim();
      currentRankName = divShort ? `${tierName} ${divShort}` : tierName;
    } else if (rankStat.metadata?.rankName && rankStat.metadata?.divisionName) {
      // e.g., Apex: rankName="Gold", divisionName="IV"
      currentRankName = `${rankStat.metadata.rankName} ${rankStat.metadata.divisionName}`;
    } else if (rankStat.displayValue) {
      currentRankName = rankStat.displayValue;
    } else if (rankStat.metadata?.tierName) {
      currentRankName = rankStat.metadata.tierName;
    }
  }

  // Try fallback stat keys if primary didn't work
  if (!currentRankName) {
    for (const key of ['rank', 'rankScore', 'tier', 'rating', 'grade', 'level']) {
      const s = stats[key];
      if (s?.displayValue && s.displayValue !== 'N/A' && s.displayValue !== '--') {
        currentRankName = s.displayValue;
        break;
      }
    }
  }

  // Peak rank
  if (cfg.peakStat && stats[cfg.peakStat]) {
    const peakStat = stats[cfg.peakStat];
    if (peakStat.displayValue) peakRankName = peakStat.displayValue;
    else if (peakStat.metadata?.rankName) peakRankName = peakStat.metadata.rankName;
  }

  return { username: displayName, currentRankName, peakRankName, platform };
}

// ─── LEGACY LOOKUP FUNCTION ───────────────────────────────────────────────────
async function lookupRank(slug, identifier, region) {
  const cfg = GAME_API_CONFIG[slug];
  if (!cfg) throw new Error('No API support for this game');

  switch (cfg.method) {
    // ── DOTA 2 (OpenDota API) ─────────────────────────────────────────────────
    case 'opendota': {
      let accountId = identifier.trim();
      if (accountId.includes('steamcommunity.com')) {
        const match = accountId.match(/\/profiles\/(\d+)/) || accountId.match(/\/id\/([^/]+)/);
        if (!match) throw new Error('Invalid Steam URL format');
        if (/^\d+$/.test(match[1])) {
          const steam64 = BigInt(match[1]);
          accountId = String(steam64 - BigInt('76561197960265728'));
        } else {
          if (!process.env.STEAM_API_KEY) throw new Error('Steam vanity URL requires STEAM_API_KEY');
          const vanityRes = await fetchJson(
            `https://api.steampowered.com/ISteamUser/ResolveVanityURL/v1/?key=${process.env.STEAM_API_KEY}&vanityurl=${encodeURIComponent(match[1])}`
          );
          if (vanityRes.body?.response?.success !== 1) throw new Error('Steam profile not found');
          const steam64 = BigInt(vanityRes.body.response.steamid);
          accountId = String(steam64 - BigInt('76561197960265728'));
        }
      } else if (/^\d{17}$/.test(accountId)) {
        const steam64 = BigInt(accountId);
        accountId = String(steam64 - BigInt('76561197960265728'));
      } else if (!/^\d+$/.test(accountId)) {
        throw new Error('Enter a Steam32 account ID, Steam64 ID, or Steam profile URL');
      }

      const res = await fetchJson(`https://api.opendota.com/api/players/${accountId}`);
      if (res.status === 404 || res.body?.error) throw new Error('Steam profile not found on OpenDota');
      if (res.status !== 200) throw new Error(`OpenDota API error (${res.status})`);

      const rank_tier = res.body.rank_tier;
      const username = res.body.profile?.personaname || `Steam ID: ${accountId}`;
      const curIdx = dota2RankIndex(rank_tier);
      return { username, current_rank_index: curIdx, peak_rank_index: curIdx, region: '' };
    }

    // ── CHESS.COM ─────────────────────────────────────────────────────────────
    case 'chesscom': {
      const username = identifier.trim();
      const res = await fetchJson(`https://api.chess.com/pub/player/${encodeURIComponent(username)}/stats`);
      if (res.status === 404) throw new Error('Chess.com user not found');
      if (res.status !== 200) throw new Error(`Chess.com API error (${res.status})`);

      const subtype = cfg.subtype;
      const statsKey = `chess_${subtype}`;
      const stats = res.body[statsKey];
      if (!stats) throw new Error(`No ${subtype} rating found for this player`);

      const currentRating = stats.last?.rating || 0;
      const bestRating = stats.best?.rating || currentRating;
      const indexFn = subtype === 'rapid' ? chessRapidIndex : chessBlitzIndex;
      return {
        username,
        current_rank_index: indexFn(currentRating),
        peak_rank_index: indexFn(bestRating),
        region: '',
        extra: { currentRating, bestRating },
      };
    }

    // ── CLASH ROYALE ──────────────────────────────────────────────────────────
    case 'clashroyale': {
      if (!CLASH_ROYALE_API_KEY) throw new Error('Clash Royale API not configured on this server');
      let tag = identifier.trim().toUpperCase();
      if (!tag.startsWith('#')) tag = '#' + tag;
      const encoded = encodeURIComponent(tag);

      const res = await fetchJson(
        `https://api.clashroyale.com/v1/players/${encoded}`,
        { Authorization: `Bearer ${CLASH_ROYALE_API_KEY}` }
      );
      if (res.status === 404) throw new Error('Player tag not found');
      if (res.status === 403) throw new Error('Clash Royale API key invalid');
      if (res.status !== 200) throw new Error(`Clash Royale API error (${res.status})`);

      const player = res.body;
      const trophies = player.trophies || 0;
      const bestTrophies = player.bestTrophies || trophies;
      return {
        username: `${player.name} (${tag})`,
        current_rank_index: clashRoyaleIndex(trophies),
        peak_rank_index: clashRoyaleIndex(bestTrophies),
        region: '',
        extra: { trophies, bestTrophies },
      };
    }

    default:
      throw new Error('Unsupported API method');
  }
}

// ─── ROUTES ───────────────────────────────────────────────────────────────────

// GET /api/verify/support — which games have API lookup
router.get('/support', (req, res) => {
  const support = {};

  // Tracker.gg games
  for (const [slug] of Object.entries(TRACKER_GG_GAMES)) {
    support[slug] = {
      method: 'trackergg',
      available: !!TRACKER_GG_API_KEY,
      label: 'Tracker.gg Profile URL',
      placeholder: 'https://tracker.gg/...',
      help: 'Paste your tracker.gg profile URL. Your current and peak ranks will be auto-detected.',
    };
  }

  // Legacy API games
  for (const [slug, cfg] of Object.entries(GAME_API_CONFIG)) {
    const available = cfg.requiresKey
      ? (cfg.method === 'clashroyale' ? !!CLASH_ROYALE_API_KEY : false)
      : true;
    support[slug] = {
      label: cfg.label,
      placeholder: cfg.placeholder,
      help: cfg.help,
      method: cfg.method,
      showRegion: cfg.showRegion || false,
      regions: cfg.regions || [],
      available,
    };
  }

  res.json(support);
});

// POST /api/verify/lookup — look up rank WITHOUT saving (preview step)
router.post('/lookup', authenticate, async (req, res) => {
  const { slug, identifier, region } = req.body;
  if (!slug || !identifier) return res.status(400).json({ error: 'slug and identifier are required' });

  try {
    // Tracker.gg games
    if (TRACKER_GG_GAMES[slug]) {
      const game = db.prepare('SELECT * FROM games WHERE slug = ?').get(slug);
      if (!game) return res.status(404).json({ error: 'Game not found' });
      const ranks = JSON.parse(game.ranks);

      const result = await lookupTrackerGG(slug, identifier);

      const curIdx = Math.max(0, Math.min(findRankIndex(ranks, result.currentRankName), ranks.length - 1));
      const peakIdx = Math.max(curIdx, Math.min(findRankIndex(ranks, result.peakRankName || result.currentRankName), ranks.length - 1));

      return res.json({
        success: true,
        username: result.username,
        current_rank_index: curIdx,
        peak_rank_index: peakIdx,
        current_rank: ranks[curIdx],
        peak_rank: ranks[peakIdx],
        platform: result.platform,
      });
    }

    // Legacy games
    const result = await lookupRank(slug, identifier, region);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/verify/refresh/:accountId — re-fetch rank for an existing account
router.post('/refresh/:accountId', authenticate, async (req, res) => {
  const account = db.prepare(`
    SELECT ca.*, g.slug, g.name as game_name, g.ranks
    FROM connected_accounts ca
    JOIN games g ON ca.game_id = g.id
    WHERE ca.id = ? AND ca.user_id = ?
  `).get(req.params.accountId, req.userId);

  if (!account) return res.status(404).json({ error: 'Account not found' });

  const ranks = JSON.parse(account.ranks);

  try {
    let curIdx, peakIdx, newUsername;

    if (TRACKER_GG_GAMES[account.slug]) {
      if (!account.tracker_url) return res.status(400).json({ error: 'No tracker.gg URL saved for this account' });
      const result = await lookupTrackerGG(account.slug, account.tracker_url);
      curIdx = Math.max(0, Math.min(findRankIndex(ranks, result.currentRankName), ranks.length - 1));
      const peakFromApi = findRankIndex(ranks, result.peakRankName || result.currentRankName);
      peakIdx = Math.max(curIdx, Math.min(Math.max(peakFromApi, account.peak_rank_index), ranks.length - 1));
      newUsername = result.username;
    } else {
      if (!GAME_API_CONFIG[account.slug]) return res.status(400).json({ error: 'This game does not support automatic rank lookup' });
      const result = await lookupRank(account.slug, account.platform_username, account.region || '');
      curIdx = Math.max(0, Math.min(result.current_rank_index, ranks.length - 1));
      peakIdx = Math.max(curIdx, Math.min(Math.max(result.peak_rank_index, account.peak_rank_index), ranks.length - 1));
      newUsername = result.username;
    }

    db.prepare(`
      UPDATE connected_accounts
      SET current_rank_index = ?, peak_rank_index = ?, platform_username = ?,
          verified = 1, verified_at = CURRENT_TIMESTAMP, last_updated = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(curIdx, peakIdx, newUsername, account.id);

    const newScore = updateUserGamerscore(req.userId);
    res.json({
      success: true,
      current_rank: ranks[curIdx],
      peak_rank: ranks[peakIdx],
      username: newUsername,
      gamerscore: newScore,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
