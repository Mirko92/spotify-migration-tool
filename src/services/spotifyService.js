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

export async function migrate(migrationData, onProgress) {
  const log = [];
  const errors = [];
  const source = JSON.parse(localStorage.getItem('spotify_source') || 'null');
  const sourceUserId = source?.profile?.id;

  const totalPlaylists = migrationData.playlists?.length || 0;
  const totalTracksBatches = (migrationData.savedTracks && migrationData.savedTrackIds?.length > 0)
    ? Math.ceil(migrationData.savedTrackIds.length / 40)
    : 0;
  const totalArtistBatches = (migrationData.followedArtists && migrationData.followedArtistIds?.length > 0)
    ? Math.ceil(migrationData.followedArtistIds.length / 40)
    : 0;

  const totalUnits = totalPlaylists + totalTracksBatches + totalArtistBatches || 1;
  let completedUnits = 0;

  const emitProgress = (currentItem, message, type = 'info') => {
    if (message) {
      log.push({
        message,
        type,
        timestamp: Date.now()
      });
    }
    const percent = Math.min(100, Math.round((completedUnits / totalUnits) * 100));
    onProgress?.({
      percent,
      currentItem: currentItem || '',
      completedUnits,
      totalUnits,
      log: [...log],
      errors: [...errors]
    });
  };

  emitProgress('Inizializzazione migrazione...', 'Avvio del processo di migrazione', 'info');

  try {
    if (migrationData.playlists.length > 0) {
      for (let i = 0; i < migrationData.playlists.length; i++) {
        const playlistId = migrationData.playlists[i];
        try {
          const sourcePlaylist = await spotifyRequest('source', `/playlists/${encodeURIComponent(playlistId)}`);
          const playlistName = sourcePlaylist.name || playlistId;
          emitProgress(`Playlist ${i + 1}/${totalPlaylists}: ${playlistName}`);

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
            completedUnits++;
            emitProgress(
              `Playlist ${i + 1}/${totalPlaylists}`,
              `Playlist seguita su destinazione: ${playlistName} (creata da ${sourcePlaylist.owner?.display_name || 'terzi'})`,
              'success'
            );
          } else {
            // Playlist creata dall'utente sorgente: clona e trasferisci le tracce
            const created = await spotifyRequest('destination', '/me/playlists', {
              method: 'POST',
              body: JSON.stringify({
                name: playlistName,
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
            completedUnits++;
            emitProgress(
              `Playlist ${i + 1}/${totalPlaylists}`,
              `Playlist clonata su destinazione: ${playlistName} (${uris.length} brani)`,
              'success'
            );
          }
        } catch (playlistError) {
          completedUnits++;
          const errorMsg = `Playlist (${playlistId}): ${playlistError.message}`;
          errors.push(errorMsg);
          emitProgress(`Playlist ${i + 1}/${totalPlaylists}`, errorMsg, 'error');
        }
      }
    }

    if (migrationData.savedTracks && migrationData.savedTrackIds.length > 0) {
      try {
        const total = migrationData.savedTrackIds.length;
        emitProgress(`Brani preferiti (0/${total})...`);
        for (let index = 0; index < total; index += 40) {
          const batch = migrationData.savedTrackIds.slice(index, index + 40);
          const uris = batch.map(id => `spotify:track:${id}`);
          await saveToLibrary('destination', uris);
          completedUnits++;
          const currentCount = Math.min(total, index + 40);
          emitProgress(
            `Brani preferiti (${currentCount}/${total})`,
            `Salvati ${currentCount}/${total} brani preferiti`,
            'success'
          );
        }
      } catch (savedTracksError) {
        const errorMsg = `Brani preferiti: ${savedTracksError.message}`;
        errors.push(errorMsg);
        emitProgress('Brani preferiti', errorMsg, 'error');
      }
    }

    if (migrationData.followedArtists && migrationData.followedArtistIds.length > 0) {
      try {
        const total = migrationData.followedArtistIds.length;
        emitProgress(`Artisti seguiti (0/${total})...`);
        for (let index = 0; index < total; index += 40) {
          const batch = migrationData.followedArtistIds.slice(index, index + 40);
          const uris = batch.map(id => `spotify:artist:${id}`);
          await saveToLibrary('destination', uris);
          completedUnits++;
          const currentCount = Math.min(total, index + 40);
          emitProgress(
            `Artisti seguiti (${currentCount}/${total})`,
            `Seguiti ${currentCount}/${total} artisti`,
            'success'
          );
        }
      } catch (artistsError) {
        const errorMsg = `Artisti seguiti: ${artistsError.message}`;
        errors.push(errorMsg);
        emitProgress('Artisti seguiti', errorMsg, 'error');
      }
    }
  } catch (error) {
    errors.push(error.message);
    emitProgress('Errore generale', error.message, 'error');
  }

  completedUnits = totalUnits;
  emitProgress(
    'Completato',
    errors.length === 0 ? 'Tutti gli elementi selezionati sono stati migrati con successo!' : 'Migrazione terminata con alcune segnalazioni.',
    errors.length === 0 ? 'success' : 'warning'
  );

  return { success: errors.length === 0, log, errors };
}