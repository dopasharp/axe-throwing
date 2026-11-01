import { mode, makeRoomId, normalizeRoomId, hostRoom } from './net.js';
import * as S from './sound.js';

const PER_ROUND = 5;
const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const rand = (a, b) => a + Math.random() * (b - a);

const els = {
  target: $('target'), stuck: $('stuck'), fly: $('flyLayer'), banner: $('banner'),
  total: $('total'), throwsLeft: $('throwsLeft'),
  axeDot: $('axeDot'), axeText: $('axeText'),
  qrOverlay: $('qrOverlay'), roundOverlay: $('roundOverlay'),
};

// ------------------------------------------------------------------ 방 & QR
let roomId = null;

function showRoomQr(id) {
  const local = mode === 'local' ? '&local=1' : '';
  const axeUrl = new URL(`axe.html?room=${id}${local}`, location.href).href;
  $('roomCode').textContent = id;
  $('roomCode2').textContent = id;
  $('axeLink').href = axeUrl;
  $('axeLink').textContent = axeUrl;
  $('qr').innerHTML = '';
  if (window.QRCode) {
    new QRCode($('qr'), { text: axeUrl, width: 440, height: 440, correctLevel: QRCode.CorrectLevel.M });
  } else {
    $('qr').textContent = 'QR 라이브러리를 불러오지 못했어요';
  }
  // 새로고침해도 같은 방 코드로 다시 열리도록 주소에 기록
  const u = new URL(location.href);
  u.searchParams.set('room', id);
  history.replaceState(null, '', u);
}
$('modeBadge').hidden = mode !== 'local';

// ------------------------------------------------------------------ 게임 상태
let best = 0;
try { best = Number(localStorage.getItem('axe-best')) || 0; } catch {}

const game = { thrown: 0, total: 0, scores: [], roundOver: false, last: null };
let net = null;
let axeOnline = false;

function publish() {
  net?.setState({
    thrown: game.thrown,
    total: game.total,
    perRound: PER_ROUND,
    roundOver: game.roundOver,
    best,
    last: game.last,
  });
}

function renderHud() {
  els.total.textContent = game.total;
  els.throwsLeft.innerHTML = '';
  for (let i = 0; i < PER_ROUND; i++) {
    const s = document.createElement('span');
    s.textContent = '🪓';
    if (i < game.thrown) s.className = 'used';
    els.throwsLeft.append(s);
  }
}

function newRound() {
  game.thrown = 0;
  game.total = 0;
  game.scores = [];
  game.roundOver = false;
  game.last = null;
  els.stuck.querySelectorAll('.stuck-axe, .slit').forEach((n) => {
    n.animate([{ opacity: 1 }, { opacity: 0, transform: 'translate(-50%, 40%)' }], { duration: 300 }).finished.then(() => n.remove());
  });
  els.roundOverlay.classList.remove('show');
  renderHud();
  publish();
}

function endRound() {
  game.roundOver = true;
  const isBest = game.total > best;
  if (isBest) {
    best = game.total;
    try { localStorage.setItem('axe-best', String(best)); } catch {}
  }
  $('roundTotal').textContent = game.total;
  $('roundScores').innerHTML = game.scores.map((s) => `<span>${s}</span>`).join('');
  $('bestText').textContent = isBest ? '🏆 최고 기록 갱신!' : `최고 기록 ${best}점`;
  setTimeout(() => {
    els.roundOverlay.classList.add('show');
    if (isBest) S.fanfare();
  }, 900);
}

// ------------------------------------------------------------------ 판정
function scoreFor(dist) {
  if (dist <= 0.12) return { score: 6, label: 'BULLSEYE!' };
  if (dist <= 0.35) return { score: 4, label: '좋아요!' };
  if (dist <= 0.6) return { score: 3, label: '나이스' };
  if (dist <= 0.85) return { score: 2, label: '아깝다' };
  if (dist <= 1.0) return { score: 1, label: '겨우 맞음' };
  return { score: 0, label: '빗나감' };
}

