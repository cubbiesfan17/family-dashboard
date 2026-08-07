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
    // Use the full player-state endpoint (not just currently-playing) so we can
    // also read shuffle_state — needed to be honest about Up Next accuracy,
    // since Spotify's queue order and shuffle's actual next-track pick can disagree.
    const r = await fetch('https://api.spotify.com/v1/me/player?additional_types=track,episode', {
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
    if (!j) {
      res.status(200).json({ playing: false });
      return;
    }
    // During commercial breaks, Spotify gives no track/episode data at all —
    // show a distinct "Advertisement" state so play/pause/skip still work
    if (j.currently_playing_type === 'ad' || (!j.item && j.is_playing)) {
      res.setHeader('Cache-Control', 'no-store');
      res.status(200).json({
        playing: !!j.is_playing,
        name: 'Advertisement',
        artist: '',
        image: null,
        progress_ms: 0,
        duration_ms: 0,
        uri: null,
        device: (j.device && j.device.name) || null,
        isAd: true,
      });
      return;
    }
    if (!j.item) {
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
      shuffle: !!j.shuffle_state,
    });
  } catch (err) {
    res.status(500).json({ playing: false, error: 'now_playing_failed', detail: String(err) });
  }
}
