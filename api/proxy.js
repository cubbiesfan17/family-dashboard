const https = require('https');
const http = require('http');

export default function handler(req, res) {
  const { url } = req.query;
  if (!url) return res.status(400).send('Missing url parameter');

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const decodedUrl = decodeURIComponent(url);
  const lib = decodedUrl.startsWith('https') ? https : http;

  const request = lib.get(decodedUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; FamilyDashboard/1.0)',
      'Accept': 'text/calendar, application/ics, */*'
    },
    timeout: 8000
  }, (proxyRes) => {
    // Follow redirects
    if (proxyRes.statusCode >= 300 && proxyRes.statusCode < 400 && proxyRes.headers.location) {
      return handler({ query: { url: encodeURIComponent(proxyRes.headers.location) } }, res);
    }
    res.setHeader('Content-Type', proxyRes.headers['content-type'] || 'text/calendar');
    res.status(proxyRes.statusCode);
    let data = '';
    proxyRes.on('data', chunk => data += chunk);
    proxyRes.on('end', () => res.send(data));
  });

  request.on('error', (e) => res.status(500).send('Proxy error: ' + e.message));
  request.on('timeout', () => { request.destroy(); res.status(504).send('Timeout'); });
}
