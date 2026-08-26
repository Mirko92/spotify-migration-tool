import { getToken } from './authService';

const API_URL = 'https://api.spotify.com/v1';

async function spotifyRequest(role, path, options = {}) {
  const token = await getToken(role);
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error?.message || `Spotify API error (${response.status})`);
  }
  return response.status === 204 ? null : response.json();
}

async function getAll(role, path, collectionKey) {
  const results = [];
  let offset = 0;
  let total = 1;

  while (offset < total) {
    const separator = path.includes('?') ? '&' : '?';
    const response = await spotifyRequest(role, `${path}${separator}limit=50&offset=${offset}`);
    const collection = response?.[collectionKey];
    const items = Array.isArray(collection)
      ? collection
      : Array.isArray(collection?.items)
        ? collection.items
        : [];

    results.push(...items);

    const pageTotal = collection?.total ?? response?.total;
    const pageLimit = collection?.limit ?? response?.limit ?? 50;
    total = pageTotal ?? results.length;
    offset += pageLimit;
  }
  return results;
}

export async function getPreviewData() {
  const [playlists, savedTracks, followedArtists] = await Promise.all([
    getAll('source', '/me/playlists', 'items'),
    getAll('source', '/me/tracks', 'items'),
    getAll('source', '/me/following?type=artist', 'artists')
  ]);

  return {
    playlists,
    savedTracks,
    followedArtists,
    followedUsers: []
  };
}

export async function getPlaylistTracks(playlistId) {
  const tracks = await getAll('source', `/playlists/${encodeURIComponent(playlistId)}/items`, 'items');
  return { tracks: tracks.map(item => item.item || item).filter(Boolean) };
}

async function addInBatches(role, path, values, batchSize = 100) {
  for (let index = 0; index < values.length; index += batchSize) {
    await spotifyRequest(role, path, {
      method: 'POST',
      body: JSON.stringify({ uris: values.slice(index, index + batchSize) })
    });
  }
}

export async function migrate(migrationData) {
  const log = [];
  const errors = [];
  const destination = JSON.parse(localStorage.getItem('spotify_destination') || 'null');

  try {
    if (migrationData.playlists.length > 0) {
      for (const playlistId of migrationData.playlists) {
        const sourcePlaylist = await spotifyRequest('source', `/playlists/${encodeURIComponent(playlistId)}`);
        const created = await spotifyRequest('destination', `/users/${encodeURIComponent(destination.profile.id)}/playlists`, {
          method: 'POST',
          body: JSON.stringify({
            name: sourcePlaylist.name,
            description: sourcePlaylist.description || '',
            public: sourcePlaylist.public,
            collaborative: false
          })
        });
        const sourceTracks = await getPlaylistTracks(playlistId);
        const uris = sourceTracks.tracks.filter(track => track?.uri).map(track => track.uri);
        await addInBatches('destination', `/playlists/${created.id}/items`, uris);
        log.push(`Playlist migrata: ${sourcePlaylist.name} (${uris.length} brani)`);
      }
    }

    if (migrationData.savedTracks && migrationData.savedTrackIds.length > 0) {
      await addInBatches('destination', '/me/tracks', migrationData.savedTrackIds.map(id => `spotify:track:${id}`), 40);
      log.push(`Brani preferiti migrati: ${migrationData.savedTrackIds.length}`);
    }

    if (migrationData.followedArtists && migrationData.followedArtistIds.length > 0) {
      for (let index = 0; index < migrationData.followedArtistIds.length; index += 50) {
        const ids = migrationData.followedArtistIds.slice(index, index + 50).join(',');
        await spotifyRequest('destination', `/me/following?type=artist&ids=${ids}`, { method: 'PUT' });
      }
      log.push(`Artisti seguiti migrati: ${migrationData.followedArtistIds.length}`);
    }
  } catch (error) {
    errors.push(error.message);
  }

  return { success: errors.length === 0, log, errors };
}