# 토익 단어 객관식 앱 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 폰 브라우저에서 홈 화면에 추가해 쓰는, 토익 빈출 단어 5000개 중 하루 300개를 가중 랜덤으로 뽑아 영어→한국어 5지선다(뜻 4개 + 고정 "모르겠다")로 푸는 오프라인 웹앱.

**Architecture:** 의존성 없는 순수 ES 모듈(로직: `src/*.js`)과 얇은 UI(`index.html`, `src/app.js`)로 나눈다. 로직 모듈은 `rng`/저장소를 인자로 받아 Node 테스트로 검증한다. 상태는 브라우저 `localStorage`에 JSON 한 덩어리로 저장하고, 서비스 워커가 정적 파일과 `data/words.json`을 캐시한다.

**Tech Stack:** Vanilla JS (ES modules), HTML/CSS, Node 20 내장 테스트 러너(`node --test`), Service Worker + Web App Manifest. 외부 라이브러리 없음.

**Spec:** `docs/superpowers/specs/2026-11-15-toeic-vocab-app-design.md`

## Global Constraints

- 사용자가 설치/빌드하는 단계 없음: 정적 파일만, 빌드 도구 금지. (`package.json`은 테스트 실행용으로만 쓴다.)
- 하루 300문제, 5지선다(뜻 보기 4개 + 항상 마지막 5번 "모르겠다"), 영어 단어 → 한국어 뜻.
- "모르겠다"(`chosen === 4`)는 틀린 것으로 기록하고 가중치를 올린다. 정답 확인 화면은 오답과 같게 정답을 보여준다.
- 정답은 항상 단어의 대표 뜻(`ko`). 오답 보기는 다른 단어의 `ko`에서만 뽑는다. 보조 뜻(`ko2`)은 정답 확인 화면에서만 보여준다.
- 오답 보기: 같은 품사(`pos`) 우선, 같은 `group`이면 제외, 정답과 같은 문자열이면 제외, 보기 4개는 서로 중복 없음.
- 가중치: 기본 1, 하한 0.3, 상한 10. 틀리면 +2(상한 적용), 맞히면 ×0.8(하한 적용).
- 오늘의 300개는 그날 첫 실행 때 가중 랜덤으로 한 번에 뽑아 저장(중복 없음). 같은 날 같은 단어 재출제 없음, 재도전 없음.
- 세션은 생성된 날짜(`YYYY-MM-DD`, 기기 로컬 시간)에 묶인다. 앱을 열었을 때 날짜가 다르면 새 세션. 이월 없음.
- 기록 가져오기는 전체 교체이며 실행 전 확인을 받는다.
- 오프라인에서 동작. 주 환경은 폰 세로 화면, 한 손 조작.

## Review Focus

1. `localStorage`가 막혀 있거나 저장된 JSON이 깨져 있음 → 앱이 죽지 않고 빈 상태로 시작한다. (Task 4)
2. 같은 품사 후보가 3개 미만인 단어 → 다른 품사에서 채워 항상 서로 다른 4개 보기를 만든다. (Task 3)
3. 단어 데이터가 늘어서 저장된 가중치에 없는 단어 id가 생김 → 기본 가중치 1로 취급한다. (Task 1, 5)
4. 형식이 틀린/다른 파일을 가져오기 → 거부하고 기존 기록은 그대로 둔다. (Task 4)
5. 보기를 빠르게 두 번 누름, 300문제를 모두 푼 뒤, 자정 이후 재실행 → 답이 두 번 기록되지 않고, 완료 화면이 뜨고, 새 세션이 열린다. (Task 5, 7)

---

### Task 1: 프로젝트 골격과 가중치 모듈

**Files:**
- Create: `package.json`, `.gitignore`, `src/weights.js`, `tests/weights.test.js`

**Interfaces:**
- Produces: `src/weights.js` exports
  `DEFAULT_WEIGHT = 1`, `MIN_WEIGHT = 0.3`, `MAX_WEIGHT = 10`,
  `getWeight(weights: Record<number, number>, id: number): number`,
  `applyAnswer(weights: Record<number, number>, id: number, correct: boolean): Record<number, number>` (원본을 바꾸지 않고 새 객체를 반환).

