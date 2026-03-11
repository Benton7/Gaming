// ===== STATE =====
let currentUser = null;
let allGames = [];
let activeModal = null;
let connectingGameId = null;
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
};

function route() {
  const hash = location.hash.slice(1) || '/';
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
  }
}

// ===== NAV USER =====
function updateNavUser() {
  if (!currentUser) return;
  document.getElementById('navUsername').textContent = currentUser.gamertag || currentUser.username;
  document.getElementById('menuGamerscore').textContent = formatScore(currentUser.gamerscore);
  setAvatar('navAvatar', currentUser.gamertag || currentUser.username, currentUser.avatar_color);
}

function setAvatar(elId, name, color) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.style.background = color || '#6366f1';
  el.textContent = (name || '?')[0].toUpperCase();
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
  document.getElementById('dashGamerscore').textContent = formatScore(currentUser.gamerscore);
  document.getElementById('dashGamesConnected').textContent = `${currentUser.accounts.length} game${currentUser.accounts.length !== 1 ? 's' : ''} connected`;
  document.getElementById('dashRankTitle').textContent = getTitleFromScore(currentUser.gamerscore);

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
  } catch { return; }

  const connected = {};
  currentUser.accounts.forEach(a => connected[a.game_id] = a);

  const grid = document.getElementById('gamesGrid');
  grid.innerHTML = allGames.map(game => {
    const acct = connected[game.id];
    const style = `--game-color: ${game.color}`;
    if (acct) {
      const trackerBadge = acct.tracker_url
        ? `<a href="${escapeHtml(acct.tracker_url)}" target="_blank" rel="noopener" class="tracker-badge">🔗 Profile Linked</a>`
        : '';
      return `
      <div class="game-card" style="${style}">
        <div class="game-card-header">
          <span class="game-big-icon">${game.icon}</span>
          <div>
            <div class="game-card-name">${game.name}</div>
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
          <div class="connected-row">
            <span class="connected-label">Platform</span>
            <span class="game-platform">${acct.platform}</span>
          </div>
        </div>
        ${trackerBadge ? `<div style="margin-bottom:0.75rem">${trackerBadge}</div>` : ''}
        <div class="game-card-actions">
          <button class="btn btn-ghost btn-sm" onclick="openUpdateRank(${acct.id}, ${JSON.stringify(game.ranks).replace(/"/g, '&quot;')}, ${acct.current_rank_index}, ${acct.peak_rank_index}, ${JSON.stringify(acct.tracker_url || '').replace(/"/g, '&quot;')})">Update Rank</button>
        </div>
      </div>`;
    } else {
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
          <button class="btn btn-primary btn-sm" onclick="openConnectGame(${game.id}, '${game.name}', ${JSON.stringify(game.ranks).replace(/"/g, '&quot;')})">Connect Account</button>
        </div>
      </div>`;
    }
  }).join('');
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
          <div class="club-stat"><div class="club-stat-val club-score-val mono">${formatScore(club.club_score)}</div><div class="club-stat-lbl">Club Score</div></div>
          <div class="club-stat"><div class="club-stat-val club-wins-val mono">${club.wins}</div><div class="club-stat-lbl">Wins</div></div>
          <div class="club-stat"><div class="club-stat-val text-red mono">${club.losses}</div><div class="club-stat-lbl">Losses</div></div>
          <div class="club-stat"><div class="club-stat-val mono">${club.member_count}/20</div><div class="club-stat-lbl">Members</div></div>
        </div>

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
      </div>`;

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
    if (action === 'accept') {
      const msg = res.winner ? `Challenge resolved! Winner: [${res.winner.tag}] ${res.winner.name} (+${res.score_awarded} pts)` : 'Challenge resolved!';
      showToast(msg, 'success');
    } else {
      showToast('Challenge declined.', 'success');
    }
    currentUser = await api.users.me();
    await loadClubs();
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
  } catch (err) {
    console.error(err);
  }
}

function renderPlayerLeaderboard(players) {
  const el = document.getElementById('playerLeaderboard');
  if (!players.length) { el.innerHTML = '<p class="text-muted">No players yet.</p>'; return; }
  el.innerHTML = `<table class="leaderboard-table">
    <thead><tr><th>#</th><th>Player</th><th>Club</th><th>Gamerscore</th></tr></thead>
    <tbody>${players.map((p, i) => {
      const rankClass = i === 0 ? 'lb-rank-1' : i === 1 ? 'lb-rank-2' : i === 2 ? 'lb-rank-3' : '';
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '';
      return `<tr>
        <td><span class="lb-rank ${rankClass}">${medal || i + 1}</span></td>
        <td><div class="lb-user">
          <div class="avatar-sm" style="background:${p.avatar_color || '#6366f1'}">${(p.gamertag || p.username)[0].toUpperCase()}</div>
          <span>${escapeHtml(p.gamertag || p.username)} ${p.id === currentUser?.id ? '<span style="font-size:0.72rem;color:var(--accent)">(you)</span>' : ''}</span>
        </div></td>
        <td>${p.club_name ? `<span style="font-size:0.82rem;color:var(--text-2)">[${p.club_tag}] ${escapeHtml(p.club_name)}</span>` : '<span class="text-muted">—</span>'}</td>
        <td><span class="lb-score mono">${formatScore(p.gamerscore)}</span></td>
      </tr>`;
    }).join('')}</tbody>
  </table>`;
}

