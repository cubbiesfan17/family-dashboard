// /api/spotify/auth — starts Spotify OAuth
// Requires env vars: SPOTIFY_CLIENT_ID, SPOTIFY_REDIRECT_URI

export default function handler(req, res) {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const redirectUri = process.env.SPOTIFY_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    res.status(500).send('Missing SPOTIFY_CLIENT_ID or SPOTIFY_REDIRECT_URI env vars');
    return;
  }

  const scopes = [
    'user-read-private',
    'user-read-recently-played',
    'user-top-read',
    'playlist-read-private',
    'playlist-read-collaborative',
    'user-read-currently-playing',
    'user-read-playback-state',
    'user-modify-playback-state',
    'user-library-read',
  ].join(' ');

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    scope: scopes,
    redirect_uri: redirectUri,
  });

  res.redirect('https://accounts.spotify.com/authorize?' + params.toString());
}
