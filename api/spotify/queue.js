// /api/spotify/queue — returns the upcoming items in the user's playback queue

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

function slimItem(item) {
  if (!item) return null;
  const isEpisode = item.type === 'episode';
  if (isEpisode) {
    return {
      name: item.name,
      sub: (item.show && item.show.name) || 'Podcast',
      uri: item.uri,
      image:
        (item.images && item.images[0] && item.images[0].url) ||
        (item.show && item.show.images && item.show.images[0] && item.show.images[0].url) ||
        null,
    };
  }
  return {
    name: item.name,
    sub: (item.artists || []).map(a => a.name).join(', '),
    uri: item.uri,
    image: (item.album && item.album.images && item.album.images[0] && item.album.images[0].url) || null,
  };
}

export default async function handler(req, res) {
  const refresh = getCookie(req, 'sp_refresh');
  if (!refresh) {
    res.status(200).json({ queue: [] });
    return;
  }

  try {
    const accessToken = await getAccessToken(refresh);
    const r = await fetch('https://api.spotify.com/v1/me/player/queue', {
      headers: { Authorization: 'Bearer ' + accessToken },
    });

    if (!r.ok) {
      res.status(200).json({ queue: [] });
      return;
    }

    const j = await r.json();
    const queue = (j.queue || []).slice(0, 5).map(slimItem).filter(Boolean);

    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ queue });
  } catch (err) {
    res.status(200).json({ queue: [] });
  }
}