function computeHit(data) {
  const power = clamp(Number(data.power) || 0, 0, 1);
  const aimX = clamp(Number(data.aimX) || 0, -1, 1);
  const jitter = () => (Math.random() + Math.random() - 1) * 0.16;
  let x = aimX * 0.95 + jitter();
  // 파워 0.55 근처가 정중앙. 약하면 아래로, 세면 위로.
  let y = (0.55 - power) * 1.5 + jitter();
  const d = Math.hypot(x, y);
  if (d > 1.35) { x *= 1.35 / d; y *= 1.35 / d; }
  const weak = power < 0.06;
  const bounce = weak || Math.random() < 0.07;
  return {
    x, y,
    dist: Math.hypot(x, y),
    bounce,
    weak,
    power,
    turns: Math.round(3 + power * 4),
    angle: rand(-38, -8),
  };
}

// ------------------------------------------------------------------ 연출
function targetGeom() {
  const r = els.target.getBoundingClientRect();
  return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, R: r.width / 2 };
}

function showBanner(text) {
  els.banner.textContent = text;
  els.banner.classList.remove('show');
  void els.banner.offsetWidth;
  els.banner.classList.add('show');
}

function popAt(x, y, html) {
  const p = document.createElement('div');
  p.className = 'pop';
  p.style.left = `${x}px`;
  p.style.top = `${y}px`;
  p.innerHTML = html;
  els.fly.append(p);
  p.animate(
    [
      { transform: 'translate(-50%, -50%) scale(0.3)', opacity: 0 },
      { transform: 'translate(-50%, -110%) scale(1.15)', opacity: 1, offset: 0.2 },
      { transform: 'translate(-50%, -150%) scale(1)', opacity: 1, offset: 0.75 },
      { transform: 'translate(-50%, -190%) scale(1)', opacity: 0 },
    ],
    { duration: 1400, easing: 'ease-out' },
  ).finished.then(() => p.remove());
}

