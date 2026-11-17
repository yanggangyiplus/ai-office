# AI 오피스 v2 (내 공간 + 팀 공간) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 로그인하면 걸어 다닐 수 있는 내 공간이 나오고, 팀을 골라 입장하면 팀원 캐릭터가 실시간으로 걷는 팀 공간에서 회의·현황판·채팅을 쓰는 ZEP 스타일 오피스.

**Architecture:** 걷기·충돌·책상 배정·보간은 `src/lib/space/`의 순수 함수로 두고 테스트한다. 실시간은 `Transport` 인터페이스 하나에 Ably 구현과 로컬(BroadcastChannel) 구현을 두고, 캔버스 컴포넌트는 인터페이스만 안다. 채팅은 서버 API가 멤버 확인 → DB 저장 → 발행한다. 개인 GitHub·Notion 토큰은 `connections` 테이블에 사람별로 암호화 저장한다.

**Tech Stack:** 기존(Next.js 16, Auth.js, Drizzle + Neon, Vitest, PGlite) + `ably`, 브라우저 Canvas 2D / BroadcastChannel.

**Spec:** `docs/superpowers/specs/2026-11-17-ai-office-v2-space-design.md` (v1: `2026-11-17-ai-office-design.md`)

## Global Constraints

- 실시간 서비스는 Ably. 채널 이름은 `team:<팀id>`. 서버가 속한 팀의 채널만 쓸 수 있는 짧은 수명 토큰을 `/api/realtime/token`으로 발급한다.
- 위치는 움직이는 동안에만 초당 약 5회 발행하고, 받는 쪽이 보간한다. 멈출 때와 움직이는 동안 5초마다 접속 목록(presence) 데이터에 마지막 좌표를 갱신한다.
- 채팅은 서버(`POST /api/teams/<id>/chat`)가 멤버 확인 → DB 저장 → 발행. 메시지는 500자까지, 입장 시 최근 100개를 불러온다.
- 운영에서 `ABLY_API_KEY`가 없으면 팀 공간 입장을 막고 안내한다. 키가 없고 production이 아니면 로컬 대체(BroadcastChannel, 탭마다 캐릭터 하나). 운영은 사용자당 캐릭터 하나(새 탭이 이기고 옛 탭은 끊김).
- 개인 토큰은 DB에 암호화 저장하고 브라우저로 다시 보내지 않는다("연결됨"만 표시). 팀 단위 토큰 컬럼(`offices.notionToken`, `offices.githubToken`)은 삭제한다.
- 이슈는 누르는 사람의 GitHub 토큰, 회의록 읽기는 올리는 사람의 Notion 토큰, 현황판은 보는 사람의 GitHub 토큰으로 한다. 토큰이 없으면 "먼저 내 공간에서 연결하세요"를 보여 주고 500을 내지 않는다.
- 책상은 최대 12개, `members.joinedAt` → `userId` 순 배정, 13번째부터는 책상 없이 입구에서 시작.
- 화면 용어는 "팀"(DB 이름 `offices`는 유지). 기존 `/offices/[id]` 화면은 "목록으로 보기"로 남기고 `/offices`는 `/me`로 리디렉션한다. 맵의 모든 기능은 HTML 패널로도 열린다.
- 로그인을 읽는 모든 페이지는 맨 앞에 `await connection()`(`next/server`)과 `export const instant = false`. 서버 액션은 `src/app/actions.ts`에 두고 인라인으로 만들지 않는다. 개발용 DB는 메모리 PGlite. 테스트 로그인은 `AUTH_TEST_LOGIN=1`일 때만.
- 마이그레이션은 `npx drizzle-kit generate`로 만든다. 모든 UI 문구는 한국어.

## Review Focus

1. 팀원이 아닌 사람이 실시간 토큰을 요청하거나 채팅을 보낼 때: 토큰의 권한에 그 팀 채널이 없고, 채팅은 403.
2. 빈 채팅·500자 초과 채팅: 400으로 거부, 저장·발행 없음. HTML이 든 채팅은 글자 그대로 보임(React 이스케이프).
3. 운영인데 `ABLY_API_KEY`가 없을 때: 팀 공간이 크래시하지 않고 안내만 보임(`realtimeMode`가 `blocked`).
4. GitHub·Notion 토큰이 없는 사람이 이슈 만들기·회의록 올리기·현황판 볼 때: 500이 아니라 "먼저 연결하세요".
5. 맵 가장자리·벽 쪽으로 계속 걷기, 대각선 이동, 한 프레임에 큰 `dt`(탭이 백그라운드였다 돌아옴): 벽을 뚫거나 맵 밖으로 나가지 않는다.

