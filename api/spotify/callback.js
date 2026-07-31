// /api/spotify/callback — exchanges code for tokens, stores refresh token in cookie

export default async function handler(req, res) {
  const { code } = req.query;
  if (!code) {
    res.status(400).send('Missing code');
    return;
  }

  const basic = Buffer.from(
    process.env.SPOTIFY_CLIENT_ID + ':' + process.env.SPOTIFY_CLIENT_SECRET
  ).toString('base64');

  try {
    const r = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + basic,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: process.env.SPOTIFY_REDIRECT_URI,
      }),
    });
    const tokens = await r.json();

    if (tokens.refresh_token) {
      res.setHeader('Set-Cookie', [
        `sp_refresh=${tokens.refresh_token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=31536000`,
      ]);
    }

    res.redirect('/work.html?spotify=connected');
  } catch (err) {
    res.status(500).send('Spotify token exchange failed: ' + String(err));
  }
}