- [ ] **Step 1:** 프로젝트 폴더에서 `git init`, `.gitignore`(`node_modules/`), `package.json`(`{"type":"module","scripts":{"test":"node --test"}}`)을 만든다.
- [ ] **Step 2: 실패하는 테스트** `tests/weights.test.js` (node:test, `assert/strict`):
  - `getWeight({}, 7) === 1` (없는 id는 기본값)
  - `applyAnswer({}, 1, false)[1] === 3` (1 + 2)
  - `applyAnswer({1: 9}, 1, false)[1] === 10` (상한)
  - `applyAnswer({}, 1, true)[1] === 0.8`
  - `applyAnswer({1: 0.3}, 1, true)[1] === 0.3` (하한)
  - 입력 객체가 변하지 않음(`Object.isFrozen` 입력으로도 오류 없음)
- [ ] **Step 3:** `npm test` → FAIL(모듈 없음) 확인.
- [ ] **Step 4:** `src/weights.js`를 위 시그니처대로 구현한다. 부동소수점 비교를 피하려고 결과를 `Math.round(x * 1000) / 1000`로 반올림한다.
- [ ] **Step 5:** `npm test` → PASS.
- [ ] **Step 6:** 커밋 `feat: add weight rules`.

### Task 2: 가중 비복원 추출

**Files:**
- Create: `src/sampler.js`, `tests/sampler.test.js`

**Interfaces:**
- Consumes: 없음 (가중치 배열을 직접 받는다).
- Produces: `weightedSample(items: number[], weightOf: (item:number)=>number, n: number, rng: () => number): number[]` — 중복 없이 `min(n, items.length)`개를 반환. 방식: 각 항목에 키 `rng() ** (1 / weight)`를 주고 키가 큰 순서로 n개 선택(Efraimidis–Spirakis).

- [ ] **Step 1: 실패하는 테스트** `tests/sampler.test.js`:
  - 결과 길이 = `n`, 모든 원소가 서로 다름, 모두 `items` 안에 있음
  - `n > items.length`면 `items.length`개
  - 통계: 100개 항목 중 id 1만 가중치 10, 나머지 1로 두고 시드 고정 rng(테스트 안에 간단한 선형합동 난수 함수)로 `n=10`을 2000회 뽑았을 때 id 1이 뽑힌 비율이 0.5 이상이고 id 2의 비율보다 3배 이상 크다.
- [ ] **Step 2:** FAIL 확인 → **Step 3:** 구현 → **Step 4:** PASS 확인.
- [ ] **Step 5:** 커밋 `feat: weighted sampling without replacement`.

### Task 3: 보기(선택지) 만들기

**Files:**
- Create: `src/choices.js`, `tests/choices.test.js`

**Interfaces:**
- Produces: 타입 `Word = { id: number, en: string, pos: string, ko: string, ko2?: string, group?: string }`.
  `buildChoices(word: Word, allWords: Word[], rng: () => number): { options: string[], answerIndex: number }` — `options.length === 4`, `options[answerIndex] === word.ko`, 4개 모두 서로 다른 문자열. `rng`로 후보 선택과 정답 위치를 섞는다.

- [ ] **Step 1: 실패하는 테스트** `tests/choices.test.js` (작은 단어 배열을 테스트 안에 직접 만든다):
  - 기본: 옵션 4개, 정답이 `answerIndex` 위치, 중복 없음
  - 같은 `group`인 단어의 `ko`는 오답에 나오지 않음
  - `word.ko`와 같은 문자열을 `ko`로 가진 다른 단어는 오답에 나오지 않음
  - 오답은 다른 단어의 `ko`만 사용 — `ko2`는 절대 오답에 나오지 않음
  - 같은 품사 후보가 충분하면 오답 3개 모두 같은 품사
  - **(Review Focus 2)** 같은 품사 후보가 1개뿐인 데이터에서도 옵션 4개, 중복 없음
  - 정답 위치가 rng에 따라 달라짐(서로 다른 시드 두 개로 `answerIndex`가 다른 경우가 존재)