---

### Task 1: 개인 연결 테이블과 스키마 변경

**Files:**
- Modify: `src/db/schema.ts`, `src/lib/offices.ts` (`saveSettings`에서 토큰 필드 제거), `src/lib/offices.test.ts`
- Create: `src/lib/connections.ts`, `drizzle/0002_*.sql`(생성)
- Test: `src/lib/connections.test.ts`

**Interfaces:**
- Produces: 테이블 `connections(userId, provider 'github'|'notion', token 암호화, 기본키 (userId, provider))`, `members.joinedAt timestamp not null default now()`, `offices.notionToken/githubToken` 삭제
- Produces: `type Provider = "github" | "notion"`, `saveConnection(db: Db, userId: string, provider: Provider, token: string): Promise<void>` (같은 provider는 덮어씀; 알 수 없는 provider나 빈 토큰은 `ValidationError`), `deleteConnection(db, userId, provider): Promise<void>`, `connectionStatus(db, userId): Promise<{ github: boolean; notion: boolean }>`, `requireToken(db, userId, provider): Promise<string>` (없으면 `NotConnectedError`, `.provider` 속성), `class NotConnectedError extends Error`
- `ValidationError`는 `src/lib/meetings.ts`에 이미 있다(그대로 import).

- [ ] **Step 1: 실패하는 테스트** `connections.test.ts`: 저장된 토큰 컬럼 값이 평문과 다르고 `requireToken`이 평문을 돌려줌; 같은 provider를 다시 저장하면 새 토큰으로 바뀜(행 1개); `connectionStatus`가 저장/삭제를 반영; 토큰이 없으면 `requireToken`이 `NotConnectedError("notion")`; 빈 토큰·`"gitlab"`은 `ValidationError`. `offices.test.ts`에서는 토큰 저장 테스트(`stores the github token encrypted`)를 지우고 `saveSettings`가 `repos`/`defaultRepo`만 저장하는 테스트로 바꾼다.
- [ ] **Step 2:** `npx vitest run src/lib/connections.test.ts` → FAIL(모듈 없음) 확인.
- [ ] **Step 3:** `schema.ts` 수정과 `connections.ts` 구현, `saveSettings` 타입에서 `notionToken`/`githubToken` 제거, `npx drizzle-kit generate`. 암호화는 기존 `encrypt/decrypt` 사용.
- [ ] **Step 4:** 이 파일들의 테스트 통과 확인. 다른 파일이 지운 컬럼을 쓰면 타입 오류가 나지만 Task 2에서 고친다(이 시점의 `npm run build`는 실패해도 된다).
- [ ] **Step 5:** Commit `feat: per-user connections and member join time`.

### Task 2: 개인 토큰으로 회의·이슈·현황판 전환

**Files:**
- Modify: `src/lib/meetings.ts` (`makeDeps`), `src/lib/github.ts` (`makeGithub`, 권한 오류), `src/lib/http.ts`, `src/components/Forms.tsx` (`SettingsForm`, `MeetingLinkForm`), `src/components/PostButton.tsx`, `src/app/api/offices/[id]/meetings/route.ts`, `src/app/api/meetings/[id]/regenerate/route.ts`, `src/app/api/meetings/[id]/issues/route.ts`, `src/app/offices/[id]/page.tsx`, `src/app/offices/[id]/settings/page.tsx`, `src/app/api/offices/[id]/settings/route.ts`
- Test: `src/lib/github.test.ts`, `src/lib/meetings.test.ts`

**Interfaces:**
- Consumes: `requireToken`, `NotConnectedError` (Task 1)
- Produces: `makeDeps(db: Db, officeId: string, userId: string): Promise<MeetingDeps>` (userId의 Notion 토큰, 없으면 `NotConnectedError`), `makeGithub(db: Db, userId: string): Promise<GithubLike>`, `class GithubPermissionError extends Error { repo: string }`
- `createIssuesForTodos`는 GitHub가 403/404를 던지면 선점을 해제하고 `GithubPermissionError(repo)`를 던진다(다른 오류는 그대로).
- `handle()`: `NotConnectedError` → 428 본문 `not_connected:<provider>`, `GithubPermissionError` → 403 본문 `github_permission:<repo>`.