function chips(x, y, count = 14, colors = ['#e2b07a', '#c98a4f', '#f3e5c8', '#8a5a33']) {
  for (let i = 0; i < count; i++) {
    const c = document.createElement('div');
    c.className = 'chip';
    c.style.left = `${x}px`;
    c.style.top = `${y}px`;
    c.style.background = colors[i % colors.length];
    els.fly.append(c);
    const a = rand(0, Math.PI * 2);
    const dist = rand(30, 110);
    const dx = Math.cos(a) * dist;
    const dy = Math.sin(a) * dist;
    c.animate(
      [
        { transform: 'translate(-50%, -50%) rotate(0deg)', opacity: 1 },
        { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy + 60}px)) rotate(${rand(-540, 540)}deg)`, opacity: 0 },
      ],
      { duration: rand(500, 850), easing: 'cubic-bezier(.2,.7,.4,1)' },
    ).finished.then(() => c.remove());
  }
}

function confetti(x, y) {
  const icons = ['🎯', '✨', '🔥', '⭐', '🎉'];
  for (let i = 0; i < 16; i++) {
    const e = document.createElement('div');
    e.className = 'pop';
    e.style.fontSize = `${rand(18, 34)}px`;
    e.style.left = `${x}px`;
    e.style.top = `${y}px`;
    e.textContent = icons[i % icons.length];
    els.fly.append(e);
    const a = rand(0, Math.PI * 2);
    const d = rand(80, 220);
    e.animate(
      [
        { transform: 'translate(-50%, -50%) scale(0.2)', opacity: 1 },
        { transform: `translate(calc(-50% + ${Math.cos(a) * d}px), calc(-50% + ${Math.sin(a) * d}px)) scale(1)`, opacity: 1, offset: 0.6 },
        { transform: `translate(calc(-50% + ${Math.cos(a) * d * 1.1}px), calc(-50% + ${Math.sin(a) * d + 120}px)) scale(0.8)`, opacity: 0 },
      ],
      { duration: rand(900, 1400), easing: 'cubic-bezier(.2,.8,.3,1)' },
    ).finished.then(() => e.remove());
  }
}

function shake(big) {
  const cls = big ? 'hit-big' : 'hit';
  els.target.classList.remove('hit', 'hit-big');
  void els.target.offsetWidth;
  els.target.classList.add(cls);
  if (navigator.userActivation?.hasBeenActive !== false) navigator.vibrate?.(big ? [60, 40, 90] : 45);
}

function stickAxe(hit, emoji) {
  const left = `${50 + hit.x * 50}%`;
  const top = `${50 + hit.y * 50}%`;
  const slit = document.createElement('div');
  slit.className = 'slit';
  slit.style.left = left;
  slit.style.top = top;
  slit.style.setProperty('--a', `${hit.angle + 60}deg`);
  const axe = document.createElement('div');
  axe.className = 'stuck-axe';
  axe.style.left = left;
  axe.style.top = top;
  axe.style.setProperty('--a', `${hit.angle}deg`);
  axe.textContent = emoji;
  els.stuck.append(slit, axe);
}

/** 화면 아래(던지는 사람 쪽)에서 과녁으로 빙글빙글 날아오는 도끼 */
function flyIn(hit, emoji) {
  const { cx, cy, R } = targetGeom();
  const ex = cx + hit.x * R;
  const ey = cy + hit.y * R;
  const sx = innerWidth / 2 + hit.x * R * 0.25;
  const sy = innerHeight + R * 0.6;
  const midY = Math.min(ey, cy) - R * (0.25 + hit.power * 0.25);
  const dur = 620 + hit.turns * 55;

  const outer = document.createElement('div');
  outer.className = 'fly-axe';
  const inner = document.createElement('span');
  inner.textContent = emoji;
  outer.append(inner);
  els.fly.append(outer);

  const at = (x, y, s) => `translate(${x}px, ${y}px) translate(-50%, -50%) scale(${s})`;
  outer.animate(
    [
      { transform: at(sx, sy, 3.4), opacity: 0.85 },
      { transform: at((sx + ex) / 2, midY, 1.8), opacity: 1, offset: 0.55 },
      { transform: at(ex, ey, 1) },
    ],
    { duration: dur, easing: 'cubic-bezier(.25,.5,.45,1)', fill: 'forwards' },
  );
  const spinAnim = inner.animate(
    [{ transform: 'rotate(0deg)' }, { transform: `rotate(${hit.turns * 360 + hit.angle}deg)` }],
    { duration: dur, easing: 'linear', fill: 'forwards' },
  );
  S.spin({ turns: hit.turns, dur: dur / 1000, approach: true });
  // 백그라운드 탭 등에서 애니메이션이 멈춰도 판정은 진행되도록 타이머로 보장
  const timeout = new Promise((r) => setTimeout(r, dur + 150));
  return Promise.race([spinAnim.finished, timeout]).then(() => {
    outer.getAnimations().forEach((a) => a.finish());
    spinAnim.finish();
    return { outer, inner, ex, ey };
  });
}

function bounceOff({ outer, inner, ex, ey }, hit) {
  const dir = hit.x >= 0 ? 1 : -1;
  outer.getAnimations().forEach((a) => a.cancel());
  outer.style.transform = `translate(${ex}px, ${ey}px) translate(-50%, -50%)`;
  inner.getAnimations().forEach((a) => a.cancel());
  inner.style.transform = `rotate(${hit.angle}deg)`;
  outer.animate(
    [
      { transform: `translate(${ex}px, ${ey}px) translate(-50%, -50%)` },
      { transform: `translate(${ex + dir * 60}px, ${ey - 50}px) translate(-50%, -50%) scale(1.05)`, offset: 0.25 },
      { transform: `translate(${ex + dir * 110}px, ${innerHeight + 120}px) translate(-50%, -50%) scale(1.1)` },
    ],
    { duration: 800, easing: 'cubic-bezier(.4,0,.8,.6)', fill: 'forwards' },
  );
  return inner.animate(
    [{ transform: `rotate(${hit.angle}deg)` }, { transform: `rotate(${hit.angle + dir * 720}deg)` }],
    { duration: 800, fill: 'forwards' },
  ).finished.then(() => outer.remove());
}

// ------------------------------------------------------------------ 투척 처리 (순서대로)
let queue = Promise.resolve();

function onThrow(id, data) {
  queue = queue.then(() => handleThrow(id, data)).catch((e) => console.error(e));
}

async function handleThrow(id, data) {
  if (game.roundOver) newRound();
  els.qrOverlay.classList.remove('show');
  const emoji = typeof data.emoji === 'string' && data.emoji.length <= 8 ? data.emoji : '🪓';
  const hit = computeHit(data);
  const flight = await flyIn(hit, emoji);

  let result;
  if (hit.bounce) {
    S.clang();
    S.drop(0.75);
    chips(flight.ex, flight.ey, 8, ['#fff6c8', '#ffd36b', '#ffffff']);
    shake(false);
    result = { score: 0, label: hit.weak ? '힘이 부족해요' : '튕겨나감!' };
    popAt(flight.ex, flight.ey, `0<small>${result.label}</small>`);
    bounceOff(flight, hit);
  } else {
    flight.outer.remove();
    stickAxe(hit, emoji);
    result = scoreFor(hit.dist);
    S.thunk(0.5 + hit.power * 0.5);
    shake(result.score === 6);
    chips(flight.ex, flight.ey, result.score === 6 ? 24 : 14);
    popAt(flight.ex, flight.ey, `+${result.score}<small>${result.label}</small>`);
    if (result.score === 6) {
      showBanner('BULLSEYE!');
      confetti(flight.ex, flight.ey);
      S.fanfare();
    } else if (result.score > 0) {
      S.ding(result.score);
    } else {
      S.miss();
    }
  }

  game.thrown += 1;
  game.total += result.score;
  game.scores.push(result.score);
  game.last = { id, score: result.score, label: result.label, bounce: hit.bounce };
  renderHud();
  if (game.thrown >= PER_ROUND) endRound();
  publish();
  await new Promise((r) => setTimeout(r, 250));
}

// ------------------------------------------------------------------ 연결 상태
function onAxe(info) {
  const was = axeOnline;
  axeOnline = !!info;
  els.axeDot.className = `dot ${axeOnline ? 'on' : 'off'}`;
  els.axeText.textContent = axeOnline
    ? `${info.emoji || '🪓'} 도끼 연결됨 — 폰을 휘둘러 던지세요!`
    : '도끼 폰을 기다리는 중…';
  $('closeQr').hidden = !axeOnline;
  if (axeOnline && !was) {
    els.qrOverlay.classList.remove('show');
    S.tick();
  }
}

// ------------------------------------------------------------------ 입력
let wakeLock = null;
async function keepAwake() {
  try {
    if ('wakeLock' in navigator && !wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    }
  } catch {}
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') keepAwake(); });

function unlock() {
  S.unlockAudio();
  keepAwake();
  const btn = $('soundBtn');
  btn.textContent = '🔊 소리 켜짐';
  btn.classList.add('ghost');
}
document.addEventListener('pointerdown', unlock, { capture: true });
$('soundBtn').addEventListener('click', () => { unlock(); S.ding(3); });
$('qrBtn').addEventListener('click', () => els.qrOverlay.classList.add('show'));
$('closeQr').addEventListener('click', () => els.qrOverlay.classList.remove('show'));
$('againBtn').addEventListener('click', newRound);

// ------------------------------------------------------------------ 방 만들기
async function openRoom(id) {
  const btn = $('createBtn');
  btn.disabled = true;
  btn.textContent = '방 만드는 중…';
  try {
    net = await hostRoom(id, { onAxe, onThrow });
    roomId = id;
    publish();
    showRoomQr(id);
    $('lobby').classList.remove('show');
    els.qrOverlay.classList.add('show');
  } catch (e) {
    console.error(e);
    $('lobbyError').textContent = '방을 만들지 못했어요. 인터넷 연결을 확인하고 다시 시도하세요.';
    btn.disabled = false;
    btn.textContent = '🎯 과녁 방 만들기';
  }
}

$('createBtn').addEventListener('click', () => {
  unlock();
  S.ding(2);
  openRoom(makeRoomId());
});

renderHud();
const reopen = normalizeRoomId(new URLSearchParams(location.search).get('room'));
if (reopen.length >= 4) openRoom(reopen);

// 개발용: 콘솔에서 testThrow() 로 과녁 단독 테스트
window.testThrow = (power = Math.random(), aimX = rand(-0.5, 0.5), emoji = '🪓') =>
  roomId && onThrow(`test-${Date.now()}`, { power, aimX, emoji });
