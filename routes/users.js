const express = require('express');
const { db, updateUserGamerscore } = require('../db');
const { authenticate } = require('./middleware');

const router = express.Router();

function enrichAccounts(accounts) {
  return accounts.map(a => {
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
      tracker_url: a.tracker_url || null,
      verified: !!a.verified,
      verified_at: a.verified_at || null,
      ranks
    };
  // Sort by current rank descending (best first)
  }).sort((a, b) => (b.current_rank_index || 0) - (a.current_rank_index || 0));
}

router.get('/me', authenticate, (req, res) => {
  const user = db.prepare(
    'SELECT id, username, email, gamertag, avatar_color, avatar_url, banner_color, bio, gamerscore, title, social_links, created_at FROM users WHERE id = ?'
  ).get(req.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const accounts = db.prepare(`
    SELECT ca.*, g.name as game_name, g.slug, g.icon, g.color, g.ranks
    FROM connected_accounts ca
    JOIN games g ON ca.game_id = g.id
    WHERE ca.user_id = ?
  `).all(req.userId);

  const membership = db.prepare(`
    SELECT cm.role, c.id, c.name, c.tag, c.club_score, c.wins, c.losses, c.club_color, c.motto
    FROM club_members cm JOIN clubs c ON cm.club_id = c.id
    WHERE cm.user_id = ?
  `).get(req.userId);

  const teams = db.prepare(`
    SELECT t.id, t.name, t.tag, g.name as game_name, g.icon, g.color as game_color, tm.role
    FROM team_members tm
    JOIN teams t ON tm.team_id = t.id
    JOIN games g ON t.game_id = g.id
    WHERE tm.user_id = ?
    ORDER BY t.name
  `).all(req.userId);

  const friendCount = db.prepare(`
    SELECT COUNT(*) as cnt FROM friends
    WHERE (requester_id = ? OR addressee_id = ?) AND status = 'accepted'
  `).get(req.userId, req.userId)?.cnt || 0;

  const pendingRequests = db.prepare(`
    SELECT COUNT(*) as cnt FROM friends WHERE addressee_id = ? AND status = 'pending'
  `).get(req.userId)?.cnt || 0;

  let socialLinks = {};
  try { socialLinks = JSON.parse(user.social_links || '{}'); } catch {}

  res.json({
    ...user,
    social_links: socialLinks,
    accounts: enrichAccounts(accounts),
    club: membership || null,
    teams,
    friend_count: friendCount,
    pending_friend_requests: pendingRequests
  });
});

router.patch('/me', authenticate, (req, res) => {
  const { gamertag, avatar_color, banner_color, bio, title, social_links } = req.body;
  const updates = [];
  const values = [];

  if (gamertag !== undefined) { updates.push('gamertag = ?'); values.push(gamertag); }
  if (avatar_color !== undefined) { updates.push('avatar_color = ?'); values.push(avatar_color); }
  if (banner_color !== undefined) { updates.push('banner_color = ?'); values.push(banner_color); }
  if (bio !== undefined) { updates.push('bio = ?'); values.push(bio); }
  if (title !== undefined) { updates.push('title = ?'); values.push(title || null); }
  if (social_links !== undefined) { updates.push('social_links = ?'); values.push(JSON.stringify(social_links)); }

  if (updates.length === 0) return res.status(400).json({ error: 'Nothing to update' });

  values.push(req.userId);
  db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  res.json({ success: true });
});

// Upload avatar (base64)
router.post('/me/avatar', authenticate, (req, res) => {
  const { avatar_url } = req.body;
  if (!avatar_url) return res.status(400).json({ error: 'avatar_url required' });
  // Basic size check (4MB base64 limit)
  if (avatar_url.length > 5 * 1024 * 1024) return res.status(400).json({ error: 'Image too large (max 4MB)' });
  db.prepare('UPDATE users SET avatar_url = ? WHERE id = ?').run(avatar_url, req.userId);
  res.json({ success: true });
});

router.get('/leaderboard', (req, res) => {
  const users = db.prepare(`
    SELECT u.id, u.username, u.gamertag, u.avatar_color, u.avatar_url, u.gamerscore, u.title, u.created_at,
           c.name as club_name, c.tag as club_tag
    FROM users u
    LEFT JOIN club_members cm ON u.id = cm.user_id
    LEFT JOIN clubs c ON cm.club_id = c.id
    ORDER BY u.gamerscore DESC
    LIMIT 50
  `).all();
  res.json(users);
});

router.get('/search', authenticate, (req, res) => {
  const { q } = req.query;
  if (!q || q.length < 2) return res.json([]);
  const like = `%${q}%`;
  const users = db.prepare(`
    SELECT id, username, gamertag, avatar_color, avatar_url, gamerscore
    FROM users WHERE (username LIKE ? OR gamertag LIKE ?) AND id != ?
    LIMIT 20
  `).all(like, like, req.userId);
  res.json(users);
});

router.get('/:id', (req, res) => {
  const user = db.prepare(
    'SELECT id, username, gamertag, avatar_color, avatar_url, banner_color, bio, gamerscore, title, social_links, created_at FROM users WHERE id = ?'
  ).get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const accounts = db.prepare(`
    SELECT ca.*, g.name as game_name, g.slug, g.icon, g.color, g.ranks
    FROM connected_accounts ca
    JOIN games g ON ca.game_id = g.id
    WHERE ca.user_id = ?
  `).all(req.params.id);

  const membership = db.prepare(`
    SELECT cm.role, c.id, c.name, c.tag, c.club_score
    FROM club_members cm JOIN clubs c ON cm.club_id = c.id
    WHERE cm.user_id = ?
  `).get(req.params.id);

  const teams = db.prepare(`
    SELECT t.id, t.name, t.tag, g.name as game_name, g.icon, tm.role
    FROM team_members tm
    JOIN teams t ON tm.team_id = t.id
    JOIN games g ON t.game_id = g.id
    WHERE tm.user_id = ?
    ORDER BY t.name
  `).all(req.params.id);

  const friendCount = db.prepare(`
    SELECT COUNT(*) as cnt FROM friends
    WHERE (requester_id = ? OR addressee_id = ?) AND status = 'accepted'
  `).get(req.params.id, req.params.id)?.cnt || 0;

  let socialLinks = {};
  try { socialLinks = JSON.parse(user.social_links || '{}'); } catch {}

  res.json({
    ...user,
    social_links: socialLinks,
    accounts: enrichAccounts(accounts),
    club: membership || null,
    teams,
    friend_count: friendCount
  });
});

module.exports = router;
