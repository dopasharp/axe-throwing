// WebAudio로 즉석 합성하는 효과음 (외부 음원 파일 없음)
let ctx, master, noiseBuf;
let enabled = true;

export function unlockAudio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

export const audioReady = () => !!ctx && ctx.state === 'running';
export function setSoundEnabled(v) { enabled = !!v; }

const ok = () => enabled && ctx && ctx.state === 'running';

function env(t, peak, attack, release) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + release);
  return g;
}

function noise(t, dur) {
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  s.loop = true;
  s.start(t, Math.random() * 0.5);
  s.stop(t + dur + 0.05);
  return s;
}

function tone(type, freq, t, dur) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  o.start(t);
  o.stop(t + dur + 0.05);
  return o;
}

/** 바람 가르는 "휙" */
export function whoosh({ at = 0, dur = 0.22, freq = 900, vol = 0.5 } = {}) {
  if (!ok()) return;
  const t = ctx.currentTime + at;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 1.4;
  bp.frequency.setValueAtTime(freq * 0.5, t);
  bp.frequency.exponentialRampToValueAtTime(freq * 1.7, t + dur * 0.5);
  bp.frequency.exponentialRampToValueAtTime(freq * 0.6, t + dur);
  noise(t, dur).connect(bp).connect(env(t, vol, dur * 0.45, dur * 0.55)).connect(master);
}

/** 빙글빙글 회전하며 날아가는 소리: 회전 수만큼 휙휙휙 */
export function spin({ turns = 4, dur = 0.8, approach = true } = {}) {
  if (!ok()) return;
  const step = dur / turns;
  for (let i = 0; i < turns; i++) {
    const p = i / Math.max(1, turns - 1);
    whoosh({
      at: i * step,
      dur: Math.min(0.24, step * 1.15),
      freq: approach ? 650 + p * 700 : 1300 - p * 650,
      vol: approach ? 0.12 + 0.5 * p : 0.6 - 0.45 * p,
    });
  }
}

/** 나무에 꽂히는 "퍽!" + 손잡이 떨림 */
export function thunk(strength = 1) {
  if (!ok()) return;
  const t = ctx.currentTime;
  const v = 0.6 + 0.4 * strength;

  // 몸통 저음
  const body = tone('sine', 190, t, 0.35);
  body.frequency.exponentialRampToValueAtTime(48, t + 0.2);
  body.connect(env(t, 1.0 * v, 0.004, 0.3)).connect(master);

  // 나무 쪼개지는 크랙
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 1800;
  noise(t, 0.06).connect(hp).connect(env(t, 0.55 * v, 0.002, 0.06)).connect(master);

  // 나무 노크
  const knock = tone('triangle', 520, t, 0.12);
  knock.frequency.exponentialRampToValueAtTime(260, t + 0.1);
  knock.connect(env(t, 0.45 * v, 0.002, 0.1)).connect(master);

  // 꽂힌 뒤 손잡이 "부르르"
  const twang = tone('sawtooth', 110, t + 0.03, 0.5);
  const lfo = tone('sine', 28, t + 0.03, 0.5);
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 18;
  lfo.connect(lfoGain).connect(twang.frequency);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 600;
  twang.connect(lp).connect(env(t + 0.03, 0.12 * v, 0.01, 0.45)).connect(master);
}

/** 금속에 튕기는 "깡!" */
export function clang() {
  if (!ok()) return;
  const t = ctx.currentTime;
  [[1240, 0.35, 0.9], [2710, 0.22, 0.6], [3920, 0.15, 0.4], [620, 0.3, 0.4]].forEach(([f, vol, dur]) => {
    tone('sine', f, t, dur).connect(env(t, vol, 0.002, dur)).connect(master);
  });
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 3000;
  noise(t, 0.04).connect(hp).connect(env(t, 0.4, 0.001, 0.04)).connect(master);
}

/** 바닥에 떨어지는 "툭" */
export function drop(at = 0.45) {
  if (!ok()) return;
  const t = ctx.currentTime + at;
  const o = tone('sine', 140, t, 0.2);
  o.frequency.exponentialRampToValueAtTime(60, t + 0.15);
  o.connect(env(t, 0.5, 0.003, 0.18)).connect(master);
}

/** 불스아이 팡파레 */
export function fanfare() {
  if (!ok()) return;
  const t = ctx.currentTime + 0.12;
  [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => {
    const s = t + i * 0.085;
    tone('triangle', f, s, 0.4).connect(env(s, 0.28, 0.01, i === 4 ? 0.6 : 0.25)).connect(master);
    tone('square', f * 2, s, 0.2).connect(env(s, 0.04, 0.01, 0.15)).connect(master);
  });
}

/** 짧은 상승음 (점수) */
export function ding(level = 1) {
  if (!ok()) return;
  const t = ctx.currentTime + 0.1;
  const base = 660 * Math.pow(1.122, level);
  tone('triangle', base, t, 0.3).connect(env(t, 0.25, 0.005, 0.28)).connect(master);
  tone('triangle', base * 1.5, t + 0.07, 0.3).connect(env(t + 0.07, 0.2, 0.005, 0.3)).connect(master);
}

/** 빗나감 "뿌우~" */
export function miss() {
  if (!ok()) return;
  const t = ctx.currentTime + 0.1;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 900;
  lp.connect(master);
  [[330, 0], [262, 0.22]].forEach(([f, d]) => {
    const o = tone('sawtooth', f, t + d, 0.3);
    o.frequency.exponentialRampToValueAtTime(f * 0.85, t + d + 0.28);
    o.connect(env(t + d, 0.18, 0.02, 0.28)).connect(lp);
  });
}

/** UI 클릭 */
export function tick() {
  if (!ok()) return;
  const t = ctx.currentTime;
  tone('square', 1500, t, 0.03).connect(env(t, 0.08, 0.001, 0.03)).connect(master);
}