- [ ] **Step 2:** FAIL → **Step 3:** 구현(후보 풀: 같은 품사에서 제외 조건 통과한 것 → 부족하면 다른 품사 풀로 보충) → **Step 4:** PASS.
- [ ] **Step 5:** 커밋 `feat: build multiple-choice options`.

### Task 4: 저장소와 내보내기/가져오기

**Files:**
- Create: `src/storage.js`, `tests/storage.test.js`

**Interfaces:**
- Produces: 타입 `AppState = { version: 1, weights: Record<number, number>, session: Session | null }` (`Session`은 Task 5 참고: `{ date: string, ids: number[], answers: Record<number, {chosen: number, correct: boolean}> }`).
  - `emptyState(): AppState`
  - `loadState(store: Pick<Storage,'getItem'>): AppState` — 키 `toeic-vocab-v1`. 읽기 예외, 없음, JSON 파싱 실패, 형식 불일치면 `emptyState()`.
  - `saveState(store: Pick<Storage,'setItem'>, state: AppState): boolean` — 예외를 삼키고 성공 여부 반환.
  - `exportState(state: AppState): string` — 들여쓰기 없는 JSON.
  - `importState(text: string): { ok: true, state: AppState } | { ok: false, error: string }` — `version === 1`, `weights`가 숫자 값 객체, `session`이 null 또는 올바른 형태일 때만 ok.

- [ ] **Step 1: 실패하는 테스트** `tests/storage.test.js` (가짜 store 객체 사용):
  - 저장 후 불러오기 왕복 동일
  - **(Review Focus 1)** `getItem`이 예외를 던져도 `emptyState()` 반환; 값이 `"{깨진"`여도 `emptyState()`
  - `setItem`이 예외를 던지면 `saveState`가 `false`
  - `exportState` → `importState` 왕복 동일
  - **(Review Focus 4)** `importState("hello")`, `importState('{"version":2}')`, `weights`가 문자열인 경우 모두 `ok:false`
- [ ] **Step 2:** FAIL → **Step 3:** 구현 → **Step 4:** PASS.
- [ ] **Step 5:** 커밋 `feat: local storage persistence with import/export`.

### Task 5: 하루 세션 로직

**Files:**
- Create: `src/session.js`, `tests/session.test.js`

**Interfaces:**
- Consumes: `weightedSample`(Task 2), `getWeight`/`applyAnswer`(Task 1), `AppState`/`Session`(Task 4), `Word`(Task 3).
- Produces:
  - `DAILY_COUNT = 300`
  - `todayString(now: Date): string` → 로컬 `YYYY-MM-DD`
  - `ensureTodaySession(state: AppState, words: Word[], now: Date, rng: () => number): AppState` — 세션이 없거나 `session.date !== todayString(now)`이면 새로 만들고(가중 추출, `min(300, words.length)`개), 아니면 그대로 반환.
  - `currentIndex(session: Session): number` — 아직 답하지 않은 첫 문제의 위치. 모두 풀었으면 `session.ids.length`.
  - `UNKNOWN_INDEX = 4` ("모르겠다" 선택 값)
  - `recordAnswer(state: AppState, wordId: number, chosen: number, correct: boolean): AppState` — `chosen === UNKNOWN_INDEX`이면 `correct`가 무엇이든 `false`로 기록한다. 이미 답한 `wordId`거나 오늘 세션에 없는 id면 상태를 그대로 반환(가중치도 안 바꿈). 처음 답할 때만 `answers`에 기록하고 `applyAnswer`로 가중치를 갱신.
  - `progress(session: Session): { done: number, total: number, correct: number, wrong: number }`

