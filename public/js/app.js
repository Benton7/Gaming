// ===== STATE =====
let currentUser = null;
let allGames = [];
let activeModal = null;
let connectingGameId = null;
let connectingGameSlug = null;
let connectingGameRanks = null;
let detectedRankIndices = null; // { current_rank_index, peak_rank_index, username, platform }
let updatingAccountId = null;
let updatingAccountRanks = [];
let updatingAccountTrackerUrl = null;
let userClubId = null;
let editingClubId = null;
let acceptingOpenChallengeId = null;

// ===== COLORS =====
const AVATAR_COLORS = [
  '#6366f1','#8b5cf6','#a855f7','#ec4899','#ef4444',
  '#f97316','#f59e0b','#10b981','#06b6d4','#3b82f6',
  '#0ea5e9','#14b8a6','#84cc16','#f000b8','#00d4ff'
];

const BANNER_COLORS = [
  '#6366f1','#7c3aed','#db2777','#dc2626','#d97706',
  '#059669','#0891b2','#1d4ed8','#7c3aed','#be185d',
  '#0f172a','#1e1e35','#111827','#0c0c24','#1a1a2e'
];

// ===== ROUTER =====
const routes = {
  '/': 'landing', '/login': 'login', '/register': 'register',
  '/dashboard': 'dashboard', '/games': 'games', '/clubs': 'clubs',
  '/leaderboard': 'leaderboard', '/profile': 'profile',
  '/teams': 'teams', '/match': 'match',
};

function route() {
  const full = location.hash.slice(1) || '/';
  const hash = full.split('?')[0];
  const page = routes[hash] || 'landing';

  if (!currentUser && !['landing','login','register'].includes(page)) {
    location.hash = '#/login';
    return;
  }
  if (currentUser && ['landing','login','register'].includes(page)) {
    location.hash = '#/dashboard';
    return;
  }
  showPage(page);
}

window.addEventListener('hashchange', route);
window.addEventListener('load', init);

async function init() {
  const token = localStorage.getItem('token');
  if (token) {
    try {
      currentUser = await api.users.me();
      updateNavUser();
      allGames = await api.games.list();
    } catch {
      localStorage.removeItem('token');
      currentUser = null;
    }
  }
  route();
}

// ===== PAGES =====
function showPage(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const el = document.getElementById(`page-${page}`);
  if (el) {
    el.classList.add('active');
    updateNavActive(page);
    loadPage(page);
  }
}

function updateNavActive(page) {
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
  const link = document.querySelector(`.nav-link[data-page="${page}"]`);
  if (link) link.classList.add('active');

  const navbar = document.getElementById('navbar');
  const navUser = document.getElementById('navUser');
  const showNav = currentUser && !['landing','login','register'].includes(page);
  navbar.style.display = showNav ? '' : 'none';
  navUser.style.display = currentUser ? '' : 'none';
}

async function loadPage(page) {
  switch (page) {
    case 'dashboard': await loadDashboard(); break;
    case 'games': await loadGames(); break;
    case 'clubs': await loadClubs(); break;
    case 'leaderboard': await loadLeaderboard(); break;
    case 'profile': await loadProfile(); break;
    case 'teams': await loadTeamsPage(); break;
    case 'match': await loadMatchPage(); break;
  }
}

// ===== NAV USER =====
function updateNavUser() {
  if (!currentUser) return;
  document.getElementById('navUsername').textContent = currentUser.gamertag || currentUser.username;
  const navElo = currentUser.best_elo;
  document.getElementById('menuGamerscore').textContent = navElo ? `ELO ${formatScore(navElo)}` : `GS ${formatScore(currentUser.gamerscore)}`;
  setAvatar('navAvatar', currentUser.gamertag || currentUser.username, currentUser.avatar_color, currentUser.avatar_url);
}

function setAvatar(elId, name, color, imageUrl) {
  const el = document.getElementById(elId);
  if (!el) return;
  if (imageUrl) {
    el.style.background = 'none';
    el.style.backgroundImage = `url(${imageUrl})`;
    el.style.backgroundSize = 'cover';
    el.style.backgroundPosition = 'center';
    el.textContent = '';
  } else {
    el.style.background = color || '#6366f1';
    el.style.backgroundImage = '';
    el.textContent = (name || '?')[0].toUpperCase();
  }
}

function toggleUserMenu() {
  document.getElementById('userMenu').classList.toggle('open');
}
document.addEventListener('click', (e) => {
  if (!e.target.closest('.nav-user')) {
    document.getElementById('userMenu').classList.remove('open');
  }
});

