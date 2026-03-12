const express = require('express');
const { db } = require('../db');
const { authenticate } = require('./middleware');

const router = express.Router();

// GET /api/friends — my accepted friends
router.get('/', authenticate, (req, res) => {
  const friends = db.prepare(`
    SELECT u.id, u.username, u.gamertag, u.avatar_color, u.avatar_url, u.gamerscore, u.title,
           c.name as club_name, c.tag as club_tag
    FROM friends f
    JOIN users u ON u.id = CASE WHEN f.requester_id = ? THEN f.addressee_id ELSE f.requester_id END
    LEFT JOIN club_members cm ON u.id = cm.user_id
    LEFT JOIN clubs c ON cm.club_id = c.id
    WHERE (f.requester_id = ? OR f.addressee_id = ?) AND f.status = 'accepted'
    ORDER BY u.gamerscore DESC
  `).all(req.userId, req.userId, req.userId);
  res.json(friends);
});

// GET /api/friends/requests — incoming pending requests
router.get('/requests', authenticate, (req, res) => {
  const requests = db.prepare(`
    SELECT f.id, f.created_at,
           u.id as user_id, u.username, u.gamertag, u.avatar_color, u.avatar_url, u.gamerscore
    FROM friends f
    JOIN users u ON u.id = f.requester_id
    WHERE f.addressee_id = ? AND f.status = 'pending'
    ORDER BY f.created_at DESC
  `).all(req.userId);
  res.json(requests);
});

// GET /api/friends/leaderboard — friends sorted by gamerscore (for leaderboard tab)
router.get('/leaderboard', authenticate, (req, res) => {
  const friends = db.prepare(`
    SELECT u.id, u.username, u.gamertag, u.avatar_color, u.avatar_url, u.gamerscore, u.title,
           c.name as club_name, c.tag as club_tag
    FROM friends f
    JOIN users u ON u.id = CASE WHEN f.requester_id = ? THEN f.addressee_id ELSE f.requester_id END
    LEFT JOIN club_members cm ON u.id = cm.user_id
    LEFT JOIN clubs c ON cm.club_id = c.id
    WHERE (f.requester_id = ? OR f.addressee_id = ?) AND f.status = 'accepted'
    ORDER BY u.gamerscore DESC
  `).all(req.userId, req.userId, req.userId);
  // Include self in friends leaderboard
  const me = db.prepare(`
    SELECT u.id, u.username, u.gamertag, u.avatar_color, u.avatar_url, u.gamerscore, u.title,
           c.name as club_name, c.tag as club_tag
    FROM users u
    LEFT JOIN club_members cm ON u.id = cm.user_id
    LEFT JOIN clubs c ON cm.club_id = c.id
    WHERE u.id = ?
  `).get(req.userId);
  const all = me ? [me, ...friends] : friends;
  all.sort((a, b) => b.gamerscore - a.gamerscore);
  res.json(all);
});

// POST /api/friends/request — send a friend request
router.post('/request', authenticate, (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId required' });
  if (userId == req.userId) return res.status(400).json({ error: 'Cannot friend yourself' });

  const target = db.prepare('SELECT id, username FROM users WHERE id = ?').get(userId);
  if (!target) return res.status(404).json({ error: 'User not found' });

  // Check existing relationship
  const existing = db.prepare(`
    SELECT * FROM friends
    WHERE (requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)
  `).get(req.userId, userId, userId, req.userId);

  if (existing) {
    if (existing.status === 'accepted') return res.status(400).json({ error: 'Already friends' });
    if (existing.status === 'pending') return res.status(400).json({ error: 'Request already pending' });
    // If declined, allow re-request by updating
    db.prepare('UPDATE friends SET status = ?, requester_id = ?, addressee_id = ? WHERE id = ?')
      .run('pending', req.userId, userId, existing.id);
    return res.json({ success: true });
  }

  db.prepare('INSERT INTO friends (requester_id, addressee_id) VALUES (?, ?)').run(req.userId, userId);
  res.json({ success: true });
});

// POST /api/friends/:id/accept
router.post('/:id/accept', authenticate, (req, res) => {
  const request = db.prepare('SELECT * FROM friends WHERE id = ? AND addressee_id = ? AND status = ?')
    .get(req.params.id, req.userId, 'pending');
  if (!request) return res.status(404).json({ error: 'Request not found' });

  db.prepare('UPDATE friends SET status = ? WHERE id = ?').run('accepted', request.id);
  res.json({ success: true });
});

// DELETE /api/friends/:id — unfriend or decline
router.delete('/:id', authenticate, (req, res) => {
  const record = db.prepare(`
    SELECT * FROM friends WHERE id = ? AND (requester_id = ? OR addressee_id = ?)
  `).get(req.params.id, req.userId, req.userId);
  if (!record) return res.status(404).json({ error: 'Not found' });

  db.prepare('DELETE FROM friends WHERE id = ?').run(record.id);
  res.json({ success: true });
});

// GET /api/friends/status/:userId — check friendship status with a user
router.get('/status/:userId', authenticate, (req, res) => {
  const record = db.prepare(`
    SELECT * FROM friends
    WHERE (requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)
  `).get(req.userId, req.params.userId, req.params.userId, req.userId);

  if (!record) return res.json({ status: 'none' });
  if (record.status === 'accepted') return res.json({ status: 'friends', id: record.id });
  if (record.status === 'pending' && record.requester_id == req.userId)
    return res.json({ status: 'sent', id: record.id });
  if (record.status === 'pending' && record.addressee_id == req.userId)
    return res.json({ status: 'received', id: record.id });
  return res.json({ status: 'none' });
});

module.exports = router;