- [ ] **Step 1: 실패하는 테스트** `tests/session.test.js` (단어 1000개를 만드는 헬퍼 사용):
  - 새 세션: ids 300개, 중복 없음, `date`가 `todayString(now)`
  - 같은 날 다시 호출하면 같은 ids(변하지 않음)
  - 다음 날(`now`만 바꿔서) 호출하면 새 세션, 이전 답변은 이월되지 않음
  - 단어가 100개뿐이면 ids 100개
  - 틀린 단어가 많이 틀린 상태(가중치 10)일 때, 시드 다른 rng로 200번 세션을 만들었을 때 그 단어가 포함된 비율이 가중치 1인 단어보다 확실히 높다(2배 이상)
  - **(Review Focus 5)** `recordAnswer`를 같은 단어로 두 번 호출해도 `answers`가 한 번만 기록되고 가중치도 한 번만 변함
  - 오늘 세션에 없는 id를 기록하면 상태 불변
  - `recordAnswer(state, id, UNKNOWN_INDEX, true)`도 `correct:false`로 기록되고 가중치가 +2 오른다
  - **(Review Focus 3)** `weights`에 없는 단어 id도 세션 생성에서 오류 없이 기본값 1로 취급
  - `currentIndex`: 3개 답한 뒤 3, 전부 답한 뒤 `ids.length`
  - `progress`의 correct/wrong 합이 done
- [ ] **Step 2:** FAIL → **Step 3:** 구현(불변 갱신: 새 state 객체 반환) → **Step 4:** PASS.
- [ ] **Step 5:** 커밋 `feat: daily session and answer recording`.

### Task 6: 단어 데이터 5000개와 검증 도구

**Files:**
- Create: `tools/validate-words.mjs`, `tests/validate-words.test.js`, `data/raw/words-01.json` … `data/raw/words-10.json`, `tools/merge-words.mjs`, `data/words.json`

**Interfaces:**
- Consumes: `Word` 형태(Task 3).
- Produces: `data/words.json` = `Word[]`, `id`는 1부터 연속 정수, 빈출 순서. `tools/validate-words.mjs` exports `validateWords(words: Word[]): string[]` (문제 목록, 빈 배열이면 통과)이고 CLI(`node tools/validate-words.mjs data/words.json`)로도 실행되며 문제가 있으면 종료 코드 1.

- [ ] **Step 1: 실패하는 테스트** `tests/validate-words.test.js`: `validateWords`가 다음을 각각 잡아낸다 — `en` 중복(대소문자 무시), 필수 필드 누락(`id,en,pos,ko`), `pos`가 `n|v|adj|adv|prep|conj` 밖, `id`가 1부터 연속이 아님, `ko`가 빈 문자열, `ko`가 영문자만으로 이루어짐, 같은 `group` 안에 단 한 단어만 있는 경우(경고가 아니라 문제로 취급). 올바른 배열은 `[]`.
- [ ] **Step 2:** FAIL → **Step 3:** `validateWords` 구현 + CLI 래퍼 → **Step 4:** PASS. 커밋 `feat: word data validator`.
- [ ] **Step 5: 단어 생성 (10배치 × 500개).** 각 배치 파일에 `{en,pos,ko,ko2?,group?}` 배열을 만든다. 배치 N은 빈출 순위 (N-1)×500+1 ~ N×500. 주제는 사무·계약·인사/채용·출장/여행·구매/배송·금융/회계·마케팅·시설/건물·제조·법규/공지 등 토익 단골 영역을 고르게 섞는다. `ko`는 토익에서 가장 흔한 뜻 한 가지(짧게), `ko2`는 다른 흔한 뜻이 있을 때만. 뜻이 사실상 같은 단어들(예: increase/rise)에는 같은 `group` 문자열을 붙인다. 배치를 만들 때마다 앞 배치까지의 `en` 목록을 확인해 중복을 피하고, 배치마다 `node tools/validate-words.mjs`로 (id 연속성 제외한) 검사를 돌려 통과시킨다.
  - [ ] 배치 01 · [ ] 02 · [ ] 03 · [ ] 04 · [ ] 05 · [ ] 06 · [ ] 07 · [ ] 08 · [ ] 09 · [ ] 10
