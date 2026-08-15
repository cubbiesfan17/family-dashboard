// api/calendars.js
// ────────────────────────────────────────────────────────────
// Lets the dashboard's Settings modal (gear icon) save Family /
// Finn / Millie / Nolan calendar links for real, across every
// device — by committing an updated shared-calendars.js straight
// to GitHub on your behalf. Vercel then auto-redeploys (~30-60s)
// and every device picks up the new links on its next page load.
//
// Requires one environment variable in your Vercel project:
//   GITHUB_TOKEN  — a GitHub personal access token with
//                    "Contents: Read and write" access to this repo.
// ────────────────────────────────────────────────────────────

const OWNER = 'cubbiesfan17';
const REPO = 'family-dashboard';
const FILE_PATH = 'shared-calendars.js';
const BRANCH = 'main';

const COLUMN_META = [
  { key: 'family', label: 'Family', color: '#2e9e5b' },
  { key: 'finn', label: 'Finn', color: '#3b82f6' },
  { key: 'millie', label: 'Millie', color: '#ec4899' },
  { key: 'nolan', label: 'Nolan', color: '#eab308' },
];

function escapeSingleQuotes(str) {
  return String(str).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function buildFileContent(values) {
  const blocks = COLUMN_META.map((col) => {
    const raw = values[col.key] || '';
    const urls = raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const urlsStr = urls
      .map((u) => `      '${escapeSingleQuotes(u)}',`)
      .join('\n');
    return (
      `  {\n` +
      `    label: '${col.label}',\n` +
      `    color: '${col.color}',\n` +
      `    urls: [\n${urlsStr}\n    ],\n` +
      `  },`
    );
  }).join('\n');

  return (
    `// shared-calendars.js\n` +
    `// ────────────────────────────────────────────────────────────\n` +
    `// Family calendar URLs. Managed automatically via the dashboard's\n` +
    `// Settings (gear icon) — edits made there are committed here by\n` +
    `// api/calendars.js, so the home and work dashboards (and every\n` +
    `// device) stay in sync without retyping anything.\n` +
    `// Last updated: ${new Date().toISOString()}\n` +
    `// ────────────────────────────────────────────────────────────\n\n` +
    `window.SHARED_CALENDARS = [\n${blocks}\n];\n`
  );
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    res.status(500).json({
      error:
        'Server missing GITHUB_TOKEN environment variable. Add it in your Vercel project settings, then redeploy.',
    });
    return;
  }

  const ghHeaders = {
    Authorization: `Bearer ${token}`,
    'User-Agent': 'family-dashboard-settings',
    Accept: 'application/vnd.github+json',
  };

  if (req.method === 'GET') {
    // Return the current calendar URLs (as comma-joined strings per person)
    // so the Settings modal can pre-fill the fields when opened.
    try {
      const getResp = await fetch(
        `https://api.github.com/repos/${OWNER}/${REPO}/contents/${FILE_PATH}?ref=${BRANCH}`,
        { headers: ghHeaders }
      );
      if (!getResp.ok) throw new Error('GitHub read failed: ' + getResp.status);
      const data = await getResp.json();
      const content = Buffer.from(data.content, 'base64').toString('utf8');
      // Pull out each urls: [...] block per label with a light-touch parse.
      const values = {};
      COLUMN_META.forEach((col) => {
        const re = new RegExp(
          `label:\\s*'${col.label}'[\\s\\S]*?urls:\\s*\\[([\\s\\S]*?)\\]`
        );
        const m = content.match(re);
        if (m) {
          const urls = [...m[1].matchAll(/'((?:[^'\\]|\\.)*)'/g)].map((x) =>
            x[1].replace(/\\'/g, "'").replace(/\\\\/g, '\\')
          );
          values[col.key] = urls.join(',');
        } else {
          values[col.key] = '';
        }
      });
      res.status(200).json(values);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
    return;
  }

  if (req.method === 'POST') {
    try {
      const body =
        typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
      const fileContent = buildFileContent(body);

      // GitHub requires the current file's SHA to update it.
      const getResp = await fetch(
        `https://api.github.com/repos/${OWNER}/${REPO}/contents/${FILE_PATH}?ref=${BRANCH}`,
        { headers: ghHeaders }
      );
      if (!getResp.ok) throw new Error('Could not read current file: ' + getResp.status);
      const getData = await getResp.json();

      const putResp = await fetch(
        `https://api.github.com/repos/${OWNER}/${REPO}/contents/${FILE_PATH}`,
        {
          method: 'PUT',
          headers: { ...ghHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: 'Update calendar links via dashboard Settings',
            content: Buffer.from(fileContent, 'utf8').toString('base64'),
            sha: getData.sha,
            branch: BRANCH,
          }),
        }
      );
      if (!putResp.ok) {
        const errText = await putResp.text();
        throw new Error('GitHub commit failed (' + putResp.status + '): ' + errText);
      }

      res.status(200).json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}