- [ ] **Step 1: 실패하는 테스트**: `github.test.ts`에 가짜 `gh.issues.create`가 `{status: 403}`를 던지면 `GithubPermissionError`이고 todo의 `issueUrl`이 다시 null; 500 오류는 그대로 전달. `meetings.test.ts`에 Notion 토큰이 없는 사용자로 `makeDeps`를 부르면 `NotConnectedError`(Review Focus 4), 토큰이 있으면 `fetchText`/`summarize`를 가진 객체를 돌려줌. `makeGithub`도 토큰 없으면 `NotConnectedError`.
- [ ] **Step 2:** 실행, FAIL 확인.
- [ ] **Step 3:** 위 시그니처대로 구현하고 세 API 라우트가 `userId`를 넘기게 한다. `SettingsForm`에서 토큰 입력을 제거(저장소·Notion 상위 페이지 ID만). `MeetingLinkForm`/`PostButton`은 428/403을 읽어 "먼저 내 공간에서 Notion(GitHub)을 연결하세요 → /me 링크", "이 저장소에 이슈를 만들 권한이 없습니다" 문구를 보여 준다. `/offices/[id]` 현황판은 보는 사람의 GitHub 토큰으로 읽고 없으면 연결 안내를 보인다(`boardError`).
- [ ] **Step 4:** `npx vitest run`과 `AUTH_SECRET=x npm run build` 통과 확인.
- [ ] **Step 5:** Commit `feat: use personal github and notion tokens`.

### Task 3: 실시간 전송 계층(인터페이스, 로컬, Ably)

**Files:**
- Create: `src/lib/realtime/types.ts`, `src/lib/realtime/local.ts`, `src/lib/realtime/ably.ts`, `src/lib/realtime/mode.ts`
- Test: `src/lib/realtime/local.test.ts`, `src/lib/realtime/mode.test.ts`

**Interfaces:**
- Produces (types.ts): `type Dir = "up"|"down"|"left"|"right"`, `type Position = { x: number; y: number; dir: Dir }`, `type Self = { id: string; userId: string; name: string }`, `type PeerState = Self & Position`, `type ChatMessage = { id: string; userId: string; name: string; body: string; at: number }`
- Produces: `interface Transport { connect(self: Self, start: Position): Promise<void>; publishMove(p: Position): void; setPresence(p: Position): Promise<void>; sendChat(m: ChatMessage): void; onMove(cb: (peerId: string, p: Position) => void): () => void; onPeers(cb: (peers: PeerState[]) => void): () => void; onChat(cb: (m: ChatMessage) => void): () => void; onKicked(cb: () => void): () => void; close(): Promise<void> }`
- Produces: `class LocalTransport implements Transport` (`constructor(teamId: string)`, BroadcastChannel `team:<id>`, `Self.id`가 접속 단위, 입장 시 hello를 보내면 다른 탭이 현재 좌표로 답함, `sendChat`은 다른 탭에 중계, `close`는 leave 알림), `class AblyTransport implements Transport` (`constructor(teamId: string)`, `/api/realtime/token`으로 인증, clientId = userId, presence 데이터에 좌표, 같은 clientId가 다른 연결로 들어오면 옛 연결에 `onKicked`, `sendChat`은 서버가 이미 발행하므로 아무 일도 하지 않음)
- Produces: `realtimeMode(env: Record<string, string | undefined>): "ably" | "local" | "blocked"` (`ABLY_API_KEY` 있음 → ably, 없음 + production 아님 → local, 없음 + production → blocked)

