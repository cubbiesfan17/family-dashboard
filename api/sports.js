// /api/sports — server-side sports data for the dashboard ticker.
//
// WHY THIS EXISTS: the previous approach had the TABLET's browser making 6+
// parallel requests directly to ESPN's undocumented API, sometimes through
// free public CORS proxies when direct requests got blocked. That's three
// independent points of failure (tablet's own WiFi, third-party proxy
// uptime, an API with no formal contract) stacked on each other, and it
// produced a long string of intermittent bugs. Fetching server-to-server
// here eliminates the CORS-proxy dependency entirely and removes the
// tablet's own network reliability from the equation — the tablet just
// asks OUR server one simple question and gets a clean answer back.
//
// Returns: { cubs: {...}, bears: {...} }, each shaped as:
//   { name, logoId, recent: {opponent,result,score,date} | null,
//     standings: {rank,division,gb,wins,losses} | null,
//     next: {opponent,date,venue} | null }

async function fetchJSON(url) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return null;
    return await r.json();
  } catch (e) {
    return null;
  }
}

function fmtDate(d) {
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

// Parse ESPN scoreboard events into a flat list of games involving teamAbbr
function parseEvents(data, teamAbbr) {
  if (!data || !data.events) return [];
  const out = [];
  for (const e of data.events) {
    const comp = e.competitions && e.competitions[0];
    if (!comp) continue;
    const competitors = comp.competitors || [];
    const me = competitors.find(c => c.team && c.team.abbreviation === teamAbbr);
    if (!me) continue;
    const opp = competitors.find(c => c !== me);
    const statusName = (e.status && e.status.type && e.status.type.name) || '';
    // Only trust an explicit, recognized status — do not guess for anything else
    const status = statusName === 'STATUS_FINAL' ? 'closed'
                  : statusName === 'STATUS_SCHEDULED' ? 'scheduled'
                  : statusName === 'STATUS_IN_PROGRESS' ? 'live'
                  : 'other';
    out.push({
      date: e.date,
      status,
      myScore: me.score,
      oppScore: opp ? opp.score : null,
      oppAbbr: opp && opp.team ? opp.team.abbreviation : '',
      isHome: me.homeAway === 'home',
      venue: (comp.venue && comp.venue.fullName) || '',
    });
  }
  return out;
}

function pickRecentAndNext(games) {
  const now = Date.now();
  const closed = games.filter(g => g.status === 'closed').sort((a, b) => new Date(b.date) - new Date(a.date));
  const upcoming = games.filter(g => g.status === 'scheduled' && new Date(g.date).getTime() >= now).sort((a, b) => new Date(a.date) - new Date(b.date));
  const recentRaw = closed[0] || null;
  const nextRaw = upcoming[0] || null;
  const recent = recentRaw ? {
    opponent: recentRaw.oppAbbr,
    result: Number(recentRaw.myScore) > Number(recentRaw.oppScore) ? 'W' : 'L',
    score: recentRaw.myScore + '-' + recentRaw.oppScore,
    date: recentRaw.date,
    isHome: recentRaw.isHome,
  } : null;
  const next = nextRaw ? {
    opponent: nextRaw.oppAbbr,
    date: nextRaw.date,
    venue: nextRaw.venue,
    isHome: nextRaw.isHome,
  } : null;
  return { recent, next };
}

async function getMLBStandings(teamId) {
  const year = new Date().getFullYear();
  const data = await fetchJSON('https://statsapi.mlb.com/api/v1/standings?leagueId=104&season=' + year + '&standingsTypes=regularSeason&hydrate=team');
  if (!data || !data.records) return null;
  const divLookup = {200:'AL West',201:'AL East',202:'AL Central',203:'NL West',204:'NL East',205:'NL Central'};
  for (const rec of data.records) {
    const teamRec = (rec.teamRecords || []).find(t => t.team && t.team.id === teamId);
    if (teamRec) {
      const rank = parseInt(teamRec.divisionRank) || null;
      const gbRaw = teamRec.gamesBack;
      const gb = gbRaw === '-' ? 0 : parseFloat(gbRaw);
      const divId = rec.division ? rec.division.id : null;
      const division = (divId && divLookup[divId]) || (rec.division && (rec.division.nameShort || rec.division.name)) || '';
      return { rank, division, gb, wins: teamRec.wins, losses: teamRec.losses };
    }
  }
  return null;
}

async function getNFLStandings(teamId) {
  const data = await fetchJSON('https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/' + teamId);
  if (!data) return null;
  try {
    const team = data.team || data;
    const summary = team.standingSummary || '';
    const rankMatch = summary.match(/(\d+)(st|nd|rd|th)/i);
    const rank = rankMatch ? parseInt(rankMatch[1]) : null;
    let wins = null, losses = null;
    const record = team.record;
    if (record && record.items) {
      const overall = record.items.find(r => r.type === 'total') || record.items[0];
      if (overall) {
        const wStat = (overall.stats || []).find(s => s.name === 'wins');
        const lStat = (overall.stats || []).find(s => s.name === 'losses');
        if (wStat) wins = wStat.value;
        if (lStat) losses = lStat.value;
      }
    }
    // ESPN's standingSummary is usually like "1st in AFC North" — extract division name
    const divMatch = summary.match(/in (.+)$/i);
    const division = divMatch ? divMatch[1] : '';
    return { rank, division, gb: null, wins, losses };
  } catch (e) {
    return null;
  }
}

export default async function handler(req, res) {
  try {
    const now = new Date();
    const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);
    const threeWeeksOut = new Date(now.getTime() + 21 * 24 * 60 * 60 * 1000);
    const dateRange = fmtDate(tenDaysAgo) + '-' + fmtDate(threeWeeksOut);

    const [cubsScoreboard, bearsScoreboard, cubsStandings, bearsStandings] = await Promise.all([
      fetchJSON('https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard?dates=' + dateRange + '&limit=50'),
      fetchJSON('https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=' + dateRange + '&limit=50'),
      getMLBStandings(112), // Cubs MLB team ID
      getNFLStandings(3),   // Bears ESPN team ID
    ]);

    const cubsGames = parseEvents(cubsScoreboard, 'CHC');
    const bearsGames = parseEvents(bearsScoreboard, 'CHI');

    const cubsRN = pickRecentAndNext(cubsGames);
    const bearsRN = pickRecentAndNext(bearsGames);

    const result = {
      cubs: { name: 'Cubs', logoId: 'chc', sport: 'mlb', ...cubsRN, standings: cubsStandings },
      bears: { name: 'Bears', logoId: 'chi', sport: 'nfl', ...bearsRN, standings: bearsStandings },
      updatedAt: now.toISOString(),
    };

    res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=180');
    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ error: 'sports_failed', detail: String(err) });
  }
}
