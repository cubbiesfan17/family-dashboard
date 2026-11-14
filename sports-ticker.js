// ══════════════════════════════════════════════════════════════════════════
// SHARED SPORTS TICKER — single source of truth for both dashboards
//
// This file is loaded by BOTH work.html and index.html via
// <script src="/sports-ticker.js"></script>. Fix bugs and make changes
// HERE ONLY — both dashboards pick up the change automatically on next
// deploy, with no risk of the two copies drifting out of sync again.
//
// IMPORTANT: game/scoreboard data is fetched CLIENT-SIDE (in the browser),
// not from our own server. We tried moving this server-side and confirmed
// via direct testing that ESPN's scoreboard endpoint returns 403 Forbidden
// to server/datacenter requests (even with a real browser User-Agent) while
// working fine from an actual browser — so this has to run in the browser.
// Standings still work fine and are fetched directly too (statsapi.mlb.com
// and ESPN's teams endpoint don't show this blocking behavior).
// ══════════════════════════════════════════════════════════════════════════

async function fetchESPN(url){
  try{const r=await fetch(url,{signal:AbortSignal.timeout(6000)});if(r.ok)return await r.json();}catch{}
  const proxies=[u=>'https://api.allorigins.win/get?url='+encodeURIComponent(u),u=>'https://corsproxy.io/?'+encodeURIComponent(u)];
  for(const makeUrl of proxies){try{const r=await fetch(makeUrl(url),{signal:AbortSignal.timeout(8000)});if(!r.ok)continue;let t=await r.text();if(t.startsWith('{')&&t.includes('contents')){try{t=JSON.parse(t).contents;}catch{}}try{return JSON.parse(t);}catch{}}catch{}}
  return null;
}
function parseESPNGames(data,teamAbbr){
  if(!data||!data.events)return[];
  const events=data.events.filter(e=>{const comp=e.competitions&&e.competitions[0];if(!comp||!comp.competitors)return false;return comp.competitors.some(c=>c.team&&c.team.abbreviation===teamAbbr);});
  const scoreOf=c=>{const v=c&&c.score;if(v&&typeof v==='object')return parseInt(v.value!==undefined?v.value:v.displayValue)||0;return parseInt(v)||0;};
  return events.map(e=>{
    const comp=e.competitions[0];
    const home=comp.competitors.find(c=>c.homeAway==='home');
    const away=comp.competitors.find(c=>c.homeAway==='away');
    const homeAbbr=home.team.abbreviation,awayAbbr=away.team.abbreviation;
    // Team-schedule events keep status on the competition, scoreboard events on the event itself
    const stObj=(e.status&&e.status.type)?e.status:(comp.status||{});
    const stType=stObj.type||{};
    const status=stType.name||'';
    const mappedStatus=status==='STATUS_FINAL'?'closed':status==='STATUS_SCHEDULED'?'scheduled':status==='STATUS_IN_PROGRESS'?'live':'other';
    const game={start_time:e.date,home:homeAbbr,away:awayAbbr,status:mappedStatus,score:{},situation:stType.shortDetail||'',pitchers:{}};
    if(comp.probables){comp.probables.forEach(p=>{const side=p.homeAway;const name=p.athlete?p.athlete.shortName||p.athlete.displayName:'TBD';game.pitchers[side]=name;});}
    if(status==='STATUS_FINAL'||status==='STATUS_IN_PROGRESS'){game.score[homeAbbr]=scoreOf(home);game.score[awayAbbr]=scoreOf(away);}
    return game;
  });
}
// MLB Stats API's own schedule endpoint — a proven-reliable alternative to
// ESPN's scoreboard endpoint for Cubs' games specifically. ESPN's dated
// scoreboard queries have shown persistent, hard-to-pin-down intermittent
// failures (confirmed via direct debug testing), while statsapi.mlb.com has
// been rock solid for standings — so game data for Cubs now comes from here
// too, sidestepping the flaky endpoint entirely rather than continuing to
// patch around it.
const mlbAbbrMap={108:'LAA',109:'ARI',110:'BAL',111:'BOS',112:'CHC',113:'CIN',114:'CLE',115:'COL',116:'DET',117:'HOU',118:'KC',119:'LAD',120:'WSH',121:'NYM',133:'OAK',134:'PIT',135:'SD',136:'SEA',137:'SF',138:'STL',139:'TB',140:'TEX',141:'TOR',142:'MIN',143:'PHI',144:'ATL',145:'CWS',146:'MIA',147:'NYY',158:'MIL'};
function parseMLBStatsGames(data,teamAbbr){
  if(!data||!data.dates)return[];
  const out=[];
  for(const d of data.dates){
    for(const g of (d.games||[])){
      const homeId=g.teams.home.team.id,awayId=g.teams.away.team.id;
      const homeAbbr=mlbAbbrMap[homeId]||String(homeId),awayAbbr=mlbAbbrMap[awayId]||String(awayId);
      if(homeAbbr!==teamAbbr&&awayAbbr!==teamAbbr)continue;
      const state=g.status&&g.status.abstractGameState;
      const mappedStatus=state==='Final'?'closed':state==='Preview'?'scheduled':state==='Live'?'live':'other';
      const game={start_time:g.gameDate,home:homeAbbr,away:awayAbbr,status:mappedStatus,score:{},situation:'',pitchers:{}};
      if(mappedStatus==='closed'||mappedStatus==='live'){game.score[homeAbbr]=g.teams.home.score||0;game.score[awayAbbr]=g.teams.away.score||0;}
      out.push(game);
    }
  }
  return out;
}
function getMLBStandings(standingsData,teamId){
  if(!standingsData||!standingsData.records)return null;
  try{
    for(const divRecord of standingsData.records){
      const teamRecord=divRecord.teamRecords.find(r=>r.team.id===teamId);
      if(teamRecord){
        const rank=teamRecord.divisionRank?parseInt(teamRecord.divisionRank):null;
        const suffix=rank===1?'st':rank===2?'nd':rank===3?'rd':'th';
        const gb=teamRecord.gamesBack==='-'?0:parseFloat(teamRecord.gamesBack);
        const wins=teamRecord.wins,losses=teamRecord.losses;
        const divLookup={200:'AL West',201:'AL East',202:'AL Central',203:'NL West',204:'NL East',205:'NL Central'};
        const divId=divRecord.division?divRecord.division.id:null;
        const divName=(divId&&divLookup[divId])||(divRecord.division&&(divRecord.division.nameShort||divRecord.division.name))||'';
        const summary=rank+suffix+' in '+divName;
        let gamesUp=null;
        if(rank===1){const sorted=[...divRecord.teamRecords].sort((a,b)=>(parseInt(a.divisionRank)||99)-(parseInt(b.divisionRank)||99));const second=sorted.find(r=>r.team.id!==teamId);if(second)gamesUp=second.gamesBack==='-'?0:parseFloat(second.gamesBack);}
        return{rank,suffix,gb,wins,losses,summary,gamesUp};
      }
    }
    return null;
  }catch(e){return null;}
}
function getNFLDivisionStandings(data,teamAbbr){
  if(!data)return null;
  try{
    // Walk the tree; the smallest standings table containing the team is its division.
    let best=null,bestName='',parentName='';
    (function walk(node,parent){
      if(!node||typeof node!=='object')return;
      const entries=node.standings&&node.standings.entries;
      if(Array.isArray(entries)&&entries.some(en=>en.team&&en.team.abbreviation===teamAbbr)){
        if(!best||entries.length<best.length){best=entries;bestName=node.abbreviation||node.name||'';parentName=parent&&(parent.abbreviation||parent.name)||'';}
      }
      (node.children||[]).forEach(c=>walk(c,node));
    })(data,null);
    if(!best)return null;
    const stat=(en,n)=>{const x=(en.stats||[]).find(s=>s.name===n);return x&&x.value!==undefined?Number(x.value):0;};
    const rows=best.map((en,i)=>{const w=stat(en,'wins'),l=stat(en,'losses'),t=stat(en,'ties');const g=w+l+t;return{abbr:en.team.abbreviation,w,l,t,pct:g?(w+t/2)/g:0,i};});
    rows.sort((a,b)=>b.pct-a.pct||a.i-b.i);
    const idx=rows.findIndex(r=>r.abbr===teamAbbr);
    if(idx<0)return null;
    const me=rows[idx];
    const half=r=>r.w+r.t/2, halfL=r=>r.l+r.t/2;
    const rank=idx+1,suffix=rank===1?'st':rank===2?'nd':rank===3?'rd':'th';
    const leader=rows[0],second=rows[1];
    const gb=rank===1?0:((half(leader)-half(me))+(halfL(me)-halfL(leader)))/2;
    const gamesUp=rank===1&&second?((half(me)-half(second))+(halfL(second)-halfL(me)))/2:null;
    // Division label: prefer "NFC North"; fall back to whatever the data calls it
    let div=bestName;
    if(!/^(AFC|NFC)/i.test(div)){div=(/(AFC|NFC)/i.test(parentName)?parentName.replace(/.*(AFC|NFC).*/i,'$1').toUpperCase()+' ':'')+div;}
    if(!div.trim())div='NFC North';
    return{rank,suffix,gb,gamesUp,wins:me.w,losses:me.l,record:me.w+'-'+me.l+(me.t?'-'+me.t:''),summary:rank+suffix+' in '+div.trim()};
  }catch(e){console.error('nfl standings parse error',e);return null;}
}
function getTeamStandings(teamData){
  if(!teamData)return null;
  try{
    const team=teamData.team||teamData;
    const standingSummary=team.standingSummary||'';
    const rankMatch=standingSummary.match(/(\d+)(st|nd|rd|th)/i);
    const rank=rankMatch?parseInt(rankMatch[1]):null;
    let gb=null,wins=null,losses=null;
    const record=team.record;
    if(record&&record.items){
      for(const item of record.items){const stats=item.stats||[];for(const s of stats){if(s.name==='gamesBehind'||s.name==='gamesBack'||s.name==='gb'){if(s.value!==undefined&&s.value!==null){gb=s.value;break;}}}if(gb!==null)break;}
      const overall=record.items.find(r=>r.type==='total')||record.items[0];
      if(overall){const wStat=(overall.stats||[]).find(s=>s.name==='wins');const lStat=(overall.stats||[]).find(s=>s.name==='losses');if(wStat)wins=wStat.value;if(lStat)losses=lStat.value;}
    }
    return{rank,gb,wins,losses,summary:standingSummary};
  }catch(e){return null;}
}
const mlbLogoMap={'ARI':'ari','ATL':'atl','BAL':'bal','BOS':'bos','CHC':'chc','CWS':'cws','CIN':'cin','CLE':'cle','COL':'col','DET':'det','HOU':'hou','KC':'kc','LAA':'laa','LAD':'lad','MIA':'mia','MIL':'mil','MIN':'min','NYM':'nym','NYY':'nyy','OAK':'oak','PHI':'phi','PIT':'pit','SD':'sd','SEA':'sea','SF':'sf','STL':'stl','TB':'tb','TEX':'tex','TOR':'tor','WSH':'wsh'};
const nflLogoMap={'CHI':'chi','GB':'gb','MIN':'min','DET':'det','DAL':'dal','NYG':'nyg','PHI':'phi','WSH':'was','ATL':'atl','CAR':'car','NO':'no','TB':'tb','ARI':'ari','LAR':'lar','SF':'sf','SEA':'sea','BUF':'buf','MIA':'mia','NE':'ne','NYJ':'nyj','BAL':'bal','CIN':'cin','CLE':'cle','PIT':'pit','HOU':'hou','IND':'ind','JAX':'jax','TEN':'ten','DEN':'den','KC':'kc','LV':'lv','LAC':'lac'};
function teamLogo(abbr,league){const map=league==='nfl'?nflLogoMap:mlbLogoMap;const id=map[abbr]||abbr.toLowerCase();const base=league==='nfl'?'nfl':'mlb';return'<span style="display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;background:rgba(255,255,255,0.8);vertical-align:middle;margin:0 3px;flex-shrink:0;"><img src="https://a.espncdn.com/i/teamlogos/'+base+'/500/'+id+'.png" style="width:15px;height:15px;display:block;object-fit:contain;"></span>';}

