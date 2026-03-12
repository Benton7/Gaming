const express = require('express');
const { db, updateUserGamerscore } = require('../db');
const { authenticate } = require('./middleware');

const router = express.Router();

router.get('/', (req, res) => {
  const games = db.prepare('SELECT id, name, slug, icon, color, ranks FROM games ORDER BY name').all();
  res.json(games.map(g => ({ ...g, ranks: JSON.parse(g.ranks) })));
});

router.post('/accounts', authenticate, (req, res) => {
  const { game_id, platform_username, platform, current_rank_index, peak_rank_index, tracker_url, verified, region } = req.body;
  if (!game_id || !platform_username) {
    return res.status(400).json({ error: 'game_id and platform_username are required' });
  }

  const game = db.prepare('SELECT * FROM games WHERE id = ?').get(game_id);
  if (!game) return res.status(404).json({ error: 'Game not found' });

  const ranks = JSON.parse(game.ranks);
  const curIdx = Math.max(0, Math.min(current_rank_index || 0, ranks.length - 1));
  const peakIdx = Math.max(curIdx, Math.min(peak_rank_index || curIdx, ranks.length - 1));

  try {
    const stmt = db.prepare(`
      INSERT INTO connected_accounts (user_id, game_id, platform_username, platform, current_rank_index, peak_rank_index, tracker_url, verified, verified_at, region)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      req.userId, game_id, platform_username, platform || 'PC', curIdx, peakIdx,
      tracker_url || null,
      verified ? 1 : 0,
      verified ? new Date().toISOString() : null,
      region || ''
    );
    const newScore = updateUserGamerscore(req.userId);

    res.json({
      id: result.lastInsertRowid,
      game_name: game.name,
      icon: game.icon,
      current_rank: ranks[curIdx],
      peak_rank: ranks[peakIdx],
      gamerscore: newScore
    });
  } catch (err) {
    if (err.message.includes('UNIQUE constraint')) {
      return res.status(409).json({ error: 'Account for this game already connected' });
    }
    res.status(500).json({ error: 'Failed to connect account' });
  }
});

router.patch('/accounts/:id', authenticate, (req, res) => {
  const account = db.prepare(
    'SELECT ca.*, g.ranks FROM connected_accounts ca JOIN games g ON ca.game_id = g.id WHERE ca.id = ? AND ca.user_id = ?'
  ).get(req.params.id, req.userId);

  if (!account) return res.status(404).json({ error: 'Account not found' });

  const ranks = JSON.parse(account.ranks);
  const { current_rank_index, peak_rank_index, platform_username, platform, tracker_url } = req.body;

  let curIdx = current_rank_index !== undefined ? current_rank_index : account.current_rank_index;
  let peakIdx = peak_rank_index !== undefined ? peak_rank_index : account.peak_rank_index;
  curIdx = Math.max(0, Math.min(curIdx, ranks.length - 1));
  peakIdx = Math.max(curIdx, Math.min(peakIdx, ranks.length - 1));

  const updates = ['current_rank_index = ?', 'peak_rank_index = ?', 'last_updated = CURRENT_TIMESTAMP'];
  const values = [curIdx, peakIdx];

  if (platform_username) { updates.push('platform_username = ?'); values.push(platform_username); }
  if (platform) { updates.push('platform = ?'); values.push(platform); }
  if (tracker_url !== undefined) { updates.push('tracker_url = ?'); values.push(tracker_url || null); }

  values.push(req.params.id, req.userId);
  db.prepare(`UPDATE connected_accounts SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`).run(...values);

  const newScore = updateUserGamerscore(req.userId);
  res.json({
    current_rank: ranks[curIdx],
    peak_rank: ranks[peakIdx],
    gamerscore: newScore
  });
});

router.delete('/accounts/:id', authenticate, (req, res) => {
  const result = db.prepare(
    'DELETE FROM connected_accounts WHERE id = ? AND user_id = ?'
  ).run(req.params.id, req.userId);

  if (result.changes === 0) return res.status(404).json({ error: 'Account not found' });

  const newScore = updateUserGamerscore(req.userId);
  res.json({ success: true, gamerscore: newScore });
});

module.exports = router;
