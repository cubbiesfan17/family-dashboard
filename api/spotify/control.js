// /api/spotify/control — play, pause, next, previous
// POST body: { action: 'play' | 'pause' | 'next' | 'previous' }

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

const ACTIONS = {
  play: { method: 'PUT', path: '/me/player/play' },
  pause: { method: 'PUT', path: '/me/player/pause' },
  next: { method: 'POST', path: '/me/player/next' },
  previous: { method: 'POST', path: '/me/player/previous' },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const refresh = getCookie(req, 'sp_refresh');
  if (!refresh) {
    res.status(401).json({ error: 'not_connected' });
    return;
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const action = ACTIONS[body.action];
  if (!action) {
    res.status(400).json({ error: 'unknown_action' });
    return;
  }

  try {
    const accessToken = await getAccessToken(refresh);
    const r = await fetch('https://api.spotify.com' + action.path, {
      method: action.method,
      headers: { Authorization: 'Bearer ' + accessToken },
    });

    // Spotify returns 204 No Content on success, 404 if no active device
    if (r.status === 404) {
      res.status(200).json({ ok: false, error: 'no_active_device' });
      return;
    }
    res.status(200).json({ ok: r.ok });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'control_failed', detail: String(err) });
  }
}
