const express = require('express');
const { db, createMatch } = require('../db');
const { authenticate } = require('./middleware');

const router = express.Router();

function getTeamWithMembers(teamId) {
  const team = db.prepare(`
    SELECT t.*, g.name as game_name, g.icon as game_icon, g.color as game_color, g.team_size, g.bench_size, u.username as owner_username
    FROM teams t
    JOIN games g ON t.game_id = g.id
    JOIN users u ON t.owner_id = u.id
    WHERE t.id = ?
  `).get(teamId);
  if (!team) return null;

  const members = db.prepare(`
    SELECT tm.role, tm.joined_at, u.id, u.username, u.gamertag, u.avatar_color, u.gamerscore,
           ca.platform_username, ca.platform, ca.current_rank_index, g.ranks
    FROM team_members tm
    JOIN users u ON tm.user_id = u.id
    LEFT JOIN connected_accounts ca ON (ca.user_id = u.id AND ca.game_id = ?)
    LEFT JOIN games g ON g.id = ca.game_id
    WHERE tm.team_id = ?
    ORDER BY CASE tm.role WHEN 'owner' THEN 0 WHEN 'player' THEN 1 ELSE 2 END, u.gamerscore DESC
  `).all(team.game_id, teamId);

  const enrichedMembers = members.map(m => {
    let current_rank = null;
    if (m.ranks && m.current_rank_index !== null) {
      try { current_rank = JSON.parse(m.ranks)[m.current_rank_index] || null; } catch {}
    }
    return { ...m, current_rank, ranks: undefined };
  });

  const maxPlayers = team.team_size || 5;
  const maxBench = team.bench_size || 2;
  const players = enrichedMembers.filter(m => m.role !== 'bench');
  const bench = enrichedMembers.filter(m => m.role === 'bench');

  return { ...team, members: enrichedMembers, players, bench, member_count: enrichedMembers.length, max_players: maxPlayers, max_bench: maxBench };
}

// List teams (optionally by game)
router.get('/', (req, res) => {
  const { game_id, search } = req.query;
  let query = `
    SELECT t.*, g.name as game_name, g.icon as game_icon, g.color as game_color,
           u.username as owner_username, COUNT(tm.user_id) as member_count
    FROM teams t
    JOIN games g ON t.game_id = g.id
    JOIN users u ON t.owner_id = u.id
    LEFT JOIN team_members tm ON t.id = tm.team_id
  `;
  const params = [];
  const conditions = [];
  if (game_id) { conditions.push('t.game_id = ?'); params.push(game_id); }
  if (search) { conditions.push('(t.name LIKE ? OR t.tag LIKE ?)'); params.push(`%${search}%`, `%${search}%`); }
  if (conditions.length) query += ' WHERE ' + conditions.join(' AND ');
  query += ' GROUP BY t.id ORDER BY CASE WHEN t.elo_matches >= 5 THEN t.elo ELSE NULL END DESC NULLS LAST, t.team_score DESC LIMIT 50';
  res.json(db.prepare(query).all(...params));
});

// Get my teams
router.get('/mine', authenticate, (req, res) => {
  const teams = db.prepare(`
    SELECT t.*, g.name as game_name, g.icon as game_icon, g.color as game_color,
           u.username as owner_username, COUNT(tm2.user_id) as member_count
    FROM team_members tm
    JOIN teams t ON tm.team_id = t.id
    JOIN games g ON t.game_id = g.id
    JOIN users u ON t.owner_id = u.id
    LEFT JOIN team_members tm2 ON t.id = tm2.team_id
    WHERE tm.user_id = ?
    GROUP BY t.id
    ORDER BY g.name
  `).all(req.userId);
  res.json(teams);
});

