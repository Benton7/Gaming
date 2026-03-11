const express = require('express');
const { db, getClubAverageGamerscore, getClubAverageGamescoреForMembers, getClubGameAverages } = require('../db');
const { authenticate } = require('./middleware');

const router = express.Router();

const MAX_MEMBERS = 20;

function getClubWithMembers(clubId) {
  const club = db.prepare(`
    SELECT c.*, u.username as owner_username
    FROM clubs c JOIN users u ON c.owner_id = u.id
    WHERE c.id = ?
  `).get(clubId);
  if (!club) return null;

  const members = db.prepare(`
    SELECT cm.role, cm.joined_at, u.id, u.username, u.gamertag, u.avatar_color, u.gamerscore
    FROM club_members cm
    JOIN users u ON cm.user_id = u.id
    WHERE cm.club_id = ?
    ORDER BY u.gamerscore DESC
  `).all(clubId);

  const game_averages = getClubGameAverages(clubId);

  return { ...club, members, member_count: members.length, game_averages };
}

// List all clubs
router.get('/', (req, res) => {
  const { search } = req.query;
  let query = `
    SELECT c.*, u.username as owner_username,
           COUNT(cm.user_id) as member_count
    FROM clubs c
    JOIN users u ON c.owner_id = u.id
    LEFT JOIN club_members cm ON c.id = cm.club_id
  `;
  const params = [];
  if (search) {
    query += ' WHERE c.name LIKE ? OR c.tag LIKE ?';
    params.push(`%${search}%`, `%${search}%`);
  }
  query += ' GROUP BY c.id ORDER BY c.club_score DESC LIMIT 50';
  const clubs = db.prepare(query).all(...params);
  res.json(clubs);
});

// List open challenges (public)
router.get('/open-challenges', (req, res) => {
  const challenges = db.prepare(`
    SELECT oc.*, c.name as club_name, c.tag as club_tag, c.club_color
    FROM open_challenges oc
    JOIN clubs c ON oc.club_id = c.id
    WHERE oc.status = 'open'
    ORDER BY oc.created_at DESC
    LIMIT 50
  `).all();

  const result = challenges.map(ch => {
    let game_ids = [];
    let participant_ids = [];
    try { game_ids = JSON.parse(ch.game_ids); } catch {}
    try { participant_ids = JSON.parse(ch.participant_ids); } catch {}

    const games = game_ids.map(gid => {
      const g = db.prepare('SELECT id, name, icon, slug FROM games WHERE id = ?').get(gid);
      return g || null;
    }).filter(Boolean);

    const participants = participant_ids.map(uid => {
      const u = db.prepare('SELECT id, username, gamertag, avatar_color, gamerscore FROM users WHERE id = ?').get(uid);
      return u || null;
    }).filter(Boolean);

    return { ...ch, games, participants };
  });

  res.json(result);
});

