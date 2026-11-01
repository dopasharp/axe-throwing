import { joinRoom, normalizeRoomId } from './net.js';
import * as S from './sound.js';

const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const show = (id) => ['joinScreen', 'startScreen', 'gameScreen'].forEach((s) => { $(s).hidden = s !== id; });

const EMOJIS = ['🪓', '🔪', '🗡️', '🔨', '🪃', '⛏️', '🍌', '🐟', '🥖', '🩴'];
const SENS = { low: 26, mid: 19, high: 13 }; // m/s² 휘두르기 임계값

// ------------------------------------------------------------------ 옵션
const opts = { emoji: '🪓', sens: 'mid', sound: 'on', vibe: 'on' };
try { Object.assign(opts, JSON.parse(localStorage.getItem('axe-opts') || '{}')); } catch {}
if (!EMOJIS.includes(opts.emoji)) opts.emoji = '🪓';

function saveOpts() {
  try { localStorage.setItem('axe-opts', JSON.stringify(opts)); } catch {}
  S.setSoundEnabled(opts.sound === 'on');
  $('bigAxe').textContent = opts.emoji;
  $('startEmoji').textContent = opts.emoji;
  api?.updateInfo({ emoji: opts.emoji });
  renderOpts();
}

function renderOpts() {
  $('emojiGrid').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.textContent === opts.emoji));
  for (const [seg, key] of [['sensSeg', 'sens'], ['soundSeg', 'sound'], ['vibeSeg', 'vibe']]) {
    $(seg).querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === opts[key]));
  }
}

$('emojiGrid').innerHTML = EMOJIS.map((e) => `<button type="button">${e}</button>`).join('');
$('emojiGrid').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  opts.emoji = b.textContent;
  S.tick();
  saveOpts();
});
for (const [seg, key] of [['sensSeg', 'sens'], ['soundSeg', 'sound'], ['vibeSeg', 'vibe']]) {
  $(seg).addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    opts[key] = b.dataset.v;
    saveOpts();
    S.tick();
    if (key === 'vibe' && opts.vibe === 'on') vibrate(40);
  });
}

const sheet = (open) => {
  $('optSheet').classList.toggle('show', open);
  $('sheetBackdrop').classList.toggle('show', open);
};
$('optBtn').addEventListener('click', () => { S.tick(); sheet(true); });
$('optClose').addEventListener('click', () => sheet(false));
$('sheetBackdrop').addEventListener('click', () => sheet(false));

const vibrate = (p) => { if (opts.vibe === 'on') navigator.vibrate?.(p); };

// ------------------------------------------------------------------ 접속
let api = null;
let roomId = normalizeRoomId(new URLSearchParams(location.search).get('room'));
let targetOnline = true;

function setConn(on) {
  targetOnline = on;
  $('connDot').className = `dot ${on ? 'on' : 'off'}`;
  $('connText').textContent = on ? '과녁 연결됨' : '과녁 연결 끊김… 과녁 화면을 확인하세요';
}

function onState(st) {
  $('hudTotal').textContent = st.total ?? 0;
  $('hudCount').textContent = st.roundOver ? `라운드 끝! (최고 ${st.best ?? 0}점)` : `${st.thrown ?? 0} / ${st.perRound ?? 5}`;
  if (pending && st.last?.id === pending) landed(st.last, st);
}

async function join(id) {
  roomId = id;
  try {
    api = await joinRoom(roomId, { emoji: opts.emoji }, { onState, onTarget: setConn });
    const u = new URL(location.href);
    u.searchParams.set('room', roomId);
    history.replaceState(null, '', u);
    $('startRoom').textContent = roomId;
    $('hudRoom').textContent = roomId;
    show('startScreen');
  } catch (e) {
    console.error(e);
    show('joinScreen');
    $('codeInput').value = roomId;
    $('joinError').textContent = e.message === 'NOT_FOUND'
      ? `방 ${roomId} 을(를) 찾을 수 없어요. 과녁 화면의 코드를 확인하세요.`
      : '연결에 실패했어요. 잠시 후 다시 시도하세요.';
  }
}

$('joinForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const id = normalizeRoomId($('codeInput').value);
  if (id.length < 4) { $('joinError').textContent = '코드를 정확히 입력하세요'; return; }
  $('joinError').textContent = '연결 중…';
  join(id);
});