- [ ] **Step 1: 실패하는 테스트** `local.test.ts`(Node의 전역 `BroadcastChannel` 사용, 같은 팀 id로 두 인스턴스): B가 `connect`하면 A의 `onPeers`에 B의 시작 좌표가 나타남; 늦게 들어온 B의 `onPeers`에 이미 있던 A의 현재 좌표가 나옴(A가 `setPresence` 또는 `publishMove`로 바꾼 좌표); A가 `publishMove`하면 B의 `onMove(A.id, p)`가 호출됨; A의 `close` 후 B의 `onPeers`에서 A가 사라짐; `sendChat`이 B의 `onChat`으로 전달; 다른 팀 id의 인스턴스에는 아무것도 가지 않음. `mode.test.ts`: 위 세 경우(Review Focus 3).
- [ ] **Step 2:** 실행, FAIL 확인.
- [ ] **Step 3:** `types.ts`, `mode.ts`, `local.ts` 구현. `ably.ts`는 `ably` 패키지를 설치(`npm install ably`)해 위 계약대로 구현하되 자동 테스트는 없다(네트워크 필요; 실제 키로 수동 확인 대상).
- [ ] **Step 4:** `npx vitest run src/lib/realtime` 통과 확인.
- [ ] **Step 5:** Commit `feat: realtime transport with local and ably implementations`.

### Task 4: 채팅 저장·발행과 실시간 토큰 발급

**Files:**
- Modify: `src/db/schema.ts` (`messages` 테이블), `drizzle/0003_*.sql`(생성), `src/lib/http.ts`
- Create: `src/lib/chat.ts`, `src/lib/realtime/server.ts`, `src/app/api/teams/[id]/chat/route.ts`, `src/app/api/realtime/token/route.ts`
- Test: `src/lib/chat.test.ts`

**Interfaces:**
- Consumes: `ChatMessage` (Task 3), `isMember`, `ForbiddenError` (`offices.ts`), `ValidationError` (`meetings.ts`)
- Produces: 테이블 `messages(id uuid pk, officeId, userId, body, createdAt)`
- Produces: `sendChat(db: Db, publish: (teamId: string, m: ChatMessage) => Promise<void>, officeId: string, userId: string, body: string): Promise<ChatMessage>` (비멤버 `ForbiddenError`, 공백뿐이거나 500자 초과 `ValidationError`, 저장 후 발행, 이름은 `users.name`), `recentChat(db: Db, officeId: string, userId: string, limit?: number): Promise<ChatMessage[]>` (기본 100, 오래된 것부터, 비멤버 `ForbiddenError`)
- Produces (server.ts): `teamChannel(officeId: string): string` (`team:<id>`), `realtimeCapability(teamIds: string[]): Record<string, string[]>` (각 채널 → `["subscribe","publish","presence"]`), `publishChat(teamId: string, m: ChatMessage): Promise<void>` (Ably REST, 키가 없으면 아무 일도 안 함)

- [ ] **Step 1: 실패하는 테스트** `chat.test.ts`(PGlite, 가짜 `publish`): 멤버의 메시지가 저장되고 `publish`가 호출됨; 비멤버는 `ForbiddenError`이고 저장·발행 없음(Review Focus 1); 빈 문자열·공백·501자는 `ValidationError`이고 저장·발행 없음, 500자는 통과(Review Focus 2); `<script>`가 든 본문은 변형 없이 저장됨; `recentChat`이 101개 중 최근 100개를 오래된 것부터 돌려줌; `realtimeCapability(["a"])`가 `{ "team:a": [...] }`만 갖고 다른 팀 키가 없음.
- [ ] **Step 2:** 실행, FAIL 확인.
- [ ] **Step 3:** 스키마·마이그레이션, `chat.ts`, `server.ts` 구현. 라우트: 채팅 POST는 `handle()`로 감싸 `sendChat(db, publishChat, id, userId, body)`; 토큰 GET/POST는 로그인한 사용자의 팀 목록으로 `realtimeCapability`를 만들어 Ably `createTokenRequest({ clientId: userId, capability })`를 돌려주고, 키가 없으면 503. `handle()`는 `ValidationError`를 이미 400으로 매핑한다.
- [ ] **Step 4:** `npx vitest run` 통과 확인.
- [ ] **Step 5:** Commit `feat: team chat persistence and realtime token endpoint`.

### Task 5: 맵·걷기·책상 순수 로직

**Files:**
- Create: `src/lib/space/map.ts`, `src/lib/space/move.ts`, `src/lib/space/desks.ts`, `src/lib/space/net.ts`
- Modify: `src/lib/meetings.ts` (`officeMembers`가 `joinedAt`도 돌려줌)
- Test: `src/lib/space/map.test.ts`, `src/lib/space/move.test.ts`, `src/lib/space/desks.test.ts`, `src/lib/space/net.test.ts`

