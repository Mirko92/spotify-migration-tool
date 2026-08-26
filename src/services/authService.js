const CLIENT_ID = import.meta.env.VITE_SPOTIFY_CLIENT_ID;
const SOURCE_REDIRECT_URI = import.meta.env.VITE_SPOTIFY_SOURCE_REDIRECT_URI;
const DESTINATION_REDIRECT_URI = import.meta.env.VITE_SPOTIFY_DESTINATION_REDIRECT_URI;
const OAUTH_BASE_URL = (import.meta.env.VITE_OAUTH_BASE_URL || '').replace(/\/+$/, '');
const AUTH_ENDPOINT = 'https://accounts.spotify.com/authorize';
const TOKEN_ENDPOINT = 'https://accounts.spotify.com/api/token';
const REDIRECT_PATHS = {
  source: '/auth/source',
  destination: '/auth/destination'
};

const accountKey = role => `spotify_${role}`;
const pendingKey = role => `spotify_pkce_${role}`;

const createRandomString = (length) => {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
};

const createCodeChallenge = async (verifier) => {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
};

const redirectUri = role => {
  if (role === 'source' && SOURCE_REDIRECT_URI) return SOURCE_REDIRECT_URI;
  if (role === 'destination' && DESTINATION_REDIRECT_URI) return DESTINATION_REDIRECT_URI;
  if (OAUTH_BASE_URL) return `${OAUTH_BASE_URL}${REDIRECT_PATHS[role]}`;
  return `${window.location.origin}${REDIRECT_PATHS[role]}`;
};

export const getRedirectUri = (role) => redirectUri(role);

export const getRedirectUris = () => ({
  source: redirectUri('source'),
  destination: redirectUri('destination')
});

export const startLogin = async (role) => {
  if (!CLIENT_ID) {
    throw new Error('VITE_SPOTIFY_CLIENT_ID non configurato: imposta la variabile in .env o .env.production');
  }

  const verifier = createRandomString(64);
  const state = createRandomString(16);
  const challenge = await createCodeChallenge(verifier);
  localStorage.setItem(pendingKey(role), JSON.stringify({ verifier, state }));

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    redirect_uri: redirectUri(role),
    code_challenge_method: 'S256',
    code_challenge: challenge,
    state,
    scope: [
      'user-read-private',
      'user-read-email',
      'playlist-read-private',
      'playlist-read-collaborative',
      'playlist-modify-public',
      'playlist-modify-private',
      'user-library-read',
      'user-library-modify',
      'user-follow-read',
      'user-follow-modify',
      'ugc-image-upload'
    ].join(' '),
    show_dialog: 'true'
  });

  window.location.href = `${AUTH_ENDPOINT}?${params}`;
};

export const completeLogin = async (role) => {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const state = params.get('state');
  const pending = JSON.parse(localStorage.getItem(pendingKey(role)) || 'null');

  if (!code || !pending || state !== pending.state) {
    throw new Error('Risposta OAuth non valida o scaduta');
  }

  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri(role),
      code_verifier: pending.verifier
    })
  });

  if (!response.ok) {
    throw new Error('Spotify non ha accettato l’autorizzazione');
  }

  const token = await response.json();
  const profileResponse = await fetch('https://api.spotify.com/v1/me', {
    headers: { Authorization: `Bearer ${token.access_token}` }
  });
  const profile = await profileResponse.json();
  localStorage.setItem(accountKey(role), JSON.stringify({ ...token, profile, expiresAt: Date.now() + token.expires_in * 1000 }));
  localStorage.removeItem(pendingKey(role));
  window.history.replaceState({}, document.title, REDIRECT_PATHS[role]);
  return profile;
};

export const getToken = async (role) => {
  const account = JSON.parse(localStorage.getItem(accountKey(role)) || 'null');
  if (!account) throw new Error(`Account ${role} non autenticato`);
  if (account.expiresAt > Date.now() + 60000) return account.access_token;

  if (!account.refresh_token) return account.access_token;
  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      grant_type: 'refresh_token',
      refresh_token: account.refresh_token
    })
  });
  if (!response.ok) throw new Error('Sessione Spotify scaduta, effettua nuovamente il login');
  const refreshed = await response.json();
  const updated = { ...account, ...refreshed, refresh_token: refreshed.refresh_token || account.refresh_token, expiresAt: Date.now() + refreshed.expires_in * 1000 };
  localStorage.setItem(accountKey(role), JSON.stringify(updated));
  return updated.access_token;
};

export const getAuthStatus = async () => {
  const source = JSON.parse(localStorage.getItem(accountKey('source')) || 'null');
  const destination = JSON.parse(localStorage.getItem(accountKey('destination')) || 'null');
  return {
    sourceAuthenticated: !!source,
    destAuthenticated: !!destination,
    sourceUser: source?.profile || null,
    destUser: destination?.profile || null,
    loading: false
  };
};

export const logoutSource = async () => localStorage.removeItem(accountKey('source'));
export const logoutDestination = async () => localStorage.removeItem(accountKey('destination'));
export const logout = async () => {
  await logoutSource();
  await logoutDestination();
};