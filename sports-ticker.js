// ══════════════════════════════════════════════════════════════════════════
// SHARED SPORTS TICKER — single source of truth for both dashboards
//
// This file is loaded by BOTH work.html and index.html via
// <script src="/sports-ticker.js"></script>. Fix bugs and make changes
// HERE ONLY — both dashboards pick up the change automatically on next
// deploy, with no risk of the two copies drifting out of sync again.
//
// All data fetching/parsing now happens server-side in /api/sports.js —
// this file is just a thin renderer, which is what makes it reliable: no
// more direct-to-ESPN calls, no CORS proxies, no client-side merge logic
// to get subtly wrong. Requires an element with id="sports-ticker-inner".
// ══════════════════════════════════════════════════════════════════════════

const mlbLogoMap={'ARI':'ari','ATL':'atl','BAL':'bal','BOS':'bos','CHC':'chc','CWS':'cws','CIN':'cin','CLE':'cle','COL':'col','DET':'det','HOU':'hou','KC':'kc','LAA':'laa','LAD':'lad','MIA':'mia','MIL':'mil','MIN':'min','NYM':'nym','NYY':'nyy','OAK':'oak','PHI':'phi','PIT':'pit','SD':'sd','SEA':'sea','SF':'sf','STL':'stl','TB':'tb','TEX':'tex','TOR':'tor','WSH':'wsh'};
const nflLogoMap={'CHI':'chi','GB':'gb','MIN':'min','DET':'det','DAL':'dal','NYG':'nyg','PHI':'phi','WSH':'was','ATL':'atl','CAR':'car','NO':'no','TB':'tb','ARI':'ari','LAR':'lar','SF':'sf','SEA':'sea','BUF':'buf','MIA':'mia','NE':'ne','NYJ':'nyj','BAL':'bal','CIN':'cin','CLE':'cle','PIT':'pit','HOU':'hou','IND':'ind','JAX':'jax','TEN':'ten','DEN':'den','KC':'kc','LV':'lv','LAC':'lac'};
function teamLogo(abbr,league){const map=league==='nfl'?nflLogoMap:mlbLogoMap;const id=map[abbr]||abbr.toLowerCase();const base=league==='nfl'?'nfl':'mlb';return'<span style="display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;background:rgba(255,255,255,0.8);vertical-align:middle;margin:0 3px;flex-shrink:0;"><img src="https://a.espncdn.com/i/teamlogos/'+base+'/500/'+id+'.png" style="width:15px;height:15px;display:block;object-fit:contain;"></span>';}

function buildTeamTicker(team){
  if(!team)return null;
  const name=team.name,teamAbbr=name==='Cubs'?'CHC':'CHI',league=team.sport;
  const hasAny=team.recent||team.standings||team.next;
  if(!hasAny)return null;
  const logo='<span style="display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:50%;background:rgba(255,255,255,0.8);vertical-align:middle;flex-shrink:0;"><img src="https://a.espncdn.com/i/teamlogos/'+league+'/500/'+(league==='nfl'?nflLogoMap[teamAbbr]:mlbLogoMap[teamAbbr])+'.png" style="width:18px;height:18px;display:block;object-fit:contain;"></span>';
  let parts=[];
  parts.push('<span style="color:#FFFFFF;font-weight:800;display:inline-flex;align-items:center;gap:4px;vertical-align:middle;">'+logo+' '+name.toUpperCase()+'</span>');

  if(team.recent){
    const r=team.recent;
    const [myScore,oppScore]=r.score.split('-');
    const won=r.result==='W';
    const loc=r.isHome?'vs':'@';
    const color=won?'#5DD99A':'#FF6B6B';
    const now=new Date();
    const gameDate=new Date(r.date);
    const gameD=gameDate.toLocaleDateString('en-US',{timeZone:'America/Chicago'});
    const todayD=now.toLocaleDateString('en-US',{timeZone:'America/Chicago'});
    const yesterD=new Date(now-86400000).toLocaleDateString('en-US',{timeZone:'America/Chicago'});
    const diffDays=gameD===todayD?0:gameD===yesterD?1:Math.max(0,Math.floor((now-gameDate)/86400000));
    const daysAgoStr=diffDays===0?'today':diffDays===1?'yesterday':diffDays+' days ago';
    parts.push('<span style="color:#3A7A9C;margin:0 6px;">|</span><span style="color:'+color+';font-weight:800;">'+r.result+' '+myScore+'-'+oppScore+'</span><span style="color:#B8D4E0;margin-left:4px;">'+loc+' '+teamLogo(r.opponent,league)+r.opponent+'</span><span style="color:#6A8A99;margin-left:3px;font-size:.62rem;">('+daysAgoStr+')</span>');
  }

  if(team.standings&&(team.standings.rank||team.standings.wins!=null)){
    const s=team.standings;
    const suffix=s.rank===1?'st':s.rank===2?'nd':s.rank===3?'rd':'th';
    let standingText=(s.rank?s.rank+suffix+' in '+s.division:s.division)||'';
    if(s.rank===1){standingText+=' 🔝';}
    else if(s.gb!=null&&parseFloat(s.gb)>0)standingText+=' · '+s.gb+' GB';
    if(s.wins!=null&&s.losses!=null)standingText+=' ('+s.wins+'-'+s.losses+')';
    parts.push('<span style="color:#3A7A9C;margin:0 6px;">|</span><span style="color:#A8CCE0;">'+standingText+'</span>');
  }

  if(team.next){
    const n=team.next;
    const days=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const loc=n.isHome?'vs':'@';
    const d=new Date(n.date);
    const chicagoDate=new Date(d.toLocaleString('en-US',{timeZone:'America/Chicago'}));
    const dateStr=days[chicagoDate.getDay()]+' '+months[chicagoDate.getMonth()]+' '+chicagoDate.getDate();
    const timeStr=d.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',hour12:true,timeZone:'America/Chicago'});
    parts.push('<span style="color:#3A7A9C;margin:0 6px;">|</span><span style="color:#D0E8F5;">📅 '+loc+' '+teamLogo(n.opponent,league)+n.opponent+' · '+dateStr+', '+timeStr+'</span>');
  }

  return parts.join('');
}

async function loadSports(){
  const inner=document.getElementById('sports-ticker-inner');
  if(!inner)return;
  try{
    const r=await fetch('/api/sports',{signal:AbortSignal.timeout(8000)});
    if(!r.ok)throw new Error('sports fetch failed');
    const data=await r.json();

    const items=[buildTeamTicker(data.cubs),buildTeamTicker(data.bears)];

    // Fail-safe: if this refresh produced FEWER populated team segments than the
    // last successful build had (e.g. a transient server hiccup), keep showing
    // the last good ticker instead of silently dropping a team.
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
    // Keep showing whatever's already there rather than replacing with an error,
    // unless nothing has ever loaded yet
    if(!inner.innerHTML){inner.innerHTML='<span style="color:#9BB5C5;padding:0 20px;">Sports data unavailable</span>';}
  }
}