**Interfaces:**
- Produces (map.ts): `const TILE = 32`, `type SpaceMap = { cols: number; rows: number; grid: string[] }`(`grid[row]`가 한 줄 문자열, 문자 하나가 한 타일: `#` 벽, `.` 바닥, `D` 책상, `M` 회의실, `B` 현황판, `E` 입구, `C` 컴퓨터, `T` 팀 보드, `X` 문), `TEAM_MAP`(30×20, `D` 12개, `M`·`B`·`E` 각 1구역), `MY_ROOM`(12×9, `C`·`T`·`X` 각 1개), `isSolid(map: SpaceMap, px: number, py: number): boolean` (`#`, 범위 밖, 책상 `D`와 오브젝트 `C`·`T`·`X`는 막힘), `deskSpots(map: SpaceMap): { x: number; y: number }[]` (`D` 칸 옆 앉는 자리 좌표, 개수 12), `spawnPoint(map: SpaceMap): Position`(`E` 또는 방의 빈 바닥), `interactTarget(map: SpaceMap, pos: Position): "meeting" | "board" | "computer" | "teamboard" | "door" | null` (한 칸 이내의 구역·오브젝트)
- Produces (move.ts): `moveStep(map: SpaceMap, pos: Position, input: { dx: -1|0|1; dy: -1|0|1 }, dtMs: number): Position` (속도 140px/s, 20×20 판정, x·y 축을 따로 처리해 벽에 미끄러짐, 대각선은 정규화, `dtMs`는 100으로 상한, 맵 밖으로 안 나감, 입력이 있으면 `dir` 갱신), `smoothPeer(shown: { x: number; y: number }, target: { x: number; y: number }, dtMs: number): { x: number; y: number }` (지수 보간, 오래 떨어져 있으면 순간 이동)
- Produces (desks.ts): `assignDesks(members: { userId: string; joinedAt: Date }[]): Map<string, number | null>` (`joinedAt`, `userId` 순으로 0~11, 13번째부터 null)
- Produces (net.ts): `shouldPublishMove(last: { at: number; x: number; y: number } | null, now: number, pos: { x: number; y: number }): boolean` (200ms 이상 지났고 좌표가 바뀌었을 때만 true), `shouldRefreshPresence(lastAt: number, now: number, moving: boolean, justStopped: boolean): boolean` (멈춘 순간 true, 움직이는 동안 5초마다 true)

- [ ] **Step 1: 실패하는 테스트**: `move.test.ts`: 벽 쪽으로 걸어도 벽 안으로 들어가지 않고 다른 축으로는 미끄러짐; 맵 가장자리에서 계속 걸어도 범위를 벗어나지 않음; `dtMs: 5000`에도 한 번에 100ms치만 이동(벽을 못 뚫음)(Review Focus 5); 대각선 속도가 직선과 같음; `smoothPeer`가 가까운 거리는 부드럽게 접근하고 먼 거리는 즉시 목표로. `map.test.ts`: `deskSpots(TEAM_MAP)` 길이 12, `isSolid`가 책상·벽·범위 밖에서 true, `interactTarget`이 회의실 구역 옆에서 `"meeting"`, 멀리서 null; `MY_ROOM`에 `C`·`T`·`X` 각 1개. `desks.test.ts`: `joinedAt` 순으로 0..n-1, 같은 시각이면 `userId` 순, 13번째 멤버는 null, 중간 멤버가 빠지면 뒤 사람이 당겨짐. `net.test.ts`: 위 두 함수의 경계.
- [ ] **Step 2:** `npx vitest run src/lib/space` → FAIL 확인.
- [ ] **Step 3:** 구현. `officeMembers` 반환에 `joinedAt: Date` 추가(기존 호출부는 영향 없음).
- [ ] **Step 4:** `npx vitest run` 전체 통과 확인.
- [ ] **Step 5:** Commit `feat: space map, movement, desk assignment logic`.

### Task 6: 캔버스 공간 컴포넌트

**Files:**
- Create: `src/lib/space/draw.ts`, `src/components/space/SpaceCanvas.tsx`
- Test: 자동 테스트 없음(캔버스 렌더링). 검증은 Task 9의 브라우저 확인.

