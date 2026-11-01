# 🪓 도끼 던지기

휴대폰 두 대로 하는 도끼 던지기 게임.

- **과녁 폰** (`index.html`): 방을 만들고 QR 코드를 띄움. 날아온 도끼가 꽂히고 점수가 올라감.
- **도끼 폰** (`axe.html?room=코드`): QR로 접속. 폰을 휘두르면(또는 위로 스와이프) 도끼가 빙글빙글 날아감.

GitHub Pages(정적 호스팅) + Firebase Realtime Database(실시간 연동)로 동작합니다.

## 플레이 방법

1. 과녁 폰에서 사이트를 열고 **🎯 과녁 방 만들기**를 탭 → 도끼 QR이 떠요.
   과녁 화면을 새로고침해도 같은 방 코드로 다시 열려서 도끼 폰이 그대로 연결돼요.
2. 도끼 폰 카메라로 QR 스캔 → **시작하기** (iPhone은 동작 센서 허용).
3. 도끼 폰을 **좌우로 기울여 조준**하고, 과녁 쪽으로 **힘껏 휘두르기**.
   - 파워 50~60% 근처가 정중앙. 약하면 아래, 세면 위로 꽂혀요.
   - 가끔 튕겨나가기도 해요 (실제 도끼처럼).
4. 한 라운드 5개. 불스아이 6점 / 4 / 3 / 2 / 1점.
5. ⚙️ 옵션: 던질 물건(🪓🔪🗡️🔨🪃🍌🐟…), 흔들기 감도, 소리, 진동.

> ⚠️ 폰을 놓치지 않게 꽉 쥐세요. 손목 스트랩 추천!

## 1. Firebase 설정

1. [Firebase 콘솔](https://console.firebase.google.com) → **프로젝트 추가**.
2. 빌드 → **Realtime Database** → 데이터베이스 만들기 (위치 아무거나, "잠금 모드"로 시작해도 OK).
3. Realtime Database → **규칙** 탭에 [`database.rules.json`](database.rules.json) 내용을 붙여넣고 **게시**.
   - 이 게임은 DB의 `axeRooms/` 경로만 써요. 기존 `rooms`, `sojuRooms` 규칙도 그대로 들어 있어요.
4. 프로젝트 설정(⚙️) → 내 앱 → **웹 앱(</>) 추가** → 표시되는 `firebaseConfig` 값을
   [`js/firebase-config.js`](js/firebase-config.js)에 붙여넣기.
   - `databaseURL`이 꼭 있어야 해요 (Realtime Database를 만든 뒤에 복사하면 들어있음).

> Firebase 웹 설정값(apiKey 등)은 공개돼도 되는 값이에요. 보안은 DB 규칙으로 지킵니다.

## 2. GitHub Pages 배포

```bash
git init
git add .
git commit -m "axe throwing game"
git branch -M main
git remote add origin https://github.com/<아이디>/axe-throwing.git
git push -u origin main
```

GitHub 저장소 → Settings → Pages → Source: `Deploy from a branch`, Branch: `main` / `(root)` → Save.
잠시 후 `https://<아이디>.github.io/axe-throwing/` 에서 열려요.

> 동작 센서는 **HTTPS에서만** 동작해요. GitHub Pages는 HTTPS라 OK.

## 로컬 테스트 (Firebase 없이)

`firebase-config.js`가 비어 있으면 자동으로 **로컬 테스트 모드**가 됩니다 (같은 브라우저의 탭끼리 BroadcastChannel로 연동).

```bash
npx serve .
```

브라우저에서 `http://localhost:3000` (과녁) 을 열고, QR 아래 링크를 새 탭으로 열어 도끼 화면에서 마우스로 위로 스와이프해 보세요.
과녁 탭 콘솔에서 `testThrow()` 를 실행하면 과녁 혼자서도 투척 연출을 볼 수 있어요.

## 파일 구조

```
index.html            과녁 화면
axe.html              도끼 화면
css/style.css         공통 스타일
js/target.js          과녁 로직 (판정, 꽂히는 연출)
js/axe.js             도끼 로직 (휘두르기/스와이프 감지, 옵션)
js/net.js             연동 (Firebase RTDB / 로컬 BroadcastChannel)
js/sound.js           WebAudio 합성 효과음 (휙휙, 퍽!, 깡!, 팡파레)
js/firebase-config.js Firebase 설정
database.rules.json   Realtime Database 보안 규칙
```