async function loadSports(){
  const inner=document.getElementById('sports-ticker-inner');
  if(!inner)return;
  try{
    const now=new Date();
    const yesterday=new Date(now-3*24*60*60*1000);
    const twoWeeks=new Date(now.getTime()+14*24*60*60*1000);
    const fmt=d=>d.toISOString().slice(0,10).replace(/-/g,'');
    const threeDaysAgo=new Date(now-3*24*60*60*1000);
    const year=now.getFullYear();
    const [cubsSchedRaw,bearsSchedRaw,bearsLive,cubsTeam,bearsTeam,nflStandingsRaw]=await Promise.all([
      fetchESPN('https://statsapi.mlb.com/api/v1/schedule?sportId=1&teamId=112&startDate='+threeDaysAgo.toISOString().slice(0,10)+'&endDate='+twoWeeks.toISOString().slice(0,10)),
      // Team schedule endpoint instead of scoreboard+dates= — structurally
      // similar to the teams/3 endpoint already proven reliable for standings,
      // and returns the whole season in one call with no dates= parameter,
      // sidestepping whatever's been causing the dated scoreboard queries to
      // intermittently fail.
      fetchESPN('https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/3/schedule'),
      fetchESPN('https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard'),
      fetchESPN('https://statsapi.mlb.com/api/v1/standings?leagueId=104&season='+year+'&standingsTypes=regularSeason&hydrate=team'),
      fetchESPN('https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/3'),
      fetchESPN('https://site.api.espn.com/apis/v2/sports/football/nfl/standings?level=3'),
    ]);
    function mergeGames(live,scores,schedule,abbr){
      const safe=(d)=>{try{return parseESPNGames(d,abbr);}catch(e){console.error('ticker parse error',e);return[];}};
      const all=[...safe(live),...safe(scores),...safe(schedule)];
      const map=new Map();
      for(const g of all){const key=g.start_time;if(!map.has(key)){map.set(key,g);}else{const existing=map.get(key);const priority=s=>s==='live'?3:s==='closed'?2:1;if(priority(g.status)>priority(existing.status))map.set(key,g);}}
      return Array.from(map.values());
    }
    function loadGamesCache(key){try{const raw=localStorage.getItem(key);const arr=raw?JSON.parse(raw):[];const cutoff=Date.now()-21*24*60*60*1000;return arr.filter(g=>new Date(g.start_time).getTime()>=cutoff);}catch(e){return[];}}
    function saveGamesCache(key,games){try{localStorage.setItem(key,JSON.stringify(games));}catch(e){}}
    function mergeWithCache(freshGames,cacheKey){
      const cached=loadGamesCache(cacheKey);
      const freshKeys=new Set(freshGames.map(g=>g.start_time));
      const supplemental=cached.filter(g=>!freshKeys.has(g.start_time));
      const merged=[...freshGames,...supplemental];
      saveGamesCache(cacheKey,merged);
      return merged;
    }
    let cubsFresh=[];try{cubsFresh=parseMLBStatsGames(cubsSchedRaw,'CHC');}catch(e){console.error('ticker cubs parse error',e);}
    const cubsGames=mergeWithCache(cubsFresh,'sports_cache_cubs_v1');
    const bearsGames=mergeWithCache(mergeGames(bearsLive,null,bearsSchedRaw,'CHI'),'sports_cache_bears_v1');
    let cubsStandings=null,bearsStandings=null;
    try{cubsStandings=getMLBStandings(cubsTeam,112);}catch(e){}
    try{bearsStandings=getNFLDivisionStandings(nflStandingsRaw,'CHI')||getTeamStandings(bearsTeam);}catch(e){}
    function buildTeamTicker(name,logo,games,teamAbbr,standings){
      const hasRecent=games.some(g=>g.status==='closed');
      const hasLive=games.some(g=>g.status==='live');
      const hasUpcoming=games.some(g=>g.status==='scheduled'&&new Date(g.start_time)<=twoWeeks);
      if(!hasRecent&&!hasLive&&!hasUpcoming)return null;
      let parts=[];
      const live=games.find(g=>g.status==='live');
      if(live){
        const myScore=live.score[teamAbbr]||0;
        const oppAbbr=live.home===teamAbbr?live.away:live.home;
        const oppScore=live.score[oppAbbr]||0;
        const loc=live.home===teamAbbr?'vs':'@';
        const winning=myScore>oppScore,tied=myScore===oppScore;
        const color=winning?'#4CAF82':tied?'#E8A838':'#E05C5C';
        const situation=live.situation||'In Progress';
        parts.push('<span style="color:#FFFFFF;font-weight:800;display:inline-flex;align-items:center;gap:4px;vertical-align:middle;">'+logo+' '+name.toUpperCase()+'</span>');
        parts.push('<span style="color:#3A7A9C;margin:0 6px;">|</span><span style="color:#E8A838;font-weight:700;">🔴 LIVE</span><span style="color:#9BB5C5;margin-left:4px;">'+loc+' '+teamLogo(oppAbbr,teamAbbr==='CHI'?'nfl':'mlb')+oppAbbr+'</span><span style="color:#3A7A9C;margin:0 6px;">|</span><span style="color:'+color+';font-weight:700;">'+myScore+'-'+oppScore+'</span><span style="color:#7A99AA;margin-left:4px;font-size:.68rem;">('+situation+')</span>');
        return parts.join('');
      }
      const days=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
      const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      parts.push('<span style="color:#FFFFFF;font-weight:800;display:inline-flex;align-items:center;gap:4px;vertical-align:middle;">'+logo+' '+name.toUpperCase()+'</span>');
      const recentCutoff=teamAbbr==='CHI'?new Date(now-8*24*60*60*1000):yesterday;
      const recent=games.filter(g=>{if(g.status!=='closed')return false;return new Date(g.start_time)>=recentCutoff;}).sort((a,b)=>new Date(b.start_time)-new Date(a.start_time))[0];
      if(recent){
        const myScore=recent.score[teamAbbr];
        const oppAbbr=recent.home===teamAbbr?recent.away:recent.home;
        const oppScore=recent.score[oppAbbr];
        const won=myScore>oppScore;
        const loc=recent.home===teamAbbr?'vs':'@';
        const color=won?'#5DD99A':'#FF6B6B';
        const gameD=new Date(recent.start_time).toLocaleDateString('en-US',{timeZone:'America/Chicago'});
        const todayD=now.toLocaleDateString('en-US',{timeZone:'America/Chicago'});
        const yesterD=new Date(now-86400000).toLocaleDateString('en-US',{timeZone:'America/Chicago'});
        const diffDays=gameD===todayD?0:gameD===yesterD?1:Math.floor((now-new Date(recent.start_time))/86400000);
        const daysAgoStr=diffDays===0?'today':diffDays===1?'yesterday':diffDays+' days ago';
        const league=teamAbbr==='CHI'?'nfl':'mlb';
        parts.push('<span style="color:#3A7A9C;margin:0 6px;">|</span><span style="color:'+color+';font-weight:800;">'+(won?'W':'L')+' '+myScore+'-'+oppScore+'</span><span style="color:#B8D4E0;margin-left:4px;">'+loc+' '+teamLogo(oppAbbr,league)+oppAbbr+'</span><span style="color:#6A8A99;margin-left:3px;font-size:.62rem;">('+daysAgoStr+')</span>');
      }
      const next=games.filter(g=>{if(g.status!=='scheduled')return false;const t=new Date(g.start_time);return t>=now&&t<=twoWeeks;}).sort((a,b)=>new Date(a.start_time)-new Date(b.start_time))[0];
      if(next){
        const oppAbbr=next.home===teamAbbr?next.away:next.home;
        const loc=next.home===teamAbbr?'vs':'@';
        const d=new Date(next.start_time);
        const chicagoDate=new Date(d.toLocaleString('en-US',{timeZone:'America/Chicago'}));
        const dateStr=days[chicagoDate.getDay()]+' '+months[chicagoDate.getMonth()]+' '+chicagoDate.getDate();
        const timeStr=d.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',hour12:true,timeZone:'America/Chicago'});
        parts.push('<span style="color:#3A7A9C;margin:0 6px;">|</span><span style="color:#D0E8F5;">📅 '+loc+' '+teamLogo(oppAbbr,teamAbbr==='CHI'?'nfl':'mlb')+oppAbbr+' · '+dateStr+', '+timeStr+'</span>');
      }
      if(standings&&(standings.rank||standings.wins!==null)){
        let standingText=standings.summary||'';
        if(standings.rank===1){if(standings.gamesUp&&standings.gamesUp>0){standingText+=' · '+standings.gamesUp+' up';}else{standingText+=' 🔝';}}
        else if(standings.gb!==null&&parseFloat(standings.gb)>0)standingText+=' · '+standings.gb+' GB';
        else if(standings.gb!==null&&parseFloat(standings.gb)===0&&standings.rank>1)standingText+=' · tied';
        if(standings.record)standingText+=' ('+standings.record+')';else if(standings.wins!==null&&standings.losses!==null)standingText+=' ('+standings.wins+'-'+standings.losses+')';
        parts.push('<span style="color:#3A7A9C;margin:0 6px;">|</span><span style="color:#A8CCE0;">'+standingText+'</span>');
      }
      return parts.join('');
    }
    const safeBuild=(...a)=>{try{return buildTeamTicker(...a);}catch(e){console.error('ticker build error',e);return null;}};
    const items=[
      safeBuild('Cubs','<span style="display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:50%;background:rgba(255,255,255,0.8);vertical-align:middle;flex-shrink:0;"><img src="https://a.espncdn.com/i/teamlogos/mlb/500/chc.png" style="width:18px;height:18px;display:block;object-fit:contain;"></span>',cubsGames,'CHC',cubsStandings),
      safeBuild('Bears','<span style="display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:50%;background:rgba(255,255,255,0.8);vertical-align:middle;flex-shrink:0;"><img src="https://a.espncdn.com/i/teamlogos/nfl/500/chi.png" style="width:18px;height:18px;display:block;object-fit:contain;"></span>',bearsGames,'CHI',bearsStandings),
    ];
    const populatedCount=items.filter(Boolean).length;
    if(window._lastGoodTickerCount!==undefined && populatedCount<window._lastGoodTickerCount){
      return;
    }
    window._lastGoodTickerCount=populatedCount;
    const filteredItems=items.filter(Boolean);
    if(!filteredItems.length){inner.innerHTML='<span style="color:#9BB5C5;padding:0 20px;">No sports data</span>';return;}
    const separator='<span style="color:#4A7A95;margin:0 24px;">◆</span>';
    const tickerContent='<span style="padding:0 30px;">'+filteredItems.join(separator)+'</span>';
    inner.innerHTML=tickerContent+tickerContent+tickerContent+tickerContent;
    if(window._tickerRAF)cancelAnimationFrame(window._tickerRAF);
    inner.style.transform='translateX(0)';
    setTimeout(()=>{
      const singleWidth=inner.scrollWidth/4;const speed=35;let pos=0,last=null;
      function step(ts){if(last!==null){pos+=(ts-last)/1000*speed;if(pos>=singleWidth)pos-=singleWidth;inner.style.transform='translateX(-'+pos+'px)';}last=ts;window._tickerRAF=requestAnimationFrame(step);}
      window._tickerRAF=requestAnimationFrame(step);
    },300);
  } catch(err) {
    console.error('ticker error',err);
    if(window._lastGoodTickerCount)return; // keep the last good ticker on screen
    inner.innerHTML='<span style="color:#9BB5C5;padding:0 20px;">Sports data unavailable <span style="font-size:.6rem;opacity:.6;">('+(err&&err.message?err.message:err)+')</span></span>';
  }
}