**Interfaces:**
- Consumes: `SpaceMap`, `moveStep`, `smoothPeer`, `interactTarget`, `shouldPublishMove`, `shouldRefreshPresence` (Task 5), `Transport`, `PeerState`, `ChatMessage` (Task 3)
- Produces: `drawAvatar(ctx: CanvasRenderingContext2D, id: string, x: number, y: number, size: number, dir: Dir): void` (v1의 8×8 스프라이트와 색 규칙 재사용, 방향별로 좌우 반전·뒷모습 구분)
- Produces: `<SpaceCanvas map: SpaceMap; self: Self; start: Position; transport: Transport | null; desks?: Map<string, number | null>; bubbles?: Record<string, string>; onInteract: (t: NonNullable<ReturnType<typeof interactTarget>>) => void />` (방향키/WASD 이동, 가까운 오브젝트에 "E" 안내 표시, E 또는 클릭으로 `onInteract`, `transport`가 null이면 혼자, 이동 중 `shouldPublishMove`일 때 `publishMove`, `shouldRefreshPresence`일 때 `setPresence`, 다른 사람은 `smoothPeer`로 그림, 이름표와 말풍선, 입력창에 포커스가 있으면 이동 입력 무시, `onKicked`면 "다른 곳에서 접속했습니다" 표시, 탭이 숨겨졌다 돌아오면 `dt` 상한 적용)

- [ ] **Step 1:** `draw.ts`와 `SpaceCanvas.tsx`를 위 계약대로 구현한다. 타일은 단색 블록과 간단한 도형으로 그린다(벽 어두운 색, 바닥 체크, 책상, 구역 표시). 구현 중 `transport`는 항상 인터페이스로만 접근한다.
- [ ] **Step 2:** `AUTH_SECRET=x npm run build`로 타입·빌드 통과 확인.
- [ ] **Step 3:** Commit `feat: canvas space component`.

### Task 7: 내 공간(`/me`)과 개인 연결 UI

**Files:**
- Create: `src/app/me/page.tsx`, `src/components/space/MyRoom.tsx`, `src/components/ConnectionsPanel.tsx`, `src/app/api/connections/route.ts`
- Modify: `src/app/actions.ts`, `src/app/page.tsx`(로그인 후 `/me`), `src/app/offices/page.tsx`(`/me`로 리디렉션), `src/app/layout.tsx`(필요 시)
- Test: `src/lib/connections.test.ts`의 검증 테스트는 Task 1에서 이미 있음. 이 Task의 화면은 브라우저로 확인.

**Interfaces:**
- Consumes: `connectionStatus`, `saveConnection`, `deleteConnection` (Task 1), `SpaceCanvas`, `MY_ROOM`, `spawnPoint` (Task 5, 6), `CreateOfficeForm` (기존)
- Produces: `POST /api/connections` 본문 `{ provider, token }`, `DELETE /api/connections?provider=github|notion`. 응답에 토큰을 절대 담지 않는다.
- `/me`: 서버에서 `connection()` → 로그인 확인 → `upsertUser` → 내 팀 목록과 `connectionStatus` 조회 → `<MyRoom>`에 전달.
- `<MyRoom>`: `MY_ROOM` 맵에 `<SpaceCanvas transport={null}>`. 컴퓨터(`computer`) → `ConnectionsPanel`(GitHub·Notion 토큰 붙여넣기, 만드는 방법 안내, 연결됨/미연결 표시, 해제), 팀 보드(`teamboard`) → 내 팀 목록과 각 "입장하기"(`/teams/<id>`), 새 팀 만들기(`CreateOfficeForm`), 초대 링크 코드 입력으로 `/join/<code>`, 문(`door`) → 로그아웃.

- [ ] **Step 1:** API 라우트(로그인 확인, `handle()` 사용)와 `/me` 페이지, `MyRoom`, `ConnectionsPanel` 구현. 로그인 뒤 이동 경로를 `/me`로 바꾸고 `/offices` 목록 페이지는 `redirect("/me")`.
- [ ] **Step 2:** `npx vitest run`과 `AUTH_SECRET=x npm run build` 통과 확인.
- [ ] **Step 3:** Commit `feat: my space with connections and team board`.

### Task 8: 팀 공간(`/teams/[id]`)

