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
    leaderboard: () => req('GET', '/api/users/leaderboard'),
    profile: (id) => req('GET', `/api/users/${id}`),
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
    join: (id) => req('POST', `/api/clubs/${id}/join`),
    leave: (id) => req('DELETE', `/api/clubs/${id}/leave`),
    kick: (clubId, userId) => req('DELETE', `/api/clubs/${clubId}/kick/${userId}`),
    challenge: (id, body) => req('POST', `/api/clubs/${id}/challenge`, body),
    respond: (challengeId, body) => req('POST', `/api/clubs/challenges/${challengeId}/respond`, body),
    leaderboard: () => req('GET', '/api/clubs/leaderboard/clubs'),
  },
};
