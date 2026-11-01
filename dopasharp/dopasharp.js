/* DOPA# shared brand frame v1.0 — identical in every DOPASHARP repo. Needs tokens.css + components.css.
   A page names itself with <meta name="dopasharp:game" content="soju-game">, then:
   - <header data-dopa="header"></header>  → D# logo · GAME 00N / CODE · "다른 게임 보기"
   - <footer data-dopa="footer"></footer>  → MADE BY DOPA#
   - DopaSharp.showResult({...})           → result sheet: retry / copy / share / challenge / other games
   - DopaSharp.moreGames()                 → other games sheet
   - DopaSharp.track(name, params)         → game_view, game_start, game_complete, game_retry, share_click, more_games_click */
(function(){
// The one list of DOPASHARP games; its order sets the game numbers. Add new games here and copy this file to every repo.
const GAMES=[
 {id:'soju-game',    code:'SOJU',    art:'🍶',name:'짠! 소주 따르기',tagline:'휴대폰 두 대로 소주 한 잔 따르기'},
 {id:'croc-chomp',   code:'CROC',    art:'🐊',name:'악어 이빨 게임', tagline:'이 중 하나는 물립니다.'},
 {id:'gacha-capsule',code:'GACHA',   art:'🎁',name:'가챠 캡슐',     tagline:'오늘의 운을 뽑아보세요.'},
 {id:'birthday-hoo', code:'BIRTHDAY',art:'🎂',name:'생일 이벤트',    tagline:'친구에게 특별한 축하를.'},
 {id:'axe-throwing', code:'AXE',     art:'🪓',name:'도끼 던지기',    tagline:'휴대폰을 휘둘러 과녁 맞히기'},
 {id:'truth-mirror', code:'MIRROR',  art:'🪞',name:'진실의 거울',    tagline:'거울에게 진실을 물어보세요.'},
 {id:'ppro_game',    code:'PEPERO',  art:'🥢',name:'빼빼로 게임',    tagline:'둘이 함께 탭하는 빼빼로 게임'}
].map((g,i)=>({...g,no:String(i+1).padStart(3,'0'),url:`https://dopasharp.github.io/${g.id}/`}));
const LOGO='<svg viewBox="0 0 132 80" fill="currentColor" aria-hidden="true"><g transform="translate(18 0) skewX(-14)"><path fill-rule="evenodd" d="M18 10h25c19 0 30 12 30 30S62 70 43 70H18zm15 13v34h9c10 0 16-6.5 16-17s-6-17-16-17z"/><rect x="83" y="12" width="9" height="56"/><rect x="100" y="12" width="9" height="56"/><rect x="77" y="27" width="38" height="9"/><rect x="77" y="45" width="38" height="9"/></g></svg>';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const meta=document.querySelector('meta[name="dopasharp:game"]');
const current=GAMES.find(g=>g.id===(meta&&meta.content))||null;
const gameId=current?current.id:location.pathname;
const pageUrl=()=>location.origin+location.pathname;
const logo=`<span class="dopa-logo" role="img" aria-label="DOPA#">${LOGO}</span>`;

// Analytics with the shared event names. Sends to gtag / dataLayer when a page has them, and always fires a DOM event.
function track(name,params){
 const data={game_id:gameId,...params};
 try{if(typeof window.gtag==='function')window.gtag('event',name,data);else if(Array.isArray(window.dataLayer))window.dataLayer.push({event:name,...data})}catch(e){}
 document.dispatchEvent(new CustomEvent('dopasharp:track',{detail:{name,...data}}));
}

const HUB='https://dopasharp.github.io/';
const brandHTML=()=>`<a class="dopa-brand" href="${HUB}" aria-label="DOPASHARP 홈">${logo}${current?`<span class="dopa-label">GAME ${current.no} / ${current.code}</span>`:''}</a>`;
const footerHTML=`<span>MADE BY DOPA#</span>`;
function cardsHTML(){
 return `<div class="dopa-games">`+GAMES.filter(g=>g!==current).map(g=>
  `<a class="dopa-card" href="${esc(g.url)}" data-dopa-game="${esc(g.id)}"><span class="dopa-card-art" aria-hidden="true">${g.art}</span><span class="dopa-card-body"><span class="dopa-label">DOPA# ${g.no}</span><b>${esc(g.name)}</b><small>${esc(g.tagline)}</small></span><span class="dopa-card-go" aria-hidden="true">PLAY →</span></a>`).join('')+`</div>`;
}

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
 sheet.innerHTML=`<div class="dopa-sheet-card" role="dialog" aria-modal="true" aria-label="${esc(label)}" tabindex="-1"><div class="dopa-header">${brandHTML()}<button class="dopa-close" data-dopa-close aria-label="닫기">✕</button></div>${inner}<h3 class="dopa-label dopa-section-title">다른 DOPA# 게임</h3>${cardsHTML()}<div class="dopa-footer">${footerHTML}</div></div>`;
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
  if(act==='copy')copy(`${result}\n${pageUrl()}\n#DOPASHARP #도파샵`,'결과를 복사했어요.');
  else if(act==='link')share({title:name,url:pageUrl()},'링크를 복사했어요.');
  else share({title:name,text:`${result}\n이 기록, 깰 수 있을까요?`,url:pageUrl()},'도전 메시지를 복사했어요.');
 };
}
function moreGames(){openSheet('','다른 DOPA# 게임')}

function mount(){
 document.querySelectorAll('[data-dopa="header"]').forEach(el=>{el.classList.add('dopa-header');el.innerHTML=brandHTML()+`<button class="dopa-button dopa-button--tertiary" data-dopa-more>다른 게임 보기</button>`});
 document.querySelectorAll('[data-dopa="footer"]').forEach(el=>{el.classList.add('dopa-footer');el.innerHTML=footerHTML});
 document.addEventListener('click',e=>{
  if(e.target.closest('[data-dopa-more]')){track('more_games_click',{from:'button'});moreGames()}
  const card=e.target.closest('[data-dopa-game]');if(card)track('more_games_click',{to:card.dataset.dopaGame});
 });
 track('game_view');
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();

window.DopaSharp={GAMES,current,showResult,moreGames,close,toast,share,track};
})();