// Get team detail
router.get('/:id', (req, res) => {
  const team = getTeamWithMembers(req.params.id);
  if (!team) return res.status(404).json({ error: 'Team not found' });

  const challenges = db.prepare(`
    SELECT tc.*, t1.name as challenger_name, t1.tag as challenger_tag, t2.name as challenged_name, t2.tag as challenged_tag
    FROM team_challenges tc
    JOIN teams t1 ON tc.challenger_team_id = t1.id
    LEFT JOIN teams t2 ON tc.challenged_team_id = t2.id
    WHERE tc.challenger_team_id = ? OR tc.challenged_team_id = ?
    ORDER BY tc.created_at DESC LIMIT 10
  `).all(req.params.id, req.params.id);

  // Pending invites
  const invites = db.prepare(`
    SELECT ti.*, u.username, u.gamertag, u.avatar_color
    FROM team_invites ti JOIN users u ON ti.invitee_id = u.id
    WHERE ti.team_id = ? AND ti.status = 'pending'
  `).all(req.params.id);

  res.json({ ...team, challenges, pending_invites: invites });
});

// Create team
router.post('/', authenticate, (req, res) => {
  const { name, tag, game_id } = req.body;
  if (!name || !tag || !game_id) return res.status(400).json({ error: 'name, tag, game_id required' });
  if (tag.length > 5) return res.status(400).json({ error: 'Tag must be ≤ 5 characters' });

  const game = db.prepare('SELECT * FROM games WHERE id = ?').get(game_id);
  if (!game) return res.status(404).json({ error: 'Game not found' });

  // User can only be on one team per game
  const existing = db.prepare(`
    SELECT t.id FROM team_members tm JOIN teams t ON tm.team_id = t.id
    WHERE tm.user_id = ? AND t.game_id = ?
  `).get(req.userId, game_id);
  if (existing) return res.status(409).json({ error: 'You are already on a team for this game' });

  try {
    const result = db.prepare('INSERT INTO teams (name, tag, game_id, owner_id) VALUES (?, ?, ?, ?)').run(name, tag.toUpperCase(), game_id, req.userId);
    db.prepare('INSERT INTO team_members (team_id, user_id, role) VALUES (?, ?, ?)').run(result.lastInsertRowid, req.userId, 'owner');
    res.json(getTeamWithMembers(result.lastInsertRowid));
  } catch (err) {
    if (err.message.includes('UNIQUE')) return res.status(409).json({ error: 'Team name already taken' });
    res.status(500).json({ error: 'Failed to create team' });
  }
});

