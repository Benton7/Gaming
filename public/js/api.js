const BASE = '';

async function req(method, path, body) {
  const token = localStorage.getItem('token');
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (token) opts.headers['Authorization'] = `Bearer ${token}`;
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(BASE + path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

const api = {
  auth: {
    register: (body) => req('POST', '/api/auth/register', body),
    login: (body) => req('POST', '/api/auth/login', body),
  },
  users: {
    me: () => req('GET', '/api/users/me'),
    update: (body) => req('PATCH', '/api/users/me', body),
    uploadAvatar: (body) => req('POST', '/api/users/me/avatar', body),
    leaderboard: () => req('GET', '/api/users/leaderboard'),
    profile: (id) => req('GET', `/api/users/${id}`),
    search: (q) => req('GET', `/api/users/search?q=${encodeURIComponent(q)}`),
  },
  games: {
    list: () => req('GET', '/api/games'),
    connect: (body) => req('POST', '/api/games/accounts', body),
    update: (id, body) => req('PATCH', `/api/games/accounts/${id}`, body),
    disconnect: (id) => req('DELETE', `/api/games/accounts/${id}`),
  },
  clubs: {
    list: (search) => req('GET', `/api/clubs${search ? `?search=${encodeURIComponent(search)}` : ''}`),
    get: (id) => req('GET', `/api/clubs/${id}`),
    create: (body) => req('POST', '/api/clubs', body),
    update: (id, body) => req('PATCH', `/api/clubs/${id}`, body),
    join: (id) => req('POST', `/api/clubs/${id}/join`),
    leave: (id) => req('DELETE', `/api/clubs/${id}/leave`),
    kick: (clubId, userId) => req('DELETE', `/api/clubs/${clubId}/kick/${userId}`),
    challenge: (id, body) => req('POST', `/api/clubs/${id}/challenge`, body),
    respond: (challengeId, body) => req('POST', `/api/clubs/challenges/${challengeId}/respond`, body),
    leaderboard: () => req('GET', '/api/clubs/leaderboard/clubs'),
    openChallenges: () => req('GET', '/api/clubs/open-challenges'),
    postOpenChallenge: (clubId, body) => req('POST', `/api/clubs/${clubId}/open-challenge`, body),
    acceptOpenChallenge: (challengeId, body) => req('POST', `/api/clubs/open-challenges/${challengeId}/accept`, body),
  },
  teams: {
    list: (gameId, search) => req('GET', `/api/teams${gameId || search ? `?${gameId ? `game_id=${gameId}` : ''}${gameId && search ? '&' : ''}${search ? `search=${encodeURIComponent(search)}` : ''}` : ''}`),
    mine: () => req('GET', '/api/teams/mine'),
    get: (id) => req('GET', `/api/teams/${id}`),
    create: (body) => req('POST', '/api/teams', body),
    invite: (id, body) => req('POST', `/api/teams/${id}/invite`, body),
    respondInvite: (inviteId, body) => req('POST', `/api/teams/invites/${inviteId}/respond`, body),
    myInvites: () => req('GET', '/api/teams/invites/mine'),
    leave: (id) => req('DELETE', `/api/teams/${id}/leave`),
    kick: (teamId, userId) => req('DELETE', `/api/teams/${teamId}/kick/${userId}`),
    postChallenge: (id, body) => req('POST', `/api/teams/${id}/challenge`, body),
    openChallenges: (gameId) => req('GET', `/api/teams/challenges/open${gameId ? `?game_id=${gameId}` : ''}`),
    acceptChallenge: (id, body) => req('POST', `/api/teams/challenges/${id}/accept`, body),
  },
  friends: {
    list: () => req('GET', '/api/friends'),
    requests: () => req('GET', '/api/friends/requests'),
    leaderboard: () => req('GET', '/api/friends/leaderboard'),
    sendRequest: (userId) => req('POST', '/api/friends/request', { userId }),
    accept: (id) => req('POST', `/api/friends/${id}/accept`),
    remove: (id) => req('DELETE', `/api/friends/${id}`),
    status: (userId) => req('GET', `/api/friends/status/${userId}`),
  },
  verify: {
    support: () => req('GET', '/api/verify/support'),
    riot: (accountId, riotId) => req('POST', `/api/verify/riot/${accountId}`, { riotId }),
    steam: (accountId, steamId) => req('POST', `/api/verify/steam/${accountId}`, { steamId }),
  },
};
