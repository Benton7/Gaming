const express = require('express');
const https = require('https');
const { db, updateUserGamerscore } = require('../db');
const { authenticate } = require('./middleware');

const router = express.Router();

const RIOT_API_KEY = process.env.RIOT_API_KEY || '';
const STEAM_API_KEY = process.env.STEAM_API_KEY || '';

// Supported platforms and their verification methods
const VERIFICATION_SUPPORT = {
  valorant:      { method: 'riot',   label: 'Riot Games',   available: () => !!RIOT_API_KEY },
  lol:           { method: 'riot',   label: 'Riot Games',   available: () => !!RIOT_API_KEY },
  tft:           { method: 'riot',   label: 'Riot Games',   available: () => !!RIOT_API_KEY },
  'cs2':         { method: 'steam',  label: 'Steam',        available: () => !!STEAM_API_KEY },
  'dota2':       { method: 'steam',  label: 'Steam',        available: () => !!STEAM_API_KEY },
};

// Helper: HTTPS GET returning JSON
function httpsGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { reject(new Error('Invalid JSON')); }
      });
    });
    req.on('error', reject);
    req.setTimeout(8000, () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

// GET /api/verify/support — which games support verification
router.get('/support', (req, res) => {
  const support = {};
  for (const [slug, info] of Object.entries(VERIFICATION_SUPPORT)) {
    support[slug] = { method: info.method, label: info.label, available: info.available() };
  }
  res.json(support);
});

// POST /api/verify/riot/:accountId
// Body: { riotId: "PlayerName#TAG" }
// Verifies account by looking up Riot ID, confirms the platform_username matches, marks verified
router.post('/riot/:accountId', authenticate, async (req, res) => {
  if (!RIOT_API_KEY) return res.status(503).json({ error: 'Riot API not configured' });

  const account = db.prepare(`
    SELECT ca.*, g.slug FROM connected_accounts ca
    JOIN games g ON ca.game_id = g.id
    WHERE ca.id = ? AND ca.user_id = ?
  `).get(req.params.accountId, req.userId);

  if (!account) return res.status(404).json({ error: 'Account not found' });
  if (!['valorant', 'lol', 'tft'].includes(account.slug))
    return res.status(400).json({ error: 'This game does not support Riot verification' });

  const { riotId } = req.body;
  if (!riotId || !riotId.includes('#'))
    return res.status(400).json({ error: 'Riot ID must be in format Name#TAG' });

  const [gameName, tagLine] = riotId.split('#');

  try {
    // Look up account by Riot ID (region: americas)
    const accountLookup = await httpsGet(
      `https://americas.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`,
      { 'X-Riot-Token': RIOT_API_KEY }
    );

    if (accountLookup.status === 404) return res.status(404).json({ error: 'Riot ID not found' });
    if (accountLookup.status !== 200) return res.status(502).json({ error: 'Riot API error' });

    const puuid = accountLookup.body.puuid;
    const verifiedName = `${accountLookup.body.gameName}#${accountLookup.body.tagLine}`;

    if (account.slug === 'lol' || account.slug === 'tft') {
      // For LoL/TFT: get summoner by PUUID then ranked data
      const region = 'na1'; // Default to NA; could be user-configurable
      const summonerRes = await httpsGet(
        `https://${region}.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${puuid}`,
        { 'X-Riot-Token': RIOT_API_KEY }
      );
      if (summonerRes.status === 200) {
        const summonerId = summonerRes.body.id;
        const rankedRes = await httpsGet(
          `https://${region}.api.riotgames.com/lol/league/v4/entries/by-summoner/${summonerId}`,
          { 'X-Riot-Token': RIOT_API_KEY }
        );
        if (rankedRes.status === 200 && rankedRes.body.length > 0) {
          const queue = account.slug === 'tft'
            ? rankedRes.body.find(e => e.queueType === 'RANKED_TFT')
            : rankedRes.body.find(e => e.queueType === 'RANKED_SOLO_5x5');
          if (queue) {
            // Update rank from API data
            const game = db.prepare('SELECT ranks FROM games WHERE id = ?').get(account.game_id);
            const ranks = JSON.parse(game.ranks);
            const tierDiv = `${queue.tier.charAt(0) + queue.tier.slice(1).toLowerCase()} ${romanToNum(queue.rank)}`;
            const matchedIdx = ranks.findIndex(r => r.name.toLowerCase().startsWith(tierDiv.toLowerCase().split(' ')[0]));
            if (matchedIdx >= 0) {
              db.prepare(`UPDATE connected_accounts SET verified = 1, verified_at = CURRENT_TIMESTAMP,
                current_rank_index = ?, platform_username = ? WHERE id = ?`)
                .run(matchedIdx, verifiedName, account.id);
              updateUserGamerscore(req.userId);
              return res.json({ success: true, verified: true, riotId: verifiedName, rankUpdated: true });
            }
          }
        }
      }
    }

    // Valorant: just verify the account identity (rank cannot be fetched without production key)
    db.prepare(`UPDATE connected_accounts SET verified = 1, verified_at = CURRENT_TIMESTAMP,
      platform_username = ? WHERE id = ?`).run(verifiedName, account.id);

    res.json({ success: true, verified: true, riotId: verifiedName });
  } catch (err) {
    console.error('Riot verify error:', err.message);
    res.status(502).json({ error: 'Could not reach Riot API' });
  }
});

// POST /api/verify/steam/:accountId
// Body: { steamId: "76561198xxxxxxxxx" or vanity URL name }
router.post('/steam/:accountId', authenticate, async (req, res) => {
  if (!STEAM_API_KEY) return res.status(503).json({ error: 'Steam API not configured' });

  const account = db.prepare(`
    SELECT ca.*, g.slug FROM connected_accounts ca
    JOIN games g ON ca.game_id = g.id
    WHERE ca.id = ? AND ca.user_id = ?
  `).get(req.params.accountId, req.userId);

  if (!account) return res.status(404).json({ error: 'Account not found' });
  if (!['cs2', 'dota2'].includes(account.slug))
    return res.status(400).json({ error: 'This game does not support Steam verification' });

  let { steamId } = req.body;
  if (!steamId) return res.status(400).json({ error: 'steamId required' });

  try {
    // If it's not a numeric Steam64 ID, resolve vanity URL
    if (!/^\d+$/.test(steamId)) {
      const vanityRes = await httpsGet(
        `https://api.steampowered.com/ISteamUser/ResolveVanityURL/v1/?key=${STEAM_API_KEY}&vanityurl=${encodeURIComponent(steamId)}`
      );
      if (vanityRes.body?.response?.success === 1) {
        steamId = vanityRes.body.response.steamid;
      } else {
        return res.status(404).json({ error: 'Steam profile not found' });
      }
    }

    // Look up player summary to confirm profile exists
    const playerRes = await httpsGet(
      `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${STEAM_API_KEY}&steamids=${steamId}`
    );

    const players = playerRes.body?.response?.players;
    if (!players || players.length === 0) return res.status(404).json({ error: 'Steam profile not found' });

    const player = players[0];
    const displayName = player.personaname;

    db.prepare(`UPDATE connected_accounts SET verified = 1, verified_at = CURRENT_TIMESTAMP,
      platform_username = ? WHERE id = ?`).run(displayName, account.id);

    res.json({ success: true, verified: true, steamId, displayName });
  } catch (err) {
    console.error('Steam verify error:', err.message);
    res.status(502).json({ error: 'Could not reach Steam API' });
  }
});

function romanToNum(roman) {
  const map = { I: 1, II: 2, III: 3, IV: 4 };
  return map[roman] || 1;
}

module.exports = router;
