const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { authenticate } = require('./middleware');

// ─── helpers ────────────────────────────────────────────────────────────────

function getClubOwner(clubId) {
  return db.prepare('SELECT owner_id FROM clubs WHERE id = ?').get(clubId);
}

function getTournament(id) {
  return db.prepare('SELECT * FROM club_tournaments WHERE id = ?').get(id);
}

function enrichTournament(t) {
  const game = db.prepare('SELECT id, name, icon, color FROM games WHERE id = ?').get(t.game_id);
  const participants = db.prepare(`
    SELECT ctp.seed, u.id, u.username, u.gamertag, u.avatar_color
    FROM club_tournament_participants ctp
    JOIN users u ON u.id = ctp.user_id
    WHERE ctp.tournament_id = ?
    ORDER BY ctp.seed ASC
  `).all(t.id);
  const matches = db.prepare(`
    SELECT * FROM club_tournament_matches
    WHERE tournament_id = ?
    ORDER BY round ASC, match_index ASC
  `).all(t.id);

  // Attach player info to matches
  const userCache = {};
  const allUserIds = new Set();
  for (const m of matches) {
    if (m.player_a_id) allUserIds.add(m.player_a_id);
    if (m.player_b_id) allUserIds.add(m.player_b_id);
    if (m.winner_id)   allUserIds.add(m.winner_id);
  }
  for (const uid of allUserIds) {
    userCache[uid] = db.prepare('SELECT id, username, gamertag, avatar_color FROM users WHERE id = ?').get(uid);
  }
  const enrichedMatches = matches.map(m => ({
    ...m,
    player_a: m.player_a_id ? userCache[m.player_a_id] : null,
    player_b: m.player_b_id ? userCache[m.player_b_id] : null,
    winner:   m.winner_id   ? userCache[m.winner_id]   : null,
  }));

  let winner = null;
  if (t.winner_id) {
    winner = db.prepare('SELECT id, username, gamertag, avatar_color FROM users WHERE id = ?').get(t.winner_id);
  }

  return { ...t, game, participants, matches: enrichedMatches, winner };
}

/** Generate bracket match rows for all rounds */
function generateBracket(participantIds, seeding) {
  const players = [...participantIds];
  if (seeding === 'random') {
    for (let i = players.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [players[i], players[j]] = [players[j], players[i]];
    }
  }

  // Pad to next power of 2
  let size = 1;
  while (size < players.length) size *= 2;
  while (players.length < size) players.push(null);

  const allMatches = [];

  // Round 1
  const r1Count = size / 2;
  for (let i = 0; i < r1Count; i++) {
    const pA = players[i * 2];
    const pB = players[i * 2 + 1];
    const isBye = pA === null || pB === null;
    allMatches.push({
      round: 1,
      match_index: i,
      player_a_id: pA,
      player_b_id: pB,
      winner_id: isBye ? (pA ?? pB) : null,
      status: isBye ? 'bye' : 'pending',
    });
  }

  // Pre-create subsequent round slots (players filled in as winners advance)
  let slotsInRound = Math.ceil(r1Count / 2);
  let round = 2;
  while (slotsInRound >= 1) {
    for (let i = 0; i < slotsInRound; i++) {
      allMatches.push({ round, match_index: i, player_a_id: null, player_b_id: null, winner_id: null, status: 'pending' });
    }
    if (slotsInRound === 1) break;
    slotsInRound = Math.ceil(slotsInRound / 2);
    round++;
  }

  return allMatches;
}

/** After a match is completed, advance winner to next round. Returns true if tournament is over. */
function advanceWinner(tournamentId, currentRound, matchIndex, winnerId) {
  // Find next round match
  const nextRound = currentRound + 1;
  const nextMatchIndex = Math.floor(matchIndex / 2);
  const nextMatch = db.prepare(`
    SELECT * FROM club_tournament_matches
    WHERE tournament_id = ? AND round = ? AND match_index = ?
  `).get(tournamentId, nextRound, nextMatchIndex);

  if (!nextMatch) {
    // No next match → tournament is over
    return true;
  }

  // Winner goes to player_a slot if matchIndex is even, player_b if odd
  if (matchIndex % 2 === 0) {
    db.prepare('UPDATE club_tournament_matches SET player_a_id = ? WHERE id = ?').run(winnerId, nextMatch.id);
  } else {
    db.prepare('UPDATE club_tournament_matches SET player_b_id = ? WHERE id = ?').run(winnerId, nextMatch.id);
  }

  // Check if this next match is now a bye (the other slot is still null after advance)
  const updated = db.prepare('SELECT * FROM club_tournament_matches WHERE id = ?').get(nextMatch.id);
  if ((updated.player_a_id === null) !== (updated.player_b_id === null)) {
    // One side null → bye, auto-complete
    const autoWinner = updated.player_a_id ?? updated.player_b_id;
    db.prepare('UPDATE club_tournament_matches SET winner_id = ?, status = ? WHERE id = ?')
      .run(autoWinner, 'bye', nextMatch.id);
    return advanceWinner(tournamentId, nextRound, nextMatchIndex, autoWinner);
  }

  return false;
}

// ─── routes ─────────────────────────────────────────────────────────────────

// List tournaments for a club
router.get('/club/:clubId', authenticate, (req, res) => {
  const rows = db.prepare(`
    SELECT t.*, g.name as game_name, g.icon as game_icon, g.color as game_color,
           u.username as winner_username, u.gamertag as winner_gamertag
    FROM club_tournaments t
    JOIN games g ON g.id = t.game_id
    LEFT JOIN users u ON u.id = t.winner_id
    WHERE t.club_id = ?
    ORDER BY t.created_at DESC
  `).all(req.params.clubId);
  res.json(rows);
});

