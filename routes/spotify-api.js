const axios = require('axios');

const API_BASE_URL = 'https://api.spotify.com/v1';
const ACCOUNTS_BASE_URL = 'https://accounts.spotify.com';

const clientId = process.env.SPOTIFY_CLIENT_ID || process.env.SOURCE_CLIENT_ID;
const clientSecret = process.env.SPOTIFY_CLIENT_SECRET || process.env.SOURCE_CLIENT_SECRET;

const createError = (error) => {
  const apiError = new Error(error.response?.data?.error?.message || error.message);
  apiError.statusCode = error.response?.status;
  apiError.headers = error.response?.headers || {};
  apiError.body = error.response?.data;
  return apiError;
};

const request = async (token, method, path, options = {}) => {
  try {
    return await axios({
      method,
      url: `${API_BASE_URL}${path}`,
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(options.headers || {})
      }
    });
  } catch (error) {
    throw createError(error);
  }
};

const toBodyResponse = (response) => ({
  body: response.data,
  headers: response.headers,
  statusCode: response.status
});

const createSpotifyApi = (accessToken) => ({
  getAccessToken: () => accessToken,
  setAccessToken: (token) => { accessToken = token; },
  getMe: async () => toBodyResponse(await request(accessToken, 'get', '/me')),
  getUserPlaylists: async (userIdOrOptions, maybeOptions) => {
    const options = typeof userIdOrOptions === 'object' ? userIdOrOptions : maybeOptions;
    const response = await request(accessToken, 'get', '/me/playlists', { params: options });
    return toBodyResponse(response);
  },
  getMySavedTracks: async (options) => toBodyResponse(
    await request(accessToken, 'get', '/me/tracks', { params: options })
  ),
  getFollowedArtists: async (options) => toBodyResponse(
    await request(accessToken, 'get', '/me/following', {
      params: { type: 'artist', ...options }
    })
  ),
  getPlaylist: async (playlistId, options) => toBodyResponse(
    await request(accessToken, 'get', `/playlists/${encodeURIComponent(playlistId)}`, { params: options })
  ),
  getPlaylistTracks: async (playlistId, options = {}) => {
    const { fields, ...params } = options;
    const response = await request(
      accessToken,
      'get',
      `/playlists/${encodeURIComponent(playlistId)}/items`,
      { params: { ...params, ...(fields ? { fields: fields.replace(/track\(/g, 'item(') } : {}) } }
    );
    return toBodyResponse({
      ...response,
      data: {
        ...response.data,
        items: response.data.items.map(item => ({ ...item, track: item.item }))
      }
    });
  },
  addTracksToPlaylist: async (playlistId, uris) => toBodyResponse(
    await request(accessToken, 'post', `/playlists/${encodeURIComponent(playlistId)}/items`, {
      data: { uris }
    })
  ),
  createPlaylist: async (userIdOrData, maybeData) => {
    const data = maybeData || userIdOrData;
    return toBodyResponse(await request(accessToken, 'post', '/me/playlists', { data }));
  },
  changePlaylistDetails: async (playlistId, data) => toBodyResponse(
    await request(accessToken, 'put', `/playlists/${encodeURIComponent(playlistId)}`, { data })
  ),
  uploadCustomPlaylistCoverImage: async (playlistId, image) => toBodyResponse(
    await request(accessToken, 'put', `/playlists/${encodeURIComponent(playlistId)}/images`, {
      data: image,
      headers: { 'Content-Type': 'image/jpeg' }
    })
  ),
  containsMySavedTracks: async (ids) => toBodyResponse(
    await request(accessToken, 'get', '/me/library/contains', {
      params: { uris: ids.map(id => `spotify:track:${id}`).join(',') }
    })
  ),
  addToMySavedTracks: async (ids) => toBodyResponse(
    await request(accessToken, 'put', '/me/library', {
      params: { uris: ids.map(id => `spotify:track:${id}`).join(',') }
    })
  ),
  isFollowingArtists: async (ids) => toBodyResponse(
    await request(accessToken, 'get', '/me/library/contains', {
      params: { uris: ids.map(id => `spotify:artist:${id}`).join(',') }
    })
  ),
  followArtists: async (ids) => toBodyResponse(
    await request(accessToken, 'put', '/me/library', {
      params: { uris: ids.map(id => `spotify:artist:${id}`).join(',') }
    })
  ),
  followPlaylist: async (playlistId) => toBodyResponse(
    await request(accessToken, 'put', '/me/library', {
      params: { uris: `spotify:playlist:${playlistId}` }
    })
  )
});

const createAuthorizeUrl = (redirectUri, scopes, state, options = {}) => {
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: scopes.join(' '),
    state,
    ...(options.showDialog ? { show_dialog: 'true' } : {})
  });
  return `https://accounts.spotify.com/authorize?${params.toString()}`;
};

const exchangeCode = async (code, redirectUri) => {
  try {
    const response = await axios.post(
      `${ACCOUNTS_BASE_URL}/api/token`,
      new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri }),
      {
        auth: { username: clientId, password: clientSecret },
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      }
    );
    return { body: response.data };
  } catch (error) {
    throw createError(error);
  }
};

const refreshAccessToken = async (refreshToken) => {
  try {
    const response = await axios.post(
      `${ACCOUNTS_BASE_URL}/api/token`,
      new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
      {
        auth: { username: clientId, password: clientSecret },
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      }
    );
    return { body: response.data };
  } catch (error) {
    throw createError(error);
  }
};

module.exports = {
  createSpotifyApi,
  createAuthorizeUrl,
  exchangeCode,
  refreshAccessToken,
  clientId,
  clientSecret
};
