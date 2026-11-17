# AI 오피스 v3 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (the user chose inline execution earlier). Steps use checkbox syntax.

**Goal:** 시안(`mock-office.html`)의 디자인과 기능(역할, 회의 기록, 출퇴근·상태, 진행도, 활동 피드)을 실제 앱에 반영한다.

**Spec:** `docs/superpowers/specs/2026-11-18-ai-office-v3-redesign.md`

## Global Constraints
- 타일 16px, 맵 72×36(1152×576), 책상 12개, 사람 12×24px 캔버스 스프라이트. 팔레트는 쿨그레이(바닥 `#e8ebf0`, 페이지 `#eef1f5`, 카드 `#f7f8fa`, 파란 포인트 `#4a7bd0`).
- 모든 UI 문구는 한국어. 로그인을 읽는 페이지는 `await connection()`과 `export const instant = false`. 서버 액션은 `src/app/actions.ts`.
- 역할: 한 사람 최대 5개, 한 역할 12자 이하, 중복 제거(대소문자 무시). 본인 또는 관리자만 바꾼다.
- 상태는 본인만, 출근한 사람만 바꾼다. 출근/퇴근은 본인만.
- AI가 만든 할 일은 사람이 확정하기 전에는 이슈가 되지 않는다(기존 규칙 유지).
- 마이그레이션은 `npx drizzle-kit generate`로 만든다.

## Review Focus
1. 팀원이 아닌 사람이 역할·출근·상태·메모·자료·활동을 읽거나 쓰기: 403.
2. 다른 사람의 역할을 일반 멤버가 바꾸기, 다른 사람의 출근/상태를 바꾸기: 거부.
3. 역할 입력 이상값(6개, 13자, 빈 문자열, 배열 아님): 400, 저장 안 됨.
4. 메모로 만든 회의를 AI 정리: Notion 토큰 없이 동작, 확정된 회의는 거부.
5. 벽·책상·파티션으로 걸어 들어가기, 맵 가장자리, 새 맵에서 12개 자리 모두 도달 가능.

---

### Task 1: 데이터 모델과 규칙 (역할, 출퇴근, 활동, 메모 회의)
**Files:** `src/db/schema.ts`, `drizzle/0004_*.sql`(생성), `src/lib/roles.ts`, `src/lib/attendance.ts`, `src/lib/activity.ts`, `src/lib/meetings.ts`, 각 `*.test.ts`
- `members.roles text[] default {}`, `members.status text default 'working'`, 테이블 `attendance(id, officeId, userId, checkedInAt, checkedOutAt?)`, 테이블 `activity(id, seq serial, officeId, userId, text, createdAt)`, `meetings.notionPageId` nullable, `meetings.notes text default ''`, `meetings.links jsonb default []`, `todos.role text?`.
- `roles.ts`: `PRESET_ROLES`, `normalizeRoles(input: unknown): string[]`(ValidationError), `setRoles(db, officeId, actorId, targetId, roles)`, `suggestAssignees(role: string|null, members: {userId; roles: string[]}[]): string[]`.
- `attendance.ts`: `checkIn`, `checkOut`, `setStatus(db, officeId, userId, status)`, `presenceOf(db, officeId): Promise<Map<userId, {present: boolean; status: Status}>>`.
- `activity.ts`: `logActivity(db, officeId, userId, text)`(실패해도 던지지 않음), `recentActivity(db, officeId, userId, limit=30)`(멤버만).
- `meetings.ts`: `createNotesMeeting(db, officeId, userId, title)`, `saveNotes(db, meetingId, userId, notes)`(확정 전만), `addLink(db, meetingId, userId, {title,url})`, `regenerate`가 메모 회의는 `notes`로 정리, `officeMembers`가 `roles`·`status` 반환, 회의 생성·확정·이슈 생성에서 `logActivity`.
- [ ] 테스트 먼저(실패 확인) → 구현 → 전체 통과 → Commit `feat: roles, attendance, activity and notes meetings`.

