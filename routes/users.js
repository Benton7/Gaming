const express = require('express');
const { db, updateUserGamerscore } = require('../db');
const { authenticate } = require('./middleware');

const router = express.Router();

router.get('/me', authenticate, (req, res) => {
  const user = db.prepare(
    'SELECT id, username, email, gamertag, avatar_color, gamerscore, created_at FROM users WHERE id = ?'
  ).get(req.userId);

  if (!user) return res.status(404).json({ error: 'User not found' });

  const accounts = db.prepare(`
    SELECT ca.*, g.name as game_name, g.slug, g.icon, g.color, g.ranks
    FROM connected_accounts ca
    JOIN games g ON ca.game_id = g.id
    WHERE ca.user_id = ?
    ORDER BY g.name
  `).all(req.userId);

  const accountsWithRanks = accounts.map(a => {
    const ranks = JSON.parse(a.ranks);
    return {
      id: a.id,
      game_id: a.game_id,
      game_name: a.game_name,
      slug: a.slug,
      icon: a.icon,
      color: a.color,
      platform_username: a.platform_username,
      platform: a.platform,
      current_rank: ranks[a.current_rank_index] || null,
      peak_rank: ranks[a.peak_rank_index] || null,
      current_rank_index: a.current_rank_index,
      peak_rank_index: a.peak_rank_index,
      last_updated: a.last_updated,
      ranks
    };
  });

  const membership = db.prepare(`
    SELECT cm.role, c.id, c.name, c.tag, c.club_score, c.wins, c.losses
    FROM club_members cm
    JOIN clubs c ON cm.club_id = c.id
    WHERE cm.user_id = ?
  `).get(req.userId);

  res.json({ ...user, accounts: accountsWithRanks, club: membership || null });
});

router.patch('/me', authenticate, (req, res) => {
  const { gamertag, avatar_color } = req.body;
  const updates = [];
  const values = [];

  if (gamertag !== undefined) { updates.push('gamertag = ?'); values.push(gamertag); }
  if (avatar_color !== undefined) { updates.push('avatar_color = ?'); values.push(avatar_color); }

  if (updates.length === 0) return res.status(400).json({ error: 'Nothing to update' });

  values.push(req.userId);
  db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  res.json({ success: true });
});

router.get('/leaderboard', (req, res) => {
  const users = db.prepare(`
    SELECT u.id, u.username, u.gamertag, u.avatar_color, u.gamerscore, u.created_at,
           c.name as club_name, c.tag as club_tag
    FROM users u
    LEFT JOIN club_members cm ON u.id = cm.user_id
    LEFT JOIN clubs c ON cm.club_id = c.id
    ORDER BY u.gamerscore DESC
    LIMIT 50
  `).all();
  res.json(users);
});

router.get('/:id', (req, res) => {
  const user = db.prepare(
    'SELECT id, username, gamertag, avatar_color, gamerscore, created_at FROM users WHERE id = ?'
  ).get(req.params.id);

  if (!user) return res.status(404).json({ error: 'User not found' });

  const accounts = db.prepare(`
    SELECT ca.*, g.name as game_name, g.slug, g.icon, g.color, g.ranks
    FROM connected_accounts ca
    JOIN games g ON ca.game_id = g.id
    WHERE ca.user_id = ?
    ORDER BY g.name
  `).all(req.params.id);

  const accountsWithRanks = accounts.map(a => {
    const ranks = JSON.parse(a.ranks);
    return {
      id: a.id,
      game_name: a.game_name,
      slug: a.slug,
      icon: a.icon,
      color: a.color,
      platform_username: a.platform_username,
      platform: a.platform,
      current_rank: ranks[a.current_rank_index] || null,
      peak_rank: ranks[a.peak_rank_index] || null
    };
  });

  const membership = db.prepare(`
    SELECT cm.role, c.id, c.name, c.tag, c.club_score
    FROM club_members cm
    JOIN clubs c ON cm.club_id = c.id
    WHERE cm.user_id = ?
  `).get(req.params.id);

  res.json({ ...user, accounts: accountsWithRanks, club: membership || null });
});

module.exports = router;