**Files:**
- Create: `src/app/teams/[id]/page.tsx`, `src/components/space/TeamSpace.tsx`, `src/components/space/ChatPanel.tsx`
- Modify: `src/app/offices/[id]/page.tsx`(공간으로 보기 링크), `src/lib/http.ts`(필요 시)
- Test: 브라우저로 확인(Task 9). 채팅 로직은 Task 4에서 테스트됨.

**Interfaces:**
- Consumes: `realtimeMode`, `LocalTransport`, `AblyTransport` (Task 3), `recentChat` (Task 4), `assignDesks`, `deskSpots`, `TEAM_MAP`, `spawnPoint` (Task 5), `SpaceCanvas` (Task 6), `officeMembers`, `buildBoard`, `fetchWork`, `makeGithub`, `MeetingLinkForm`
- `/teams/[id]` 서버: `connection()` → 로그인·멤버 확인(아니면 `notFound`) → 멤버·책상·최근 채팅·회의 목록·현황판 데이터(보는 사람의 GitHub 토큰, 없으면 안내 문구)를 모아 `<TeamSpace>`에 전달. `realtimeMode(process.env)`가 `blocked`면 맵 대신 안내만 렌더(Review Focus 3).
- `<TeamSpace>`: 모드에 맞는 `Transport`를 만들어 `<SpaceCanvas>`에 연결. 시작 위치는 내 책상 옆, 책상이 없으면 입구. 회의실(`meeting`) → 회의 목록·회의록 올리기 패널, 현황판(`board`) → 팀원별 하는 중/다음/끝남 패널(기존 `/offices/[id]` 표시 재사용). 책상은 걸어 다니는 장식과 "누가 어디 앉는지" 표시일 뿐 상호작용은 없다. 오른쪽 아래에 `<ChatPanel>`: 입장 시 받은 기록 표시, 입력 → `POST /api/teams/<id>/chat` → 성공 응답을 `transport.sendChat`으로 로컬 중계, `onChat`으로 받은 메시지를 목록에 더하고 보낸 사람 머리 위 말풍선으로 몇 초간 표시. "목록으로 보기" 링크(`/offices/<id>`)와 "내 공간으로" 링크.

- [ ] **Step 1:** 위 구성대로 서버 페이지와 클라이언트 컴포넌트를 구현한다. 채팅 전송 실패(403/400)는 입력창 아래에 한국어 문구로 보인다.
- [ ] **Step 2:** `npx vitest run`과 `AUTH_SECRET=x npm run build` 통과 확인.
- [ ] **Step 3:** Commit `feat: team space with walking, panels and chat`.

### Task 9: 브라우저 통합 확인과 마무리

**Files:**
- Modify: `.env.example`(`ABLY_API_KEY` 추가), 발견된 문제의 파일들
- Test: 전체 `npx vitest run`

- [ ] **Step 1:** 개발 서버(`npm run dev`, `AUTH_TEST_LOGIN=1`, Ably 키 없음 = 로컬 모드)를 띄우고 브라우저로 확인한다: 테스트 로그인 → `/me` 내 공간에서 걷기 → 컴퓨터에서 토큰 저장(저장 후 화면에 토큰이 다시 나타나지 않음) → 팀 보드에서 팀 만들기 → 입장하기 → 팀 공간 도착.
- [ ] **Step 2:** 같은 팀 공간을 **탭 두 개**로 열어 서로의 캐릭터가 보이고 걸을 때 따라 움직이는지, 늦게 연 탭에서도 상대 현재 위치가 보이는지, 채팅이 양쪽에 말풍선과 목록으로 뜨는지, 새로고침하면 최근 대화가 남는지 확인한다.
- [ ] **Step 3:** 회의실·현황판 패널이 열리는지, 토큰이 없을 때 "먼저 내 공간에서 연결하세요"가 나오는지, "목록으로 보기"로 기존 화면이 열리는지 확인한다. 발견한 문제는 고치고 가능하면 테스트를 먼저 쓴다.
- [ ] **Step 4:** `npx vitest run`과 `AUTH_SECRET=x npm run build` 통과 확인. Ably 실연결, 실제 Notion·GitHub 토큰 흐름은 키가 없어 확인하지 못한 항목으로 기록한다.
- [ ] **Step 5:** Commit `feat: integrate and verify my space and team space`.