// Create club
router.post('/', authenticate, (req, res) => {
  const { name, tag, description, club_color, motto } = req.body;
  if (!name || !tag) return res.status(400).json({ error: 'Name and tag are required' });
  if (tag.length > 5) return res.status(400).json({ error: 'Tag must be 5 characters or less' });

  const existing = db.prepare('SELECT id FROM club_members WHERE user_id = ?').get(req.userId);
  if (existing) return res.status(409).json({ error: 'You are already in a club. Leave your current club first.' });

  try {
    const result = db.prepare(
      'INSERT INTO clubs (name, tag, description, owner_id, club_color, motto) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(name, tag.toUpperCase(), description || null, req.userId, club_color || '#6366f1', motto || null);

    db.prepare('INSERT INTO club_members (club_id, user_id, role) VALUES (?, ?, ?)').run(result.lastInsertRowid, req.userId, 'owner');
    res.json(getClubWithMembers(result.lastInsertRowid));
  } catch (err) {
    if (err.message.includes('UNIQUE constraint')) {
      return res.status(409).json({ error: 'Club name already taken' });
    }
    res.status(500).json({ error: 'Failed to create club' });
  }
});

// Get club detail
router.get('/:id', (req, res) => {
  const club = getClubWithMembers(req.params.id);
  if (!club) return res.status(404).json({ error: 'Club not found' });

  const challenges = db.prepare(`
    SELECT cc.*,
           c1.name as challenger_name, c1.tag as challenger_tag,
           c2.name as challenged_name, c2.tag as challenged_tag,
           cw.name as winner_name
    FROM club_challenges cc
    JOIN clubs c1 ON cc.challenger_id = c1.id
    JOIN clubs c2 ON cc.challenged_id = c2.id
    LEFT JOIN clubs cw ON cc.winner_id = cw.id
    WHERE cc.challenger_id = ? OR cc.challenged_id = ?
    ORDER BY cc.created_at DESC
    LIMIT 10
  `).all(req.params.id, req.params.id);

  res.json({ ...club, challenges });
});

// Update club settings
router.patch('/:id', authenticate, (req, res) => {
  const club = db.prepare('SELECT * FROM clubs WHERE id = ? AND owner_id = ?').get(req.params.id, req.userId);
  if (!club) return res.status(403).json({ error: 'Only the club owner can update settings' });

  const { description, club_color, motto, recruit_open } = req.body;
  const updates = [];
  const values = [];

  if (description !== undefined) { updates.push('description = ?'); values.push(description); }
  if (club_color !== undefined) { updates.push('club_color = ?'); values.push(club_color); }
  if (motto !== undefined) { updates.push('motto = ?'); values.push(motto); }
  if (recruit_open !== undefined) { updates.push('recruit_open = ?'); values.push(recruit_open ? 1 : 0); }

  if (updates.length === 0) return res.status(400).json({ error: 'Nothing to update' });

  values.push(req.params.id);
  db.prepare(`UPDATE clubs SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  res.json(getClubWithMembers(req.params.id));
});

// Join club
router.post('/:id/join', authenticate, (req, res) => {
  const club = db.prepare('SELECT * FROM clubs WHERE id = ?').get(req.params.id);
  if (!club) return res.status(404).json({ error: 'Club not found' });

  if (!club.recruit_open) return res.status(403).json({ error: 'This club is not recruiting' });

  const existing = db.prepare('SELECT id FROM club_members WHERE user_id = ?').get(req.userId);
  if (existing) return res.status(409).json({ error: 'You are already in a club' });

  const memberCount = db.prepare('SELECT COUNT(*) as count FROM club_members WHERE club_id = ?').get(req.params.id).count;
  if (memberCount >= MAX_MEMBERS) return res.status(409).json({ error: `Club is full (max ${MAX_MEMBERS} members)` });

  db.prepare('INSERT INTO club_members (club_id, user_id, role) VALUES (?, ?, ?)').run(req.params.id, req.userId, 'member');
  res.json({ success: true, club_id: req.params.id });
});

// Leave/disband club
router.delete('/:id/leave', authenticate, (req, res) => {
  const membership = db.prepare('SELECT * FROM club_members WHERE club_id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!membership) return res.status(404).json({ error: 'You are not in this club' });

  if (membership.role === 'owner') {
    const memberCount = db.prepare('SELECT COUNT(*) as count FROM club_members WHERE club_id = ?').get(req.params.id).count;
    if (memberCount > 1) {
      return res.status(400).json({ error: 'Transfer ownership before leaving, or disband the club' });
    }
    db.prepare('DELETE FROM clubs WHERE id = ?').run(req.params.id);
    return res.json({ success: true, disbanded: true });
  }

  db.prepare('DELETE FROM club_members WHERE club_id = ? AND user_id = ?').run(req.params.id, req.userId);
  res.json({ success: true });
});

// Kick member
router.delete('/:id/kick/:userId', authenticate, (req, res) => {
  const club = db.prepare('SELECT * FROM clubs WHERE id = ? AND owner_id = ?').get(req.params.id, req.userId);
  if (!club) return res.status(403).json({ error: 'Only the club owner can kick members' });

  if (parseInt(req.params.userId) === req.userId) {
    return res.status(400).json({ error: 'Cannot kick yourself' });
  }

  const result = db.prepare('DELETE FROM club_members WHERE club_id = ? AND user_id = ?').run(req.params.id, req.params.userId);
  if (result.changes === 0) return res.status(404).json({ error: 'Member not found' });

  res.json({ success: true });
});

// Issue targeted challenge
router.post('/:id/challenge', authenticate, (req, res) => {
  const { challenged_id } = req.body;
  if (!challenged_id) return res.status(400).json({ error: 'challenged_id is required' });

  const membership = db.prepare('SELECT * FROM club_members WHERE club_id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!membership || (membership.role !== 'owner' && membership.role !== 'officer')) {
    return res.status(403).json({ error: 'Only club owner or officers can issue challenges' });
  }

  if (parseInt(req.params.id) === parseInt(challenged_id)) {
    return res.status(400).json({ error: 'Cannot challenge your own club' });
  }

  const challengedClub = db.prepare('SELECT * FROM clubs WHERE id = ?').get(challenged_id);
  if (!challengedClub) return res.status(404).json({ error: 'Target club not found' });

  const existingChallenge = db.prepare(`
    SELECT id FROM club_challenges
    WHERE status IN ('pending', 'active')
    AND ((challenger_id = ? AND challenged_id = ?) OR (challenger_id = ? AND challenged_id = ?))
  `).get(req.params.id, challenged_id, challenged_id, req.params.id);

  if (existingChallenge) {
    return res.status(409).json({ error: 'A challenge already exists between these clubs' });
  }

  const result = db.prepare(
    'INSERT INTO club_challenges (challenger_id, challenged_id) VALUES (?, ?)'
  ).run(req.params.id, challenged_id);

  res.json({ id: result.lastInsertRowid, status: 'pending' });
});

// Create open challenge
router.post('/:id/open-challenge', authenticate, (req, res) => {
  const { participant_ids, game_ids, description } = req.body;

  if (!participant_ids || !Array.isArray(participant_ids) || participant_ids.length === 0) {
    return res.status(400).json({ error: 'participant_ids (array) is required' });
  }
  if (!game_ids || !Array.isArray(game_ids) || game_ids.length === 0) {
    return res.status(400).json({ error: 'game_ids (array) is required' });
  }

  const membership = db.prepare('SELECT * FROM club_members WHERE club_id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!membership || (membership.role !== 'owner' && membership.role !== 'officer')) {
    return res.status(403).json({ error: 'Only club owner or officers can create open challenges' });
  }

  // Verify participants are members of the club
  for (const uid of participant_ids) {
    const m = db.prepare('SELECT id FROM club_members WHERE club_id = ? AND user_id = ?').get(req.params.id, uid);
    if (!m) return res.status(400).json({ error: `User ${uid} is not a member of this club` });
  }

  // Verify games exist
  for (const gid of game_ids) {
    const g = db.prepare('SELECT id FROM games WHERE id = ?').get(gid);
    if (!g) return res.status(400).json({ error: `Game ${gid} not found` });
  }

  const result = db.prepare(
    'INSERT INTO open_challenges (club_id, description, game_ids, participant_ids) VALUES (?, ?, ?, ?)'
  ).run(req.params.id, description || null, JSON.stringify(game_ids), JSON.stringify(participant_ids));

  res.json({ id: result.lastInsertRowid, status: 'open' });
});

// Accept open challenge
router.post('/open-challenges/:id/accept', authenticate, (req, res) => {
  const { participant_ids } = req.body;
  if (!participant_ids || !Array.isArray(participant_ids) || participant_ids.length === 0) {
    return res.status(400).json({ error: 'participant_ids (array) is required' });
  }

  const challenge = db.prepare('SELECT * FROM open_challenges WHERE id = ? AND status = ?').get(req.params.id, 'open');
  if (!challenge) return res.status(404).json({ error: 'Open challenge not found' });

  // Get the accepting user's club
  const membership = db.prepare('SELECT cm.*, c.id as cid FROM club_members cm JOIN clubs c ON cm.club_id = c.id WHERE cm.user_id = ?').get(req.userId);
  if (!membership) return res.status(403).json({ error: 'You are not in a club' });
  if (membership.club_id === challenge.club_id) return res.status(400).json({ error: 'Cannot accept your own open challenge' });
  if (membership.role !== 'owner' && membership.role !== 'officer') {
    return res.status(403).json({ error: 'Only club owner or officers can accept open challenges' });
  }

  const acceptingClubId = membership.club_id;

  // Verify accepting participants are in the accepting club
  for (const uid of participant_ids) {
    const m = db.prepare('SELECT id FROM club_members WHERE club_id = ? AND user_id = ?').get(acceptingClubId, uid);
    if (!m) return res.status(400).json({ error: `User ${uid} is not a member of your club` });
  }

  // Resolve by comparing average gamerscore of chosen participants
  let challengerIds = [];
  try { challengerIds = JSON.parse(challenge.participant_ids); } catch {}

  const challengerScore = getClubAverageGamescoреForMembers(challengerIds);
  const challengedScore = getClubAverageGamescoреForMembers(participant_ids);
  const winnerId = challengerScore >= challengedScore ? challenge.club_id : acceptingClubId;
  const loserId = winnerId === challenge.club_id ? acceptingClubId : challenge.club_id;
  const scoreAwarded = 100;

  db.prepare(`
    UPDATE open_challenges
    SET status = 'completed', accepted_by_club_id = ?, accepted_participant_ids = ?,
        challenger_score = ?, challenged_score = ?, winner_id = ?, score_awarded = ?,
        resolved_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(acceptingClubId, JSON.stringify(participant_ids), challengerScore, challengedScore, winnerId, scoreAwarded, challenge.id);

  db.prepare('UPDATE clubs SET club_score = club_score + ?, wins = wins + 1 WHERE id = ?').run(scoreAwarded, winnerId);
  db.prepare('UPDATE clubs SET losses = losses + 1 WHERE id = ?').run(loserId);

  const winner = db.prepare('SELECT name, tag FROM clubs WHERE id = ?').get(winnerId);
  res.json({
    status: 'completed',
    challenger_score: challengerScore,
    challenged_score: challengedScore,
    winner,
    score_awarded: scoreAwarded
  });
});

// Respond to targeted challenge
router.post('/challenges/:challengeId/respond', authenticate, (req, res) => {
  const { action } = req.body;
  if (!['accept', 'decline'].includes(action)) {
    return res.status(400).json({ error: 'action must be accept or decline' });
  }

  const challenge = db.prepare('SELECT * FROM club_challenges WHERE id = ? AND status = ?').get(req.params.challengeId, 'pending');
  if (!challenge) return res.status(404).json({ error: 'Pending challenge not found' });

  const membership = db.prepare('SELECT * FROM club_members WHERE club_id = ? AND user_id = ?').get(challenge.challenged_id, req.userId);
  if (!membership || (membership.role !== 'owner' && membership.role !== 'officer')) {
    return res.status(403).json({ error: 'Only the challenged club owner/officers can respond' });
  }

  if (action === 'decline') {
    db.prepare('UPDATE club_challenges SET status = ?, resolved_at = CURRENT_TIMESTAMP WHERE id = ?').run('declined', challenge.id);
    return res.json({ status: 'declined' });
  }

  const challengerScore = getClubAverageGamerscore(challenge.challenger_id);
  const challengedScore = getClubAverageGamerscore(challenge.challenged_id);
  const winnerId = challengerScore >= challengedScore ? challenge.challenger_id : challenge.challenged_id;
  const loserId = winnerId === challenge.challenger_id ? challenge.challenged_id : challenge.challenger_id;
  const scoreAwarded = 100;

  db.prepare(`
    UPDATE club_challenges
    SET status = 'completed', challenger_score = ?, challenged_score = ?,
        winner_id = ?, score_awarded = ?, resolved_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(challengerScore, challengedScore, winnerId, scoreAwarded, challenge.id);

  db.prepare('UPDATE clubs SET club_score = club_score + ?, wins = wins + 1 WHERE id = ?').run(scoreAwarded, winnerId);
  db.prepare('UPDATE clubs SET losses = losses + 1 WHERE id = ?').run(loserId);

  const winner = db.prepare('SELECT name, tag FROM clubs WHERE id = ?').get(winnerId);
  res.json({
    status: 'completed',
    challenger_score: challengerScore,
    challenged_score: challengedScore,
    winner,
    score_awarded: scoreAwarded
  });
});

// Club leaderboard
router.get('/leaderboard/clubs', (req, res) => {
  const clubs = db.prepare(`
    SELECT c.*, u.username as owner_username, COUNT(cm.user_id) as member_count
    FROM clubs c
    JOIN users u ON c.owner_id = u.id
    LEFT JOIN club_members cm ON c.id = cm.club_id
    GROUP BY c.id
    ORDER BY c.club_score DESC
    LIMIT 50
  `).all();
  res.json(clubs);
});

module.exports = router;