// ------------------------------------------------------------------ 시작 (센서 권한)
let motionSeen = false;

$('startBtn').addEventListener('click', async () => {
  S.unlockAudio();
  S.setSoundEnabled(opts.sound === 'on');
  try {
    for (const Ev of [window.DeviceMotionEvent, window.DeviceOrientationEvent]) {
      if (Ev && typeof Ev.requestPermission === 'function') {
        const r = await Ev.requestPermission();
        if (r !== 'granted') throw new Error('denied');
      }
    }
  } catch {
    $('hint').innerHTML = '<b>센서 권한이 거부됐어요</b><br><small>도끼를 위로 휙 스와이프해서 던지세요</small>';
  }
  addEventListener('devicemotion', onMotion);
  addEventListener('deviceorientation', onOrientation);
  keepAwake();
  show('gameScreen');
  vibrate(30);
  S.ding(2);
  setTimeout(() => {
    if (!motionSeen) {
      $('aimBox').hidden = true;
      $('hint').innerHTML = '<b>이 기기엔 동작 센서가 없어요</b><br><small>도끼를 위로 휙 스와이프해서 던지세요</small>';
    }
  }, 1500);
});

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

// ------------------------------------------------------------------ 조준 (기울기)
const oriBuf = [];
let aimNow = 0;

function onOrientation(e) {
  if (e.gamma == null) return;
  const t = performance.now();
  oriBuf.push({ t, g: e.gamma });
  while (oriBuf.length && t - oriBuf[0].t > 1200) oriBuf.shift();
  if (!swing && !busy) {
    aimNow = clamp(e.gamma / 35, -1, 1);
    $('aimDot').style.left = `${50 + aimNow * 46}%`;
  }
}

/** 휘두르기 시작 직전(흔들리기 전) 기울기 값 */
function aimBefore(t) {
  let pick = null;
  for (const o of oriBuf) if (o.t <= t - 180) pick = o;
  return pick ? clamp(pick.g / 35, -1, 1) : aimNow;
}

// ------------------------------------------------------------------ 휘두르기 감지
let swing = null;
let busy = false;

function onMotion(e) {
  let x, y, z, mag;
  const a = e.acceleration;
  if (a && a.x != null) {
    x = a.x || 0; y = a.y || 0; z = a.z || 0;
    mag = Math.hypot(x, y, z);
  } else {
    const g = e.accelerationIncludingGravity;
    if (!g || g.x == null) return;
    mag = Math.max(0, Math.hypot(g.x || 0, g.y || 0, g.z || 0) - 9.81);
  }
  motionSeen = true;
  if (busy || !api) return;

  const t = performance.now();
  const thr = SENS[opts.sens] || SENS.mid;
  if (!swing) {
    if (mag > thr) swing = { start: t, peak: mag, aim: aimBefore(t) };
    return;
  }
  if (mag > swing.peak) swing.peak = mag;
  if (t - swing.start > 160) {
    const power = clamp(0.15 + (swing.peak - thr) / (thr * 1.3), 0, 1);
    const aim = swing.aim;
    swing = null;
    throwAxe({ power, aimX: aim, method: 'swing' });
  }
}

// ------------------------------------------------------------------ 스와이프 투척
let pts = null;
const zone = $('zone');
zone.addEventListener('pointerdown', (e) => {
  S.unlockAudio();
  pts = [{ x: e.clientX, y: e.clientY, t: performance.now() }];
  zone.setPointerCapture?.(e.pointerId);
});
zone.addEventListener('pointermove', (e) => {
  if (!pts) return;
  const t = performance.now();
  pts.push({ x: e.clientX, y: e.clientY, t });
  while (pts.length > 2 && t - pts[0].t > 120) pts.shift();
  if (!busy) $('bigAxe').style.translate = `0 ${Math.min(0, e.clientY - pts[pts.length - 1].y)}px`;
});
const endSwipe = (e) => {
  if (!pts) return;
  const t = performance.now();
  pts.push({ x: e.clientX, y: e.clientY, t });
  while (pts.length > 2 && t - pts[0].t > 120) pts.shift();
  const first = pts[0];
  const dx = e.clientX - first.x;
  const dy = e.clientY - first.y;
  const dt = Math.max(1, t - first.t);
  pts = null;
  $('bigAxe').style.translate = '';
  const v = -dy / dt; // px/ms, 위쪽이 +
  if (busy || v < 0.6 || -dy < 50) return;
  const power = clamp(0.1 + (v - 0.6) / 2.6, 0, 1);
  const aimX = clamp((dx / -dy) * 1.6, -1, 1);
  throwAxe({ power, aimX, method: 'swipe' });
};
zone.addEventListener('pointerup', endSwipe);
zone.addEventListener('pointercancel', () => { pts = null; $('bigAxe').style.translate = ''; });

