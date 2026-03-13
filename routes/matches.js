const express = require('express');
const { db, updateEloForMatch } = require('../db');
const { authenticate } = require('./middleware');

const router = express.Router();

function enrichMatch(match) {
  if (!match) return null;

  let game_ids = [], participant_a_ids = [], participant_b_ids = [];
  try { game_ids = JSON.parse(match.game_ids); } catch {}
  try { participant_a_ids = JSON.parse(match.participant_a_ids); } catch {}
  try { participant_b_ids = JSON.parse(match.participant_b_ids); } catch {}

  const games = game_ids.map(gid => {
    const g = db.prepare('SELECT id, name, icon, color, slug FROM games WHERE id = ?').get(gid);
    return g || null;
  }).filter(Boolean);

  function enrichParticipants(ids) {
    return ids.map(uid => {
      const u = db.prepare('SELECT id, username, gamertag, avatar_color, gamerscore FROM users WHERE id = ?').get(uid);
      if (!u) return null;
      // Include their in-game names for all connected games
      const accounts = db.prepare(`
        SELECT ca.platform_username, ca.platform, g.id as game_id, g.name as game_name, g.slug, g.icon
        FROM connected_accounts ca JOIN games g ON ca.game_id = g.id
        WHERE ca.user_id = ?
      `).all(uid);
      return { ...u, accounts };
    }).filter(Boolean);
  }

  const participants_a = enrichParticipants(participant_a_ids);
  const participants_b = enrichParticipants(participant_b_ids);

  return { ...match, games, participants_a, participants_b, participant_a_ids, participant_b_ids, game_ids };
}

// Get active/disputed matches for the current user
router.get('/mine', authenticate, (req, res) => {
  const all = db.prepare(`
    SELECT * FROM matches
    WHERE status IN ('active', 'disputed')
    ORDER BY created_at DESC
  `).all();

  const mine = all.filter(m => {
    let pA = [], pB = [];
    try { pA = JSON.parse(m.participant_a_ids); } catch {}
    try { pB = JSON.parse(m.participant_b_ids); } catch {}
    return [...pA, ...pB].includes(req.userId);
  });

  res.json(mine.map(m => {
    let game_ids = [];
    try { game_ids = JSON.parse(m.game_ids); } catch {}
    const games = game_ids.map(gid => db.prepare('SELECT id, name, icon, slug FROM games WHERE id = ?').get(gid)).filter(Boolean);
    return { ...m, games };
  }));
});

// Get a match by ID
router.get('/:id', authenticate, (req, res) => {
  const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(req.params.id);
  if (!match) return res.status(404).json({ error: 'Match not found' });

  // Check user is a participant
  let pA = [], pB = [];
  try { pA = JSON.parse(match.participant_a_ids); } catch {}
  try { pB = JSON.parse(match.participant_b_ids); } catch {}
  const allIds = [...pA, ...pB];
  if (!allIds.includes(req.userId)) {
    return res.status(403).json({ error: 'You are not a participant in this match' });
  }

  const messages = db.prepare(`
    SELECT mm.*, u.username, u.gamertag, u.avatar_color
    FROM match_messages mm JOIN users u ON mm.user_id = u.id
    WHERE mm.match_id = ?
    ORDER BY mm.created_at ASC
    LIMIT 200
  `).all(req.params.id);

  res.json({ ...enrichMatch(match), messages });
});

// Get messages (for polling)
router.get('/:id/messages', authenticate, (req, res) => {
  const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(req.params.id);
  if (!match) return res.status(404).json({ error: 'Match not found' });

  let pA = [], pB = [];
  try { pA = JSON.parse(match.participant_a_ids); } catch {}
  try { pB = JSON.parse(match.participant_b_ids); } catch {}
  if (![...pA, ...pB].includes(req.userId)) {
    return res.status(403).json({ error: 'Not a participant' });
  }

  const since = req.query.since || '1970-01-01';
  const messages = db.prepare(`
    SELECT mm.*, u.username, u.gamertag, u.avatar_color
    FROM match_messages mm JOIN users u ON mm.user_id = u.id
    WHERE mm.match_id = ? AND mm.created_at > ?
    ORDER BY mm.created_at ASC
    LIMIT 100
  `).all(req.params.id, since);

  res.json(messages);
});

// Send chat message
router.post('/:id/messages', authenticate, (req, res) => {
  const { message } = req.body;
  if (!message || !message.trim()) return res.status(400).json({ error: 'Message required' });

  const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(req.params.id);
  if (!match) return res.status(404).json({ error: 'Match not found' });
  if (match.status === 'completed') return res.status(400).json({ error: 'Match is completed' });

  let pA = [], pB = [];
  try { pA = JSON.parse(match.participant_a_ids); } catch {}
  try { pB = JSON.parse(match.participant_b_ids); } catch {}
  if (![...pA, ...pB].includes(req.userId)) {
    return res.status(403).json({ error: 'Not a participant' });
  }

  const result = db.prepare(
    'INSERT INTO match_messages (match_id, user_id, message) VALUES (?, ?, ?)'
  ).run(req.params.id, req.userId, message.trim().slice(0, 500));

  const msg = db.prepare(`
    SELECT mm.*, u.username, u.gamertag, u.avatar_color
    FROM match_messages mm JOIN users u ON mm.user_id = u.id
    WHERE mm.id = ?
  `).get(result.lastInsertRowid);

  res.json(msg);
});