// ===== AUTH =====
async function handleLogin(e) {
  e.preventDefault();
  const btn = document.getElementById('loginBtn');
  btn.disabled = true; btn.textContent = 'Signing in...';
  hideError('loginError');
  try {
    const data = await api.auth.login({
      email: document.getElementById('loginEmail').value,
      password: document.getElementById('loginPassword').value,
    });
    localStorage.setItem('token', data.token);
    currentUser = data.user;
    allGames = await api.games.list();
    updateNavUser();
    location.hash = '#/dashboard';
  } catch (err) {
    showError('loginError', err.message);
  } finally {
    btn.disabled = false; btn.textContent = 'Sign In';
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const btn = document.getElementById('registerBtn');
  btn.disabled = true; btn.textContent = 'Creating account...';
  hideError('registerError');
  try {
    const data = await api.auth.register({
      username: document.getElementById('regUsername').value,
      email: document.getElementById('regEmail').value,
      password: document.getElementById('regPassword').value,
      gamertag: document.getElementById('regGamertag').value || undefined,
    });
    localStorage.setItem('token', data.token);
    currentUser = data.user;
    allGames = await api.games.list();
    updateNavUser();
    location.hash = '#/dashboard';
  } catch (err) {
    showError('registerError', err.message);
  } finally {
    btn.disabled = false; btn.textContent = 'Create Account';
  }
}

function logout() {
  localStorage.removeItem('token');
  currentUser = null;
  location.hash = '#/';
}

// ===== DASHBOARD =====
async function loadDashboard() {
  if (!currentUser) return;
  try {
    currentUser = await api.users.me();
    updateNavUser();
  } catch { return; }

  document.getElementById('dashWelcome').textContent = `Welcome back, ${currentUser.gamertag || currentUser.username}!`;
  // ELO (primary) — show best calibrated ELO or "Calibrating"
  const bestElo = currentUser.best_elo;
  document.getElementById('dashGamerscore').textContent = bestElo ? formatScore(bestElo) : '—';
  const eloSubEl = document.getElementById('dashGamesConnected');
  if (!bestElo) {
    const totalMatches = (currentUser.elo_data || []).reduce((s, r) => s + r.matches_played, 0);
    const needed = 5 - Math.min(totalMatches, 5);
    eloSubEl.textContent = totalMatches === 0 ? 'Play 5 matches to earn your ELO' : `${needed} more match${needed !== 1 ? 'es' : ''} to calibrate`;
  } else {
    eloSubEl.textContent = `${currentUser.accounts.length} game${currentUser.accounts.length !== 1 ? 's' : ''} connected`;
  }
  document.getElementById('dashRankTitle').textContent = bestElo ? getEloTitle(bestElo) : '';
  // Gamerscore (secondary label update)
  const gsSecEl = document.getElementById('dashGamerscoreSecondary');
  if (gsSecEl) gsSecEl.textContent = `GS: ${formatScore(currentUser.gamerscore)}`;

  renderClubSummary(currentUser.club);
  renderDashAccounts(currentUser.accounts);
  userClubId = currentUser.club ? currentUser.club.id : null;
}

function getTitleFromScore(score) {
  if (score >= 10000) return '◈ Legend';
  if (score >= 6000) return '◈ Diamond';
  if (score >= 3000) return '◈ Gold';
  if (score >= 1000) return '◈ Silver';
  if (score > 0) return '◈ Bronze';
  return '';
}

function getEloTitle(elo) {
  if (!elo) return '';
  if (elo >= 2000) return '◈ Grandmaster';
  if (elo >= 1800) return '◈ Master';
  if (elo >= 1600) return '◈ Diamond';
  if (elo >= 1400) return '◈ Platinum';
  if (elo >= 1250) return '◈ Gold';
  if (elo >= 1100) return '◈ Silver';
  return '◈ Bronze';
}

function formatElo(elo, matchesPlayed) {
  if (matchesPlayed < 5) return `<span style="color:var(--text-3);font-style:italic">Calibrating (${matchesPlayed}/5)</span>`;
  return `<span class="mono" style="color:#fbbf24;font-weight:700">${formatScore(elo)}</span>`;
}

function renderClubSummary(club) {
  const el = document.getElementById('clubSummaryContent');
  if (!club) {
    el.innerHTML = `<p class="no-club">You're not in a club.</p>
      <button class="btn btn-outline btn-sm" style="margin-top:1rem" onclick="showPage('clubs')">Find a Club</button>`;
    return;
  }
  el.innerHTML = `
    <div class="club-mini">
      <div>
        <div class="club-mini-name">[${club.tag}] ${club.name}</div>
        <div class="club-mini-tag">Role: ${club.role}</div>
      </div>
      <div class="club-mini-stats">
        <div class="club-mini-stat">
          <div class="club-mini-stat-val text-gold mono">${formatScore(club.club_score)}</div>
          <div class="club-mini-stat-lbl">Club Score</div>
        </div>
        <div class="club-mini-stat">
          <div class="club-mini-stat-val text-green mono">${club.wins}</div>
          <div class="club-mini-stat-lbl">Wins</div>
        </div>
        <div class="club-mini-stat">
          <div class="club-mini-stat-val text-red mono">${club.losses}</div>
          <div class="club-mini-stat-lbl">Losses</div>
        </div>
      </div>
    </div>`;
}

function renderDashAccounts(accounts) {
  const el = document.getElementById('dashAccounts');
  if (!accounts.length) {
    el.innerHTML = `<div class="empty-state">
      <span class="empty-icon">🎮</span>
      <p>No games connected yet.</p>
      <button class="btn btn-primary" onclick="showPage('games')">Connect Your First Game</button>
    </div>`;
    return;
  }
  el.innerHTML = accounts.map(a => {
    const curScore = a.current_rank ? a.current_rank.value * 100 : 0;
    const peakBonus = (a.peak_rank && a.peak_rank.value > (a.current_rank ? a.current_rank.value : 0))
      ? (a.peak_rank.value - a.current_rank.value) * 50 : 0;
    const contrib = curScore + peakBonus;
    const trackerBadge = a.tracker_url
      ? `<a href="${escapeHtml(a.tracker_url)}" target="_blank" rel="noopener" class="tracker-badge" onclick="event.stopPropagation()">🔗 Linked</a>`
      : '';
    return `
    <div class="account-card" onclick="openUpdateRank(${a.id}, ${JSON.stringify(a.ranks).replace(/"/g, '&quot;')}, ${a.current_rank_index}, ${a.peak_rank_index}, ${JSON.stringify(a.tracker_url || '').replace(/"/g, '&quot;')})">
      <div class="account-card-header">
        <span class="game-icon">${a.icon}</span>
        <span class="game-name">${a.game_name}</span>
        <span class="game-platform">${a.platform}</span>
      </div>
      <div class="rank-rows">
        <div class="rank-row">
          <span class="rank-row-label">Current</span>
          <span class="rank-badge" style="color:${a.current_rank ? a.current_rank.color : '#6b7280'}">${a.current_rank ? a.current_rank.name : 'Unranked'}</span>
        </div>
        <div class="rank-row">
          <span class="rank-row-label">Peak</span>
          <span class="rank-badge" style="color:${a.peak_rank ? a.peak_rank.color : '#6b7280'}">${a.peak_rank ? a.peak_rank.name : 'Unranked'}</span>
        </div>
      </div>
      <div class="account-gs" style="display:flex;justify-content:space-between;align-items:center">
        <span>+<strong>${formatScore(contrib)}</strong> GS · ${escapeHtml(a.platform_username)}</span>
        ${trackerBadge}
      </div>
    </div>`;
  }).join('');
}

// ===== GAMES PAGE =====
async function loadGames() {
  if (!currentUser) return;
  try {
    currentUser = await api.users.me();
    allGames = await api.games.list();
    if (!verifySupport) verifySupport = await api.verify.support().catch(() => ({}));
  } catch { return; }

  const connected = {};
  currentUser.accounts.forEach(a => connected[a.game_id] = a);

  const grid = document.getElementById('gamesGrid');
  grid.innerHTML = allGames.map(game => {
    const acct = connected[game.id];
    const style = `--game-color: ${game.color}`;
    const gameSupport = verifySupport[game.slug];
    const hasApi = !!(gameSupport?.available && gameSupport?.method !== 'manual');

    if (acct) {
      const trackerBadge = acct.tracker_url
        ? `<a href="${escapeHtml(acct.tracker_url)}" target="_blank" rel="noopener" class="tracker-badge">🔗 Profile Linked</a>`
        : '';
      const verifiedBadge = acct.verified
        ? `<span class="game-verified-badge">✓ Verified</span>` : '';
      const actionBtn = hasApi
        ? `<button class="btn btn-cyan btn-sm" onclick="refreshGameRank(${acct.id}, '${game.slug}', this)">↻ Refresh Rank</button>`
        : `<button class="btn btn-ghost btn-sm" onclick="openUpdateRank(${acct.id}, ${JSON.stringify(game.ranks).replace(/"/g, '&quot;')}, ${acct.current_rank_index}, ${acct.peak_rank_index}, ${JSON.stringify(acct.tracker_url || '').replace(/"/g, '&quot;')})">Update Rank</button>`;
      return `
      <div class="game-card" style="${style}">
        <div class="game-card-header">
          <span class="game-big-icon">${game.icon}</span>
          <div>
            <div class="game-card-name">${game.name} ${verifiedBadge}</div>
            <div class="game-card-connected">◈ Connected · ${escapeHtml(acct.platform_username)}</div>
          </div>
        </div>
        <div class="connected-info">
          <div class="connected-row">
            <span class="connected-label">Current Rank</span>
            <span style="font-weight:700;color:${acct.current_rank ? acct.current_rank.color : '#6b7280'};text-shadow:0 0 6px currentColor">${acct.current_rank ? acct.current_rank.name : 'Unranked'}</span>
          </div>
          <div class="connected-row">
            <span class="connected-label">Peak Rank</span>
            <span style="font-weight:700;color:${acct.peak_rank ? acct.peak_rank.color : '#6b7280'};text-shadow:0 0 6px currentColor">${acct.peak_rank ? acct.peak_rank.name : 'Unranked'}</span>
          </div>
          ${!hasApi ? `<div class="connected-row"><span class="connected-label">Platform</span><span class="game-platform">${acct.platform}</span></div>` : ''}
        </div>
        ${trackerBadge ? `<div style="margin-bottom:0.75rem">${trackerBadge}</div>` : ''}
        <div class="game-card-actions">
          ${actionBtn}
          ${hasApi ? '' : ''}
          <button class="btn btn-ghost btn-sm" style="color:var(--red)" onclick="disconnectAccountById(${acct.id})">Disconnect</button>
        </div>
      </div>`;
    } else {
      const connectLabel = hasApi ? '⚡ Connect & Verify' : 'Connect Account';
      return `
      <div class="game-card" style="${style}">
        <div class="game-card-header">
          <span class="game-big-icon">${game.icon}</span>
          <div>
            <div class="game-card-name">${game.name}</div>
            <div class="game-card-disconnected">Not connected</div>
          </div>
        </div>
        <div class="game-card-actions">
          <button class="btn btn-primary btn-sm" onclick="openConnectGame(${game.id}, '${game.slug}', '${game.name}', ${JSON.stringify(game.ranks).replace(/"/g, '&quot;')})">${connectLabel}</button>
        </div>
      </div>`;
    }
  }).join('');
}

async function refreshGameRank(accountId, slug, btn) {
  const orig = btn.textContent;
  btn.disabled = true; btn.textContent = 'Refreshing...';
  try {
    const res = await api.verify.refresh(accountId);
    currentUser = await api.users.me();
    updateNavUser();
    showToast(`Rank updated! ${res.current_rank?.name || ''} · Gamerscore: ${formatScore(res.gamerscore)}`, 'success');
    await loadGames();
  } catch (err) {
    btn.disabled = false; btn.textContent = orig;
    showToast(`Refresh failed: ${err.message}`, 'error');
  }
}

async function disconnectAccountById(accountId) {
  if (!confirm('Disconnect this game account?')) return;
  try {
    await api.games.disconnect(accountId);
    currentUser = await api.users.me();
    updateNavUser();
    showToast('Account disconnected.', 'success');
    await loadGames();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ===== CLUBS PAGE =====
async function loadClubs() {
  if (!currentUser) return;
  try {
    currentUser = await api.users.me();
    userClubId = currentUser.club ? currentUser.club.id : null;
  } catch { return; }

  document.getElementById('createClubBtn').style.display = currentUser.club ? 'none' : '';

  if (currentUser.club) {
    document.getElementById('myClubSection').style.display = '';
    await renderMyClub(currentUser.club.id);
  } else {
    document.getElementById('myClubSection').style.display = 'none';
  }

  await loadOpenChallenges();
  await loadAllClubs();
}

async function renderMyClub(clubId) {
  try {
    const club = await api.clubs.get(clubId);
    const myClubCard = document.getElementById('myClubCard');
    const isOwner = club.owner_id === currentUser.id;
    const clubColor = club.club_color || '#6366f1';

    myClubCard.innerHTML = `
      <div class="my-club-card" style="--club-color:${clubColor}">
        <div class="my-club-header">
          <div>
            <div class="my-club-name">[${club.tag}] ${escapeHtml(club.name)}</div>
            ${club.motto ? `<div class="my-club-motto">"${escapeHtml(club.motto)}"</div>` : ''}
            ${club.description ? `<p class="text-muted" style="font-size:0.875rem;margin-top:0.25rem">${escapeHtml(club.description)}</p>` : ''}
          </div>
          <div style="display:flex;gap:0.5rem;flex-wrap:wrap;align-items:center">
            <span class="recruit-badge ${club.recruit_open ? 'recruit-open' : 'recruit-closed'}">${club.recruit_open ? '● Recruiting' : '● Closed'}</span>
            ${isOwner ? `<button class="btn btn-ghost btn-sm" onclick="openEditClub(${clubId})">Edit</button>` : ''}
            ${isOwner ? `<button class="btn btn-danger btn-sm" onclick="leaveClub(${clubId})">Disband</button>` : `<button class="btn btn-ghost btn-sm text-red" onclick="leaveClub(${clubId})">Leave</button>`}
          </div>
        </div>
        <div class="my-club-stats">
          <div class="club-stat">
            <div class="club-stat-val mono" style="color:#fbbf24">${club.best_elo ? formatScore(club.best_elo) : '—'}</div>
            <div class="club-stat-lbl">Club ELO</div>
          </div>
          <div class="club-stat"><div class="club-stat-val club-wins-val mono">${club.wins}</div><div class="club-stat-lbl">Wins</div></div>
          <div class="club-stat"><div class="club-stat-val text-red mono">${club.losses}</div><div class="club-stat-lbl">Losses</div></div>
          <div class="club-stat"><div class="club-stat-val mono">${club.member_count}/20</div><div class="club-stat-lbl">Members</div></div>
        </div>
        ${club.elo_data && club.elo_data.length ? `
        <div style="margin-top:0.75rem">
          <div class="section-title" style="font-size:0.75rem;margin-bottom:0.35rem;color:var(--text-3)">ELO by Game</div>
          <div class="game-avg-grid">
            ${club.elo_data.map(row => {
              const isCalibrated = row.matches_played >= 5;
              return `<div class="game-avg-chip">
                <span>${row.game_icon}</span>
                <span>${row.game_name}</span>
                ${isCalibrated
                  ? `<span class="game-avg-chip-rank" style="color:#fbbf24">${formatScore(row.elo)}</span>`
                  : `<span class="game-avg-chip-rank" style="color:var(--text-3);font-style:italic">${row.matches_played}/5</span>`}
              </div>`;
            }).join('')}
          </div>
        </div>` : ''}

        ${club.game_averages && club.game_averages.length ? `
        <div class="club-game-averages">
          <div class="section-title" style="font-size:0.82rem;margin-bottom:0.5rem">Avg Rank by Game</div>
          <div class="game-avg-grid">
            ${club.game_averages.map(ga => `
              <div class="game-avg-chip">
                <span>${ga.icon}</span>
                <span>${ga.game_name}</span>
                <span class="game-avg-chip-rank" style="color:${ga.avg_rank.color}">${ga.avg_rank.name}</span>
                <span class="game-avg-count">(${ga.player_count})</span>
              </div>
            `).join('')}
          </div>
        </div>` : ''}

        <div class="my-club-members">
          <div class="section-title" style="font-size:0.82rem;margin-bottom:0.5rem;margin-top:1.25rem">Members (${club.member_count}/20)</div>
          <div class="members-list">
            ${club.members.map(m => `
              <div class="member-row">
                <div class="avatar-sm" style="background:${m.avatar_color || '#6366f1'}">${(m.gamertag || m.username)[0].toUpperCase()}</div>
                <div class="member-info">
                  <div class="member-name">${escapeHtml(m.gamertag || m.username)}</div>
                  <div class="member-gs mono">${formatScore(m.gamerscore)} GS</div>
                </div>
                <span class="member-role">${m.role}</span>
                ${isOwner && m.id !== currentUser.id ? `<button class="btn btn-ghost btn-sm" style="padding:0.2rem 0.5rem;font-size:0.68rem" onclick="kickMember(${clubId}, ${m.id})">Kick</button>` : ''}
              </div>
            `).join('')}
          </div>
        </div>

        ${club.badges && club.badges.length ? `
        <div style="margin-top:1.25rem">
          <div class="section-title" style="font-size:0.82rem;margin-bottom:0.5rem">🏆 Tournament Champions</div>
          <div style="display:flex;flex-wrap:wrap;gap:0.5rem">
            ${club.badges.map(b => `
              <div class="tournament-champion-badge" style="--badge-color:${b.game_color || '#f59e0b'}">
                <span class="badge-game-icon">${b.game_icon}</span>
                <div class="badge-info">
                  <div class="badge-player">${escapeHtml(b.gamertag || b.username)}</div>
                  <div class="badge-game">${escapeHtml(b.game_name)} Champion</div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>` : ''}
      </div>`;

    // Show/hide tournament create button for owner
    const createBtn = document.getElementById('createTournamentBtn');
    if (createBtn) createBtn.style.display = isOwner ? '' : 'none';

    await loadClubTournaments(clubId);
    await loadActiveMatches('myClubMatches', 'myClubMatchesSection', 'club');

    const challengesEl = document.getElementById('myClubChallenges');
    if (!club.challenges || club.challenges.length === 0) {
      challengesEl.innerHTML = '<p class="text-muted" style="font-size:0.9rem;margin-top:0.5rem">No challenges yet.</p>';
    } else {
      challengesEl.innerHTML = `<div class="challenges-list" style="margin-top:0.75rem">${club.challenges.map(c => {
        const isChallenger = c.challenger_id === clubId;
        const opponentName = isChallenger ? c.challenged_name : c.challenger_name;
        const opponentTag = isChallenger ? c.challenged_tag : c.challenger_tag;
        const amWinner = c.winner_id === clubId;
        const isPending = c.status === 'pending';
        const canRespond = isPending && !isChallenger;

        return `
        <div class="challenge-card">
          <div class="challenge-vs">
            <span class="challenge-club">${isChallenger ? 'vs' : 'from'} [${opponentTag}] ${escapeHtml(opponentName)}</span>
          </div>
          <span class="challenge-status status-${c.status}">${c.status.toUpperCase()}</span>
          ${c.status === 'completed' ? `<div class="challenge-result">
            <div class="challenge-winner">${amWinner ? '🏆 Victory' : '💀 Defeat'}</div>
            <div>${formatScore(c.challenger_score)} vs ${formatScore(c.challenged_score)} avg GS</div>
          </div>` : ''}
          ${canRespond ? `<div style="display:flex;gap:0.5rem">
            <button class="btn btn-success btn-sm" onclick="respondChallenge(${c.id}, 'accept')">Accept</button>
            <button class="btn btn-ghost btn-sm" onclick="respondChallenge(${c.id}, 'decline')">Decline</button>
          </div>` : ''}
        </div>`;
      }).join('')}</div>`;
    }
  } catch (err) {
    console.error(err);
  }
}

function renderActiveMatchCards(matches, type) {
  if (!matches.length) return '';
  return matches.map(m => {
    const statusColor = m.status === 'disputed' ? '#f59e0b' : '#10b981';
    const statusLabel = m.status === 'disputed' ? 'Disputed' : 'In Progress';
    const opponentLabel = type === 'club'
      ? (m.entity_a_label && m.entity_b_label ? `${m.entity_a_label} vs ${m.entity_b_label}` : 'Club Match')
      : (m.entity_a_label && m.entity_b_label ? `${m.entity_a_label} vs ${m.entity_b_label}` : 'Team Match');
    const gameIcons = (m.games || []).map(g => `<span title="${escapeHtml(g.name)}">${escapeHtml(g.icon || g.name[0])}</span>`).join(' ');
    return `<div class="challenge-card" style="display:flex;align-items:center;justify-content:space-between;gap:1rem;flex-wrap:wrap">
      <div>
        <div style="font-weight:700;color:#e0e0f0">${escapeHtml(opponentLabel)}</div>
        <div style="font-size:0.8rem;color:#a0a0b0;margin-top:0.15rem">${gameIcons}</div>
      </div>
      <div style="display:flex;align-items:center;gap:0.75rem">
        <span style="padding:0.2rem 0.6rem;border-radius:9999px;font-size:0.75rem;font-weight:700;background:${statusColor}22;color:${statusColor};border:1px solid ${statusColor}55">${statusLabel}</span>
        <a class="btn btn-primary btn-sm" href="#/match?id=${m.id}">Open Match</a>
      </div>
    </div>`;
  }).join('');
}

async function loadActiveMatches(listElId, sectionElId, type) {
  try {
    const matches = await api.matches.mine();
    const filtered = matches.filter(m => m.match_type === type);
    const section = document.getElementById(sectionElId);
    const list = document.getElementById(listElId);
    if (!filtered.length) {
      section.style.display = 'none';
      return;
    }
    section.style.display = '';
    list.innerHTML = renderActiveMatchCards(filtered, type);
  } catch {}
}

async function loadOpenChallenges() {
  const el = document.getElementById('openChallengesList');
  try {
    const challenges = await api.clubs.openChallenges();
    if (!challenges.length) {
      el.innerHTML = '<p class="text-muted" style="font-size:0.875rem;padding:0.5rem 0">No open challenges posted yet.</p>';
      return;
    }

    el.innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:1rem;">
      ${challenges.map(ch => {
        const isMyClub = userClubId === ch.club_id;
        const canAccept = userClubId && !isMyClub;
        const gamesStr = ch.games.map(g => `${g.icon} ${g.name}`).join(', ');
        const participantsStr = ch.participants.map(p => p.gamertag || p.username).join(', ');
        return `
        <div class="open-challenge-card">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:0.75rem">
            <div>
              <span style="font-weight:800;font-size:1rem">[${ch.club_tag}] ${escapeHtml(ch.club_name)}</span>
              ${ch.description ? `<p style="font-size:0.82rem;color:var(--text-2);margin-top:0.2rem">"${escapeHtml(ch.description)}"</p>` : ''}
            </div>
            <span class="challenge-status status-open">OPEN</span>
          </div>
          ${gamesStr ? `<div style="font-size:0.82rem;color:var(--text-2);margin-bottom:0.5rem">🎮 ${escapeHtml(gamesStr)}</div>` : ''}
          ${participantsStr ? `<div style="font-size:0.78rem;color:var(--text-3);margin-bottom:0.75rem">Participants: ${escapeHtml(participantsStr)}</div>` : ''}
          ${canAccept ? `<button class="btn btn-success btn-sm" onclick="openAcceptOpenChallenge(${ch.id}, ${JSON.stringify(ch).replace(/"/g, '&quot;')})">⚡ Accept Challenge</button>` : ''}
          ${isMyClub ? `<span style="font-size:0.78rem;color:var(--text-3)">Your club's challenge</span>` : ''}
        </div>`;
      }).join('')}
    </div>`;
  } catch (err) {
    el.innerHTML = '<p class="text-muted" style="font-size:0.875rem">Failed to load open challenges.</p>';
  }
}

async function loadAllClubs(search) {
  try {
    const clubs = await api.clubs.list(search);
    const grid = document.getElementById('clubsGrid');
    if (!clubs.length) {
      grid.innerHTML = `<div class="empty-state"><span class="empty-icon">⚔️</span><p>No clubs found.</p></div>`;
      return;
    }
    grid.innerHTML = clubs.map(c => {
      const isMember = currentUser.club && currentUser.club.id === c.id;
      const clubColor = c.club_color || '#6366f1';
      const canJoin = !currentUser.club && c.recruit_open;
      return `
      <div class="club-card" style="--club-accent:${clubColor}">
        <div class="club-card-header">
          <div class="club-card-title">${escapeHtml(c.name)}</div>
          <span class="club-card-tag">${c.tag}</span>
        </div>
        ${c.motto ? `<p style="font-size:0.78rem;color:var(--text-3);font-style:italic;margin-bottom:0.5rem">"${escapeHtml(c.motto)}"</p>` : ''}
        <p class="club-card-desc">${c.description ? escapeHtml(c.description) : 'No description.'}</p>
        <div class="club-card-stats">
          <div class="club-stat"><div class="club-stat-val club-score-val mono">${formatScore(c.club_score)}</div><div class="club-stat-lbl">Score</div></div>
          <div class="club-stat"><div class="club-stat-val club-wins-val mono">${c.wins}</div><div class="club-stat-lbl">Wins</div></div>
          <div class="club-stat"><div class="club-stat-val mono">${c.member_count}/20</div><div class="club-stat-lbl">Members</div></div>
        </div>
        <div style="display:flex;gap:0.5rem;align-items:center;margin-top:0.25rem">
          <span class="recruit-badge ${c.recruit_open ? 'recruit-open' : 'recruit-closed'}">${c.recruit_open ? '● Open' : '● Closed'}</span>
          ${isMember
            ? `<span class="btn btn-outline btn-sm" style="cursor:default">◈ Your Club</span>`
            : canJoin
              ? `<button class="btn btn-primary btn-sm" onclick="joinClub(${c.id})">Join Club</button>`
              : ''}
        </div>
      </div>`;
    }).join('');
  } catch (err) {
    console.error(err);
  }
}

let searchTimeout;
function searchClubs(val) {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => loadAllClubs(val), 300);
}

async function joinClub(clubId) {
  try {
    await api.clubs.join(clubId);
    currentUser = await api.users.me();
    userClubId = currentUser.club ? currentUser.club.id : null;
    updateNavUser();
    showToast('Joined club!', 'success');
    await loadClubs();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function leaveClub(clubId) {
  if (!confirm('Are you sure you want to leave/disband this club?')) return;
  try {
    await api.clubs.leave(clubId);
    currentUser = await api.users.me();
    userClubId = null;
    updateNavUser();
    showToast('Left club.', 'success');
    await loadClubs();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function kickMember(clubId, userId) {
  if (!confirm('Kick this member?')) return;
  try {
    await api.clubs.kick(clubId, userId);
    showToast('Member kicked.', 'success');
    await renderMyClub(clubId);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function respondChallenge(challengeId, action) {
  try {
    const res = await api.clubs.respond(challengeId, { action });
    if (action === 'accept' && res.match_id) {
      showToast('Challenge accepted! Opening match room...', 'success');
      location.hash = `#/match?id=${res.match_id}`;
    } else if (action === 'accept') {
      showToast('Challenge accepted!', 'success');
      currentUser = await api.users.me();
      await loadClubs();
    } else {
      showToast('Challenge declined.', 'success');
      await loadClubs();
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ===== LEADERBOARD =====
async function loadLeaderboard() {
  try {
    const [players, clubs] = await Promise.all([api.users.leaderboard(), api.clubs.leaderboard()]);
    renderPlayerLeaderboard(players);
    renderClubLeaderboard(clubs);
    // Friends tab loaded on click
    document.getElementById('friendLeaderboard').innerHTML = '<p class="text-muted" style="padding:1rem">Click the Friends tab to load your friends ranking.</p>';
  } catch (err) {
    console.error(err);
  }
}

function renderPlayerLeaderboard(players) {
  const el = document.getElementById('playerLeaderboard');
  if (!players.length) { el.innerHTML = '<p class="text-muted">No players yet.</p>'; return; }
  el.innerHTML = `<table class="leaderboard-table">
    <thead><tr><th>#</th><th>Player</th><th>Club</th><th>ELO</th><th style="font-size:0.75rem;color:var(--text-3)">GS</th></tr></thead>
    <tbody>${players.map((p, i) => {
      const rankClass = i === 0 ? 'lb-rank-1' : i === 1 ? 'lb-rank-2' : i === 2 ? 'lb-rank-3' : '';
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '';
      const avatarEl = buildAvatarHtml(p, 'sm');
      const eloDisplay = p.best_elo ? `<span class="lb-score mono" style="color:#fbbf24">${formatScore(p.best_elo)}</span>` : `<span style="color:var(--text-3);font-style:italic;font-size:0.8rem">Unranked</span>`;
      return `<tr>
        <td><span class="lb-rank ${rankClass}">${medal || i + 1}</span></td>
        <td><div class="lb-user">
          ${avatarEl}
          <span>${escapeHtml(p.gamertag || p.username)} ${p.id === currentUser?.id ? '<span style="font-size:0.72rem;color:var(--accent)">(you)</span>' : ''}</span>
        </div></td>
        <td>${p.club_name ? `<span style="font-size:0.82rem;color:var(--text-2)">[${p.club_tag}] ${escapeHtml(p.club_name)}</span>` : '<span class="text-muted">—</span>'}</td>
        <td>${eloDisplay}</td>
        <td><span class="mono" style="font-size:0.8rem;color:var(--text-3)">${formatScore(p.gamerscore)}</span></td>
      </tr>`;
    }).join('')}</tbody>
  </table>`;
}

async function loadFriendsLeaderboard() {
  const el = document.getElementById('friendLeaderboard');
  el.innerHTML = '<p class="text-muted">Loading...</p>';
  try {
    const friends = await api.friends.leaderboard();
    if (!friends.length) {
      el.innerHTML = `<div class="empty-state"><span class="empty-icon">👥</span><p>No friends yet.</p><button class="btn btn-primary" onclick="showPage('profile')">Add Friends</button></div>`;
      return;
    }
    el.innerHTML = `<table class="leaderboard-table">
      <thead><tr><th>#</th><th>Player</th><th>Club</th><th>ELO</th><th style="font-size:0.75rem;color:var(--text-3)">GS</th></tr></thead>
      <tbody>${friends.map((p, i) => {
        const rankClass = i === 0 ? 'lb-rank-1' : i === 1 ? 'lb-rank-2' : i === 2 ? 'lb-rank-3' : '';
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '';
        const avatarEl = buildAvatarHtml(p, 'sm');
        const eloDisplay = p.best_elo ? `<span class="lb-score mono" style="color:#fbbf24">${formatScore(p.best_elo)}</span>` : `<span style="color:var(--text-3);font-style:italic;font-size:0.8rem">Unranked</span>`;
        return `<tr>
          <td><span class="lb-rank ${rankClass}">${medal || i + 1}</span></td>
          <td><div class="lb-user">
            ${avatarEl}
            <span>${escapeHtml(p.gamertag || p.username)} ${p.id === currentUser?.id ? '<span style="font-size:0.72rem;color:var(--accent)">(you)</span>' : ''}</span>
            ${p.title ? `<span class="player-title">${escapeHtml(p.title)}</span>` : ''}
          </div></td>
          <td>${p.club_name ? `<span style="font-size:0.82rem;color:var(--text-2)">[${p.club_tag}] ${escapeHtml(p.club_name)}</span>` : '<span class="text-muted">—</span>'}</td>
          <td>${eloDisplay}</td>
          <td><span class="mono" style="font-size:0.8rem;color:var(--text-3)">${formatScore(p.gamerscore)}</span></td>
        </tr>`;
      }).join('')}</tbody>
    </table>`;
  } catch (err) {
    el.innerHTML = `<p class="text-muted">Error loading friends: ${escapeHtml(err.message)}</p>`;
  }
}

function renderClubLeaderboard(clubs) {
  const el = document.getElementById('clubLeaderboard');
  if (!clubs.length) { el.innerHTML = '<p class="text-muted">No clubs yet.</p>'; return; }
  el.innerHTML = `<table class="leaderboard-table">
    <thead><tr><th>#</th><th>Club</th><th>Members</th><th>W / L</th><th>ELO</th></tr></thead>
    <tbody>${clubs.map((c, i) => {
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '';
      const rankClass = i === 0 ? 'lb-rank-1' : i === 1 ? 'lb-rank-2' : i === 2 ? 'lb-rank-3' : '';
      const eloDisplay = c.best_elo ? `<span class="lb-club-score mono" style="color:#fbbf24">${formatScore(c.best_elo)}</span>` : `<span style="color:var(--text-3);font-style:italic;font-size:0.8rem">Unranked</span>`;
      return `<tr>
        <td><span class="lb-rank ${rankClass}">${medal || i + 1}</span></td>
        <td><div class="lb-user"><strong>[${c.tag}]</strong>&nbsp;${escapeHtml(c.name)}</div></td>
        <td class="mono">${c.member_count}/20</td>
        <td><span class="text-green mono">${c.wins}W</span> / <span class="text-red mono">${c.losses}L</span></td>
        <td>${eloDisplay}</td>
      </tr>`;
    }).join('')}</tbody>
  </table>`;
}

function switchTab(tab, btn) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById(`tab${tab.charAt(0).toUpperCase() + tab.slice(1)}`).classList.add('active');
  if (tab === 'friends') loadFriendsLeaderboard();
}

// ===== PROFILE =====
async function loadProfile() {
  if (!currentUser) return;
  try { currentUser = await api.users.me(); } catch { return; }

  renderProfileCard(currentUser);
  renderProfileEdit(currentUser);
  renderProfileGames(currentUser.accounts);
  renderProfileTeams(currentUser.teams || []);
  loadProfileFriends();
}

function renderProfileCard(user) {
  document.getElementById('profileGamertag').textContent = user.gamertag || user.username;
  document.getElementById('profileUsername').textContent = `@${user.username}`;
  document.getElementById('profileBio').textContent = user.bio || '';
  const profileBestElo = user.best_elo;
  const profileEloEl = document.getElementById('profileGamerscore');
  profileEloEl.innerHTML = profileBestElo
    ? `<span style="color:#fbbf24">${formatScore(profileBestElo)}</span> <span style="font-size:0.65em;color:var(--text-3);font-weight:400">ELO</span>`
    : `<span style="font-size:0.75em;color:var(--text-3);font-style:italic">Unranked</span>`;
  // Gamerscore sub-label
  const gsSubEl = document.getElementById('profileGamerscoreSub');
  if (gsSubEl) gsSubEl.textContent = `GS: ${formatScore(user.gamerscore)}`;
  document.getElementById('profileFriendCount').textContent = user.friend_count || 0;
  document.getElementById('profileGamesCount').textContent = user.accounts.length;

  // Per-game ELO breakdown
  const eloSectionEl = document.getElementById('profileEloSection');
  if (eloSectionEl && user.elo_data && user.elo_data.length) {
    eloSectionEl.style.display = '';
    eloSectionEl.innerHTML = `
      <div class="section-title" style="font-size:0.82rem;margin-bottom:0.5rem;margin-top:1.25rem">ELO by Game</div>
      <div class="game-avg-grid">
        ${user.elo_data.map(row => {
          const isCalibrated = row.matches_played >= 5;
          return `<div class="game-avg-chip">
            <span>${row.game_icon}</span>
            <span>${escapeHtml(row.game_name)}</span>
            ${isCalibrated
              ? `<span class="game-avg-chip-rank" style="color:#fbbf24">${formatScore(row.elo)}</span>`
              : `<span class="game-avg-chip-rank" style="color:var(--text-3);font-style:italic">${row.matches_played}/5</span>`}
          </div>`;
        }).join('')}
      </div>`;
  } else if (eloSectionEl) {
    eloSectionEl.style.display = 'none';
  }

  setAvatar('profileAvatar', user.gamertag || user.username, user.avatar_color, user.avatar_url);

  const bannerEl = document.getElementById('profileBanner');
  const bannerColor = user.banner_color || '#6366f1';
  bannerEl.style.background = `linear-gradient(135deg, ${bannerColor} 0%, rgba(0,212,255,0.35) 100%)`;

  // Title badge
  const titleBadge = document.getElementById('profileTitleBadge');
  if (user.title) {
    titleBadge.textContent = user.title;
    titleBadge.style.display = '';
  } else {
    const autoTitle = user.best_elo ? getEloTitle(user.best_elo) : getTitleFromScore(user.gamerscore);
    if (autoTitle) { titleBadge.textContent = autoTitle; titleBadge.style.display = ''; }
    else titleBadge.style.display = 'none';
  }

  // Club badge
  const clubBadge = document.getElementById('profileClubBadge');
  if (user.club) {
    clubBadge.innerHTML = `<span style="color:${user.club.club_color || '#6366f1'}">◈</span> [${user.club.tag}] ${escapeHtml(user.club.name)} <span class="text-muted" style="font-size:0.75rem">${user.club.role}</span>`;
    clubBadge.style.display = '';
  } else {
    clubBadge.style.display = 'none';
  }

  // Social links
  const socialEl = document.getElementById('profileSocialLinks');
  const links = user.social_links || {};
  const parts = [];
  if (links.twitch) parts.push(`<a href="https://twitch.tv/${encodeURIComponent(links.twitch)}" target="_blank" rel="noopener" class="social-link social-twitch">🟣 ${escapeHtml(links.twitch)}</a>`);
  if (links.twitter) parts.push(`<a href="https://twitter.com/${encodeURIComponent(links.twitter)}" target="_blank" rel="noopener" class="social-link social-twitter">𝕏 ${escapeHtml(links.twitter)}</a>`);
  if (links.discord) parts.push(`<span class="social-link social-discord">💬 ${escapeHtml(links.discord)}</span>`);
  if (links.youtube) parts.push(`<a href="https://youtube.com/@${encodeURIComponent(links.youtube)}" target="_blank" rel="noopener" class="social-link social-youtube">📺 ${escapeHtml(links.youtube)}</a>`);
  socialEl.innerHTML = parts.join('');

  // Pending friend requests badge
  const reqBadge = document.getElementById('profileFriendRequestsBadge');
  if (user.pending_friend_requests > 0) {
    reqBadge.textContent = `${user.pending_friend_requests} pending`;
    reqBadge.style.display = '';
  } else {
    reqBadge.style.display = 'none';
  }
}

function renderProfileEdit(user) {
  document.getElementById('editGamertag').value = user.gamertag || '';
  document.getElementById('editBio').value = user.bio || '';
  document.getElementById('editTitle').value = user.title || '';
  const links = user.social_links || {};
  document.getElementById('editTwitch').value = links.twitch || '';
  document.getElementById('editTwitter').value = links.twitter || '';
  document.getElementById('editDiscord').value = links.discord || '';
  document.getElementById('editYoutube').value = links.youtube || '';

  const bannerColor = user.banner_color || '#6366f1';
  const swatches = document.getElementById('colorSwatches');
  swatches.innerHTML = AVATAR_COLORS.map(c => `
    <div class="color-swatch ${c === user.avatar_color ? 'selected' : ''}"
      style="background:${c}" onclick="selectColor('${c}', this, 'avatar')"></div>
  `).join('');

  const bannerSwatches = document.getElementById('bannerSwatches');
  bannerSwatches.innerHTML = BANNER_COLORS.map(c => `
    <div class="color-swatch ${c === bannerColor ? 'selected' : ''}"
      style="background:${c}" onclick="selectColor('${c}', this, 'banner')"></div>
  `).join('');
}

function renderProfileGames(accounts) {
  const el = document.getElementById('profileGamesList');
  if (!accounts.length) {
    el.innerHTML = `<div class="empty-state"><span class="empty-icon">🎮</span><p>No games connected.</p><button class="btn btn-primary btn-sm" onclick="showPage('games')">Connect Games</button></div>`;
    return;
  }
  // accounts already sorted best → worst by backend
  el.innerHTML = accounts.map((a, i) => {
    const trackerBadge = a.tracker_url
      ? `<a href="${escapeHtml(a.tracker_url)}" target="_blank" rel="noopener" class="tracker-badge">🔗 Linked</a>`
      : '';
    const updateBtn = `<button class="btn btn-ghost btn-sm" style="font-size:0.75rem" onclick="openUpdateRank(${a.id}, ${JSON.stringify(a.ranks).replace(/"/g, '&quot;')}, ${a.current_rank_index}, ${a.peak_rank_index}, ${JSON.stringify(a.tracker_url || '').replace(/"/g, '&quot;')})">Update</button>`;
    return `
    <div class="profile-game-row">
      <div class="profile-game-rank-num">#${i + 1}</div>
      <span class="game-icon">${a.icon}</span>
      <div class="profile-game-info">
        <div class="profile-game-name">${escapeHtml(a.game_name)}
          <span class="game-platform-small">${a.platform}</span>
        </div>
        <div class="profile-game-user">@${escapeHtml(a.platform_username)}</div>
      </div>
      <div class="profile-game-ranks">
        <span class="rank-badge" style="color:${a.current_rank?.color || '#6b7280'}">${a.current_rank?.name || 'Unranked'}</span>
        ${a.peak_rank && a.peak_rank.value > (a.current_rank?.value || 0) ? `<span style="font-size:0.72rem;color:var(--text-3)">↑ ${a.peak_rank.name}</span>` : ''}
      </div>
      <div class="profile-game-actions">
        ${trackerBadge}
        ${updateBtn}
      </div>
    </div>`;
  }).join('');
}

function renderProfileTeams(teams) {
  const section = document.getElementById('profileTeamsSection');
  const el = document.getElementById('profileTeamsList');
  if (!teams.length) { section.style.display = 'none'; return; }
  section.style.display = '';
  el.innerHTML = teams.map(t => `
    <div class="profile-team-chip">
      <span>${t.icon || '🎮'}</span>
      <span><strong>[${t.tag}]</strong> ${escapeHtml(t.name)}</span>
      <span style="font-size:0.75rem;color:var(--text-3)">${escapeHtml(t.game_name)} · ${t.role}</span>
    </div>
  `).join('');
}

async function loadProfileFriends() {
  try {
    const [friends, requests] = await Promise.all([api.friends.list(), api.friends.requests()]);
    renderProfileFriendsList(friends);
    renderFriendRequests(requests);
  } catch (err) {
    document.getElementById('profileFriendsList').innerHTML = '<p class="text-muted">Failed to load friends.</p>';
  }
}

function renderProfileFriendsList(friends) {
  const el = document.getElementById('profileFriendsList');
  if (!friends.length) {
    el.innerHTML = `<div class="empty-state" style="padding:1.5rem"><span class="empty-icon">👥</span><p>No friends yet. Add some!</p></div>`;
    return;
  }
  el.innerHTML = friends.map(f => {
    const avatarEl = buildAvatarHtml(f, 'sm');
    return `
    <div class="friend-card">
      ${avatarEl}
      <div class="friend-info">
        <div class="friend-name">${escapeHtml(f.gamertag || f.username)}</div>
        ${f.title ? `<div class="friend-title">${escapeHtml(f.title)}</div>` : ''}
        <div class="friend-gs mono">${formatScore(f.gamerscore)} GS</div>
        ${f.club_name ? `<div class="friend-club">[${f.club_tag}] ${escapeHtml(f.club_name)}</div>` : ''}
      </div>
      <button class="btn btn-ghost btn-sm" style="font-size:0.7rem;color:var(--red)" onclick="removeFriend(${f.id})">Remove</button>
    </div>`;
  }).join('');
}

function renderFriendRequests(requests) {
  const section = document.getElementById('profileFriendRequestsList');
  const el = document.getElementById('pendingRequestsGrid');
  if (!requests.length) { section.style.display = 'none'; return; }
  section.style.display = '';
  el.innerHTML = requests.map(r => `
    <div class="friend-card">
      <div class="avatar-sm" style="background:${r.avatar_color || '#6366f1'}">${(r.gamertag || r.username)[0].toUpperCase()}</div>
      <div class="friend-info">
        <div class="friend-name">${escapeHtml(r.gamertag || r.username)}</div>
        <div class="friend-gs mono">${formatScore(r.gamerscore)} GS</div>
      </div>
      <div style="display:flex;gap:0.35rem">
        <button class="btn btn-success btn-sm" onclick="acceptFriendRequest(${r.id})">Accept</button>
        <button class="btn btn-ghost btn-sm" onclick="declineFriendRequest(${r.id})">Decline</button>
      </div>
    </div>
  `).join('');
}

function scrollToEdit() {
  document.getElementById('profileEditCard').scrollIntoView({ behavior: 'smooth' });
}

function selectColor(color, el, type) {
  if (type === 'avatar') {
    document.querySelectorAll('#colorSwatches .color-swatch').forEach(s => s.classList.remove('selected'));
  } else {
    document.querySelectorAll('#bannerSwatches .color-swatch').forEach(s => s.classList.remove('selected'));
    const bannerEl = document.getElementById('profileBanner');
    bannerEl.style.background = `linear-gradient(135deg, ${color} 0%, rgba(0,212,255,0.35) 100%)`;
  }
  el.classList.add('selected');
}

async function handleAvatarUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) { showToast('Please select an image file.', 'error'); return; }

  try {
    const dataUrl = await resizeImageToDataUrl(file, 800, 800, 0.85);
    await api.users.uploadAvatar({ avatar_url: dataUrl });
    currentUser = await api.users.me();
    setAvatar('profileAvatar', currentUser.gamertag || currentUser.username, currentUser.avatar_color, dataUrl);
    setAvatar('navAvatar', currentUser.gamertag || currentUser.username, currentUser.avatar_color, dataUrl);
    showToast('Profile photo updated!', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function resizeImageToDataUrl(file, maxW, maxH, quality) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error('Invalid image file'));
      img.onload = () => {
        let { width, height } = img;
        if (width > maxW || height > maxH) {
          const ratio = Math.min(maxW / width, maxH / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

async function saveProfile() {
  hideError('profileEditError');
  const gamertag = document.getElementById('editGamertag').value.trim();
  const bio = document.getElementById('editBio').value.trim();
  const title = document.getElementById('editTitle').value.trim();
  const selectedSwatch = document.querySelector('#colorSwatches .color-swatch.selected');
  const selectedBanner = document.querySelector('#bannerSwatches .color-swatch.selected');
  const avatar_color = selectedSwatch ? selectedSwatch.style.background : currentUser.avatar_color;
  const banner_color = selectedBanner ? selectedBanner.style.background : (currentUser.banner_color || '#6366f1');
  const social_links = {
    twitch: document.getElementById('editTwitch').value.trim(),
    twitter: document.getElementById('editTwitter').value.trim(),
    discord: document.getElementById('editDiscord').value.trim(),
    youtube: document.getElementById('editYoutube').value.trim(),
  };

  try {
    await api.users.update({ gamertag, avatar_color, banner_color, bio, title: title || null, social_links });
    currentUser = await api.users.me();
    updateNavUser();
    renderProfileCard(currentUser);
    document.getElementById('profileEditSuccess').style.display = '';
    document.getElementById('profileEditSuccess').textContent = 'Profile saved!';
    setTimeout(() => { document.getElementById('profileEditSuccess').style.display = 'none'; }, 3000);
  } catch (err) {
    showError('profileEditError', err.message);
  }
}

// ===== FRIENDS =====
let _friendStatusCache = null; // { friendIds: Set, sentIds: Set, receivedMap: Map<userId, requestId> }

async function openAddFriendModal() {
  document.getElementById('friendSearchInput').value = '';
  document.getElementById('friendSearchResults').innerHTML = '';
  hideError('addFriendError');
  document.getElementById('addFriendSuccess').style.display = 'none';
  _friendStatusCache = null;
  // Pre-load friendship statuses so search results show correct state
  try {
    const [friends, requests] = await Promise.all([api.friends.list(), api.friends.requests()]);
    const friendIds = new Set(friends.map(f => f.id));
    const sentIds = new Set(); // we don't have a "sent" list endpoint, populated on demand
    const receivedMap = new Map(requests.map(r => [r.user_id, r.id]));
    _friendStatusCache = { friendIds, sentIds, receivedMap };
  } catch { _friendStatusCache = { friendIds: new Set(), sentIds: new Set(), receivedMap: new Map() }; }
  openModal('addFriendModal');
}

let friendSearchTimer;
async function searchFriendUsers(q) {
  clearTimeout(friendSearchTimer);
  const el = document.getElementById('friendSearchResults');
  if (q.length < 2) { el.innerHTML = ''; return; }
  friendSearchTimer = setTimeout(async () => {
    try {
      const users = await api.users.search(q);
      if (!users.length) { el.innerHTML = '<p class="text-muted" style="font-size:0.82rem;padding:0.5rem 0">No users found.</p>'; return; }
      const cache = _friendStatusCache || { friendIds: new Set(), sentIds: new Set(), receivedMap: new Map() };
      el.innerHTML = users.map(u => {
        let actionBtn;
        if (cache.friendIds.has(u.id)) {
          actionBtn = `<span class="btn btn-ghost btn-sm" style="opacity:0.6;cursor:default">Friends ✓</span>`;
        } else if (cache.receivedMap.has(u.id)) {
          const reqId = cache.receivedMap.get(u.id);
          actionBtn = `<button class="btn btn-success btn-sm" onclick="acceptFromSearch(${reqId}, ${u.id}, this)">Accept</button>`;
        } else if (cache.sentIds.has(u.id)) {
          actionBtn = `<span class="btn btn-ghost btn-sm" style="opacity:0.6;cursor:default">Sent ✓</span>`;
        } else {
          actionBtn = `<button class="btn btn-primary btn-sm" onclick="sendFriendRequest(${u.id}, this)">Add</button>`;
        }
        return `
        <div class="friend-search-row">
          <div class="avatar-sm" style="background:${u.avatar_color || '#6366f1'}">${(u.gamertag || u.username)[0].toUpperCase()}</div>
          <div class="friend-info" style="flex:1">
            <div class="friend-name">${escapeHtml(u.gamertag || u.username)}</div>
            <div class="friend-gs mono">${formatScore(u.gamerscore)} GS</div>
          </div>
          ${actionBtn}
        </div>`;
      }).join('');
    } catch { el.innerHTML = '<p class="text-muted" style="font-size:0.82rem">Search failed.</p>'; }
  }, 350);
}

async function sendFriendRequest(userId, btn) {
  hideError('addFriendError');
  if (btn) { btn.disabled = true; btn.textContent = 'Sending...'; }
  try {
    await api.friends.sendRequest(userId);
    if (btn) { btn.textContent = 'Sent ✓'; btn.className = 'btn btn-ghost btn-sm'; btn.style.opacity = '0.6'; btn.style.cursor = 'default'; btn.disabled = true; }
    if (_friendStatusCache) _friendStatusCache.sentIds.add(userId);
    document.getElementById('addFriendSuccess').style.display = '';
    document.getElementById('addFriendSuccess').textContent = 'Friend request sent!';
    setTimeout(() => { document.getElementById('addFriendSuccess').style.display = 'none'; }, 3000);
  } catch (err) {
    if (btn) { btn.disabled = false; btn.textContent = 'Add'; }
    showError('addFriendError', err.message);
  }
}

async function acceptFromSearch(requestId, userId, btn) {
  if (btn) { btn.disabled = true; btn.textContent = 'Accepting...'; }
  try {
    await api.friends.accept(requestId);
    if (btn) { btn.outerHTML = `<span class="btn btn-ghost btn-sm" style="opacity:0.6;cursor:default">Friends ✓</span>`; }
    if (_friendStatusCache) {
      _friendStatusCache.friendIds.add(userId);
      _friendStatusCache.receivedMap.delete(userId);
    }
    currentUser = await api.users.me();
    updateNavUser();
    loadProfileFriends();
    showToast('Friend added!', 'success');
  } catch (err) {
    if (btn) { btn.disabled = false; btn.textContent = 'Accept'; }
    showError('addFriendError', err.message);
  }
}

async function acceptFriendRequest(id) {
  try {
    await api.friends.accept(id);
    currentUser = await api.users.me();
    showToast('Friend added!', 'success');
    loadProfileFriends();
    renderProfileCard(currentUser);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function declineFriendRequest(id) {
  try {
    await api.friends.remove(id);
    loadProfileFriends();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function removeFriend(friendId) {
  if (!confirm('Remove this friend?')) return;
  try {
    // friendId here is the user id, need to find the friend record
    const friends = await api.friends.list();
    // We passed user id, not record id - find by matching
    // Actually renderProfileFriendsList passes f.id which is user id not record id
    // Let's pass correct info - we need to refetch friend status
    const status = await api.friends.status(friendId);
    if (status.id) await api.friends.remove(status.id);
    currentUser = await api.users.me();
    showToast('Friend removed.', 'success');
    loadProfileFriends();
    renderProfileCard(currentUser);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ===== VERIFY ACCOUNT =====
let verifyingAccountId = null;
let verifyingSlug = null;
let verifySupport = null;

async function openVerifyModal(accountId, slug) {
  verifyingAccountId = accountId;
  verifyingSlug = slug;
  hideError('verifyError');
  document.getElementById('verifySuccess').style.display = 'none';
  document.getElementById('verifyRiotGroup').style.display = 'none';
  document.getElementById('verifySteamGroup').style.display = 'none';

  if (!verifySupport) {
    try { verifySupport = await api.verify.support(); } catch { verifySupport = {}; }
  }

  const info = verifySupport[slug];
  if (!info || !info.available) {
    showToast('Verification not available for this game (API key not configured).', 'error');
    return;
  }

  document.getElementById('verifyModalTitle').textContent = `✓ Verify ${slug.toUpperCase()} Account`;
  const desc = document.getElementById('verifyDescription');

  if (info.method === 'riot') {
    desc.textContent = `Enter your Riot ID to verify your ${slug.toUpperCase()} account via the Riot Games API. Your rank will be confirmed directly.`;
    document.getElementById('verifyRiotGroup').style.display = '';
    document.getElementById('verifyRiotId').value = '';
  } else if (info.method === 'steam') {
    desc.textContent = `Enter your Steam ID or profile URL name to verify your ${slug.toUpperCase()} account via the Steam API.`;
    document.getElementById('verifySteamGroup').style.display = '';
    document.getElementById('verifySteamId').value = '';
  }

  openModal('verifyAccountModal');
}

async function submitVerifyAccount() {
  hideError('verifyError');
  const btn = document.getElementById('verifySubmitBtn');
  btn.disabled = true; btn.textContent = 'Verifying...';

  try {
    let res;
    if (verifySupport[verifyingSlug]?.method === 'riot') {
      const riotId = document.getElementById('verifyRiotId').value.trim();
      if (!riotId) { showError('verifyError', 'Enter your Riot ID'); btn.disabled = false; btn.textContent = '✓ Verify'; return; }
      res = await api.verify.riot(verifyingAccountId, riotId);
    } else if (verifySupport[verifyingSlug]?.method === 'steam') {
      const steamId = document.getElementById('verifySteamId').value.trim();
      if (!steamId) { showError('verifyError', 'Enter your Steam ID'); btn.disabled = false; btn.textContent = '✓ Verify'; return; }
      res = await api.verify.steam(verifyingAccountId, steamId);
    }
    document.getElementById('verifySuccess').style.display = '';
    document.getElementById('verifySuccess').textContent = `Account verified! ${res.rankUpdated ? 'Rank updated from API.' : ''}`;
    currentUser = await api.users.me();
    updateNavUser();
    setTimeout(() => { closeAllModals(); renderProfileGames(currentUser.accounts); }, 1800);
  } catch (err) {
    showError('verifyError', err.message);
  } finally {
    btn.disabled = false; btn.textContent = '✓ Verify';
  }
}

// ===== AVATAR HELPER =====
function buildAvatarHtml(user, size = 'sm') {
  if (user.avatar_url) {
    return `<div class="avatar-${size}" style="background:none;background-image:url(${user.avatar_url});background-size:cover;background-position:center"></div>`;
  }
  return `<div class="avatar-${size}" style="background:${user.avatar_color || '#6366f1'}">${(user.gamertag || user.username || '?')[0].toUpperCase()}</div>`;
}

// ===== CONNECT GAME MODAL =====
function openConnectGame(gameId, gameSlug, gameName, ranks) {
  connectingGameId = gameId;
  connectingGameSlug = gameSlug;
  connectingGameRanks = ranks;
  detectedRankIndices = null;
  document.getElementById('connectGameTitle').textContent = `Connect ${gameName}`;
  hideError('connectGameError');

  const useTrackerGG = !!(verifySupport?.[gameSlug]?.method === 'trackergg');

  const apiMode = document.getElementById('connectApiMode');
  const manualMode = document.getElementById('connectManualMode');
  const lookupBtn = document.getElementById('connectLookupBtn');
  const confirmBtn = document.getElementById('connectApiConfirmBtn');
  const connectBtn = document.getElementById('connectGameBtn');

  if (useTrackerGG) {
    // Tracker.gg mode: show URL input only
    apiMode.style.display = '';
    manualMode.style.display = 'none';
    lookupBtn.style.display = '';
    confirmBtn.style.display = 'none';
    connectBtn.style.display = 'none';

    document.getElementById('connectApiLabel').textContent = 'Tracker.gg Profile URL';
    document.getElementById('connectApiIdentifier').type = 'url';
    document.getElementById('connectApiIdentifier').placeholder = `https://tracker.gg/${gameSlug}/profile/...`;
    document.getElementById('connectApiHelp').textContent = 'Paste your tracker.gg profile URL. Your ranks will be auto-detected.';
    document.getElementById('connectApiIdentifier').value = '';
    document.getElementById('connectApiPreview').style.display = 'none';
  } else {
    // Manual mode
    apiMode.style.display = 'none';
    manualMode.style.display = '';
    lookupBtn.style.display = 'none';
    confirmBtn.style.display = 'none';
    connectBtn.style.display = '';

    const currentSel = document.getElementById('connectCurrentRank');
    const peakSel = document.getElementById('connectPeakRank');
    currentSel.innerHTML = ranks.map((r, i) => `<option value="${i}">${r.name}</option>`).join('');
    peakSel.innerHTML = ranks.map((r, i) => `<option value="${i}">${r.name}</option>`).join('');
    currentSel.onchange = () => {
      const curIdx = parseInt(currentSel.value);
      if (parseInt(peakSel.value) < curIdx) peakSel.value = curIdx;
    };
    document.getElementById('connectUsername').value = '';
    document.getElementById('connectTrackerUrl').value = '';
  }

  openModal('connectGameModal');
}

async function lookupGameRank() {
  const btn = document.getElementById('connectLookupBtn');
  const identifier = document.getElementById('connectApiIdentifier').value.trim();
  if (!identifier) { showError('connectGameError', 'Please enter a tracker.gg profile URL'); return; }

  btn.disabled = true;
  btn.textContent = '🔍 Looking up...';
  hideError('connectGameError');
  document.getElementById('connectApiPreview').style.display = 'none';

  try {
    const result = await api.verify.lookup({ slug: connectingGameSlug, identifier });
    detectedRankIndices = result;

    document.getElementById('connectApiPreviewName').textContent = result.username || identifier;
    document.getElementById('connectApiPreviewCur').textContent = result.current_rank?.name || 'Unranked';
    document.getElementById('connectApiPreviewCur').style.color = result.current_rank?.color || '#6b7280';
    document.getElementById('connectApiPreviewPeak').textContent = result.peak_rank?.name || 'Unranked';
    document.getElementById('connectApiPreviewPeak').style.color = result.peak_rank?.color || '#6b7280';
    document.getElementById('connectApiPreview').style.display = '';

    document.getElementById('connectApiConfirmBtn').style.display = '';
  } catch (err) {
    showError('connectGameError', err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = '🔍 Look Up Rank';
  }
}

async function confirmApiConnect() {
  if (!detectedRankIndices) return;
  const btn = document.getElementById('connectApiConfirmBtn');
  btn.disabled = true;
  hideError('connectGameError');
  try {
    const trackerUrl = document.getElementById('connectApiIdentifier').value.trim();
    await api.games.connect({
      game_id: connectingGameId,
      platform_username: detectedRankIndices.username || trackerUrl,
      platform: detectedRankIndices.platform || 'PC',
      current_rank_index: detectedRankIndices.current_rank_index,
      peak_rank_index: detectedRankIndices.peak_rank_index,
      tracker_url: trackerUrl || null,
      verified: true,
    });
    currentUser = await api.users.me();
    updateNavUser();
    closeAllModals();
    showToast('Game account connected and verified!', 'success');
    await loadGames();
  } catch (err) {
    showError('connectGameError', err.message);
  } finally {
    btn.disabled = false;
  }
}

async function submitConnectGame() {
  const btn = document.getElementById('connectGameBtn');
  btn.disabled = true;
  hideError('connectGameError');
  try {
    const trackerUrl = document.getElementById('connectTrackerUrl').value.trim();
    await api.games.connect({
      game_id: connectingGameId,
      platform_username: document.getElementById('connectUsername').value.trim(),
      platform: document.getElementById('connectPlatform').value,
      current_rank_index: parseInt(document.getElementById('connectCurrentRank').value),
      peak_rank_index: parseInt(document.getElementById('connectPeakRank').value),
      tracker_url: trackerUrl || null,
    });
    currentUser = await api.users.me();
    updateNavUser();
    closeAllModals();
    showToast('Game account connected!', 'success');
    await loadGames();
  } catch (err) {
    showError('connectGameError', err.message);
  } finally {
    btn.disabled = false;
  }
}

// ===== UPDATE RANK MODAL =====
function openUpdateRank(accountId, ranks, currentIdx, peakIdx, trackerUrl) {
  updatingAccountId = accountId;
  updatingAccountRanks = ranks;
  updatingAccountTrackerUrl = trackerUrl || '';
  document.getElementById('updateRankTitle').textContent = 'Update Rank';
  hideError('updateRankError');

  const currentSel = document.getElementById('updateCurrentRank');
  const peakSel = document.getElementById('updatePeakRank');
  currentSel.innerHTML = ranks.map((r, i) => `<option value="${i}">${r.name}</option>`).join('');
  peakSel.innerHTML = ranks.map((r, i) => `<option value="${i}">${r.name}</option>`).join('');
  currentSel.value = currentIdx;
  peakSel.value = peakIdx;
  document.getElementById('updateTrackerUrl').value = trackerUrl || '';

  currentSel.onchange = () => {
    const curIdx = parseInt(currentSel.value);
    if (parseInt(peakSel.value) < curIdx) peakSel.value = curIdx;
  };

  openModal('updateRankModal');
}

async function submitUpdateRank() {
  hideError('updateRankError');
  try {
    const trackerUrl = document.getElementById('updateTrackerUrl').value.trim();
    const res = await api.games.update(updatingAccountId, {
      current_rank_index: parseInt(document.getElementById('updateCurrentRank').value),
      peak_rank_index: parseInt(document.getElementById('updatePeakRank').value),
      tracker_url: trackerUrl || null,
    });
    currentUser = await api.users.me();
    updateNavUser();
    closeAllModals();
    showToast(`Rank updated! New Gamerscore: ${formatScore(res.gamerscore)}`, 'success');
    const page = document.querySelector('.page.active');
    if (page && page.id === 'page-dashboard') await loadDashboard();
    else if (page && page.id === 'page-games') await loadGames();
  } catch (err) {
    showError('updateRankError', err.message);
  }
}

async function disconnectAccount() {
  if (!confirm('Disconnect this game account?')) return;
  try {
    await api.games.disconnect(updatingAccountId);
    currentUser = await api.users.me();
    updateNavUser();
    closeAllModals();
    showToast('Account disconnected.', 'success');
    const page = document.querySelector('.page.active');
    if (page && page.id === 'page-dashboard') await loadDashboard();
    else await loadGames();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ===== CREATE CLUB MODAL =====
function openCreateClub() {
  hideError('createClubError');
  document.getElementById('clubName').value = '';
  document.getElementById('clubTag').value = '';
  document.getElementById('clubDesc').value = '';
  document.getElementById('clubMotto').value = '';

  const swatches = document.getElementById('clubColorSwatches');
  swatches.innerHTML = AVATAR_COLORS.map((c, i) => `
    <div class="color-swatch ${i === 0 ? 'selected' : ''}" style="background:${c}" onclick="selectClubColor('${c}', this)"></div>
  `).join('');

  openModal('createClubModal');
}

function selectClubColor(color, el) {
  document.querySelectorAll('#clubColorSwatches .color-swatch').forEach(s => s.classList.remove('selected'));
  el.classList.add('selected');
}

async function submitCreateClub() {
  hideError('createClubError');
  const selectedColor = document.querySelector('#clubColorSwatches .color-swatch.selected');
  try {
    await api.clubs.create({
      name: document.getElementById('clubName').value.trim(),
      tag: document.getElementById('clubTag').value.trim().toUpperCase(),
      description: document.getElementById('clubDesc').value.trim(),
      motto: document.getElementById('clubMotto').value.trim(),
      club_color: selectedColor ? selectedColor.style.background : '#6366f1',
    });
    currentUser = await api.users.me();
    userClubId = currentUser.club ? currentUser.club.id : null;
    updateNavUser();
    closeAllModals();
    showToast('Club created!', 'success');
    await loadClubs();
  } catch (err) {
    showError('createClubError', err.message);
  }
}

// ===== EDIT CLUB MODAL =====
async function openEditClub(clubId) {
  editingClubId = clubId;
  hideError('editClubError');
  try {
    const club = await api.clubs.get(clubId);
    document.getElementById('editClubDesc').value = club.description || '';
    document.getElementById('editClubMotto').value = club.motto || '';
    document.getElementById('editClubRecruit').value = club.recruit_open ? '1' : '0';

    const currentColor = club.club_color || '#6366f1';
    const swatches = document.getElementById('editClubColorSwatches');
    swatches.innerHTML = AVATAR_COLORS.map(c => `
      <div class="color-swatch ${c === currentColor ? 'selected' : ''}" style="background:${c}" onclick="selectEditClubColor('${c}', this)"></div>
    `).join('');

    openModal('editClubModal');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function selectEditClubColor(color, el) {
  document.querySelectorAll('#editClubColorSwatches .color-swatch').forEach(s => s.classList.remove('selected'));
  el.classList.add('selected');
}

async function submitEditClub() {
  hideError('editClubError');
  const selectedColor = document.querySelector('#editClubColorSwatches .color-swatch.selected');
  try {
    await api.clubs.update(editingClubId, {
      description: document.getElementById('editClubDesc').value.trim(),
      motto: document.getElementById('editClubMotto').value.trim(),
      club_color: selectedColor ? selectedColor.style.background : '#6366f1',
      recruit_open: document.getElementById('editClubRecruit').value === '1',
    });
    closeAllModals();
    showToast('Club updated!', 'success');
    await renderMyClub(editingClubId);
    await loadAllClubs();
  } catch (err) {
    showError('editClubError', err.message);
  }
}

// ===== CHALLENGE MODAL =====
async function openChallengeModal() {
  if (!userClubId) return;
  hideError('challengeError');
  try {
    const clubs = await api.clubs.list();
    const others = clubs.filter(c => c.id !== userClubId);
    const sel = document.getElementById('challengeTargetSelect');
    sel.innerHTML = others.map(c => `<option value="${c.id}">[${c.tag}] ${c.name} (Score: ${formatScore(c.club_score)})</option>`).join('');
    if (!others.length) sel.innerHTML = '<option disabled>No other clubs available</option>';
    openModal('challengeModal');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function submitChallenge() {
  hideError('challengeError');
  const challenged_id = parseInt(document.getElementById('challengeTargetSelect').value);
  if (!challenged_id) return showError('challengeError', 'Please select a club');
  try {
    await api.clubs.challenge(userClubId, { challenged_id });
    closeAllModals();
    showToast('Challenge issued!', 'success');
    await loadClubs();
  } catch (err) {
    showError('challengeError', err.message);
  }
}

// ===== OPEN CHALLENGE MODAL =====
async function openOpenChallengeModal() {
  if (!userClubId) return;
  hideError('openChallengeError');
  document.getElementById('openChallengeDesc').value = '';

  try {
    const club = await api.clubs.get(userClubId);

    // Render member checkboxes
    const membersEl = document.getElementById('openChallengeMembers');
    membersEl.innerHTML = club.members.map(m => `
      <label class="member-check-row">
        <input type="checkbox" value="${m.id}" />
        <div class="avatar-sm" style="background:${m.avatar_color || '#6366f1'}">${(m.gamertag || m.username)[0].toUpperCase()}</div>
        <div class="member-info">
          <div class="member-name">${escapeHtml(m.gamertag || m.username)}</div>
          <div class="member-gs mono">${formatScore(m.gamerscore)} GS</div>
        </div>
        <span class="member-role">${m.role}</span>
      </label>
    `).join('');

    // Render game chips
    const gamesEl = document.getElementById('openChallengeGames');
    gamesEl.innerHTML = allGames.map(g => `
      <label class="game-check-chip">
        <input type="checkbox" value="${g.id}" onchange="this.parentElement.classList.toggle('selected', this.checked)" />
        ${g.icon} ${g.name}
      </label>
    `).join('');

    openModal('openChallengeModal');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function submitOpenChallenge() {
  hideError('openChallengeError');
  const memberIds = Array.from(document.querySelectorAll('#openChallengeMembers input:checked')).map(i => parseInt(i.value));
  const gameIds = Array.from(document.querySelectorAll('#openChallengeGames input:checked')).map(i => parseInt(i.value));
  const description = document.getElementById('openChallengeDesc').value.trim();

  if (!memberIds.length) return showError('openChallengeError', 'Select at least one participating member');
  if (!gameIds.length) return showError('openChallengeError', 'Select at least one game');

  try {
    await api.clubs.postOpenChallenge(userClubId, { participant_ids: memberIds, game_ids: gameIds, description });
    closeAllModals();
    showToast('Open challenge posted!', 'success');
    await loadOpenChallenges();
  } catch (err) {
    showError('openChallengeError', err.message);
  }
}

// ===== ACCEPT OPEN CHALLENGE MODAL =====
async function openAcceptOpenChallenge(challengeId, challengeData) {
  if (!userClubId) { showToast('You need to be in a club to accept challenges', 'error'); return; }
  acceptingOpenChallengeId = challengeId;
  hideError('acceptOpenChallengeError');

  const infoEl = document.getElementById('acceptChallengeInfo');
  const gamesStr = (challengeData.games || []).map(g => `${g.icon} ${g.name}`).join(', ');
  const participantsStr = (challengeData.participants || []).map(p => p.gamertag || p.username).join(', ');
  infoEl.innerHTML = `
    <div style="font-size:0.82rem;color:var(--text-2)">
      <div style="font-weight:700;font-size:0.9rem;color:var(--text);margin-bottom:0.4rem">Challenge from [${challengeData.club_tag}] ${escapeHtml(challengeData.club_name)}</div>
      ${challengeData.description ? `<div style="margin-bottom:0.3rem;font-style:italic">"${escapeHtml(challengeData.description)}"</div>` : ''}
      ${gamesStr ? `<div>Games: ${escapeHtml(gamesStr)}</div>` : ''}
      ${participantsStr ? `<div>Their participants: ${escapeHtml(participantsStr)}</div>` : ''}
    </div>
  `;

  try {
    const myClub = await api.clubs.get(userClubId);
    const membersEl = document.getElementById('acceptOpenChallengeMembers');
    membersEl.innerHTML = myClub.members.map(m => `
      <label class="member-check-row">
        <input type="checkbox" value="${m.id}" />
        <div class="avatar-sm" style="background:${m.avatar_color || '#6366f1'}">${(m.gamertag || m.username)[0].toUpperCase()}</div>
        <div class="member-info">
          <div class="member-name">${escapeHtml(m.gamertag || m.username)}</div>
          <div class="member-gs mono">${formatScore(m.gamerscore)} GS</div>
        </div>
        <span class="member-role">${m.role}</span>
      </label>
    `).join('');
    openModal('acceptOpenChallengeModal');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function submitAcceptOpenChallenge() {
  hideError('acceptOpenChallengeError');
  const memberIds = Array.from(document.querySelectorAll('#acceptOpenChallengeMembers input:checked')).map(i => parseInt(i.value));
  if (!memberIds.length) return showError('acceptOpenChallengeError', 'Select at least one participating member');

  try {
    const res = await api.clubs.acceptOpenChallenge(acceptingOpenChallengeId, { participant_ids: memberIds });
    closeAllModals();
    if (res.match_id) {
      showToast('Challenge accepted! Opening match room...', 'success');
      location.hash = `#/match?id=${res.match_id}`;
    } else {
      showToast('Challenge accepted!', 'success');
      currentUser = await api.users.me();
      await loadClubs();
    }
  } catch (err) {
    showError('acceptOpenChallengeError', err.message);
  }
}

// ===== MODAL HELPERS =====
function openModal(id) {
  closeAllModals();
  document.getElementById('modalOverlay').classList.add('open');
  document.getElementById(id).classList.add('open');
  activeModal = id;
}

function closeAllModals() {
  document.getElementById('modalOverlay').classList.remove('open');
  document.querySelectorAll('.modal').forEach(m => m.classList.remove('open'));
  activeModal = null;
}

function closeModal(e) {
  if (e.target === document.getElementById('modalOverlay')) closeAllModals();
}

// ===== TOAST =====
let toastTimer;
function showToast(msg, type = 'success') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast ${type} show`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.classList.remove('show'); }, 3500);
}

// ===== TEAMS PAGE =====
let invitingTeamId = null;
let postingChallengeTeamId = null;
let acceptingTeamChallengeId = null;
let teamDebounce;

async function loadTeamsPage() {
  if (!currentUser) return;
  try { currentUser = await api.users.me(); } catch { return; }

  // Populate game filters
  const gameFilters = [document.getElementById('teamFilterGame'), document.getElementById('teamChallengeFilterGame')];
  gameFilters.forEach(sel => {
    if (!sel) return;
    const cur = sel.value;
    sel.innerHTML = '<option value="">All Games</option>' +
      allGames.map(g => `<option value="${g.id}" ${String(g.id) === cur ? 'selected' : ''}>${g.icon} ${g.name}</option>`).join('');
  });

  // Populate create team game select
  const teamGameSel = document.getElementById('teamGameSelect');
  if (teamGameSel) teamGameSel.innerHTML = allGames.map(g => `<option value="${g.id}">${g.icon} ${g.name}</option>`).join('');

  await Promise.all([loadMyTeams(), loadAllTeams(), loadOpenTeamChallenges()]);
}

async function loadMyTeams() {
  const el = document.getElementById('myTeamsList');
  try {
    const teams = await api.teams.mine();
    if (!teams.length) {
      el.innerHTML = '<p class="text-muted" style="font-size:0.875rem">You\'re not on any teams yet.</p>';
    } else {
      el.innerHTML = teams.map(t => renderTeamCard(t, true)).join('');
    }
    // Load invites
    const invites = await api.teams.myInvites();
    const invSection = document.getElementById('teamInvitesSection');
    const invList = document.getElementById('teamInvitesList');
    if (invites.length) {
      invSection.style.display = '';
      invList.innerHTML = invites.map(inv => `
        <div class="challenge-card" style="display:flex;align-items:center;gap:1rem;flex-wrap:wrap">
          <div style="flex:1">
            <div style="font-weight:700">${escapeHtml(inv.team_name)} <span style="font-size:0.75rem;color:var(--text-3)">[${inv.team_tag}]</span></div>
            <div style="font-size:0.8rem;color:var(--text-2)">${inv.game_icon} ${escapeHtml(inv.game_name)} · Role: ${inv.role}</div>
            <div style="font-size:0.75rem;color:var(--text-3)">From: ${escapeHtml(inv.inviter_gamertag || inv.inviter_username)}</div>
          </div>
          <div style="display:flex;gap:0.4rem">
            <button class="btn btn-success btn-sm" onclick="respondTeamInvite(${inv.id}, 'accept')">Accept</button>
            <button class="btn btn-ghost btn-sm" onclick="respondTeamInvite(${inv.id}, 'decline')">Decline</button>
          </div>
        </div>
      `).join('');
    } else {
      invSection.style.display = 'none';
    }
    await loadActiveMatches('myTeamMatches', 'myTeamMatchesSection', 'team');
  } catch (err) {
    el.innerHTML = '<p class="text-muted">Failed to load teams.</p>';
  }
}

function renderTeamCard(t, isMine) {
  const isOwner = t.owner_id === currentUser.id;
  return `
  <div class="club-card" style="--club-accent:${t.game_color || '#6366f1'}">
    <div class="club-card-header">
      <div class="club-card-title">${t.game_icon || '🎮'} ${escapeHtml(t.name)}</div>
      <span class="club-card-tag">${t.tag}</span>
    </div>
    <div style="font-size:0.78rem;color:var(--text-2);margin-bottom:0.5rem">${escapeHtml(t.game_name)} · ${t.member_count || 0} members</div>
    <div class="club-card-stats">
      <div class="club-stat"><div class="club-stat-val mono">${t.wins || 0}</div><div class="club-stat-lbl">Wins</div></div>
      <div class="club-stat"><div class="club-stat-val text-red mono">${t.losses || 0}</div><div class="club-stat-lbl">Losses</div></div>
      <div class="club-stat">
        <div class="club-stat-val mono" style="${(t.elo_matches || 0) >= 5 ? 'color:#fbbf24' : ''}">${(t.elo_matches || 0) >= 5 ? formatScore(t.elo) : '—'}</div>
        <div class="club-stat-lbl">ELO</div>
      </div>
    </div>
    <div style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-top:0.5rem">
      <button class="btn btn-ghost btn-sm" onclick="openTeamDetail(${t.id})">View</button>
      ${isMine && isOwner ? `<button class="btn btn-cyan btn-sm" onclick="openPostTeamChallenge(${t.id})">⚡ Challenge</button>` : ''}
      ${isMine ? `<button class="btn btn-ghost btn-sm text-red" onclick="leaveTeam(${t.id})">${isOwner ? 'Disband' : 'Leave'}</button>` : ''}
    </div>
  </div>`;
}

async function loadAllTeams() {
  const gameId = document.getElementById('teamFilterGame')?.value;
  const search = document.getElementById('teamSearch')?.value;
  const el = document.getElementById('allTeamsGrid');
  try {
    const teams = await api.teams.list(gameId, search);
    if (!teams.length) {
      el.innerHTML = '<div class="empty-state"><span class="empty-icon">🎮</span><p>No teams found.</p></div>';
      return;
    }
    el.innerHTML = teams.map(t => renderTeamCard(t, false)).join('');
  } catch (err) {
    el.innerHTML = '<p class="text-muted">Failed to load teams.</p>';
  }
}

function debounceLoadTeams() {
  clearTimeout(teamDebounce);
  teamDebounce = setTimeout(loadAllTeams, 300);
}

async function loadOpenTeamChallenges() {
  const gameId = document.getElementById('teamChallengeFilterGame')?.value;
  const el = document.getElementById('openTeamChallengesList');
  try {
    const challenges = await api.teams.openChallenges(gameId);
    if (!challenges.length) {
      el.innerHTML = '<p class="text-muted" style="font-size:0.875rem;padding:0.5rem 0">No open team challenges.</p>';
      return;
    }
    el.innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:1rem">
      ${challenges.map(c => `
        <div class="open-challenge-card">
          <div style="font-weight:800">${escapeHtml(c.team_name)} <span style="font-size:0.75rem;color:var(--text-3)">[${c.team_tag}]</span></div>
          <div style="font-size:0.8rem;color:var(--text-2);margin:0.25rem 0">${c.game_icon} ${escapeHtml(c.game_name)}</div>
          ${c.description ? `<div style="font-size:0.78rem;color:var(--text-3);margin-bottom:0.5rem">"${escapeHtml(c.description)}"</div>` : ''}
          <div style="font-size:0.75rem;color:var(--text-3);margin-bottom:0.75rem">${c.participant_count} participants</div>
          <button class="btn btn-success btn-sm" onclick="openAcceptTeamChallenge(${c.id}, ${JSON.stringify(c).replace(/"/g, '&quot;')})">⚡ Accept</button>
        </div>
      `).join('')}
    </div>`;
  } catch (err) {
    el.innerHTML = '<p class="text-muted">Failed to load challenges.</p>';
  }
}

function openCreateTeamModal() {
  hideError('createTeamError');
  document.getElementById('teamName').value = '';
  document.getElementById('teamTag').value = '';
  openModal('createTeamModal');
}

async function submitCreateTeam() {
  hideError('createTeamError');
  try {
    await api.teams.create({
      name: document.getElementById('teamName').value.trim(),
      tag: document.getElementById('teamTag').value.trim().toUpperCase(),
      game_id: parseInt(document.getElementById('teamGameSelect').value),
    });
    closeAllModals();
    showToast('Team created!', 'success');
    await loadTeamsPage();
  } catch (err) {
    showError('createTeamError', err.message);
  }
}

async function openTeamDetail(teamId) {
  try {
    const team = await api.teams.get(teamId);
    const isOwner = team.owner_id === currentUser.id;
    const isMember = team.members?.some(m => m.id === currentUser.id);
    document.getElementById('teamDetailTitle').textContent = `${team.game_icon || '🎮'} ${team.name} [${team.tag}]`;
    document.getElementById('teamDetailBody').innerHTML = `
      <div style="margin-bottom:1rem">
        <div style="color:var(--text-2);font-size:0.85rem;margin-bottom:0.5rem">${escapeHtml(team.game_name)}</div>
        <div class="my-club-stats" style="margin-bottom:1rem">
          <div class="club-stat"><div class="club-stat-val club-wins-val mono">${team.wins}</div><div class="club-stat-lbl">Wins</div></div>
          <div class="club-stat"><div class="club-stat-val text-red mono">${team.losses}</div><div class="club-stat-lbl">Losses</div></div>
          <div class="club-stat"><div class="club-stat-val mono">${formatScore(team.team_score)}</div><div class="club-stat-lbl">Score</div></div>
        </div>
      </div>
      <div class="members-list">
        ${(team.members || []).map(m => `
          <div class="member-row">
            ${buildAvatarHtml(m, 'sm')}
            <div class="member-info">
              <div class="member-name">${escapeHtml(m.gamertag || m.username)}</div>
              <div class="member-gs mono">${formatScore(m.gamerscore)} GS</div>
            </div>
            <span class="member-role">${m.role}</span>
            ${isOwner && m.id !== currentUser.id ? `<button class="btn btn-ghost btn-sm" style="font-size:0.68rem" onclick="kickTeamMember(${team.id}, ${m.id})">Kick</button>` : ''}
          </div>
        `).join('')}
      </div>`;
    document.getElementById('teamDetailFooter').innerHTML = `
      ${isOwner ? `<button class="btn btn-primary btn-sm" onclick="openInvitePlayer(${team.id})">Invite Player</button>` : ''}
      <div style="flex:1"></div>
      <button class="btn btn-ghost" onclick="closeAllModals()">Close</button>
    `;
    openModal('teamDetailModal');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function openInvitePlayer(teamId) {
  invitingTeamId = teamId;
  document.getElementById('inviteUsername').value = '';
  document.getElementById('inviteRole').value = 'player';
  hideError('teamInviteError');
  openModal('teamInviteModal');
}

async function submitInvitePlayer() {
  hideError('teamInviteError');
  try {
    await api.teams.invite(invitingTeamId, {
      username: document.getElementById('inviteUsername').value.trim(),
      role: document.getElementById('inviteRole').value,
    });
    closeAllModals();
    showToast('Invite sent!', 'success');
  } catch (err) {
    showError('teamInviteError', err.message);
  }
}

async function respondTeamInvite(inviteId, action) {
  try {
    await api.teams.respondInvite(inviteId, { action });
    showToast(action === 'accept' ? 'Joined team!' : 'Invite declined.', 'success');
    await loadMyTeams();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function leaveTeam(teamId) {
  if (!confirm('Leave/disband this team?')) return;
  try {
    await api.teams.leave(teamId);
    showToast('Left team.', 'success');
    await loadTeamsPage();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function kickTeamMember(teamId, userId) {
  if (!confirm('Kick this player?')) return;
  try {
    await api.teams.kick(teamId, userId);
    showToast('Player kicked.', 'success');
    await openTeamDetail(teamId);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function openPostTeamChallenge(teamId) {
  postingChallengeTeamId = teamId;
  hideError('postTeamChallengeError');
  document.getElementById('teamChallengeDesc').value = '';
  try {
    const team = await api.teams.get(teamId);
    document.getElementById('teamChallengeParticipants').innerHTML = (team.members || []).map(m => `
      <label class="member-check-row">
        <input type="checkbox" value="${m.id}" />
        ${buildAvatarHtml(m, 'sm')}
        <div class="member-info">
          <div class="member-name">${escapeHtml(m.gamertag || m.username)}</div>
          <div class="member-gs mono">${formatScore(m.gamerscore)} GS</div>
        </div>
        <span class="member-role">${m.role}</span>
      </label>`).join('');
    openModal('postTeamChallengeModal');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function submitPostTeamChallenge() {
  hideError('postTeamChallengeError');
  const participants = Array.from(document.querySelectorAll('#teamChallengeParticipants input:checked')).map(i => parseInt(i.value));
  if (!participants.length) return showError('postTeamChallengeError', 'Select at least one participant');
  try {
    await api.teams.postChallenge(postingChallengeTeamId, {
      participant_ids: participants,
      description: document.getElementById('teamChallengeDesc').value.trim(),
    });
    closeAllModals();
    showToast('Challenge posted!', 'success');
    await loadOpenTeamChallenges();
  } catch (err) {
    showError('postTeamChallengeError', err.message);
  }
}

async function openAcceptTeamChallenge(challengeId, challengeData) {
  acceptingTeamChallengeId = challengeId;
  hideError('acceptTeamChallengeError');
  document.getElementById('acceptTeamChallengeInfo').innerHTML = `
    <div style="font-size:0.82rem">
      <div style="font-weight:700;margin-bottom:0.3rem">${challengeData.game_icon} ${escapeHtml(challengeData.game_name)}</div>
      <div>From: ${escapeHtml(challengeData.team_name)} [${challengeData.team_tag}]</div>
      ${challengeData.description ? `<div style="font-style:italic;color:var(--text-2)">"${escapeHtml(challengeData.description)}"</div>` : ''}
    </div>`;
  try {
    // Load my teams for this game
    const myTeams = await api.teams.mine();
    const gameTeams = myTeams.filter(t => t.game_id === challengeData.game_id);
    const sel = document.getElementById('acceptTeamSelect');
    if (!gameTeams.length) {
      showToast(`You need a ${challengeData.game_name} team to accept this challenge.`, 'error');
      return;
    }
    sel.innerHTML = gameTeams.map(t => `<option value="${t.id}">[${t.tag}] ${t.name}</option>`).join('');

    const firstTeam = await api.teams.get(gameTeams[0].id);
    document.getElementById('acceptTeamParticipants').innerHTML = (firstTeam.members || []).map(m => `
      <label class="member-check-row">
        <input type="checkbox" value="${m.id}" />
        ${buildAvatarHtml(m, 'sm')}
        <div class="member-info">
          <div class="member-name">${escapeHtml(m.gamertag || m.username)}</div>
        </div>
      </label>`).join('');

    sel.onchange = async () => {
      const t = await api.teams.get(parseInt(sel.value));
      document.getElementById('acceptTeamParticipants').innerHTML = (t.members || []).map(m => `
        <label class="member-check-row">
          <input type="checkbox" value="${m.id}" />
          ${buildAvatarHtml(m, 'sm')}
          <div class="member-info"><div class="member-name">${escapeHtml(m.gamertag || m.username)}</div></div>
        </label>`).join('');
    };
    openModal('acceptTeamChallengeModal');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function submitAcceptTeamChallenge() {
  hideError('acceptTeamChallengeError');
  const teamId = parseInt(document.getElementById('acceptTeamSelect').value);
  const participants = Array.from(document.querySelectorAll('#acceptTeamParticipants input:checked')).map(i => parseInt(i.value));
  if (!participants.length) return showError('acceptTeamChallengeError', 'Select at least one participant');
  try {
    await api.teams.acceptChallenge(acceptingTeamChallengeId, { team_id: teamId, participant_ids: participants });
    closeAllModals();
    showToast('Challenge accepted!', 'success');
    await loadTeamsPage();
  } catch (err) {
    showError('acceptTeamChallengeError', err.message);
  }
}

// ===== UTILS =====
function formatScore(n) {
  return Number(n || 0).toLocaleString();
}

function showError(id, msg) {
  const el = document.getElementById(id);
  if (el) { el.textContent = msg; el.style.display = ''; }
}

function hideError(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = 'none';
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ===== MATCH PAGE =====
let _matchPollTimer = null;
let _matchLastMsgTime = null;

async function loadMatchPage() {
  const params = new URLSearchParams(location.hash.split('?')[1] || '');
  const matchId = params.get('id');
  const el = document.getElementById('matchPageContent');
  if (!matchId) {
    el.innerHTML = '<p class="text-muted" style="padding:2rem">No match ID specified.</p>';
    return;
  }
  clearInterval(_matchPollTimer);
  el.innerHTML = '<p class="text-muted" style="padding:2rem">Loading match...</p>';
  try {
    const match = await api.matches.get(matchId);
    _matchLastMsgTime = match.messages?.length ? match.messages[match.messages.length - 1].created_at : null;
    renderMatch(match);
    _matchPollTimer = setInterval(() => pollMatchMessages(matchId), 5000);
  } catch (err) {
    el.innerHTML = `<p class="text-muted" style="padding:2rem">${escapeHtml(err.message)}</p>`;
  }
}

function renderMatch(match) {
  const el = document.getElementById('matchPageContent');
  const isA = match.participant_a_ids.includes(currentUser.id);
  const isB = match.participant_b_ids.includes(currentUser.id);
  const myTeam = isA ? 'a' : 'b';

  const statusLabel = { active: 'In Progress', disputed: 'Disputed', completed: 'Completed' }[match.status] || match.status;
  const statusColor = { active: '#10b981', disputed: '#f59e0b', completed: '#6366f1' }[match.status] || '#888';

  const gameIcons = match.games.map(g => `<span title="${escapeHtml(g.name)}" style="font-size:1.25rem">${escapeHtml(g.icon || g.name[0])}</span>`).join(' ');

  function renderTeam(participants, label) {
    return `<div class="match-team" style="flex:1;min-width:220px">
      <div style="font-size:0.75rem;text-transform:uppercase;letter-spacing:0.08em;color:#888;margin-bottom:0.5rem">${label}</div>
      ${participants.map(p => {
        const initials = (p.gamertag || p.username || '?')[0].toUpperCase();
        const accountLines = match.games.map(g => {
          const acct = p.accounts.find(a => a.game_id === g.id);
          return acct
            ? `<div style="font-size:0.75rem;color:#a0a0b0;margin-left:1.75rem">${escapeHtml(g.icon || '')} <span style="color:#d0d0e0">${escapeHtml(acct.platform_username)}</span></div>`
            : `<div style="font-size:0.75rem;color:#555;margin-left:1.75rem">${escapeHtml(g.icon || '')} not connected</div>`;
        }).join('');
        return `<div style="margin-bottom:0.75rem">
          <div style="display:flex;align-items:center;gap:0.5rem">
            <div style="width:1.5rem;height:1.5rem;border-radius:50%;background:${escapeHtml(p.avatar_color||'#6366f1')};display:flex;align-items:center;justify-content:center;font-size:0.7rem;font-weight:700;color:#fff;flex-shrink:0">${initials}</div>
            <span style="font-weight:600;color:#e0e0f0">${escapeHtml(p.gamertag || p.username)}</span>
          </div>
          ${accountLines}
        </div>`;
      }).join('')}
    </div>`;
  }

  // Score reporting section
  let scoreSection = '';
  if (match.status === 'active' || match.status === 'disputed') {
    const myReported = isA ? match.reported_by_a : match.reported_by_b;
    const oppReported = isA ? match.reported_by_b : match.reported_by_a;
    const myScore = isA ? match.report_a_wins : match.report_b_wins;
    const oppScore = isA ? match.report_b_wins : match.report_a_wins;

    scoreSection = `<div class="card" style="margin-top:1.5rem;padding:1.25rem">
      <div style="font-size:1rem;font-weight:700;margin-bottom:1rem;color:#e0e0f0">Report Score</div>
      ${myReported
        ? `<p style="color:#a0a0b0;font-size:0.875rem">You reported: <strong style="color:#10b981">${myScore} wins</strong> for your team.
           ${oppReported ? `Opponent reported: <strong style="color:${match.report_a_wins === match.report_b_wins ? '#10b981' : '#ef4444'}">${oppScore} wins</strong>.` : 'Waiting for opponent to report.'}</p>`
        : `<div style="display:flex;align-items:center;gap:0.75rem;flex-wrap:wrap">
             <label style="color:#a0a0b0;font-size:0.875rem">My team won:</label>
             <input id="matchWinsInput" type="number" min="0" max="99" placeholder="Rounds won" style="width:120px;padding:0.4rem 0.6rem;background:#1a1a2e;border:1px solid #333;border-radius:6px;color:#e0e0f0;font-size:0.875rem" />
             <button class="btn btn-primary btn-sm" onclick="submitMatchReport(${match.id})">Submit Score</button>
           </div>`
      }
      ${match.status === 'disputed' ? `<div style="margin-top:1rem;padding:0.75rem;background:#2a1a0e;border:1px solid #7c3a0e;border-radius:8px;color:#fbbf24;font-size:0.875rem">
        Scores are disputed.${match.dispute_reason ? ` Reason: ${escapeHtml(match.dispute_reason)}` : ''}<br>
        <button class="btn btn-sm" style="margin-top:0.5rem;background:#7c3a0e;color:#fbbf24;border:none" onclick="openDisputeModal(${match.id})">Attach Proof / Update Dispute</button>
        ${myReported && oppReported ? `<button class="btn btn-sm" style="margin-top:0.5rem;margin-left:0.5rem;background:#1a3a2e;color:#10b981;border:1px solid #10b981" onclick="confirmMatchScore(${match.id})">Accept Opponent's Score</button>` : ''}
      </div>` : ''}
    </div>`;
  } else if (match.status === 'completed') {
    const winnerIsA = match.winner_entity_id === match.entity_a_id;
    scoreSection = `<div class="card" style="margin-top:1.5rem;padding:1.25rem;text-align:center">
      <div style="font-size:1.5rem;font-weight:800;color:#10b981;margin-bottom:0.5rem">Match Complete</div>
      <div style="font-size:1.1rem;color:#e0e0f0">${escapeHtml(match.score_a ?? 0)} — ${escapeHtml(match.score_b ?? 0)}</div>
      <div style="font-size:0.875rem;color:#a0a0b0;margin-top:0.25rem">
        ${winnerIsA ? 'Team A wins' : 'Team B wins'}${match.score_awarded ? ` · +${match.score_awarded} pts` : ''}
      </div>
    </div>`;
  }

  // Chat
  const chatHtml = `<div class="card" style="margin-top:1.5rem;padding:1.25rem">
    <div style="font-size:0.9rem;font-weight:700;margin-bottom:0.75rem;color:#e0e0f0">Match Chat</div>
    <div id="matchChatMessages" style="max-height:260px;overflow-y:auto;margin-bottom:0.75rem;display:flex;flex-direction:column;gap:0.4rem">
      ${renderChatMessages(match.messages || [])}
    </div>
    ${match.status !== 'completed' ? `<div style="display:flex;gap:0.5rem">
      <input id="matchChatInput" type="text" placeholder="Send a message..." maxlength="500"
        style="flex:1;padding:0.4rem 0.7rem;background:#1a1a2e;border:1px solid #333;border-radius:6px;color:#e0e0f0;font-size:0.875rem"
        onkeydown="if(event.key==='Enter')sendMatchChat(${match.id})" />
      <button class="btn btn-ghost btn-sm" onclick="sendMatchChat(${match.id})">Send</button>
    </div>` : ''}
  </div>`;

  el.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:0.5rem;margin-bottom:1.5rem">
      <div>
        <div style="font-size:0.75rem;color:#888;margin-bottom:0.25rem">Match #${match.id}</div>
        <h2 style="margin:0;font-size:1.5rem;font-weight:800;color:#e0e0f0">Active Match</h2>
        <div style="font-size:0.875rem;color:#a0a0b0;margin-top:0.25rem">Games: ${gameIcons}</div>
      </div>
      <span style="padding:0.35rem 0.9rem;border-radius:9999px;font-size:0.8rem;font-weight:700;background:${statusColor}22;color:${statusColor};border:1px solid ${statusColor}55">${statusLabel}</span>
    </div>

    <div class="card" style="padding:1.25rem">
      <div style="display:flex;gap:2rem;flex-wrap:wrap">
        ${renderTeam(match.participants_a, 'Team A')}
        <div style="display:flex;align-items:center;font-size:1.5rem;font-weight:800;color:#555;padding:0 0.5rem">vs</div>
        ${renderTeam(match.participants_b, 'Team B')}
      </div>
    </div>

    ${scoreSection}
    ${chatHtml}

    <!-- Dispute Modal -->
    <div id="disputeModalInline" style="display:none;margin-top:1rem;padding:1.25rem;background:#1a1a2e;border:1px solid #333;border-radius:12px">
      <div style="font-weight:700;color:#e0e0f0;margin-bottom:0.75rem">File / Update Dispute</div>
      <textarea id="disputeReason" placeholder="Describe the issue..." rows="3"
        style="width:100%;padding:0.5rem;background:#0e0e1a;border:1px solid #333;border-radius:6px;color:#e0e0f0;font-size:0.875rem;resize:vertical;margin-bottom:0.5rem"></textarea>
      <input id="disputeEvidence" type="url" placeholder="Evidence URL (screenshot, video, etc.) — optional"
        style="width:100%;padding:0.4rem 0.6rem;background:#0e0e1a;border:1px solid #333;border-radius:6px;color:#e0e0f0;font-size:0.875rem;margin-bottom:0.75rem" />
      <div style="display:flex;gap:0.5rem">
        <button class="btn btn-sm" style="background:#7c0e1a;color:#fca5a5;border:none" onclick="submitDispute(${match.id})">Submit Dispute</button>
        <button class="btn btn-ghost btn-sm" onclick="document.getElementById('disputeModalInline').style.display='none'">Cancel</button>
      </div>
      <div id="disputeError" class="error-msg" style="display:none;margin-top:0.5rem"></div>
    </div>
  `;

  scrollChatToBottom();
}

function renderChatMessages(messages) {
  if (!messages.length) return '<p style="color:#555;font-size:0.8rem;text-align:center">No messages yet.</p>';
  return messages.map(m => {
    const isMe = m.user_id === currentUser.id;
    const initials = (m.gamertag || m.username || '?')[0].toUpperCase();
    return `<div style="display:flex;align-items:flex-start;gap:0.5rem;${isMe ? 'flex-direction:row-reverse' : ''}">
      <div style="width:1.5rem;height:1.5rem;border-radius:50%;background:${escapeHtml(m.avatar_color||'#6366f1')};display:flex;align-items:center;justify-content:center;font-size:0.65rem;font-weight:700;color:#fff;flex-shrink:0">${initials}</div>
      <div style="max-width:70%;padding:0.35rem 0.65rem;border-radius:10px;background:${isMe ? '#2d2d6e' : '#1e1e35'};color:#e0e0f0;font-size:0.825rem">${escapeHtml(m.message)}</div>
    </div>`;
  }).join('');
}

function scrollChatToBottom() {
  const c = document.getElementById('matchChatMessages');
  if (c) c.scrollTop = c.scrollHeight;
}

async function pollMatchMessages(matchId) {
  try {
    const msgs = await api.matches.getMessages(matchId, _matchLastMsgTime);
    if (!msgs.length) return;
    _matchLastMsgTime = msgs[msgs.length - 1].created_at;
    const c = document.getElementById('matchChatMessages');
    if (!c) return;
    const atBottom = c.scrollHeight - c.scrollTop <= c.clientHeight + 10;
    c.insertAdjacentHTML('beforeend', renderChatMessages(msgs));
    if (atBottom) scrollChatToBottom();
  } catch {}
}

async function submitMatchReport(matchId) {
  const input = document.getElementById('matchWinsInput');
  const wins = parseInt(input?.value);
  if (isNaN(wins) || wins < 0) { showToast('Enter a valid number of wins.', 'error'); return; }
  try {
    const res = await api.matches.report(matchId, { rounds_won: wins });
    showToast(res.message || 'Score reported!', res.status === 'disputed' ? 'error' : 'success');
    const match = await api.matches.get(matchId);
    renderMatch(match);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function confirmMatchScore(matchId) {
  try {
    const res = await api.matches.confirm(matchId);
    showToast(res.message || 'Score confirmed!', 'success');
    const match = await api.matches.get(matchId);
    renderMatch(match);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function openDisputeModal(matchId) {
  document.getElementById('disputeModalInline').style.display = '';
}

async function submitDispute(matchId) {
  const reason = document.getElementById('disputeReason').value.trim();
  const evidence_url = document.getElementById('disputeEvidence').value.trim();
  if (!reason) { showError('disputeError', 'Please provide a reason.'); return; }
  hideError('disputeError');
  try {
    const res = await api.matches.dispute(matchId, { reason, evidence_url: evidence_url || undefined });
    showToast(res.message || 'Dispute submitted.', 'success');
    document.getElementById('disputeModalInline').style.display = 'none';
    const match = await api.matches.get(matchId);
    renderMatch(match);
  } catch (err) {
    showError('disputeError', err.message);
  }
}

async function sendMatchChat(matchId) {
  const input = document.getElementById('matchChatInput');
  const message = input?.value.trim();
  if (!message) return;
  input.value = '';
  try {
    const msg = await api.matches.sendMessage(matchId, { message });
    _matchLastMsgTime = msg.created_at;
    const c = document.getElementById('matchChatMessages');
    if (c) {
      c.insertAdjacentHTML('beforeend', renderChatMessages([msg]));
      scrollChatToBottom();
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ===== TOURNAMENTS =====

let _currentTournamentId = null;

async function loadClubTournaments(clubId) {
  const el = document.getElementById('clubTournamentsList');
  if (!el) return;
  try {
    const tournaments = await api.tournaments.forClub(clubId);
    if (!tournaments.length) {
      el.innerHTML = '<p class="text-muted" style="font-size:0.875rem">No tournaments yet.</p>';
      return;
    }
    el.innerHTML = tournaments.map(t => {
      const statusColor = { active: '#10b981', completed: '#f59e0b', pending: '#6366f1' }[t.status] || '#888';
      const statusLabel = { active: 'In Progress', completed: 'Completed', pending: 'Pending' }[t.status] || t.status;
      const winnerText = t.status === 'completed' && t.winner_gamertag
        ? `<div style="font-size:0.78rem;color:#fbbf24;margin-top:0.2rem">🏆 ${escapeHtml(t.winner_gamertag || t.winner_username)}</div>`
        : '';
      return `<div class="challenge-card" style="display:flex;align-items:center;justify-content:space-between;gap:1rem;flex-wrap:wrap">
        <div>
          <div style="font-weight:700">${escapeHtml(t.name)}</div>
          <div style="font-size:0.8rem;color:var(--text-2)">${t.game_icon} ${escapeHtml(t.game_name)} · Best of ${t.games_per_round}</div>
          ${winnerText}
        </div>
        <div style="display:flex;align-items:center;gap:0.75rem">
          <span style="padding:0.2rem 0.6rem;border-radius:9999px;font-size:0.75rem;font-weight:700;background:${statusColor}22;color:${statusColor};border:1px solid ${statusColor}55">${statusLabel}</span>
          <button class="btn btn-ghost btn-sm" onclick="openTournamentBracket(${t.id})">View Bracket</button>
        </div>
      </div>`;
    }).join('');
  } catch {
    el.innerHTML = '<p class="text-muted">Failed to load tournaments.</p>';
  }
}

async function openCreateTournamentModal() {
  if (!currentUser) return;
  const club = await api.clubs.get(userClubId).catch(() => null);
  if (!club) return;

  // Populate game dropdown
  const games = await api.games.list().catch(() => []);
  const gameSelect = document.getElementById('tournamentGame');
  gameSelect.innerHTML = games.map(g => `<option value="${g.id}">${g.icon} ${escapeHtml(g.name)}</option>`).join('');

  // Populate member checkboxes
  const cbContainer = document.getElementById('tournamentMemberCheckboxes');
  cbContainer.innerHTML = club.members.map(m => `
    <label style="display:flex;align-items:center;gap:0.4rem;font-size:0.82rem;padding:0.2rem 0.1rem;cursor:pointer">
      <input type="checkbox" class="tournament-member-cb" value="${m.id}" onchange="updateTournamentParticipantCount()">
      <div class="avatar-sm" style="background:${m.avatar_color || '#6366f1'};width:20px;height:20px;font-size:0.65rem;flex-shrink:0">${(m.gamertag || m.username)[0].toUpperCase()}</div>
      ${escapeHtml(m.gamertag || m.username)}
    </label>
  `).join('');

  document.getElementById('tournamentName').value = '';
  document.getElementById('tournamentParticipantCount').textContent = '';
  document.getElementById('manualSeedOrder').style.display = 'none';
  document.getElementById('createTournamentError').style.display = 'none';
  document.getElementById('tournamentSeeding').onchange = updateManualSeedUI;

  openModal('createTournamentModal');
}

function updateTournamentParticipantCount() {
  const checked = document.querySelectorAll('.tournament-member-cb:checked').length;
  document.getElementById('tournamentParticipantCount').textContent = `(${checked} selected)`;
  if (document.getElementById('tournamentSeeding').value === 'manual') updateManualSeedList();
}

function updateManualSeedUI() {
  const isManual = document.getElementById('tournamentSeeding').value === 'manual';
  document.getElementById('manualSeedOrder').style.display = isManual ? '' : 'none';
  if (isManual) updateManualSeedList();
}

function updateManualSeedList() {
  const checked = [...document.querySelectorAll('.tournament-member-cb:checked')];
  const list = document.getElementById('manualSeedList');
  // Preserve existing order if items match
  const existing = [...list.querySelectorAll('[data-uid]')].map(el => el.dataset.uid);
  const checkedIds = checked.map(cb => cb.value);
  // Add new items, keep existing order
  const orderedIds = [...existing.filter(id => checkedIds.includes(id)), ...checkedIds.filter(id => !existing.includes(id))];
  list.innerHTML = orderedIds.map((uid, i) => {
    const cb = document.querySelector(`.tournament-member-cb[value="${uid}"]`);
    const label = cb ? cb.closest('label').textContent.trim() : uid;
    return `<div class="seed-row" data-uid="${uid}" draggable="true"
      ondragstart="seedDragStart(event)" ondragover="seedDragOver(event)" ondrop="seedDrop(event)"
      style="display:flex;align-items:center;gap:0.5rem;padding:0.35rem 0.5rem;background:var(--bg-3);border-radius:var(--radius-sm);cursor:grab">
      <span style="font-size:0.75rem;color:var(--text-3);width:18px;text-align:right">#${i + 1}</span>
      <span style="font-size:0.82rem">${escapeHtml(label)}</span>
    </div>`;
  }).join('');
}

function seedDragStart(e) { e.dataTransfer.setData('text/plain', e.currentTarget.dataset.uid); }
function seedDragOver(e) { e.preventDefault(); }
function seedDrop(e) {
  e.preventDefault();
  const draggedUid = e.dataTransfer.getData('text/plain');
  const target = e.currentTarget;
  if (target.dataset.uid === draggedUid) return;
  const list = document.getElementById('manualSeedList');
  const draggedEl = list.querySelector(`[data-uid="${draggedUid}"]`);
  list.insertBefore(draggedEl, target);
  updateManualSeedList();
}

async function submitCreateTournament() {
  const name = document.getElementById('tournamentName').value.trim();
  const gameId = document.getElementById('tournamentGame').value;
  const gpr = document.getElementById('tournamentGPR').value;
  const seeding = document.getElementById('tournamentSeeding').value;
  const errEl = document.getElementById('createTournamentError');

  if (!name) { errEl.textContent = 'Please enter a tournament name.'; errEl.style.display = ''; return; }

  let participantIds;
  if (seeding === 'manual') {
    participantIds = [...document.querySelectorAll('#manualSeedList [data-uid]')].map(el => Number(el.dataset.uid));
  } else {
    participantIds = [...document.querySelectorAll('.tournament-member-cb:checked')].map(cb => Number(cb.value));
  }
  if (participantIds.length < 2) { errEl.textContent = 'Select at least 2 participants.'; errEl.style.display = ''; return; }

  errEl.style.display = 'none';
  try {
    await api.tournaments.create({ club_id: userClubId, name, game_id: gameId, games_per_round: gpr, seeding, participant_ids: participantIds });
    showToast('Tournament created!', 'success');
    closeAllModals();
    await loadClubTournaments(userClubId);
  } catch (err) {
    errEl.textContent = err.message;
    errEl.style.display = '';
  }
}

async function openTournamentBracket(id) {
  _currentTournamentId = id;
  try {
    const t = await api.tournaments.get(id);
    renderBracketModal(t);
    openModal('tournamentBracketModal');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function renderBracketModal(t) {
  const isOwner = userClubId && t.created_by === currentUser.id || (currentUser && t.club && t.club.owner_id === currentUser.id);
  const canManage = currentUser && t.created_by === currentUser.id;

  document.getElementById('bracketModalTitle').textContent = `${t.game ? t.game.icon : '🏆'} ${escapeHtml(t.name)}`;

  const cancelBtn = document.getElementById('cancelTournamentBtn');
  if (cancelBtn) cancelBtn.style.display = canManage && t.status === 'active' ? '' : 'none';

  // Winner banner
  const banner = document.getElementById('bracketWinnerBanner');
  const winnerName = document.getElementById('bracketWinnerName');
  if (t.status === 'completed' && t.winner) {
    banner.style.display = '';
    winnerName.textContent = `🏆 ${t.winner.gamertag || t.winner.username}`;
  } else {
    banner.style.display = 'none';
  }

  // Group matches by round
  const maxRound = Math.max(...t.matches.map(m => m.round), 1);
  const rounds = [];
  for (let r = 1; r <= maxRound; r++) {
    rounds.push(t.matches.filter(m => m.round === r).sort((a, b) => a.match_index - b.match_index));
  }

  const roundLabels = getRoundLabels(maxRound);

  const html = `<div class="bracket-wrapper">
    ${rounds.map((rMatches, ri) => `
      <div class="bracket-round">
        <div class="bracket-round-label">${roundLabels[ri]}</div>
        <div class="bracket-matches">
          ${rMatches.map(m => renderBracketMatch(m, t, canManage)).join('')}
        </div>
      </div>
    `).join('')}
  </div>`;

  document.getElementById('bracketContainer').innerHTML = html;
}

function getRoundLabels(maxRound) {
  const labels = [];
  for (let r = 1; r <= maxRound; r++) {
    const fromEnd = maxRound - r;
    if (fromEnd === 0) labels.push('Final');
    else if (fromEnd === 1) labels.push('Semifinal');
    else if (fromEnd === 2) labels.push('Quarterfinal');
    else labels.push(`Round ${r}`);
  }
  return labels;
}

function renderBracketMatch(m, t, canManage) {
  const playerName = (p) => p ? escapeHtml(p.gamertag || p.username) : '<span style="color:var(--text-3);font-style:italic">TBD</span>';
  const isWinnerA = m.winner_id && m.player_a_id && m.winner_id === m.player_a_id;
  const isWinnerB = m.winner_id && m.player_b_id && m.winner_id === m.player_b_id;
  const isPending = m.status === 'pending' && m.player_a_id && m.player_b_id;
  const isBye = m.status === 'bye';

  const rowStyle = (isWinner) => isWinner ? 'background:var(--bg-3);font-weight:700;color:#fbbf24' : 'background:var(--bg-2)';

  return `<div class="bracket-match ${isBye ? 'bracket-match-bye' : ''}">
    <div class="bracket-player" style="${rowStyle(isWinnerA)}">
      ${isWinnerA ? '🏆 ' : ''}${playerName(m.player_a)}
    </div>
    <div class="bracket-player" style="${rowStyle(isWinnerB)}">
      ${isWinnerB ? '🏆 ' : ''}${playerName(m.player_b)}
      ${isBye ? '<span style="font-size:0.68rem;color:var(--text-3);margin-left:0.25rem">(bye)</span>' : ''}
    </div>
    ${isPending && canManage && t.status === 'active' ? `
    <div class="bracket-set-winner">
      <button class="btn btn-ghost btn-sm" style="font-size:0.72rem;padding:0.2rem 0.5rem" onclick="promptSetWinner(${t.id}, ${m.id}, ${m.player_a_id}, '${escapeHtml(m.player_a ? (m.player_a.gamertag || m.player_a.username) : '')}', ${m.player_b_id}, '${escapeHtml(m.player_b ? (m.player_b.gamertag || m.player_b.username) : '')}')">Set Winner</button>
    </div>` : ''}
  </div>`;
}

function promptSetWinner(tId, matchId, pAId, pAName, pBId, pBName) {
  // Simple inline prompt using a small overlay inside the bracket modal
  const existing = document.getElementById('setWinnerPrompt');
  if (existing) existing.remove();

  const div = document.createElement('div');
  div.id = 'setWinnerPrompt';
  div.style.cssText = 'position:fixed;inset:0;background:#0009;display:flex;align-items:center;justify-content:center;z-index:9999';
  div.innerHTML = `
    <div style="background:var(--bg-2);border:1px solid var(--border);border-radius:var(--radius);padding:1.5rem;max-width:320px;width:90%;text-align:center">
      <div style="font-weight:700;font-size:1rem;margin-bottom:1rem">Who won this match?</div>
      <div style="display:flex;gap:0.75rem;justify-content:center;flex-wrap:wrap">
        <button class="btn btn-primary" onclick="confirmSetWinner(${tId},${matchId},${pAId})">${escapeHtml(pAName)}</button>
        <button class="btn btn-primary" onclick="confirmSetWinner(${tId},${matchId},${pBId})">${escapeHtml(pBName)}</button>
      </div>
      <button class="btn btn-ghost btn-sm" style="margin-top:1rem" onclick="document.getElementById('setWinnerPrompt').remove()">Cancel</button>
    </div>`;
  document.body.appendChild(div);
}

async function confirmSetWinner(tId, matchId, winnerId) {
  const prompt = document.getElementById('setWinnerPrompt');
  if (prompt) prompt.remove();
  try {
    const t = await api.tournaments.setWinner(tId, matchId, { winner_id: winnerId });
    renderBracketModal(t);
    if (t.status === 'completed') {
      showToast(`🏆 ${t.winner ? (t.winner.gamertag || t.winner.username) : 'Unknown'} wins the tournament!`, 'success');
      await loadClubTournaments(userClubId);
      await renderMyClub(userClubId);
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function cancelTournament() {
  if (!_currentTournamentId) return;
  if (!confirm('Cancel this tournament? This cannot be undone.')) return;
  try {
    await api.tournaments.cancel(_currentTournamentId);
    showToast('Tournament cancelled.', 'success');
    closeAllModals();
    await loadClubTournaments(userClubId);
  } catch (err) {
    showToast(err.message, 'error');
  }
}
