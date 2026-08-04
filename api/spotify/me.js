// /api/spotify/me — returns the user's playlists, recently played (grouped by context), top tracks, and podcasts

function getCookie(req, name) {
  const raw = req.headers.cookie || '';
  const match = raw.split(';').map(s => s.trim()).find(s => s.startsWith(name + '='));
  return match ? decodeURIComponent(match.split('=').slice(1).join('=')) : null;
}

async function getAccessToken(refreshToken) {
  const basic = Buffer.from(
    process.env.SPOTIFY_CLIENT_ID + ':' + process.env.SPOTIFY_CLIENT_SECRET
  ).toString('base64');
  const r = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + basic,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });
  const j = await r.json();
  return j.access_token;
}

// Podcasts to always surface first, in this order (case-insensitive match on show name)
const PINNED_SHOWS = ['up first', 'the journal', 'today explained', 'the lovable reunion'];

export default async function handler(req, res) {
  const refresh = getCookie(req, 'sp_refresh');
  if (!refresh) {
    res.status(401).json({ error: 'not_connected' });
    return;
  }

  try {
    const accessToken = await getAccessToken(refresh);
    const auth = { Authorization: 'Bearer ' + accessToken };

    const [playlistsR, recentR, topR, showsR] = await Promise.all([
      fetch('https://api.spotify.com/v1/me/playlists?limit=8', { headers: auth }),
      fetch('https://api.spotify.com/v1/me/player/recently-played?limit=20', { headers: auth }),
      fetch('https://api.spotify.com/v1/me/top/tracks?limit=8&time_range=short_term', { headers: auth }),
      fetch('https://api.spotify.com/v1/me/shows?limit=30', { headers: auth }),
    ]);

    const [playlists, recent, top, shows] = await Promise.all([
      playlistsR.json(),
      recentR.json(),
      topR.json(),
      showsR.json(),
    ]);

    // ── Recently played, grouped by context (playlist/album/artist) instead of individual tracks ──
    const rawRecent = recent.items || [];
    const seen = new Set();
    const contextEntries = [];
    for (const it of rawRecent) {
      const ctx = it.context;
      if (ctx && ctx.uri) {
        if (!seen.has(ctx.uri)) {
          seen.add(ctx.uri);
          const parts = ctx.uri.split(':'); // spotify:playlist:ID
          contextEntries.push({ type: parts[1], id: parts[2], uri: ctx.uri, playedAt: it.played_at });
        }
      } else {
        // No context (played standalone, or via an algorithmic/radio session Spotify doesn't label)
        const key = 'track:' + it.track.uri;
        if (!seen.has(key)) {
          seen.add(key);
          contextEntries.push({
            type: 'track',
            uri: it.track.uri,
            playedAt: it.played_at,
            trackName: it.track.name,
            trackArtist: it.track.artists.map(a => a.name).join(', '),
            trackImage: (it.track.album.images[0] && it.track.album.images[0].url) || null,
          });
        }
      }
    }
    const limitedContexts = contextEntries.slice(0, 8);

    const detailFetches = limitedContexts.map(c => {
      if (c.type === 'playlist') return fetch('https://api.spotify.com/v1/playlists/' + c.id + '?fields=name,images', { headers: auth }).then(r => r.ok ? r.json() : null).catch(() => null);
      if (c.type === 'album') return fetch('https://api.spotify.com/v1/albums/' + c.id + '?fields=name,images', { headers: auth }).then(r => r.ok ? r.json() : null).catch(() => null);
      if (c.type === 'artist') return fetch('https://api.spotify.com/v1/artists/' + c.id, { headers: auth }).then(r => r.ok ? r.json() : null).catch(() => null);
      return Promise.resolve(null); // track type — no extra lookup needed
    });
    const details = await Promise.all(detailFetches);

    const KIND_LABEL = { playlist: 'Playlist', album: 'Album', artist: 'Artist / Radio', track: 'Track' };
    const recentGrouped = limitedContexts.map((c, i) => {
      if (c.type === 'track') {
        return { name: c.trackName, sub: c.trackArtist, uri: c.uri, image: c.trackImage, kind: 'Track' };
      }
      const d = details[i];
      const name = (d && d.name) ? d.name : (KIND_LABEL[c.type] || c.type);
      const image = (d && d.images && d.images[0] && d.images[0].url) || null;
      return { name, sub: KIND_LABEL[c.type] || c.type, uri: c.uri, image, kind: KIND_LABEL[c.type] || c.type };
    });

    // ── Podcasts: pinned favorites first (in order), then the rest by most recently followed ──
    const allShows = (shows.items || []).map(s => ({
      name: s.show.name,
      sub: s.show.publisher,
      uri: s.show.uri,
      image: (s.show.images && s.show.images[0] && s.show.images[0].url) || null,
      addedAt: s.added_at,
    }));
    const pinned = [];
    PINNED_SHOWS.forEach(pinName => {
      const match = allShows.find(s => s.name.trim().toLowerCase() === pinName);
      if (match) pinned.push(match);
    });
    const pinnedUris = new Set(pinned.map(s => s.uri));
    const rest = allShows
      .filter(s => !pinnedUris.has(s.uri))
      .sort((a, b) => new Date(b.addedAt) - new Date(a.addedAt));
    const showsOrdered = [...pinned, ...rest];

    const slim = {
      playlists: (playlists.items || []).map(p => ({
        name: p.name,
        sub: (p.tracks && p.tracks.total ? p.tracks.total : 0) + ' tracks',
        uri: p.uri,
        image: (p.images && p.images[0] && p.images[0].url) || null,
      })),
      recent: recentGrouped,
      top: (top.items || []).map(t => ({
        name: t.name,
        sub: t.artists.map(a => a.name).join(', '),
        uri: t.uri,
        image: (t.album.images[0] && t.album.images[0].url) || null,
      })),
      shows: showsOrdered,
    };

    res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=300');
    res.status(200).json(slim);
  } catch (err) {
    res.status(500).json({ error: 'spotify_failed', detail: String(err) });
  }
}
