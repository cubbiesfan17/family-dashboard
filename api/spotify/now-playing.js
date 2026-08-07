// /api/spotify/now-playing — returns what's currently playing on the account,
// regardless of which device/app is actually playing it (Chrome, phone, Echo, etc.)

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
    res.status(401).json({ playing: false, error: 'not_connected' });
    return;
  }

  try {
    const accessToken = await getAccessToken(refresh);
    // IMPORTANT: Spotify only returns track data by default — episodes (podcasts)
    // are silently omitted unless explicitly requested via additional_types.
    const r = await fetch('https://api.spotify.com/v1/me/player/currently-playing?additional_types=track,episode', {
      headers: { Authorization: 'Bearer ' + accessToken },
    });

    if (r.status === 204) {
      // Nothing playing anywhere on the account
      res.status(200).json({ playing: false });
      return;
    }
    if (!r.ok) {
      res.status(200).json({ playing: false });
      return;
    }

    const j = await r.json();
    if (!j || !j.item) {
      res.status(200).json({ playing: false });
      return;
    }

    const item = j.item;
    const isEpisode = item.type === 'episode' || j.currently_playing_type === 'episode';

    let name, sub, image;
    if (isEpisode) {
      name = item.name;
      sub = (item.show && item.show.name) || 'Podcast';
      image =
        (item.images && item.images[0] && item.images[0].url) ||
        (item.show && item.show.images && item.show.images[0] && item.show.images[0].url) ||
        null;
    } else {
      name = item.name;
      sub = (item.artists || []).map(a => a.name).join(', ');
      image = (item.album && item.album.images && item.album.images[0]) ? item.album.images[0].url : null;
    }

    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({
      playing: !!j.is_playing,
      name,
      artist: sub,
      image,
      progress_ms: j.progress_ms || 0,
      duration_ms: item.duration_ms || 0,
      uri: item.uri,
      device: (j.device && j.device.name) || null,
      isEpisode,
    });
  } catch (err) {
    res.status(500).json({ playing: false, error: 'now_playing_failed', detail: String(err) });
  }
}