- [ ] **Step 6:** `tools/merge-words.mjs`가 배치 파일을 순서대로 합쳐 id를 1부터 부여하고 `data/words.json`을 쓴다. 실행 후 `node tools/validate-words.mjs data/words.json` → 종료 코드 0, 단어 수 4800 이상 5200 이하를 확인한다. 같은 품사 후보가 3개 미만인 품사(예: conj)는 허용한다(Task 3이 처리).
- [ ] **Step 7:** 무작위로 단어 30개를 뽑아 `ko`가 토익 빈출 뜻으로 맞는지 눈으로 검토하고, 이상한 항목은 배치 파일에서 고쳐 다시 합친다. 커밋 `feat: add 5000 TOEIC words`.

### Task 7: 화면(UI)

**Files:**
- Create: `index.html`, `styles.css`, `src/app.js`, `tools/serve.mjs`

**Interfaces:**
- Consumes: `loadState/saveState/exportState/importState`(Task 4), `ensureTodaySession/currentIndex/recordAnswer/progress`(Task 5), `buildChoices`(Task 3), `data/words.json`(Task 6).
- Produces: `tools/serve.mjs` — `node tools/serve.mjs`로 프로젝트 루트를 `http://localhost:8080`에 서빙하는 정적 서버(의존성 없음).

- [ ] **Step 1:** `tools/serve.mjs` 작성 후 실행해 `http://localhost:8080/`이 응답하는지 확인한다.
- [ ] **Step 2:** `index.html` + `styles.css`: 폰 세로 화면용(`viewport` 메타 태그, 큰 터치 영역 최소 56px 높이 보기 버튼, 라이트/다크는 `prefers-color-scheme` 따름). 구성 — 상단 진행 줄(`오늘 N / 300 · ✔ a ✘ b`), 영어 단어, 품사 표시, 뜻 보기 4개, 그 아래 항상 고정된 5번 "모르겠다" 버튼(뜻 보기와 구분되는 보조 스타일), 설정 메뉴(내보내기/가져오기). 정답 확인 상태에서는 맞은 보기를 초록, 고른 오답을 빨강으로 표시하고("모르겠다"를 눌렀으면 정답만 초록으로 표시하고 5번을 빨강으로), `ko2`가 있으면 아래에 보여주며 "다음" 버튼이 나온다.
- [ ] **Step 3:** `src/app.js`: 시작 시 `words.json`을 불러오고 상태를 읽어 `ensureTodaySession` 후 저장. 문제 표시는 `currentIndex`부터. 한 문제당 `buildChoices`는 단어 id를 시드로 하는 rng를 써서(같은 문제는 새로고침해도 같은 보기 순서) 만든다. 보기 클릭 처리: 해당 문제에서 첫 클릭만 `recordAnswer` + `saveState`하고 이후 클릭은 무시(보기 버튼 비활성화로 구현, **Review Focus 5**). 300문제를 모두 푼 뒤에는 완료 화면(오늘 결과, 가장 많이 틀린 단어 5개, "내일 새 300개가 열립니다")을 보여준다. `saveState`가 `false`면 화면 상단에 "기록을 저장할 수 없습니다" 배너를 띄운다. 내보내기는 JSON 파일 다운로드, 가져오기는 파일 선택 후 `importState` 검사 → 확인 대화상자("현재 기록이 대체됩니다") → 저장 후 다시 불러오기. 형식이 틀리면 오류 메시지를 보여주고 기존 상태 유지(**Review Focus 4**).
- [ ] **Step 4: 수동 검증** (내장 브라우저, 폭 375px 모바일 프리셋으로 `http://localhost:8080/`):
  - 첫 화면에 문제 1/300이 보이고 뜻 보기 4개와 그 아래 5번 "모르겠다"가 항상 같은 자리에 있다
  - "모르겠다"를 누르면 정답이 초록으로 표시되고 틀린 수가 1 늘어난다
  - 보기를 누르면 색이 바뀌고, 같은 문제에서 다른 보기를 눌러도 변하지 않는다
  - 몇 문제 푼 뒤 새로고침하면 같은 지점에서 이어진다
  - 개발자 도구에서 `localStorage`의 `toeic-vocab-v1` 값을 `{깨짐`으로 바꾸고 새로고침 → 앱이 새 세션으로 시작하고 콘솔 오류 없음
  - 내보낸 파일 가져오기 성공, 아무 텍스트 파일 가져오기는 오류 메시지
  - 콘솔에서 `localStorage`의 세션 `date`를 어제 날짜로 바꾸고 새로고침 → 진행이 0/300인 새 세션
