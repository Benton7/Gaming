const express = require('express');
const { db, getClubAverageGamerscore } = require('../db');
const { authenticate } = require('./middleware');

const router = express.Router();

function getClubWithMembers(clubId) {
  const club = db.prepare('SELECT c.*, u.username as owner_username FROM clubs c JOIN users u ON c.owner_id = u.id WHERE c.id = ?').get(clubId);
  if (!club) return null;

  const members = db.prepare(`
    SELECT cm.role, cm.joined_at, u.id, u.username, u.gamertag, u.avatar_color, u.gamerscore
    FROM club_members cm
    JOIN users u ON cm.user_id = u.id
    WHERE cm.club_id = ?
    ORDER BY u.gamerscore DESC
  `).all(clubId);

  return { ...club, members, member_count: members.length };
}

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

router.post('/', authenticate, (req, res) => {
  const { name, tag, description } = req.body;
  if (!name || !tag) return res.status(400).json({ error: 'Name and tag are required' });
  if (tag.length > 5) return res.status(400).json({ error: 'Tag must be 5 characters or less' });

  const existing = db.prepare('SELECT id FROM club_members WHERE user_id = ?').get(req.userId);
  if (existing) return res.status(409).json({ error: 'You are already in a club. Leave your current club first.' });

  try {
    const result = db.prepare(
      'INSERT INTO clubs (name, tag, description, owner_id) VALUES (?, ?, ?, ?)'
    ).run(name, tag.toUpperCase(), description || null, req.userId);

    db.prepare('INSERT INTO club_members (club_id, user_id, role) VALUES (?, ?, ?)').run(result.lastInsertRowid, req.userId, 'owner');
    res.json(getClubWithMembers(result.lastInsertRowid));
  } catch (err) {
    if (err.message.includes('UNIQUE constraint')) {
      return res.status(409).json({ error: 'Club name already taken' });
    }
    res.status(500).json({ error: 'Failed to create club' });
  }
});

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

router.post('/:id/join', authenticate, (req, res) => {
  const club = db.prepare('SELECT * FROM clubs WHERE id = ?').get(req.params.id);
  if (!club) return res.status(404).json({ error: 'Club not found' });

  const existing = db.prepare('SELECT id FROM club_members WHERE user_id = ?').get(req.userId);
  if (existing) return res.status(409).json({ error: 'You are already in a club' });

  db.prepare('INSERT INTO club_members (club_id, user_id, role) VALUES (?, ?, ?)').run(req.params.id, req.userId, 'member');
  res.json({ success: true, club_id: req.params.id });
});

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
    winner: winner,
    score_awarded: scoreAwarded
  });
});

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