// Report score
router.post('/:id/report', authenticate, (req, res) => {
  const { rounds_won } = req.body;
  if (rounds_won === undefined || rounds_won < 0) return res.status(400).json({ error: 'rounds_won is required (≥ 0)' });

  const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(req.params.id);
  if (!match) return res.status(404).json({ error: 'Match not found' });
  if (!['active', 'disputed'].includes(match.status)) return res.status(400).json({ error: 'Match is not active' });

  let pA = [], pB = [];
  try { pA = JSON.parse(match.participant_a_ids); } catch {}
  try { pB = JSON.parse(match.participant_b_ids); } catch {}

  const isA = pA.includes(req.userId);
  const isB = pB.includes(req.userId);
  if (!isA && !isB) return res.status(403).json({ error: 'Not a participant' });

  if (isA) {
    db.prepare('UPDATE matches SET report_a_wins = ?, reported_by_a = 1 WHERE id = ?').run(rounds_won, match.id);
  } else {
    db.prepare('UPDATE matches SET report_b_wins = ?, reported_by_b = 1 WHERE id = ?').run(rounds_won, match.id);
  }

  // Check if both have reported
  const updated = db.prepare('SELECT * FROM matches WHERE id = ?').get(match.id);
  if (updated.reported_by_a && updated.reported_by_b) {
    if (updated.report_a_wins === updated.report_b_wins) {
      // Agreed on same score - auto resolve
      _resolveMatch(updated, updated.report_a_wins, updated.report_b_wins);
      return res.json({ status: 'completed', message: 'Scores agreed — match resolved!' });
    } else {
      db.prepare("UPDATE matches SET status = 'disputed' WHERE id = ?").run(match.id);
      return res.json({ status: 'disputed', message: 'Scores disagree — dispute opened. Upload evidence.' });
    }
  }

  res.json({ status: updated.status, message: 'Score reported. Waiting for opponent.' });
});

// Confirm score (when you agree with opponent's report)
router.post('/:id/confirm', authenticate, (req, res) => {
  const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(req.params.id);
  if (!match) return res.status(404).json({ error: 'Match not found' });
  if (!['active', 'disputed'].includes(match.status)) return res.status(400).json({ error: 'Match is not in a confirmable state' });

  let pA = [], pB = [];
  try { pA = JSON.parse(match.participant_a_ids); } catch {}
  try { pB = JSON.parse(match.participant_b_ids); } catch {}
  const isA = pA.includes(req.userId);
  const isB = pB.includes(req.userId);
  if (!isA && !isB) return res.status(403).json({ error: 'Not a participant' });

  // Confirm the opponent's reported score
  const aWins = match.report_a_wins ?? 0;
  const bWins = match.report_b_wins ?? 0;
  _resolveMatch(match, aWins, bWins);
  res.json({ status: 'completed', message: 'Score confirmed — match resolved!' });
});

// Dispute score with evidence
router.post('/:id/dispute', authenticate, (req, res) => {
  const { reason, evidence_url } = req.body;
  if (!reason) return res.status(400).json({ error: 'A reason is required for disputes' });

  const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(req.params.id);
  if (!match) return res.status(404).json({ error: 'Match not found' });
  if (!['active', 'disputed'].includes(match.status)) return res.status(400).json({ error: 'Cannot dispute this match' });

  let pA = [], pB = [];
  try { pA = JSON.parse(match.participant_a_ids); } catch {}
  try { pB = JSON.parse(match.participant_b_ids); } catch {}
  const isA = pA.includes(req.userId);
  const isB = pB.includes(req.userId);
  if (!isA && !isB) return res.status(403).json({ error: 'Not a participant' });

  if (isA) {
    db.prepare('UPDATE matches SET status = ?, dispute_reason = ?, dispute_evidence_a = ? WHERE id = ?')
      .run('disputed', reason, evidence_url || null, match.id);
  } else {
    db.prepare('UPDATE matches SET status = ?, dispute_reason = ?, dispute_evidence_b = ? WHERE id = ?')
      .run('disputed', reason, evidence_url || null, match.id);
  }

  res.json({ status: 'disputed', message: 'Dispute filed. Both teams can view evidence in the match room.' });
});

function _resolveMatch(match, aWins, bWins) {
  const winnerId = aWins >= bWins ? match.entity_a_id : match.entity_b_id;
  const loserId = winnerId === match.entity_a_id ? match.entity_b_id : match.entity_a_id;
  const scoreAwarded = 100;

  db.prepare(`
    UPDATE matches SET status = 'completed', score_a = ?, score_b = ?, winner_entity_id = ?, score_awarded = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?
  `).run(aWins, bWins, winnerId, scoreAwarded, match.id);

  if (winnerId) {
    if (match.match_type === 'club') {
      db.prepare('UPDATE clubs SET club_score = club_score + ?, wins = wins + 1 WHERE id = ?').run(scoreAwarded, winnerId);
      if (loserId) db.prepare('UPDATE clubs SET losses = losses + 1 WHERE id = ?').run(loserId);
    } else if (match.match_type === 'team') {
      db.prepare('UPDATE teams SET wins = wins + 1 WHERE id = ?').run(winnerId);
      if (loserId) db.prepare('UPDATE teams SET losses = losses + 1 WHERE id = ?').run(loserId);
    }
  }

  // Update ELO for all participants and entities
  updateEloForMatch(match, winnerId);

  // Close any linked club challenge
  const clubChallenge = db.prepare('SELECT * FROM club_challenges WHERE match_id = ?').get(match.id);
  if (clubChallenge) {
    db.prepare(`
      UPDATE club_challenges
      SET status = 'completed', winner_id = ?, resolved_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(winnerId || null, clubChallenge.id);
  }

  // Close any linked open challenge
  const openChallenge = db.prepare('SELECT * FROM open_challenges WHERE match_id = ?').get(match.id);
  if (openChallenge) {
    db.prepare(`
      UPDATE open_challenges
      SET status = 'completed', winner_id = ?, resolved_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(winnerId || null, openChallenge.id);
  }
}

module.exports = router;