- [ ] **Step 5:** 커밋 `feat: quiz UI`.

### Task 8: 홈 화면 추가와 오프라인(PWA)

**Files:**
- Create: `manifest.webmanifest`, `sw.js`, `icons/icon.svg`, `icons/icon-192.png`, `icons/icon-512.png`
- Modify: `index.html` (매니페스트 링크, 서비스 워커 등록)

**Interfaces:**
- Consumes: Task 7의 파일 전부와 `data/words.json`.
- Produces: 캐시 이름 `toeic-vocab-v1`, 캐시 대상은 `index.html, styles.css, src/*.js, data/words.json, manifest.webmanifest, icons/*`.

- [ ] **Step 1:** 매니페스트(`name`, `short_name`, `start_url: "./"`, `display: "standalone"`, 아이콘 192/512, `theme_color`/`background_color`)와 단순한 아이콘(SVG를 만들고 PNG 두 크기를 그에서 생성)을 만든다.
- [ ] **Step 2:** `sw.js`: 설치 시 위 파일들을 캐시에 넣고, 요청은 캐시 우선·없으면 네트워크, 활성화 시 이름이 다른 이전 캐시 삭제.
- [ ] **Step 3:** `index.html`에 `<link rel="manifest">`와 서비스 워커 등록(등록 실패는 콘솔 경고만, 앱 동작에는 영향 없음).
- [ ] **Step 4: 수동 검증** (`http://localhost:8080/`): 개발자 도구 Application에서 서비스 워커가 활성화되고 매니페스트가 인식된다. 서버(`tools/serve.mjs`)를 끄고 새로고침해도 앱과 단어가 나오고 문제를 풀 수 있다.
- [ ] **Step 5:** 커밋 `feat: installable offline PWA`.

### Task 9: 폰에서 쓰기 위한 배포

폰에서 홈 화면에 추가하려면 정적 파일이 HTTPS 주소에 올라가 있어야 한다. 외부 서비스에 파일을 올리는 일이라 **구현 중 이 단계에 도달하면 사용자에게 먼저 어디에 올릴지 묻고 허락을 받는다** (GitHub Pages / Netlify Drop / 직접 호스팅 등).

**Files:** 선택한 호스팅에 따라 다름 (GitHub Pages라면 저장소 생성과 Pages 설정, 코드 변경 없음).

- [ ] **Step 1:** 사용자가 고른 방식과 계정을 확인한다. 사용자가 직접 해야 하는 로그인/인증은 사용자에게 맡긴다.
- [ ] **Step 2:** 배포한 뒤 주소를 사용자에게 전달한다.
- [ ] **Step 3: 수동 검증** (사용자 폰에서): 주소를 열어 문제를 풀 수 있고, "홈 화면에 추가"가 가능하며, 비행기 모드에서도 앱이 열린다. 사용자에게 확인을 요청한다.
- [ ] **Step 4:** 최종 확인 후 커밋.

---

## Self-Review

- 설계 문서의 요구 → 작업: 가중치(1), 하루 300 가중 추출(2, 5), 보기 규칙(3), 저장·내보내기·가져오기(4), 세션·자정·재도전 없음(5), 5000개 단어와 유의어 그룹(6), 화면·완료 화면·이어풀기(7), 오프라인·홈 화면(8), 폰에서 쓰기(9) — 빠진 항목 없음.
- 타입 일관성: `Word`, `Session`, `AppState`, `weightedSample`, `buildChoices`, `ensureTodaySession`, `recordAnswer`의 이름과 시그니처가 모든 작업에서 같다.
- Review Focus 5개 모두 해당 작업의 테스트나 수동 검증에 들어 있다.
- 설계 문서의 "단어 뜻을 앱에서 수정하는 기능"은 후순위라 이 계획에 넣지 않았다.
