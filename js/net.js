// 과녁 <-> 도끼 연동 레이어.
// - firebase: Realtime Database (서로 다른 기기 간 연동)
// - local:    BroadcastChannel (같은 브라우저의 탭끼리, Firebase 설정 전 테스트용)
import { firebaseConfig } from './firebase-config.js';

const ROOT = 'axeRooms'; // DB 최상위 경로 (다른 게임의 rooms 와 분리)
const SDK = 'https://www.gstatic.com/firebasejs/10.12.2';
const params = new URLSearchParams(location.search);
const cfg = firebaseConfig || {};
const configured = !!cfg.databaseURL && !/YOUR_/.test(`${cfg.apiKey}${cfg.databaseURL}`);

export const mode = params.has('local') || !configured ? 'local' : 'firebase';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function makeRoomId(len = 5) {
  let s = '';
  const buf = crypto.getRandomValues(new Uint8Array(len));
  for (const b of buf) s += ALPHABET[b % ALPHABET.length];
  return s;
}

export function normalizeRoomId(s) {
  return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
}

let fbPromise;
function fb() {
  fbPromise ??= (async () => {
    const [{ initializeApp }, d] = await Promise.all([
      import(`${SDK}/firebase-app.js`),
      import(`${SDK}/firebase-database.js`),
    ]);
    const app = initializeApp(firebaseConfig);
    return { d, db: d.getDatabase(app) };
  })();
  return fbPromise;
}

/**
 * 과녁(호스트)이 방을 연다.
 * @returns {{ setState(state): void }}
 */
export async function hostRoom(roomId, { onAxe, onThrow }) {
  if (mode === 'local') return localHost(roomId, { onAxe, onThrow });

  const { d, db } = await fb();
  const path = (p = '') => d.ref(db, `${ROOT}/${roomId}${p}`);
  let lastState = null;

  // 과녁이 끊기면 방 전체 삭제. 재연결되면 다시 연다.
  d.onValue(d.ref(db, '.info/connected'), (snap) => {
    if (snap.val() !== true) return;
    d.onDisconnect(path()).remove();
    d.set(path('/meta'), { createdAt: d.serverTimestamp() });
    if (lastState) d.set(path('/state'), lastState);
  });

  d.onValue(path('/axe'), (s) => onAxe(s.val()));
  d.onChildAdded(path('/throws'), (s) => {
    onThrow(s.key, s.val());
    d.remove(s.ref);
  });

  return {
    setState(state) {
      lastState = state;
      d.set(path('/state'), state);
    },
  };
}

/**
 * 도끼가 방에 들어간다.
 * @returns {{ throwAxe(data): string, updateInfo(info): void }}
 */
export async function joinRoom(roomId, info, { onState, onTarget }) {
  if (mode === 'local') return localJoin(roomId, info, { onState, onTarget });

  const { d, db } = await fb();
  const path = (p = '') => d.ref(db, `${ROOT}/${roomId}${p}`);

  const meta = await d.get(path('/meta'));
  if (!meta.exists()) throw new Error('NOT_FOUND');

  let current = info;
  d.onValue(d.ref(db, '.info/connected'), (snap) => {
    if (snap.val() !== true) return;
    d.onDisconnect(path('/axe')).remove();
    d.set(path('/axe'), { ...current, at: d.serverTimestamp() });
  });
  // 과녁이 새로고침되면 방이 지워졌다 다시 생기므로, 다시 생길 때 도끼 접속을 재등록
  let targetUp = true;
  d.onValue(path('/meta'), (s) => {
    const up = s.exists();
    if (up && !targetUp) d.set(path('/axe'), { ...current, at: d.serverTimestamp() });
    targetUp = up;
    onTarget(up);
  });
  d.onValue(path('/state'), (s) => s.exists() && onState(s.val()));

  return {
    throwAxe(data) {
      const r = d.push(path('/throws'));
      d.set(r, { ...data, at: d.serverTimestamp() });
      return r.key;
    },
    updateInfo(next) {
      current = next;
      d.update(path('/axe'), next);
    },
  };
}

// ---------------------------------------------------------------- local mode

function channel(roomId) {
  return new BroadcastChannel(`axe-room-${roomId}`);
}

function localHost(roomId, { onAxe, onThrow }) {
  const ch = channel(roomId);
  let state = null;
  ch.onmessage = ({ data: m }) => {
    if (m.type === 'axe') onAxe(m.info);
    else if (m.type === 'throw') onThrow(m.id, m.data);
    else if (m.type === 'hello') {
      ch.postMessage({ type: 'meta' });
      if (state) ch.postMessage({ type: 'state', state });
    }
  };
  ch.postMessage({ type: 'meta' });
  addEventListener('pagehide', () => ch.postMessage({ type: 'bye' }));
  return {
    setState(s) {
      state = s;
      ch.postMessage({ type: 'state', state: s });
    },
  };
}

function localJoin(roomId, info, { onState, onTarget }) {
  const ch = channel(roomId);
  let current = info;
  const api = {
    throwAxe(data) {
      const id = `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
      ch.postMessage({ type: 'throw', id, data: { ...data, at: Date.now() } });
      return id;
    },
    updateInfo(next) {
      current = next;
      ch.postMessage({ type: 'axe', info: current });
    },
  };
  addEventListener('pagehide', () => ch.postMessage({ type: 'axe', info: null }));

  return new Promise((resolve, reject) => {
    let found = false;
    ch.onmessage = ({ data: m }) => {
      if (m.type === 'meta') {
        if (!found) { found = true; resolve(api); }
        onTarget(true);
        ch.postMessage({ type: 'axe', info: current });
      } else if (m.type === 'state') onState(m.state);
      else if (m.type === 'bye') onTarget(false);
    };
    ch.postMessage({ type: 'hello' });
    setTimeout(() => { if (!found) reject(new Error('NOT_FOUND')); }, 1500);
  });
}