// Invite user to team
router.post('/:id/invite', authenticate, (req, res) => {
  const { user_id, role } = req.body;
  if (!user_id) return res.status(400).json({ error: 'user_id required' });

  const team = getTeamWithMembers(req.params.id);
  if (!team) return res.status(404).json({ error: 'Team not found' });

  const myMembership = db.prepare('SELECT role FROM team_members WHERE team_id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!myMembership || myMembership.role !== 'owner') return res.status(403).json({ error: 'Only the team owner can invite' });

  const targetUser = db.prepare('SELECT id, username FROM users WHERE id = ?').get(user_id);
  if (!targetUser) return res.status(404).json({ error: 'User not found' });

  // Check if already member
  const alreadyMember = db.prepare('SELECT id FROM team_members WHERE team_id = ? AND user_id = ?').get(req.params.id, user_id);
  if (alreadyMember) return res.status(409).json({ error: 'User is already on the team' });

  // Capacity check
  const assignedRole = role === 'bench' ? 'bench' : 'player';
  const roleCount = assignedRole === 'bench' ? team.bench.length : team.players.length;
  const maxCount = assignedRole === 'bench' ? (team.max_bench || 2) : (team.max_players || 5);
  if (roleCount >= maxCount) return res.status(409).json({ error: `${assignedRole === 'bench' ? 'Bench' : 'Roster'} is full (${maxCount}/${maxCount})` });

  try {
    const result = db.prepare('INSERT OR REPLACE INTO team_invites (team_id, invitee_id, inviter_id, role) VALUES (?, ?, ?, ?)').run(req.params.id, user_id, req.userId, assignedRole);
    res.json({ id: result.lastInsertRowid, status: 'pending' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to invite' });
  }
});

// Respond to invite
router.post('/invites/:inviteId/respond', authenticate, (req, res) => {
  const { action } = req.body;
  if (!['accept', 'decline'].includes(action)) return res.status(400).json({ error: 'action must be accept or decline' });

  const invite = db.prepare('SELECT * FROM team_invites WHERE id = ? AND invitee_id = ? AND status = ?').get(req.params.inviteId, req.userId, 'pending');
  if (!invite) return res.status(404).json({ error: 'Invite not found' });

  if (action === 'decline') {
    db.prepare("UPDATE team_invites SET status = 'declined' WHERE id = ?").run(invite.id);
    return res.json({ status: 'declined' });
  }

  // Accept — check capacity again
  const team = getTeamWithMembers(invite.team_id);
  if (!team) return res.status(404).json({ error: 'Team not found' });

  const roleCount = invite.role === 'bench' ? team.bench.length : team.players.filter(p => p.role !== 'owner').length;
  const maxCount = invite.role === 'bench' ? (team.max_bench || 2) : (team.max_players || 5);
  if (roleCount >= maxCount) return res.status(409).json({ error: 'Team is full' });

  // Check user not already on a team for this game
  const conflicting = db.prepare(`
    SELECT t.id FROM team_members tm JOIN teams t ON tm.team_id = t.id WHERE tm.user_id = ? AND t.game_id = ?
  `).get(req.userId, team.game_id);
  if (conflicting) return res.status(409).json({ error: 'You are already on a team for this game' });

  db.prepare('INSERT INTO team_members (team_id, user_id, role) VALUES (?, ?, ?)').run(invite.team_id, req.userId, invite.role);
  db.prepare("UPDATE team_invites SET status = 'accepted' WHERE id = ?").run(invite.id);
  res.json({ status: 'accepted' });
});

// Get my pending invites
router.get('/invites/mine', authenticate, (req, res) => {
  const invites = db.prepare(`
    SELECT ti.*, t.name as team_name, t.tag as team_tag, g.name as game_name, g.icon as game_icon, g.color as game_color,
           u.username as inviter_username, u.gamertag as inviter_gamertag
    FROM team_invites ti
    JOIN teams t ON ti.team_id = t.id
    JOIN games g ON t.game_id = g.id
    JOIN users u ON ti.inviter_id = u.id
    WHERE ti.invitee_id = ? AND ti.status = 'pending'
  `).all(req.userId);
  res.json(invites);
});

// Leave / kick from team
router.delete('/:id/leave', authenticate, (req, res) => {
  const membership = db.prepare('SELECT role FROM team_members WHERE team_id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!membership) return res.status(404).json({ error: 'Not on this team' });

  if (membership.role === 'owner') {
    const count = db.prepare('SELECT COUNT(*) as c FROM team_members WHERE team_id = ?').get(req.params.id).c;
    if (count > 1) return res.status(400).json({ error: 'Transfer ownership before leaving, or disband the team' });
    db.prepare('DELETE FROM teams WHERE id = ?').run(req.params.id);
    return res.json({ disbanded: true });
  }

  db.prepare('DELETE FROM team_members WHERE team_id = ? AND user_id = ?').run(req.params.id, req.userId);
  res.json({ success: true });
});

router.delete('/:id/kick/:userId', authenticate, (req, res) => {
  const team = db.prepare('SELECT * FROM teams WHERE id = ? AND owner_id = ?').get(req.params.id, req.userId);
  if (!team) return res.status(403).json({ error: 'Only owner can kick' });
  if (parseInt(req.params.userId) === req.userId) return res.status(400).json({ error: 'Cannot kick yourself' });

  const result = db.prepare('DELETE FROM team_members WHERE team_id = ? AND user_id = ?').run(req.params.id, req.params.userId);
  if (result.changes === 0) return res.status(404).json({ error: 'Member not found' });
  res.json({ success: true });
});

// Post a team challenge (open — any team of same game can accept)
router.post('/:id/challenge', authenticate, (req, res) => {
  const { participant_ids, description } = req.body;
  if (!participant_ids || !Array.isArray(participant_ids) || !participant_ids.length) {
    return res.status(400).json({ error: 'participant_ids required' });
  }

  const myMembership = db.prepare('SELECT role FROM team_members WHERE team_id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!myMembership || myMembership.role !== 'owner') return res.status(403).json({ error: 'Only team owner can post challenges' });

  const team = getTeamWithMembers(req.params.id);
  if (!team) return res.status(404).json({ error: 'Team not found' });

  // Verify participants are on the team
  for (const uid of participant_ids) {
    const m = db.prepare('SELECT id FROM team_members WHERE team_id = ? AND user_id = ?').get(req.params.id, uid);
    if (!m) return res.status(400).json({ error: `User ${uid} is not on the team` });
  }

  const result = db.prepare(
    'INSERT INTO team_challenges (challenger_team_id, participant_ids, description) VALUES (?, ?, ?)'
  ).run(req.params.id, JSON.stringify(participant_ids), description || null);

  res.json({ id: result.lastInsertRowid, status: 'open' });
});

// List open team challenges for a game
router.get('/challenges/open', (req, res) => {
  const { game_id } = req.query;
  let query = `
    SELECT tc.*, t.name as team_name, t.tag as team_tag, g.name as game_name, g.icon as game_icon, g.color as game_color, t.game_id
    FROM team_challenges tc
    JOIN teams t ON tc.challenger_team_id = t.id
    JOIN games g ON t.game_id = g.id
    WHERE tc.status = 'open'
  `;
  const params = [];
  if (game_id) { query += ' AND t.game_id = ?'; params.push(game_id); }
  query += ' ORDER BY tc.created_at DESC LIMIT 50';

  const challenges = db.prepare(query).all(...params).map(ch => {
    let participant_ids = [];
    try { participant_ids = JSON.parse(ch.participant_ids); } catch {}
    const participants = participant_ids.map(uid => db.prepare('SELECT id, username, gamertag, avatar_color, gamerscore FROM users WHERE id = ?').get(uid)).filter(Boolean);
    return { ...ch, participants };
  });
  res.json(challenges);
});

// Accept a team challenge
router.post('/challenges/:challengeId/accept', authenticate, (req, res) => {
  const { team_id, participant_ids } = req.body;
  if (!team_id || !participant_ids || !Array.isArray(participant_ids) || !participant_ids.length) {
    return res.status(400).json({ error: 'team_id and participant_ids required' });
  }

  const challenge = db.prepare('SELECT * FROM team_challenges WHERE id = ? AND status = ?').get(req.params.challengeId, 'open');
  if (!challenge) return res.status(404).json({ error: 'Open challenge not found' });

  if (challenge.challenger_team_id === parseInt(team_id)) return res.status(400).json({ error: 'Cannot accept your own challenge' });

  const myMembership = db.prepare('SELECT role FROM team_members WHERE team_id = ? AND user_id = ?').get(team_id, req.userId);
  if (!myMembership || myMembership.role !== 'owner') return res.status(403).json({ error: 'Only team owner can accept challenges' });

  const challengerTeam = db.prepare('SELECT * FROM teams WHERE id = ?').get(challenge.challenger_team_id);
  const acceptingTeam = db.prepare('SELECT * FROM teams WHERE id = ?').get(team_id);
  if (!challengerTeam || !acceptingTeam) return res.status(404).json({ error: 'Team not found' });
  if (challengerTeam.game_id !== acceptingTeam.game_id) return res.status(400).json({ error: 'Teams must play the same game' });

  // Verify accepting participants
  for (const uid of participant_ids) {
    const m = db.prepare('SELECT id FROM team_members WHERE team_id = ? AND user_id = ?').get(team_id, uid);
    if (!m) return res.status(400).json({ error: `User ${uid} is not on your team` });
  }

  let challenger_ids = [];
  try { challenger_ids = JSON.parse(challenge.participant_ids); } catch {}

  // Create match
  const matchId = createMatch({
    match_type: 'team',
    entity_a_id: challenge.challenger_team_id,
    entity_b_id: parseInt(team_id),
    entity_a_label: `[${challengerTeam.tag}] ${challengerTeam.name}`,
    entity_b_label: `[${acceptingTeam.tag}] ${acceptingTeam.name}`,
    participant_a_ids: challenger_ids,
    participant_b_ids: participant_ids,
    game_ids: [challengerTeam.game_id],
    description: challenge.description
  });

  db.prepare('UPDATE team_challenges SET status = ?, accepted_participant_ids = ?, match_id = ? WHERE id = ?')
    .run('accepted', JSON.stringify(participant_ids), matchId, challenge.id);

  res.json({ match_id: matchId, status: 'accepted' });
});

module.exports = router;
