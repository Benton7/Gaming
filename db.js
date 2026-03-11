const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'gaming.db'));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    gamertag TEXT,
    avatar_color TEXT DEFAULT '#6366f1',
    gamerscore INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS games (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    icon TEXT,
    color TEXT,
    ranks TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS connected_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    game_id INTEGER NOT NULL,
    platform_username TEXT NOT NULL,
    platform TEXT DEFAULT 'PC',
    current_rank_index INTEGER DEFAULT 0,
    peak_rank_index INTEGER DEFAULT 0,
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (game_id) REFERENCES games(id),
    UNIQUE(user_id, game_id)
  );

  CREATE TABLE IF NOT EXISTS clubs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    tag TEXT NOT NULL,
    description TEXT,
    owner_id INTEGER NOT NULL,
    club_score INTEGER DEFAULT 0,
    wins INTEGER DEFAULT 0,
    losses INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (owner_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS club_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    club_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    role TEXT DEFAULT 'member',
    joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (club_id) REFERENCES clubs(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(club_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS club_challenges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    challenger_id INTEGER NOT NULL,
    challenged_id INTEGER NOT NULL,
    game_id INTEGER,
    status TEXT DEFAULT 'pending',
    challenger_score INTEGER DEFAULT 0,
    challenged_score INTEGER DEFAULT 0,
    winner_id INTEGER,
    score_awarded INTEGER DEFAULT 100,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    resolved_at DATETIME,
    FOREIGN KEY (challenger_id) REFERENCES clubs(id),
    FOREIGN KEY (challenged_id) REFERENCES clubs(id),
    FOREIGN KEY (game_id) REFERENCES games(id)
  );
`);

const gameCount = db.prepare('SELECT COUNT(*) as count FROM games').get();
if (gameCount.count === 0) {
  const games = [
    {
      name: 'Valorant',
      slug: 'valorant',
      icon: '🎯',
      color: '#ff4655',
      ranks: JSON.stringify([
        { name: 'Iron 1', value: 1, color: '#78716c' },
        { name: 'Iron 2', value: 2, color: '#78716c' },
        { name: 'Iron 3', value: 3, color: '#78716c' },
        { name: 'Bronze 1', value: 4, color: '#b45309' },
        { name: 'Bronze 2', value: 5, color: '#b45309' },
        { name: 'Bronze 3', value: 6, color: '#b45309' },
        { name: 'Silver 1', value: 7, color: '#9ca3af' },
        { name: 'Silver 2', value: 8, color: '#9ca3af' },
        { name: 'Silver 3', value: 9, color: '#9ca3af' },
        { name: 'Gold 1', value: 10, color: '#d97706' },
        { name: 'Gold 2', value: 11, color: '#d97706' },
        { name: 'Gold 3', value: 12, color: '#d97706' },
        { name: 'Platinum 1', value: 13, color: '#0ea5e9' },
        { name: 'Platinum 2', value: 14, color: '#0ea5e9' },
        { name: 'Platinum 3', value: 15, color: '#0ea5e9' },
        { name: 'Diamond 1', value: 16, color: '#818cf8' },
        { name: 'Diamond 2', value: 17, color: '#818cf8' },
        { name: 'Diamond 3', value: 18, color: '#818cf8' },
        { name: 'Ascendant 1', value: 19, color: '#10b981' },
        { name: 'Ascendant 2', value: 20, color: '#10b981' },
        { name: 'Ascendant 3', value: 21, color: '#10b981' },
        { name: 'Immortal 1', value: 22, color: '#ef4444' },
        { name: 'Immortal 2', value: 23, color: '#ef4444' },
        { name: 'Immortal 3', value: 24, color: '#ef4444' },
        { name: 'Radiant', value: 25, color: '#fbbf24' }
      ])
    },
    {
      name: 'League of Legends',
      slug: 'lol',
      icon: '⚔️',
      color: '#c8a84b',
      ranks: JSON.stringify([
        { name: 'Iron IV', value: 1, color: '#78716c' },
        { name: 'Iron III', value: 2, color: '#78716c' },
        { name: 'Iron II', value: 3, color: '#78716c' },
        { name: 'Iron I', value: 4, color: '#78716c' },
        { name: 'Bronze IV', value: 5, color: '#b45309' },
        { name: 'Bronze III', value: 6, color: '#b45309' },
        { name: 'Bronze II', value: 7, color: '#b45309' },
        { name: 'Bronze I', value: 8, color: '#b45309' },
        { name: 'Silver IV', value: 9, color: '#9ca3af' },
        { name: 'Silver III', value: 10, color: '#9ca3af' },
        { name: 'Silver II', value: 11, color: '#9ca3af' },
        { name: 'Silver I', value: 12, color: '#9ca3af' },
        { name: 'Gold IV', value: 13, color: '#d97706' },
        { name: 'Gold III', value: 14, color: '#d97706' },
        { name: 'Gold II', value: 15, color: '#d97706' },
        { name: 'Gold I', value: 16, color: '#d97706' },
        { name: 'Platinum IV', value: 17, color: '#0ea5e9' },
        { name: 'Platinum III', value: 18, color: '#0ea5e9' },
        { name: 'Platinum II', value: 19, color: '#0ea5e9' },
        { name: 'Platinum I', value: 20, color: '#0ea5e9' },
        { name: 'Emerald IV', value: 21, color: '#10b981' },
        { name: 'Emerald III', value: 22, color: '#10b981' },
        { name: 'Emerald II', value: 23, color: '#10b981' },
        { name: 'Emerald I', value: 24, color: '#10b981' },
        { name: 'Diamond IV', value: 25, color: '#818cf8' },
        { name: 'Diamond III', value: 26, color: '#818cf8' },
        { name: 'Diamond II', value: 27, color: '#818cf8' },
        { name: 'Diamond I', value: 28, color: '#818cf8' },
        { name: 'Master', value: 29, color: '#9333ea' },
        { name: 'Grandmaster', value: 30, color: '#ef4444' },
        { name: 'Challenger', value: 31, color: '#fbbf24' }
      ])
    },
    {
      name: 'Rocket League',
      slug: 'rocket-league',
      icon: '🚀',
      color: '#3b82f6',
      ranks: JSON.stringify([
        { name: 'Bronze I', value: 1, color: '#b45309' },
        { name: 'Bronze II', value: 2, color: '#b45309' },
        { name: 'Bronze III', value: 3, color: '#b45309' },
        { name: 'Silver I', value: 4, color: '#9ca3af' },
        { name: 'Silver II', value: 5, color: '#9ca3af' },
        { name: 'Silver III', value: 6, color: '#9ca3af' },
        { name: 'Gold I', value: 7, color: '#d97706' },
        { name: 'Gold II', value: 8, color: '#d97706' },
        { name: 'Gold III', value: 9, color: '#d97706' },
        { name: 'Platinum I', value: 10, color: '#0ea5e9' },
        { name: 'Platinum II', value: 11, color: '#0ea5e9' },
        { name: 'Platinum III', value: 12, color: '#0ea5e9' },
        { name: 'Diamond I', value: 13, color: '#818cf8' },
        { name: 'Diamond II', value: 14, color: '#818cf8' },
        { name: 'Diamond III', value: 15, color: '#818cf8' },
        { name: 'Champion I', value: 16, color: '#ef4444' },
        { name: 'Champion II', value: 17, color: '#ef4444' },
        { name: 'Champion III', value: 18, color: '#ef4444' },
        { name: 'Grand Champion I', value: 19, color: '#fbbf24' },
        { name: 'Grand Champion II', value: 20, color: '#fbbf24' },
        { name: 'Grand Champion III', value: 21, color: '#fbbf24' },
        { name: 'Supersonic Legend', value: 22, color: '#a855f7' }
      ])
    },
    {
      name: 'Overwatch 2',
      slug: 'overwatch-2',
      icon: '🛡️',
      color: '#f97316',
      ranks: JSON.stringify([
        { name: 'Bronze 5', value: 1, color: '#b45309' },
        { name: 'Bronze 4', value: 2, color: '#b45309' },
        { name: 'Bronze 3', value: 3, color: '#b45309' },
        { name: 'Bronze 2', value: 4, color: '#b45309' },
        { name: 'Bronze 1', value: 5, color: '#b45309' },
        { name: 'Silver 5', value: 6, color: '#9ca3af' },
        { name: 'Silver 4', value: 7, color: '#9ca3af' },
        { name: 'Silver 3', value: 8, color: '#9ca3af' },
        { name: 'Silver 2', value: 9, color: '#9ca3af' },
        { name: 'Silver 1', value: 10, color: '#9ca3af' },
        { name: 'Gold 5', value: 11, color: '#d97706' },
        { name: 'Gold 4', value: 12, color: '#d97706' },
        { name: 'Gold 3', value: 13, color: '#d97706' },
        { name: 'Gold 2', value: 14, color: '#d97706' },
        { name: 'Gold 1', value: 15, color: '#d97706' },
        { name: 'Platinum 5', value: 16, color: '#0ea5e9' },
        { name: 'Platinum 4', value: 17, color: '#0ea5e9' },
        { name: 'Platinum 3', value: 18, color: '#0ea5e9' },
        { name: 'Platinum 2', value: 19, color: '#0ea5e9' },
        { name: 'Platinum 1', value: 20, color: '#0ea5e9' },
        { name: 'Diamond 5', value: 21, color: '#818cf8' },
        { name: 'Diamond 4', value: 22, color: '#818cf8' },
        { name: 'Diamond 3', value: 23, color: '#818cf8' },
        { name: 'Diamond 2', value: 24, color: '#818cf8' },
        { name: 'Diamond 1', value: 25, color: '#818cf8' },
        { name: 'Master 5', value: 26, color: '#9333ea' },
        { name: 'Master 4', value: 27, color: '#9333ea' },
        { name: 'Master 3', value: 28, color: '#9333ea' },
        { name: 'Master 2', value: 29, color: '#9333ea' },
        { name: 'Master 1', value: 30, color: '#9333ea' },
        { name: 'Grandmaster', value: 31, color: '#ef4444' },
        { name: 'Top 500', value: 32, color: '#fbbf24' }
      ])
    },
    {
      name: 'CS2',
      slug: 'cs2',
      icon: '💣',
      color: '#f59e0b',
      ranks: JSON.stringify([
        { name: 'Silver I', value: 1, color: '#9ca3af' },
        { name: 'Silver II', value: 2, color: '#9ca3af' },
        { name: 'Silver III', value: 3, color: '#9ca3af' },
        { name: 'Silver IV', value: 4, color: '#9ca3af' },
        { name: 'Silver Elite', value: 5, color: '#9ca3af' },
        { name: 'Silver Elite Master', value: 6, color: '#9ca3af' },
        { name: 'Gold Nova I', value: 7, color: '#d97706' },
        { name: 'Gold Nova II', value: 8, color: '#d97706' },
        { name: 'Gold Nova III', value: 9, color: '#d97706' },
        { name: 'Gold Nova Master', value: 10, color: '#d97706' },
        { name: 'Master Guardian I', value: 11, color: '#0ea5e9' },
        { name: 'Master Guardian II', value: 12, color: '#0ea5e9' },
        { name: 'Master Guardian Elite', value: 13, color: '#0ea5e9' },
        { name: 'Distinguished Master Guardian', value: 14, color: '#0ea5e9' },
        { name: 'Legendary Eagle', value: 15, color: '#818cf8' },
        { name: 'Legendary Eagle Master', value: 16, color: '#818cf8' },
        { name: 'Supreme Master First Class', value: 17, color: '#ef4444' },
        { name: 'Global Elite', value: 18, color: '#fbbf24' }
      ])
    },
    {
      name: 'Apex Legends',
      slug: 'apex-legends',
      icon: '🎮',
      color: '#ef4444',
      ranks: JSON.stringify([
        { name: 'Rookie', value: 1, color: '#78716c' },
        { name: 'Bronze IV', value: 2, color: '#b45309' },
        { name: 'Bronze III', value: 3, color: '#b45309' },
        { name: 'Bronze II', value: 4, color: '#b45309' },
        { name: 'Bronze I', value: 5, color: '#b45309' },
        { name: 'Silver IV', value: 6, color: '#9ca3af' },
        { name: 'Silver III', value: 7, color: '#9ca3af' },
        { name: 'Silver II', value: 8, color: '#9ca3af' },
        { name: 'Silver I', value: 9, color: '#9ca3af' },
        { name: 'Gold IV', value: 10, color: '#d97706' },
        { name: 'Gold III', value: 11, color: '#d97706' },
        { name: 'Gold II', value: 12, color: '#d97706' },
        { name: 'Gold I', value: 13, color: '#d97706' },
        { name: 'Platinum IV', value: 14, color: '#0ea5e9' },
        { name: 'Platinum III', value: 15, color: '#0ea5e9' },
        { name: 'Platinum II', value: 16, color: '#0ea5e9' },
        { name: 'Platinum I', value: 17, color: '#0ea5e9' },
        { name: 'Diamond IV', value: 18, color: '#818cf8' },
        { name: 'Diamond III', value: 19, color: '#818cf8' },
        { name: 'Diamond II', value: 20, color: '#818cf8' },
        { name: 'Diamond I', value: 21, color: '#818cf8' },
        { name: 'Master', value: 22, color: '#9333ea' },
        { name: 'Predator', value: 23, color: '#ef4444' }
      ])
    }
  ];

  const insertGame = db.prepare('INSERT INTO games (name, slug, icon, color, ranks) VALUES (?, ?, ?, ?, ?)');
  for (const game of games) {
    insertGame.run(game.name, game.slug, game.icon, game.color, game.ranks);
  }
}

function calculateGamerscore(userId) {
  const accounts = db.prepare(`
    SELECT ca.current_rank_index, ca.peak_rank_index, g.ranks
    FROM connected_accounts ca
    JOIN games g ON ca.game_id = g.id
    WHERE ca.user_id = ?
  `).all(userId);

  let total = 0;
  for (const acct of accounts) {
    const ranks = JSON.parse(acct.ranks);
    const currentRank = ranks[acct.current_rank_index];
    const peakRank = ranks[acct.peak_rank_index];
    if (!currentRank) continue;

    const currentVal = currentRank.value;
    const peakVal = peakRank ? peakRank.value : currentVal;
    total += currentVal * 100;
    if (peakVal > currentVal) {
      total += (peakVal - currentVal) * 50;
    }
  }
  return total;
}

function updateUserGamerscore(userId) {
  const score = calculateGamerscore(userId);
  db.prepare('UPDATE users SET gamerscore = ? WHERE id = ?').run(score, userId);
  return score;
}

function getClubAverageGamerscore(clubId) {
  const members = db.prepare('SELECT user_id FROM club_members WHERE club_id = ?').all(clubId);
  if (members.length === 0) return 0;
  const total = members.reduce((sum, m) => {
    const user = db.prepare('SELECT gamerscore FROM users WHERE id = ?').get(m.user_id);
    return sum + (user ? user.gamerscore : 0);
  }, 0);
  return Math.floor(total / members.length);
}

module.exports = { db, updateUserGamerscore, getClubAverageGamerscore };