### Task 2: 진행도와 역할 로직, AI 정리에 역할
**Files:** `src/lib/progress.ts`, `src/lib/summarize.ts`, 테스트
- `teamProgress(board)`, `myProgress(board, userId)`, `filterBoardByRole(board, roles, role)`.
- `summarizeMeeting` 프롬프트에 역할 후보를 주고 `todos[].role?: string | null`을 받는다(검증 포함). `buildTodos`가 role 저장, 담당자 미정이고 역할 후보가 한 명이면 미리 채움.
- [ ] 테스트 먼저 → 구현 → Commit `feat: progress, role filter and role in summaries`.

### Task 3: API 연결
**Files:** `src/app/api/offices/[id]/roles/route.ts`, `.../attendance/route.ts`, `src/app/api/offices/[id]/meetings/route.ts`(제목만으로 메모 회의 생성), `src/app/api/meetings/[id]/notes/route.ts`, `.../links/route.ts`, regenerate 라우트(메모 회의는 Notion 토큰 없이)
- 얇은 라우트(`handle()`), 오류 매핑은 기존 것 사용. 
- [ ] 빌드·전체 테스트 → Commit `feat: roles, attendance and notes meeting routes`.

### Task 4: 새 맵과 충돌
**Files:** `src/lib/space/map.ts`(재작성), `map.test.ts`, `move.test.ts`, `desks.test.ts`, `net.ts`/`move.ts`(상수 확인)
- `TILE=16`, `TEAM_MAP` 72×36(책상 12개 파티션 구역, 유리 회의실, 입구 E, 현황판 B, 회의실 M), `MY_ROOM` 28×18(컴퓨터 C, 팀 보드 T, 문 X), `SpaceMap.seats`, `deskSpots`가 `seats` 반환, `Interactable`에 `entrance` 추가, 사람 판정 12×12(타일 16에 맞춤), 속도 80px/s·`MAX_DT` 유지.
- 12개 자리가 입구에서 모두 걸어 도달 가능함을 BFS 테스트로 확인.
- [ ] 테스트 수정(실패 확인) → 구현 → Commit `feat: office map at 16px tiles with partitions`.

### Task 5: 장면 그리기와 카메라
**Files:** `src/lib/space/scene.ts`, `src/lib/space/draw.ts`, `src/components/space/SpaceCanvas.tsx`
- 시안의 그리기 코드를 `scene.ts`로 옮겨 `drawTeamScene(ctx, state)`, `drawRoomScene(ctx)`로 만든다. 사람은 12×24 스프라이트(`drawPerson`).
- `SpaceCanvas`: 캔버스 1280×720, `zoom: "near" | "fit"`, 카메라가 캐릭터를 따라감, 자리 이름표에 이름·역할·상태 점, 캐릭터 이름표 위 역할 태그, 말풍선 유지.
- [ ] 타입·빌드 통과 → Commit `feat: new scene drawing and follow camera`.

### Task 6: 화면 테마와 팀 공간 구성
**Files:** `src/app/globals.css`, `src/components/space/TeamSpace.tsx`, `RoomPanel.tsx`, `SideCards.tsx`, `src/app/teams/[id]/page.tsx`, `MyRoom.tsx`, 기존 페이지의 흰 글씨 제거
- 테마를 쿨그레이로. 위쪽 요약 바(출근, 하는 중/다음/끝남, 팀 진행률, 가까이/전체 보기, 출근·퇴근 버튼), 오른쪽 카드(팀 진행률, 내 진행도, 내 역할, 팀원별 + 역할 필터, 오늘 회의, 활동 피드, 팀원), 채팅은 맵 아래.
- `RoomPanel`: 회의 목록, 탭 `정리/메모/자료`, `+ 새 회의 기록`, Notion 가져오기, `AI로 정리하기`.
- 입구에 서서 E → 출퇴근·상태 패널.
- [ ] 빌드·전체 테스트 → Commit `feat: cool-gray theme, team space layout, room panel`.

### Task 7: 브라우저 확인, 검토, 마무리
- 샘플 데이터에 역할·출근·활동·메모 회의를 넣고(개발용) 브라우저에서 확인한 뒤, 별도 검토자가 전체를 읽는다. 중요한 지적은 테스트 먼저 고친다.