function renderClubLeaderboard(clubs) {
  const el = document.getElementById('clubLeaderboard');
  if (!clubs.length) { el.innerHTML = '<p class="text-muted">No clubs yet.</p>'; return; }
  el.innerHTML = `<table class="leaderboard-table">
    <thead><tr><th>#</th><th>Club</th><th>Members</th><th>W / L</th><th>Club Score</th></tr></thead>
    <tbody>${clubs.map((c, i) => {
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '';
      const rankClass = i === 0 ? 'lb-rank-1' : i === 1 ? 'lb-rank-2' : i === 2 ? 'lb-rank-3' : '';
      return `<tr>
        <td><span class="lb-rank ${rankClass}">${medal || i + 1}</span></td>
        <td><div class="lb-user"><strong>[${c.tag}]</strong>&nbsp;${escapeHtml(c.name)}</div></td>
        <td class="mono">${c.member_count}/20</td>
        <td><span class="text-green mono">${c.wins}W</span> / <span class="text-red mono">${c.losses}L</span></td>
        <td><span class="lb-club-score mono">${formatScore(c.club_score)}</span></td>
      </tr>`;
    }).join('')}</tbody>
  </table>`;
}

function switchTab(tab, btn) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById(`tab${tab.charAt(0).toUpperCase() + tab.slice(1)}`).classList.add('active');
}

// ===== PROFILE =====
async function loadProfile() {
  if (!currentUser) return;
  try { currentUser = await api.users.me(); } catch { return; }

  document.getElementById('profileGamertag').textContent = currentUser.gamertag || currentUser.username;
  document.getElementById('profileUsername').textContent = `@${currentUser.username}`;
  document.getElementById('profileBio').textContent = currentUser.bio || '';
  document.getElementById('profileGamerscore').textContent = formatScore(currentUser.gamerscore);
  document.getElementById('editGamertag').value = currentUser.gamertag || '';
  document.getElementById('editBio').value = currentUser.bio || '';
  setAvatar('profileAvatar', currentUser.gamertag || currentUser.username, currentUser.avatar_color);

  const bannerEl = document.getElementById('profileBanner');
  const bannerColor = currentUser.banner_color || '#6366f1';
  bannerEl.style.background = `linear-gradient(135deg, ${bannerColor}, rgba(0,212,255,0.4))`;
  bannerEl.style.setProperty('--banner-color', bannerColor);

  const swatches = document.getElementById('colorSwatches');
  swatches.innerHTML = AVATAR_COLORS.map(c => `
    <div class="color-swatch ${c === currentUser.avatar_color ? 'selected' : ''}"
      style="background:${c}"
      onclick="selectColor('${c}', this, 'avatar')"></div>
  `).join('');

  const bannerSwatches = document.getElementById('bannerSwatches');
  bannerSwatches.innerHTML = BANNER_COLORS.map(c => `
    <div class="color-swatch ${c === bannerColor ? 'selected' : ''}"
      style="background:${c}"
      onclick="selectColor('${c}', this, 'banner')"></div>
  `).join('');
}

function selectColor(color, el, type) {
  if (type === 'avatar') {
    document.querySelectorAll('#colorSwatches .color-swatch').forEach(s => s.classList.remove('selected'));
  } else {
    document.querySelectorAll('#bannerSwatches .color-swatch').forEach(s => s.classList.remove('selected'));
    // Live preview
    const bannerEl = document.getElementById('profileBanner');
    bannerEl.style.background = `linear-gradient(135deg, ${color}, rgba(0,212,255,0.4))`;
  }
  el.classList.add('selected');
}

async function saveProfile() {
  hideError('profileEditError');
  const gamertag = document.getElementById('editGamertag').value.trim();
  const bio = document.getElementById('editBio').value.trim();
  const selectedSwatch = document.querySelector('#colorSwatches .color-swatch.selected');
  const selectedBanner = document.querySelector('#bannerSwatches .color-swatch.selected');
  const avatar_color = selectedSwatch ? selectedSwatch.style.background : currentUser.avatar_color;
  const banner_color = selectedBanner ? selectedBanner.style.background : (currentUser.banner_color || '#6366f1');

  try {
    await api.users.update({ gamertag, avatar_color, banner_color, bio });
    currentUser = await api.users.me();
    updateNavUser();
    document.getElementById('profileEditSuccess').style.display = '';
    document.getElementById('profileEditSuccess').textContent = 'Profile saved!';
    document.getElementById('profileGamertag').textContent = currentUser.gamertag || currentUser.username;
    document.getElementById('profileBio').textContent = currentUser.bio || '';
    setAvatar('profileAvatar', currentUser.gamertag || currentUser.username, avatar_color);
    setTimeout(() => { document.getElementById('profileEditSuccess').style.display = 'none'; }, 3000);
  } catch (err) {
    showError('profileEditError', err.message);
  }
}

// ===== CONNECT GAME MODAL =====
function openConnectGame(gameId, gameName, ranks) {
  connectingGameId = gameId;
  document.getElementById('connectGameTitle').textContent = `Connect ${gameName}`;
  hideError('connectGameError');

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
  openModal('connectGameModal');
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
    const msg = res.winner ? `Challenge complete! Winner: [${res.winner.tag}] ${res.winner.name} (+${res.score_awarded} pts)` : 'Challenge complete!';
    showToast(msg, 'success');
    currentUser = await api.users.me();
    await loadClubs();
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