// ------------------------------------------------------------------ 투척!
let pending = null;
let pendingTimer = 0;

function throwAxe({ power, aimX, method }) {
  if (busy || !api) return;
  if (!targetOnline) {
    $('hint').innerHTML = '<b>과녁이 연결되지 않았어요</b>';
    return;
  }
  busy = true;
  $('powerBar').style.width = `${Math.round(power * 100)}%`;
  $('aimDot').style.left = `${50 + aimX * 46}%`;

  const big = $('bigAxe');
  big.classList.remove('ready', 'gone');
  big.getAnimations().forEach((a) => a.cancel());
  const turns = 3 + Math.round(power * 3);
  big.animate(
    [
      { transform: 'translate(0, 0) scale(1) rotate(0deg)', opacity: 1 },
      { transform: `translate(${aimX * 20}vw, -25vh) scale(0.6) rotate(${turns * 180}deg)`, opacity: 1, offset: 0.55 },
      { transform: `translate(${aimX * 30}vw, -60vh) scale(0.15) rotate(${turns * 360}deg)`, opacity: 0 },
    ],
    { duration: 700, easing: 'cubic-bezier(.3,.6,.5,1)', fill: 'forwards' },
  );
  setTimeout(() => big.classList.add('gone'), 700);

  S.spin({ turns, dur: 0.7, approach: false });
  vibrate([25, 30, 25, 30, 25]);
  $('hint').innerHTML = `<b>${['휙', '휘익', '휘리릭', '휘리리릭!'][Math.min(3, Math.floor(power * 4))]}</b><br><small>파워 ${Math.round(power * 100)}% · 날아가는 중…</small>`;

  pending = api.throwAxe({ power, aimX, emoji: opts.emoji, method });
  clearTimeout(pendingTimer);
  pendingTimer = setTimeout(() => {
    if (!pending) return;
    pending = null;
    $('hint').innerHTML = '<b>과녁 응답이 없어요</b><br><small>과녁 화면이 켜져 있는지 확인하세요</small>';
    ready();
  }, 7000);
}

function landed(last, st) {
  pending = null;
  clearTimeout(pendingTimer);
  const r = $('result');
  r.innerHTML = `<div><div class="pts">${last.score > 0 ? `+${last.score}` : '0'}</div><div class="lbl">${last.label}</div></div>`;
  r.classList.remove('show');
  void r.offsetWidth;
  r.classList.add('show');

  if (last.bounce) { S.clang(); vibrate([80, 60, 30]); }
  else if (last.score === 6) { S.thunk(1); S.fanfare(); vibrate([60, 40, 60, 40, 200]); }
  else if (last.score > 0) { S.thunk(0.7); S.ding(last.score); vibrate(90); }
  else { S.thunk(0.5); S.miss(); vibrate(60); }

  const tip = last.bounce ? '각도가 안 맞았어요. 다시!'
    : last.score === 6 ? '완벽해요! 🎯'
    : st.roundOver ? `라운드 끝! 총 ${st.total}점 — 다시 던지면 새 라운드`
    : '파워 50~60% 근처가 정중앙이에요';
  setTimeout(() => {
    $('hint').innerHTML = `<b>${tip}</b><br><small>다시 휘둘러 던지세요</small>`;
    ready();
  }, 1300);
}

function ready() {
  const big = $('bigAxe');
  big.getAnimations().forEach((a) => a.cancel());
  big.classList.remove('gone');
  void big.offsetWidth;
  big.classList.add('ready');
  swing = null;
  setTimeout(() => { busy = false; }, 350);
}

// ------------------------------------------------------------------ 시작
renderOpts();
saveOpts();
if (roomId) {
  join(roomId);
} else {
  show('joinScreen');
  $('codeInput').focus();
}
