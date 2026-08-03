// /api/spotify/me — returns the user's playlists, recently played, top tracks

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
      fetch('https://api.spotify.com/v1/me/player/recently-played?limit=8', { headers: auth }),
      fetch('https://api.spotify.com/v1/me/top/tracks?limit=8&time_range=short_term', { headers: auth }),
      fetch('https://api.spotify.com/v1/me/shows?limit=12', { headers: auth }),
    ]);

    const [playlists, recent, top, shows] = await Promise.all([
      playlistsR.json(),
      recentR.json(),
      topR.json(),
      showsR.json(),
    ]);

    const slim = {
      playlists: (playlists.items || []).map(p => ({
        id: p.id,
        name: p.name,
        uri: p.uri,
        image: (p.images && p.images[0] && p.images[0].url) || null,
        tracks: p.tracks && p.tracks.total,
      })),
      recent: (recent.items || []).map(it => ({
        name: it.track.name,
        artist: it.track.artists.map(a => a.name).join(', '),
        uri: it.track.uri,
        image: (it.track.album.images[0] && it.track.album.images[0].url) || null,
        playedAt: it.played_at,
      })),
      top: (top.items || []).map(t => ({
        name: t.name,
        artist: t.artists.map(a => a.name).join(', '),
        uri: t.uri,
        image: (t.album.images[0] && t.album.images[0].url) || null,
      })),
      shows: (shows.items || [])
        .slice()
        .sort((a, b) => new Date(b.added_at) - new Date(a.added_at))
        .map(s => ({
          name: s.show.name,
          publisher: s.show.publisher,
          uri: s.show.uri,
          image: (s.show.images && s.show.images[0] && s.show.images[0].url) || null,
        })),
    };

    res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=300');
    res.status(200).json(slim);
  } catch (err) {
    res.status(500).json({ error: 'spotify_failed', detail: String(err) });
  }
}
