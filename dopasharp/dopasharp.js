/* 도파# shared brand frame v1.3 — identical in every dopa.shap repo. Needs tokens.css + components.css.
   A page names itself with <meta name="dopasharp:game" content="soju-game">, then:
   - <header data-dopa="header"></header>  → D# logo · GAME 00N / CODE · "다른 게임 보기"
   - <footer data-dopa="footer"></footer>  → MADE BY 도파#
   - DopaSharp.showResult({...})           → result sheet: retry / copy / share / challenge / other games
   - DopaSharp.moreGames() or [data-dopa-more] → the games page on the hub (dopasharp.github.io/games/)
   - DopaSharp.track(name, params)         → game_view, game_start, game_complete, game_retry, share_click, more_games_click */
(function(){
const HUB='https://dopasharp.github.io/';
// The game list lives only on the hub (dopasharp.github.io/games.js). It is loaded from there, so a game added
// to the hub gets its GAME 00N / CODE here without touching any game repo. Until it arrives (or if it can't
// load) the header shows the logo alone.
let GAMES=[],current=null;
const LOGO='<svg viewBox="0 0 132 80" fill="currentColor" aria-hidden="true"><g transform="translate(18 0) skewX(-14)"><path fill-rule="evenodd" d="M18 10h25c19 0 30 12 30 30S62 70 43 70H18zm15 13v34h9c10 0 16-6.5 16-17s-6-17-16-17z"/><rect x="83" y="12" width="9" height="56"/><rect x="100" y="12" width="9" height="56"/><rect x="77" y="27" width="38" height="9"/><rect x="77" y="45" width="38" height="9"/></g></svg>';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const meta=document.querySelector('meta[name="dopasharp:game"]');
const myId=meta&&meta.content||'';
const gameId=myId||location.pathname;
const pageUrl=()=>location.origin+location.pathname;
const logo=`<span class="dopa-logo" role="img" aria-label="도파#">${LOGO}</span>`;

// Analytics with the shared event names. The hub's analytics.js holds the GA4 ID; events wait here until it has loaded.
const pending=window.__dopaPending=window.__dopaPending||[];
function track(name,params){
 const data={game_id:gameId,...params};
 try{if(window.__dopaGA)window.gtag('event',name,data);else pending.push([name,data])}catch(e){}
 document.dispatchEvent(new CustomEvent('dopasharp:track',{detail:{name,...data}}));
}

// One GA4 setup for every game: load the hub's analytics.js (it does nothing until a GA4 ID is set there).
if(!document.querySelector('script[src$="/analytics.js"]')){const s=document.createElement('script');s.src=HUB+'analytics.js';s.async=true;document.head.appendChild(s)}
// Every "other games" entry leads to the hub's games page, which hides the game the player came from.
const gamesUrl=()=>`${HUB}games/${myId?'?from='+encodeURIComponent(myId):''}`;
const labelHTML=()=>current?`<span class="dopa-label">GAME ${current.no} / ${esc(current.code)}</span>`:'';
const brandHTML=()=>`<a class="dopa-brand" href="${HUB}" aria-label="도파# 홈">${logo}${labelHTML()}</a>`;
function useGames(list){
 if(!Array.isArray(list))return;
 GAMES=list.map((g,i)=>({id:g.id,code:g.code||String(g.id).replace(/[^a-z0-9]/gi,'').toUpperCase(),art:g.emoji,name:g.name,no:String(i+1).padStart(3,'0'),url:`${HUB}${g.id}/`}));
 current=GAMES.find(g=>g.id===myId)||null;
 if(current)document.querySelectorAll('.dopa-brand').forEach(a=>{if(!a.querySelector('.dopa-label'))a.insertAdjacentHTML('beforeend',labelHTML())});
}
if(window.DOPA_GAMES)useGames(window.DOPA_GAMES);
else{const s=document.createElement('script');s.src=HUB+'games.js';s.async=true;s.onload=()=>useGames(window.DOPA_GAMES);document.head.appendChild(s)}
const footerHTML=`<span>MADE BY 도파#</span>`;
let toastTimer;
function toast(text){
 let t=document.querySelector('.dopa-toast');
 if(!t){t=document.createElement('div');t.className='dopa-toast';t.setAttribute('role','status');document.body.appendChild(t)}
 t.textContent=text;t.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.hidden=true,2400);
}
async function copy(text,done){
 try{await navigator.clipboard.writeText(text);toast(done)}
 catch(e){window.prompt('아래 내용을 복사해 주세요.',text)}
}
// The phone's share sheet (Instagram DM, KakaoTalk…) where there is one, the clipboard elsewhere.
async function share({title,text,url},copied){
 if(navigator.share){try{await navigator.share({title,text,url});return}catch(e){if(e.name==='AbortError')return}}
 copy(text?text+'\n'+url:url,copied);
}

let sheet,lastFocus;
function openSheet(inner,label){
 if(!sheet){
  sheet=document.createElement('div');sheet.className='dopa-sheet';sheet.hidden=true;
  sheet.addEventListener('click',e=>{if(e.target===sheet||e.target.closest('[data-dopa-close]'))close()});
  sheet.addEventListener('keydown',e=>{if(e.key==='Escape')close()});
  document.body.appendChild(sheet);
 }
 lastFocus=document.activeElement;
 sheet.innerHTML=`<div class="dopa-sheet-card" role="dialog" aria-modal="true" aria-label="${esc(label)}" tabindex="-1"><div class="dopa-header">${brandHTML()}<button class="dopa-close" data-dopa-close aria-label="닫기">✕</button></div>${inner}<a class="dopa-button dopa-button--tertiary dopa-more-link" href="${esc(gamesUrl())}" data-dopa-more>다른 도파# 게임 보기 →</a><div class="dopa-footer">${footerHTML}</div></div>`;
 sheet.hidden=false;
 const card=sheet.firstElementChild;(card.querySelector('[data-act]')||card).focus({preventScroll:true});
 return card;
}
function close(){if(!sheet||sheet.hidden)return;sheet.hidden=true;if(lastFocus&&lastFocus.focus)lastFocus.focus({preventScroll:true})}

/* opts: {art,title,stat,detail,shareText,retryLabel,onRetry}
   shareText is the line people send; the page link goes after it. */
function showResult(opts){
 const o=opts||{},name=current?current.name:document.title;
 const card=openSheet(`<div class="dopa-result"><div class="dopa-result-art" aria-hidden="true">${esc(o.art||'🎉')}</div><h2>${esc(o.title)}</h2>${o.stat?`<strong class="dopa-result-stat">${esc(o.stat)}</strong>`:''}${o.detail?`<p>${esc(o.detail)}</p>`:''}</div>
  <div class="dopa-actions">${o.onRetry?`<button class="dopa-button" data-act="retry">${esc(o.retryLabel||'다시 하기')}</button>`:''}
  <button class="dopa-button dopa-button--secondary" data-act="copy">결과 복사</button><button class="dopa-button dopa-button--secondary" data-act="link">링크 공유</button>
  <button class="dopa-button dopa-button--secondary dopa-button--wide dopa-challenge" data-act="challenge">친구에게 도전 보내기</button></div>`,o.title||'결과');
 const result=o.shareText||`${name} — ${o.title}${o.stat?' '+o.stat:''}`;
 card.querySelector('.dopa-actions').onclick=e=>{
  const act=e.target.closest('[data-act]')?.dataset.act;if(!act)return;
  if(act==='retry'){track('game_retry');close();o.onRetry();return}
  track('share_click',{method:act});
  if(act==='copy')copy(`${result}\n${pageUrl()}\n#도파샵 #dopashap`,'결과를 복사했어요.');
  else if(act==='link')share({title:name,url:pageUrl()},'링크를 복사했어요.');
  else share({title:name,text:`${result}\n이 기록, 깰 수 있을까요?`,url:pageUrl()},'도전 메시지를 복사했어요.');
 };
}
function moreGames(){location.href=gamesUrl()}

function mount(){
 document.querySelectorAll('[data-dopa="header"]').forEach(el=>{el.classList.add('dopa-header');el.innerHTML=brandHTML()+`<a class="dopa-button dopa-button--tertiary" href="${esc(gamesUrl())}" data-dopa-more>다른 게임 보기</a>`});
 document.querySelectorAll('[data-dopa="footer"]').forEach(el=>{el.classList.add('dopa-footer');el.innerHTML=footerHTML});
 document.addEventListener('click',e=>{
  // Links navigate on their own; plain buttons marked data-dopa-more are sent to the games page.
  const more=e.target.closest('[data-dopa-more]');if(more){track('more_games_click',{from:more.tagName==='A'?'link':'button'});if(more.tagName!=='A')moreGames()}
 });
 track('game_view');
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();

window.DopaSharp={get GAMES(){return GAMES},get current(){return current},showResult,moreGames,close,toast,share,track};
})();
