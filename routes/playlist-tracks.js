const express = require('express');
const router = express.Router();
const auth = require('./auth');
const axios = require('axios');

// Middleware to ensure both accounts are authenticated
const ensureAuthenticated = (req, res, next) => {
  if (!req.session.sourceUser || !req.session.destUser) {
    return res.status(401).json({ error: 'Both accounts must be authenticated' });
  }
  next();
};

// Get tracks for a specific playlist
router.get('/playlist-tracks/:playlistId', [auth.refreshSourceToken, ensureAuthenticated], async (req, res) => {
  const { playlistId } = req.params;
  
  try {
    const sourceSpotifyApi = auth.createSourceApi(req);
    // Get all tracks from source playlist with pagination
    let tracks = [];
    let offset = 0;
    const limit = 100;
    let total = 1; // Initial value to enter the loop
    
    while (offset < total) {
      const tracksResponse = await axios.get(
        `https://api.spotify.com/v1/playlists/${encodeURIComponent(playlistId)}/items`,
        {
          headers: { Authorization: `Bearer ${sourceSpotifyApi.getAccessToken()}` },
          params: {
            offset,
            limit,
            fields: 'items(item(id,name,artists(name))),total'
          }
        }
      );
      
      total = tracksResponse.data.total;
      tracks = tracks.concat(
        tracksResponse.data.items
          .map(item => item.item)
          .filter(Boolean)
      );
      offset += limit;
      
      // Break if we've fetched all tracks or reached a reasonable limit
      if (tracks.length >= total || offset >= 500) {
        break;
      }
    }
    
    res.json({ tracks });
  } catch (error) {
    console.error(`Error fetching tracks for playlist ${playlistId}:`, error);
    res.status(500).json({ error: 'Failed to fetch playlist tracks' });
  }
});

module.exports = router;