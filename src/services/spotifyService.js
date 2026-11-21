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
    const message = error.error?.message || error.message || `Spotify API error (${response.status})`;
    throw new Error(`[${role.toUpperCase()} ${options.method || 'GET'} ${path}] ${message} (${response.status})`);
  }
  // PUT /me/library answers 200 with an empty body
  const text = await response.text();
  return text ? JSON.parse(text) : null;
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
  try {
    const tracks = await getAll('source', `/playlists/${encodeURIComponent(playlistId)}/tracks`, 'items');
    return { tracks: tracks.map(item => item.track || item.item || item).filter(Boolean) };
  } catch (err) {
    const tracks = await getAll('source', `/playlists/${encodeURIComponent(playlistId)}/items`, 'items');
    return { tracks: tracks.map(item => item.item || item.track || item).filter(Boolean) };
  }
}

async function addInBatches(role, path, values, batchSize = 100) {
  for (let index = 0; index < values.length; index += batchSize) {
    await spotifyRequest(role, path, {
      method: 'POST',
      body: JSON.stringify({ uris: values.slice(index, index + batchSize) })
    });
  }
}

// PUT /me/library takes URIs in the query string, max 40 per request
async function saveToLibrary(role, uris) {
  for (let index = 0; index < uris.length; index += 40) {
    const batch = uris.slice(index, index + 40).map(encodeURIComponent).join(',');
    await spotifyRequest(role, `/me/library?uris=${batch}`, { method: 'PUT' });
  }
}

export async function migrate(migrationData) {
  const log = [];
  const errors = [];
  const source = JSON.parse(localStorage.getItem('spotify_source') || 'null');
  const sourceUserId = source?.profile?.id;

  try {
    if (migrationData.playlists.length > 0) {
      for (const playlistId of migrationData.playlists) {
        try {
          const sourcePlaylist = await spotifyRequest('source', `/playlists/${encodeURIComponent(playlistId)}`);
          const isOwnedBySource = sourceUserId && sourcePlaylist.owner?.id === sourceUserId;

          if (!isOwnedBySource) {
            // Playlist di terzi: seguila su destinazione invece di clonarla (evita il 403 sulle tracce di terzi)
            try {
              await spotifyRequest('destination', `/playlists/${encodeURIComponent(playlistId)}/followers`, {
                method: 'PUT',
                body: JSON.stringify({ public: false })
              });
            } catch (followErr) {
              await saveToLibrary('destination', [`spotify:playlist:${playlistId}`]);
            }
            log.push(`Playlist seguita su destinazione: ${sourcePlaylist.name} (creata da ${sourcePlaylist.owner?.display_name || 'terzi'})`);
          } else {
            // Playlist creata dall'utente sorgente: clona e trasferisci le tracce
            const created = await spotifyRequest('destination', '/me/playlists', {
              method: 'POST',
              body: JSON.stringify({
                name: sourcePlaylist.name,
                description: sourcePlaylist.description || '',
                public: sourcePlaylist.public,
                collaborative: false
              })
            });
            const sourceTracks = await getPlaylistTracks(playlistId);
            const uris = sourceTracks.tracks
              .map(track => track?.uri || track?.track?.uri || track?.item?.uri)
              .filter(Boolean);
            if (uris.length > 0) {
              await addInBatches('destination', `/playlists/${created.id}/items`, uris);
            }
            log.push(`Playlist migrata: ${sourcePlaylist.name} (${uris.length} brani)`);
          }
        } catch (playlistError) {
          errors.push(`Playlist (${playlistId}): ${playlistError.message}`);
        }
      }
    }

    if (migrationData.savedTracks && migrationData.savedTrackIds.length > 0) {
      try {
        await saveToLibrary('destination', migrationData.savedTrackIds.map(id => `spotify:track:${id}`));
        log.push(`Brani preferiti migrati: ${migrationData.savedTrackIds.length}`);
      } catch (savedTracksError) {
        errors.push(`Brani preferiti: ${savedTracksError.message}`);
      }
    }

    if (migrationData.followedArtists && migrationData.followedArtistIds.length > 0) {
      try {
        await saveToLibrary('destination', migrationData.followedArtistIds.map(id => `spotify:artist:${id}`));
        log.push(`Artisti seguiti migrati: ${migrationData.followedArtistIds.length}`);
      } catch (artistsError) {
        errors.push(`Artisti seguiti: ${artistsError.message}`);
      }
    }
  } catch (error) {
    errors.push(error.message);
  }

  return { success: errors.length === 0, log, errors };
}