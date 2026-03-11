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

  CREATE TABLE IF NOT EXISTS open_challenges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    club_id INTEGER NOT NULL,
    description TEXT,
    game_ids TEXT NOT NULL,
    participant_ids TEXT NOT NULL,
    status TEXT DEFAULT 'open',
    accepted_by_club_id INTEGER,
    accepted_participant_ids TEXT,
    challenger_score INTEGER DEFAULT 0,
    challenged_score INTEGER DEFAULT 0,
    winner_id INTEGER,
    score_awarded INTEGER DEFAULT 100,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    resolved_at DATETIME,
    FOREIGN KEY (club_id) REFERENCES clubs(id) ON DELETE CASCADE,
    FOREIGN KEY (accepted_by_club_id) REFERENCES clubs(id)
  );
`);

// ===== MIGRATIONS =====
const userCols = db.pragma('table_info(users)').map(c => c.name);
if (!userCols.includes('bio')) db.exec("ALTER TABLE users ADD COLUMN bio TEXT DEFAULT ''");
if (!userCols.includes('banner_color')) db.exec("ALTER TABLE users ADD COLUMN banner_color TEXT DEFAULT '#6366f1'");

const acctCols = db.pragma('table_info(connected_accounts)').map(c => c.name);
if (!acctCols.includes('tracker_url')) db.exec('ALTER TABLE connected_accounts ADD COLUMN tracker_url TEXT');

const clubCols = db.pragma('table_info(clubs)').map(c => c.name);
if (!clubCols.includes('club_color')) db.exec("ALTER TABLE clubs ADD COLUMN club_color TEXT DEFAULT '#6366f1'");
if (!clubCols.includes('motto')) db.exec('ALTER TABLE clubs ADD COLUMN motto TEXT');
if (!clubCols.includes('recruit_open')) db.exec('ALTER TABLE clubs ADD COLUMN recruit_open INTEGER DEFAULT 1');

// ===== SEED GAMES =====
const allGames = [
  {
    name: 'Valorant', slug: 'valorant', icon: '🎯', color: '#ff4655',
    ranks: JSON.stringify([
      { name: 'Iron 1', value: 1, color: '#78716c' }, { name: 'Iron 2', value: 2, color: '#78716c' }, { name: 'Iron 3', value: 3, color: '#78716c' },
      { name: 'Bronze 1', value: 4, color: '#b45309' }, { name: 'Bronze 2', value: 5, color: '#b45309' }, { name: 'Bronze 3', value: 6, color: '#b45309' },
      { name: 'Silver 1', value: 7, color: '#9ca3af' }, { name: 'Silver 2', value: 8, color: '#9ca3af' }, { name: 'Silver 3', value: 9, color: '#9ca3af' },
      { name: 'Gold 1', value: 10, color: '#d97706' }, { name: 'Gold 2', value: 11, color: '#d97706' }, { name: 'Gold 3', value: 12, color: '#d97706' },
      { name: 'Platinum 1', value: 13, color: '#0ea5e9' }, { name: 'Platinum 2', value: 14, color: '#0ea5e9' }, { name: 'Platinum 3', value: 15, color: '#0ea5e9' },
      { name: 'Diamond 1', value: 16, color: '#818cf8' }, { name: 'Diamond 2', value: 17, color: '#818cf8' }, { name: 'Diamond 3', value: 18, color: '#818cf8' },
      { name: 'Ascendant 1', value: 19, color: '#10b981' }, { name: 'Ascendant 2', value: 20, color: '#10b981' }, { name: 'Ascendant 3', value: 21, color: '#10b981' },
      { name: 'Immortal 1', value: 22, color: '#ef4444' }, { name: 'Immortal 2', value: 23, color: '#ef4444' }, { name: 'Immortal 3', value: 24, color: '#ef4444' },
      { name: 'Radiant', value: 25, color: '#fbbf24' }
    ])
  },
  {
    name: 'League of Legends', slug: 'lol', icon: '⚔️', color: '#c8a84b',
    ranks: JSON.stringify([
      { name: 'Iron IV', value: 1, color: '#78716c' }, { name: 'Iron III', value: 2, color: '#78716c' }, { name: 'Iron II', value: 3, color: '#78716c' }, { name: 'Iron I', value: 4, color: '#78716c' },
      { name: 'Bronze IV', value: 5, color: '#b45309' }, { name: 'Bronze III', value: 6, color: '#b45309' }, { name: 'Bronze II', value: 7, color: '#b45309' }, { name: 'Bronze I', value: 8, color: '#b45309' },
      { name: 'Silver IV', value: 9, color: '#9ca3af' }, { name: 'Silver III', value: 10, color: '#9ca3af' }, { name: 'Silver II', value: 11, color: '#9ca3af' }, { name: 'Silver I', value: 12, color: '#9ca3af' },
      { name: 'Gold IV', value: 13, color: '#d97706' }, { name: 'Gold III', value: 14, color: '#d97706' }, { name: 'Gold II', value: 15, color: '#d97706' }, { name: 'Gold I', value: 16, color: '#d97706' },
      { name: 'Platinum IV', value: 17, color: '#0ea5e9' }, { name: 'Platinum III', value: 18, color: '#0ea5e9' }, { name: 'Platinum II', value: 19, color: '#0ea5e9' }, { name: 'Platinum I', value: 20, color: '#0ea5e9' },
      { name: 'Emerald IV', value: 21, color: '#10b981' }, { name: 'Emerald III', value: 22, color: '#10b981' }, { name: 'Emerald II', value: 23, color: '#10b981' }, { name: 'Emerald I', value: 24, color: '#10b981' },
      { name: 'Diamond IV', value: 25, color: '#818cf8' }, { name: 'Diamond III', value: 26, color: '#818cf8' }, { name: 'Diamond II', value: 27, color: '#818cf8' }, { name: 'Diamond I', value: 28, color: '#818cf8' },
      { name: 'Master', value: 29, color: '#9333ea' }, { name: 'Grandmaster', value: 30, color: '#ef4444' }, { name: 'Challenger', value: 31, color: '#fbbf24' }
    ])
  },
  {
    name: 'Rocket League', slug: 'rocket-league', icon: '🚀', color: '#3b82f6',
    ranks: JSON.stringify([
      { name: 'Bronze I', value: 1, color: '#b45309' }, { name: 'Bronze II', value: 2, color: '#b45309' }, { name: 'Bronze III', value: 3, color: '#b45309' },
      { name: 'Silver I', value: 4, color: '#9ca3af' }, { name: 'Silver II', value: 5, color: '#9ca3af' }, { name: 'Silver III', value: 6, color: '#9ca3af' },
      { name: 'Gold I', value: 7, color: '#d97706' }, { name: 'Gold II', value: 8, color: '#d97706' }, { name: 'Gold III', value: 9, color: '#d97706' },
      { name: 'Platinum I', value: 10, color: '#0ea5e9' }, { name: 'Platinum II', value: 11, color: '#0ea5e9' }, { name: 'Platinum III', value: 12, color: '#0ea5e9' },
      { name: 'Diamond I', value: 13, color: '#818cf8' }, { name: 'Diamond II', value: 14, color: '#818cf8' }, { name: 'Diamond III', value: 15, color: '#818cf8' },
      { name: 'Champion I', value: 16, color: '#ef4444' }, { name: 'Champion II', value: 17, color: '#ef4444' }, { name: 'Champion III', value: 18, color: '#ef4444' },
      { name: 'Grand Champion I', value: 19, color: '#fbbf24' }, { name: 'Grand Champion II', value: 20, color: '#fbbf24' }, { name: 'Grand Champion III', value: 21, color: '#fbbf24' },
      { name: 'Supersonic Legend', value: 22, color: '#a855f7' }
    ])
  },
  {
    name: 'Overwatch 2', slug: 'overwatch-2', icon: '🛡️', color: '#f97316',
    ranks: JSON.stringify([
      { name: 'Bronze 5', value: 1, color: '#b45309' }, { name: 'Bronze 4', value: 2, color: '#b45309' }, { name: 'Bronze 3', value: 3, color: '#b45309' }, { name: 'Bronze 2', value: 4, color: '#b45309' }, { name: 'Bronze 1', value: 5, color: '#b45309' },
      { name: 'Silver 5', value: 6, color: '#9ca3af' }, { name: 'Silver 4', value: 7, color: '#9ca3af' }, { name: 'Silver 3', value: 8, color: '#9ca3af' }, { name: 'Silver 2', value: 9, color: '#9ca3af' }, { name: 'Silver 1', value: 10, color: '#9ca3af' },
      { name: 'Gold 5', value: 11, color: '#d97706' }, { name: 'Gold 4', value: 12, color: '#d97706' }, { name: 'Gold 3', value: 13, color: '#d97706' }, { name: 'Gold 2', value: 14, color: '#d97706' }, { name: 'Gold 1', value: 15, color: '#d97706' },
      { name: 'Platinum 5', value: 16, color: '#0ea5e9' }, { name: 'Platinum 4', value: 17, color: '#0ea5e9' }, { name: 'Platinum 3', value: 18, color: '#0ea5e9' }, { name: 'Platinum 2', value: 19, color: '#0ea5e9' }, { name: 'Platinum 1', value: 20, color: '#0ea5e9' },
      { name: 'Diamond 5', value: 21, color: '#818cf8' }, { name: 'Diamond 4', value: 22, color: '#818cf8' }, { name: 'Diamond 3', value: 23, color: '#818cf8' }, { name: 'Diamond 2', value: 24, color: '#818cf8' }, { name: 'Diamond 1', value: 25, color: '#818cf8' },
      { name: 'Master 5', value: 26, color: '#9333ea' }, { name: 'Master 4', value: 27, color: '#9333ea' }, { name: 'Master 3', value: 28, color: '#9333ea' }, { name: 'Master 2', value: 29, color: '#9333ea' }, { name: 'Master 1', value: 30, color: '#9333ea' },
      { name: 'Grandmaster', value: 31, color: '#ef4444' }, { name: 'Top 500', value: 32, color: '#fbbf24' }
    ])
  },
  {
    name: 'CS2', slug: 'cs2', icon: '💣', color: '#f59e0b',
    ranks: JSON.stringify([
      { name: 'Silver I', value: 1, color: '#9ca3af' }, { name: 'Silver II', value: 2, color: '#9ca3af' }, { name: 'Silver III', value: 3, color: '#9ca3af' },
      { name: 'Silver IV', value: 4, color: '#9ca3af' }, { name: 'Silver Elite', value: 5, color: '#9ca3af' }, { name: 'Silver Elite Master', value: 6, color: '#9ca3af' },
      { name: 'Gold Nova I', value: 7, color: '#d97706' }, { name: 'Gold Nova II', value: 8, color: '#d97706' }, { name: 'Gold Nova III', value: 9, color: '#d97706' }, { name: 'Gold Nova Master', value: 10, color: '#d97706' },
      { name: 'Master Guardian I', value: 11, color: '#0ea5e9' }, { name: 'Master Guardian II', value: 12, color: '#0ea5e9' }, { name: 'Master Guardian Elite', value: 13, color: '#0ea5e9' }, { name: 'Distinguished Master Guardian', value: 14, color: '#0ea5e9' },
      { name: 'Legendary Eagle', value: 15, color: '#818cf8' }, { name: 'Legendary Eagle Master', value: 16, color: '#818cf8' },
      { name: 'Supreme Master First Class', value: 17, color: '#ef4444' }, { name: 'Global Elite', value: 18, color: '#fbbf24' }
    ])
  },
  {
    name: 'Apex Legends', slug: 'apex-legends', icon: '🎮', color: '#ef4444',
    ranks: JSON.stringify([
      { name: 'Rookie', value: 1, color: '#78716c' },
      { name: 'Bronze IV', value: 2, color: '#b45309' }, { name: 'Bronze III', value: 3, color: '#b45309' }, { name: 'Bronze II', value: 4, color: '#b45309' }, { name: 'Bronze I', value: 5, color: '#b45309' },
      { name: 'Silver IV', value: 6, color: '#9ca3af' }, { name: 'Silver III', value: 7, color: '#9ca3af' }, { name: 'Silver II', value: 8, color: '#9ca3af' }, { name: 'Silver I', value: 9, color: '#9ca3af' },
      { name: 'Gold IV', value: 10, color: '#d97706' }, { name: 'Gold III', value: 11, color: '#d97706' }, { name: 'Gold II', value: 12, color: '#d97706' }, { name: 'Gold I', value: 13, color: '#d97706' },
      { name: 'Platinum IV', value: 14, color: '#0ea5e9' }, { name: 'Platinum III', value: 15, color: '#0ea5e9' }, { name: 'Platinum II', value: 16, color: '#0ea5e9' }, { name: 'Platinum I', value: 17, color: '#0ea5e9' },
      { name: 'Diamond IV', value: 18, color: '#818cf8' }, { name: 'Diamond III', value: 19, color: '#818cf8' }, { name: 'Diamond II', value: 20, color: '#818cf8' }, { name: 'Diamond I', value: 21, color: '#818cf8' },
      { name: 'Master', value: 22, color: '#9333ea' }, { name: 'Predator', value: 23, color: '#ef4444' }
    ])
  },
  {
    name: 'Rainbow Six Siege', slug: 'r6s', icon: '🔫', color: '#f97316',
    ranks: JSON.stringify([
      { name: 'Copper V', value: 1, color: '#78716c' }, { name: 'Copper IV', value: 2, color: '#78716c' }, { name: 'Copper III', value: 3, color: '#78716c' }, { name: 'Copper II', value: 4, color: '#78716c' }, { name: 'Copper I', value: 5, color: '#78716c' },
      { name: 'Bronze V', value: 6, color: '#b45309' }, { name: 'Bronze IV', value: 7, color: '#b45309' }, { name: 'Bronze III', value: 8, color: '#b45309' }, { name: 'Bronze II', value: 9, color: '#b45309' }, { name: 'Bronze I', value: 10, color: '#b45309' },
      { name: 'Silver V', value: 11, color: '#9ca3af' }, { name: 'Silver IV', value: 12, color: '#9ca3af' }, { name: 'Silver III', value: 13, color: '#9ca3af' }, { name: 'Silver II', value: 14, color: '#9ca3af' }, { name: 'Silver I', value: 15, color: '#9ca3af' },
      { name: 'Gold V', value: 16, color: '#d97706' }, { name: 'Gold IV', value: 17, color: '#d97706' }, { name: 'Gold III', value: 18, color: '#d97706' }, { name: 'Gold II', value: 19, color: '#d97706' }, { name: 'Gold I', value: 20, color: '#d97706' },
      { name: 'Platinum V', value: 21, color: '#0ea5e9' }, { name: 'Platinum IV', value: 22, color: '#0ea5e9' }, { name: 'Platinum III', value: 23, color: '#0ea5e9' }, { name: 'Platinum II', value: 24, color: '#0ea5e9' }, { name: 'Platinum I', value: 25, color: '#0ea5e9' },
      { name: 'Emerald V', value: 26, color: '#10b981' }, { name: 'Emerald IV', value: 27, color: '#10b981' }, { name: 'Emerald III', value: 28, color: '#10b981' }, { name: 'Emerald II', value: 29, color: '#10b981' }, { name: 'Emerald I', value: 30, color: '#10b981' },
      { name: 'Diamond V', value: 31, color: '#818cf8' }, { name: 'Diamond IV', value: 32, color: '#818cf8' }, { name: 'Diamond III', value: 33, color: '#818cf8' }, { name: 'Diamond II', value: 34, color: '#818cf8' }, { name: 'Diamond I', value: 35, color: '#818cf8' },
      { name: 'Champion', value: 36, color: '#fbbf24' }
    ])
  },
  {
    name: 'Fortnite', slug: 'fortnite', icon: '🏗️', color: '#8b5cf6',
    ranks: JSON.stringify([
      { name: 'Bronze I', value: 1, color: '#b45309' }, { name: 'Bronze II', value: 2, color: '#b45309' }, { name: 'Bronze III', value: 3, color: '#b45309' },
      { name: 'Silver I', value: 4, color: '#9ca3af' }, { name: 'Silver II', value: 5, color: '#9ca3af' }, { name: 'Silver III', value: 6, color: '#9ca3af' },
      { name: 'Gold I', value: 7, color: '#d97706' }, { name: 'Gold II', value: 8, color: '#d97706' }, { name: 'Gold III', value: 9, color: '#d97706' },
      { name: 'Platinum I', value: 10, color: '#0ea5e9' }, { name: 'Platinum II', value: 11, color: '#0ea5e9' }, { name: 'Platinum III', value: 12, color: '#0ea5e9' },
      { name: 'Diamond I', value: 13, color: '#818cf8' }, { name: 'Diamond II', value: 14, color: '#818cf8' }, { name: 'Diamond III', value: 15, color: '#818cf8' },
      { name: 'Elite', value: 16, color: '#ef4444' },
      { name: 'Champion', value: 17, color: '#fbbf24' },
      { name: 'Unreal', value: 18, color: '#a855f7' }
    ])
  },
  {
    name: 'Dota 2', slug: 'dota2', icon: '🐉', color: '#dc2626',
    ranks: JSON.stringify([
      { name: 'Herald I', value: 1, color: '#78716c' }, { name: 'Herald II', value: 2, color: '#78716c' }, { name: 'Herald III', value: 3, color: '#78716c' }, { name: 'Herald IV', value: 4, color: '#78716c' }, { name: 'Herald V', value: 5, color: '#78716c' },
      { name: 'Guardian I', value: 6, color: '#b45309' }, { name: 'Guardian II', value: 7, color: '#b45309' }, { name: 'Guardian III', value: 8, color: '#b45309' }, { name: 'Guardian IV', value: 9, color: '#b45309' }, { name: 'Guardian V', value: 10, color: '#b45309' },
      { name: 'Crusader I', value: 11, color: '#9ca3af' }, { name: 'Crusader II', value: 12, color: '#9ca3af' }, { name: 'Crusader III', value: 13, color: '#9ca3af' }, { name: 'Crusader IV', value: 14, color: '#9ca3af' }, { name: 'Crusader V', value: 15, color: '#9ca3af' },
      { name: 'Archon I', value: 16, color: '#d97706' }, { name: 'Archon II', value: 17, color: '#d97706' }, { name: 'Archon III', value: 18, color: '#d97706' }, { name: 'Archon IV', value: 19, color: '#d97706' }, { name: 'Archon V', value: 20, color: '#d97706' },
      { name: 'Legend I', value: 21, color: '#0ea5e9' }, { name: 'Legend II', value: 22, color: '#0ea5e9' }, { name: 'Legend III', value: 23, color: '#0ea5e9' }, { name: 'Legend IV', value: 24, color: '#0ea5e9' }, { name: 'Legend V', value: 25, color: '#0ea5e9' },
      { name: 'Ancient I', value: 26, color: '#818cf8' }, { name: 'Ancient II', value: 27, color: '#818cf8' }, { name: 'Ancient III', value: 28, color: '#818cf8' }, { name: 'Ancient IV', value: 29, color: '#818cf8' }, { name: 'Ancient V', value: 30, color: '#818cf8' },
      { name: 'Divine I', value: 31, color: '#9333ea' }, { name: 'Divine II', value: 32, color: '#9333ea' }, { name: 'Divine III', value: 33, color: '#9333ea' }, { name: 'Divine IV', value: 34, color: '#9333ea' }, { name: 'Divine V', value: 35, color: '#9333ea' },
      { name: 'Immortal', value: 36, color: '#fbbf24' }
    ])
  },
  {
    name: 'Warzone', slug: 'warzone', icon: '💀', color: '#22c55e',
    ranks: JSON.stringify([
      { name: 'Bronze I', value: 1, color: '#b45309' }, { name: 'Bronze II', value: 2, color: '#b45309' }, { name: 'Bronze III', value: 3, color: '#b45309' },
      { name: 'Silver I', value: 4, color: '#9ca3af' }, { name: 'Silver II', value: 5, color: '#9ca3af' }, { name: 'Silver III', value: 6, color: '#9ca3af' },
      { name: 'Gold I', value: 7, color: '#d97706' }, { name: 'Gold II', value: 8, color: '#d97706' }, { name: 'Gold III', value: 9, color: '#d97706' },
      { name: 'Platinum I', value: 10, color: '#0ea5e9' }, { name: 'Platinum II', value: 11, color: '#0ea5e9' }, { name: 'Platinum III', value: 12, color: '#0ea5e9' },
      { name: 'Diamond I', value: 13, color: '#818cf8' }, { name: 'Diamond II', value: 14, color: '#818cf8' }, { name: 'Diamond III', value: 15, color: '#818cf8' },
      { name: 'Crimson I', value: 16, color: '#ef4444' }, { name: 'Crimson II', value: 17, color: '#ef4444' }, { name: 'Crimson III', value: 18, color: '#ef4444' },
      { name: 'Iridescent', value: 19, color: '#a855f7' },
      { name: 'Top 250', value: 20, color: '#fbbf24' }
    ])
  }
];

const insertGame = db.prepare('INSERT OR IGNORE INTO games (name, slug, icon, color, ranks) VALUES (?, ?, ?, ?, ?)');
for (const game of allGames) {
  insertGame.run(game.name, game.slug, game.icon, game.color, game.ranks);
}

// ===== HELPERS =====
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

function getClubAverageGamescoреForMembers(memberIds) {
  if (!memberIds || memberIds.length === 0) return 0;
  const placeholders = memberIds.map(() => '?').join(',');
  const members = db.prepare(`SELECT gamerscore FROM users WHERE id IN (${placeholders})`).all(...memberIds);
  if (!members.length) return 0;
  return Math.floor(members.reduce((s, m) => s + m.gamerscore, 0) / members.length);
}

function getClubGameAverages(clubId) {
  const members = db.prepare('SELECT user_id FROM club_members WHERE club_id = ?').all(clubId);
  if (!members.length) return [];

  const memberIds = members.map(m => m.user_id);
  const placeholders = memberIds.map(() => '?').join(',');
  const accounts = db.prepare(`
    SELECT ca.user_id, ca.current_rank_index, g.id as game_id, g.name as game_name, g.icon, g.color, g.ranks
    FROM connected_accounts ca
    JOIN games g ON ca.game_id = g.id
    WHERE ca.user_id IN (${placeholders})
  `).all(...memberIds);

  const byGame = {};
  for (const a of accounts) {
    if (!byGame[a.game_id]) {
      byGame[a.game_id] = { game_id: a.game_id, game_name: a.game_name, icon: a.icon, color: a.color, ranks: a.ranks, values: [] };
    }
    const ranks = JSON.parse(a.ranks);
    const rank = ranks[a.current_rank_index];
    if (rank) byGame[a.game_id].values.push(rank.value);
  }

  return Object.values(byGame).map(g => {
    const avgValue = g.values.reduce((a, b) => a + b, 0) / g.values.length;
    const ranks = JSON.parse(g.ranks);
    const closestRank = ranks.reduce((prev, curr) =>
      Math.abs(curr.value - avgValue) < Math.abs(prev.value - avgValue) ? curr : prev
    );
    return {
      game_id: g.game_id,
      game_name: g.game_name,
      icon: g.icon,
      color: g.color,
      avg_rank: closestRank,
      player_count: g.values.length
    };
  }).sort((a, b) => b.player_count - a.player_count);
}

module.exports = { db, updateUserGamerscore, getClubAverageGamerscore, getClubAverageGamescoреForMembers, getClubGameAverages };