// Get full tournament (bracket + participants)
router.get('/:id', authenticate, (req, res) => {
  const t = getTournament(req.params.id);
  if (!t) return res.status(404).json({ error: 'Tournament not found' });
  res.json(enrichTournament(t));
});

// Create tournament (club owner only)
router.post('/', authenticate, (req, res) => {
  const { club_id, name, game_id, games_per_round, seeding, participant_ids } = req.body;
  if (!club_id || !name || !game_id || !participant_ids?.length) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  if (participant_ids.length < 2) {
    return res.status(400).json({ error: 'Need at least 2 participants' });
  }

  const club = getClubOwner(club_id);
  if (!club || club.owner_id !== req.userId) {
    return res.status(403).json({ error: 'Only the club owner can create tournaments' });
  }

  const gpr = [1, 3].includes(Number(games_per_round)) ? Number(games_per_round) : 1;
  const seed = seeding === 'manual' ? 'manual' : 'random';

  const result = db.prepare(`
    INSERT INTO club_tournaments (club_id, name, game_id, games_per_round, seeding, status, created_by)
    VALUES (?, ?, ?, ?, ?, 'active', ?)
  `).run(club_id, name.trim(), game_id, gpr, seed, req.userId);

  const tournamentId = result.lastInsertRowid;

  // Insert participants in the given order (for manual seeding this is their seed order)
  const insertParticipant = db.prepare(`
    INSERT INTO club_tournament_participants (tournament_id, user_id, seed) VALUES (?, ?, ?)
  `);
  participant_ids.forEach((uid, idx) => insertParticipant.run(tournamentId, uid, idx + 1));

  // Generate and insert bracket
  const matches = generateBracket(participant_ids, seed);
  const insertMatch = db.prepare(`
    INSERT INTO club_tournament_matches (tournament_id, round, match_index, player_a_id, player_b_id, winner_id, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  for (const m of matches) {
    insertMatch.run(tournamentId, m.round, m.match_index, m.player_a_id, m.player_b_id, m.winner_id, m.status);
  }

  // Propagate any initial byes through all rounds
  const byeMatches = db.prepare(`
    SELECT * FROM club_tournament_matches
    WHERE tournament_id = ? AND status = 'bye' AND round = 1
    ORDER BY match_index ASC
  `).all(tournamentId);
  for (const bm of byeMatches) {
    const done = advanceWinner(tournamentId, 1, bm.match_index, bm.winner_id);
    if (done) {
      db.prepare('UPDATE club_tournaments SET status = ?, winner_id = ? WHERE id = ?')
        .run('completed', bm.winner_id, tournamentId);
    }
  }

  res.json(enrichTournament(getTournament(tournamentId)));
});

// Set match winner (club owner only)
router.post('/:id/matches/:matchId/winner', authenticate, (req, res) => {
  const { winner_id } = req.body;
  if (!winner_id) return res.status(400).json({ error: 'winner_id required' });

  const t = getTournament(req.params.id);
  if (!t) return res.status(404).json({ error: 'Tournament not found' });

  const club = getClubOwner(t.club_id);
  if (!club || club.owner_id !== req.userId) {
    return res.status(403).json({ error: 'Only the club owner can set match winners' });
  }
  if (t.status !== 'active') {
    return res.status(400).json({ error: 'Tournament is not active' });
  }

  const match = db.prepare('SELECT * FROM club_tournament_matches WHERE id = ? AND tournament_id = ?')
    .get(req.params.matchId, req.params.id);
  if (!match) return res.status(404).json({ error: 'Match not found' });
  if (match.status !== 'pending') return res.status(400).json({ error: 'Match already resolved' });

  const validPlayers = [match.player_a_id, match.player_b_id].filter(Boolean);
  if (!validPlayers.includes(Number(winner_id))) {
    return res.status(400).json({ error: 'Winner must be one of the match participants' });
  }

  // Mark match complete
  db.prepare('UPDATE club_tournament_matches SET winner_id = ?, status = ? WHERE id = ?')
    .run(Number(winner_id), 'completed', match.id);

  // Advance winner to next round
  const tournamentOver = advanceWinner(t.id, match.round, match.match_index, Number(winner_id));

  if (tournamentOver) {
    db.prepare('UPDATE club_tournaments SET status = ?, winner_id = ? WHERE id = ?')
      .run('completed', Number(winner_id), t.id);

    // Award champion badge (upsert - replaces previous champion for this game)
    db.prepare(`
      INSERT INTO club_badges (club_id, user_id, game_id, badge_type, tournament_id, awarded_at)
      VALUES (?, ?, ?, 'tournament_champion', ?, CURRENT_TIMESTAMP)
      ON CONFLICT(club_id, game_id, badge_type) DO UPDATE SET
        user_id = excluded.user_id,
        tournament_id = excluded.tournament_id,
        awarded_at = excluded.awarded_at
    `).run(t.club_id, Number(winner_id), t.game_id, t.id);
  }

  res.json(enrichTournament(getTournament(t.id)));
});

// Cancel tournament (owner only)
router.delete('/:id', authenticate, (req, res) => {
  const t = getTournament(req.params.id);
  if (!t) return res.status(404).json({ error: 'Tournament not found' });
  const club = getClubOwner(t.club_id);
  if (!club || club.owner_id !== req.userId) {
    return res.status(403).json({ error: 'Only the club owner can cancel tournaments' });
  }
  db.prepare('DELETE FROM club_tournaments WHERE id = ?').run(t.id);
  res.json({ ok: true });
});

module.exports = router;
