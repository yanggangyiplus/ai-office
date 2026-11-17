import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { activity, attendance, meetings, members, messages, offices, todos, users } from "@/db/schema";
import type { WorkItem } from "./github";
import type { Summary } from "./summarize";

// DEV-ONLY sample data, so the screens can be looked at without Notion/GitHub. Throwaway: remove when real data is easy to get.
export const DEMO_TEAM_NAME = "AI 캠프 팀";

// Needs the explicit flag AND a non-production, non-Vercel environment.
export function demoMode(env: Record<string, string | undefined>): boolean {
  return env.SEED_DEMO === "1" && env.NODE_ENV !== "production" && !env.VERCEL_ENV;
}

// Same id scheme as the dev test login ("test:<name>"), so signing in as "양강이" owns this team.
const PEOPLE = [
  { id: "test:양강이", name: "양강이", gh: "yanggang" },
  { id: "test:지은", name: "지은", gh: "jieun-dev" },
  { id: "test:민수", name: "민수", gh: "minsu-dev" },
  { id: "test:하늘", name: "하늘", gh: "haneul" },
  { id: "test:도윤", name: "도윤", gh: "doyoon" },
];
const REPOS = ["demo/ai-office", "demo/docs"];
// roles, whether they are at work, and their status (index matches PEOPLE)
const SETUP: { roles: string[]; present: boolean; status: "working" | "meeting" | "away" | "meal" }[] = [
  { roles: ["개발", "QA"], present: true, status: "working" },
  { roles: ["디자인"], present: true, status: "working" },
  { roles: ["개발"], present: true, status: "meeting" },
  { roles: ["마케팅"], present: true, status: "meal" },
  { roles: ["PO", "기획"], present: false, status: "working" },
];

export async function seedDemo(db: Db): Promise<void> {
  if ((await db.select().from(offices).where(eq(offices.name, DEMO_TEAM_NAME))).length) return;

  for (const p of PEOPLE) {
    await db.insert(users).values({ id: p.id, email: `${p.name}@test.local`, name: p.name, githubUsername: p.gh }).onConflictDoNothing();
  }
  const [team] = await db
    .insert(offices)
    .values({ name: DEMO_TEAM_NAME, adminId: PEOPLE[0].id, repos: REPOS, defaultRepo: REPOS[0], notionParentPageId: "demo" })
    .returning({ id: offices.id });
  const start = Date.now() - 5 * 86_400_000;
  for (const [i, p] of PEOPLE.entries()) {
    await db.insert(members).values({
      officeId: team.id, userId: p.id, joinedAt: new Date(start + i * 3_600_000), roles: SETUP[i].roles, status: SETUP[i].status,
    });
    if (SETUP[i].present) await db.insert(attendance).values({ officeId: team.id, userId: p.id, checkedInAt: new Date(Date.now() - (3 - (i % 3)) * 3_600_000) });
  }

  const meeting = async (
    title: string,
    status: "draft" | "confirmed",
    decisions: string[],
    extra: { notionPageId?: string | null; notes?: string; links?: { title: string; url: string }[] } = {},
  ) => {
    const [m] = await db
      .insert(meetings)
      .values({
        officeId: team.id, title, status, summary: { decisions }, createdBy: PEOPLE[0].id,
        notionPageId: extra.notionPageId === undefined ? "demo" : extra.notionPageId, notes: extra.notes ?? "", links: extra.links ?? [],
      })
      .returning({ id: meetings.id });
    return m.id;
  };
  const todo = (meetingId: string, title: string, who: number, issue?: number, role?: string) =>
    db.insert(todos).values({
      meetingId, title, assigneeUserId: PEOPLE[who].id, repo: REPOS[0], role: role ?? SETUP[who].roles[0],
      issueUrl: issue ? `https://github.com/${REPOS[0]}/issues/${issue}` : null,
    });

  const kickoff = await meeting("킥오프 회의", "confirmed", ["Next.js로 간다", "매주 월요일 오전 10시에 회의한다", "역할은 각자 맡은 영역 기준으로 나눈다"]);
  await todo(kickoff, "로그인 화면 만들기", 0, 1);
  await todo(kickoff, "DB 스키마 설계", 1, 2);
  await todo(kickoff, "Notion 연동 조사", 2, 3);
  const sprint = await meeting("스프린트 1 계획", "confirmed", ["이번 주 목표는 팀 공간 시연", "디자인은 금요일까지 확정"]);
  await todo(sprint, "팀 보드 UI", 0, 4);
  await todo(sprint, "채팅 기능", 3, 5);
  await todo(sprint, "발표 자료 초안", 4);
  const retro = await meeting("디자인 리뷰 (초안)", "draft", ["픽셀 크기를 줄이고 사무실 소품을 늘린다"], {
    notionPageId: null,
    notes: "10:02 목표: 금요일 시연\n10:05 디자인 톤은 쿨그레이로, 흰색은 너무 밝음\n10:11 역할 선택 기능을 넣고 필터에도 사용\n10:20 회의록은 직접 쓰거나 Notion 링크 둘 다",
    links: [{ title: "Figma · 시안 v2", url: "https://www.figma.com/file/demo" }, { title: "참고 사이트", url: "https://ai-company-hq.kijooaioffice.workers.dev/" }],
  });
  await todo(retro, "타일 아트 다시 그리기", 1);
  await todo(retro, "현황판 개선", 2);
  await todo(retro, "홍보 문구 작성", 3);

  const say = (who: number, body: string, minsAgo: number) =>
    db.insert(messages).values({ officeId: team.id, userId: PEOPLE[who].id, body, createdAt: new Date(Date.now() - minsAgo * 60_000) });
  await say(1, "오늘 회의록 Notion에 올렸어요", 90);
  await say(2, "확인했어요! 이슈 만들게요", 80);
  await say(0, "로그인 PR 올렸습니다. 리뷰 부탁해요", 35);
  await say(3, "점심 먹고 리뷰할게요", 30);
  await say(4, "발표 자료 어디까지 했어요?", 5);

  const feed = (who: number, text: string, minsAgo: number) =>
    db.insert(activity).values({ officeId: team.id, userId: PEOPLE[who].id, text, createdAt: new Date(Date.now() - minsAgo * 60_000) });
  await feed(0, "출근했어요", 180);
  await feed(1, "출근했어요", 170);
  await feed(1, "회의록을 올렸어요 · 스프린트 1 계획", 150);
  await feed(0, "회의를 확정했어요 · 스프린트 1 계획", 120);
  await feed(2, "이슈 3개를 만들었어요", 100);
  await feed(0, "새 회의 기록을 시작했어요 · 디자인 리뷰 (초안)", 40);
  await feed(3, "식사하러 갔어요", 20);
}

// DEV-ONLY stand-in for the AI summary: no key needed, so the whole "write notes -> summarize" flow can be tried.
// Lines that sound like a decision become decisions, lines that sound like a task become todos.
const NAMES = PEOPLE.map((p) => p.name);
const GUESS_ROLE: [RegExp, string][] = [
  [/디자인|시안|톤|그림/, "디자인"],
  [/홍보|문구|마케팅|광고/, "마케팅"],
  [/발표|기획|계획서/, "기획"],
  [/QA|테스트|검수/, "QA"],
  [/개발|API|로그인|화면|서버|코드|배포/, "개발"],
];
export function demoSummarize(text: string): Summary {
  const lines = text.split("\n").map((l) => l.replace(/^\s*\d{1,2}:\d{2}\s*/, "").trim()).filter(Boolean);
  const isTask = (l: string) => /맡기로|끝내기로|해야|만들기로|준비/.test(l);
  const isDecision = (l: string) => /결정|목표|기로 했|기로 함/.test(l);
  return {
    decisions: lines.filter((l) => isDecision(l) && !isTask(l)),
    todos: lines.filter(isTask).map((l) => ({
      title: l,
      assigneeName: NAMES.find((n) => new RegExp(`${n}[이가은는]?\\s`).test(l)) ?? null,
      role: GUESS_ROLE.find(([re]) => re.test(l))?.[1] ?? null,
    })),
  };
}

// Fake GitHub work shown on the board in demo mode (the real board reads live GitHub issues and PRs).
export function demoWork(repos: string[]): WorkItem[] {
  const repo = repos[0] ?? REPOS[0];
  const w = (n: number, title: string, who: number, state: "open" | "closed", hasOpenPr = false): WorkItem => ({
    repo, number: n, title, assignee: PEOPLE[who].gh, state, hasOpenPr,
  });
  return [
    w(1, "로그인 화면 만들기", 0, "open", true),
    w(4, "팀 보드 UI", 0, "open"),
    w(6, "README 정리", 0, "closed"),
    w(7, "환경 변수 문서화", 0, "closed"),
    w(2, "DB 스키마 설계", 1, "closed"),
    w(8, "타일 아트 다시 그리기", 1, "open", true),
    w(9, "마이그레이션 점검", 1, "closed"),
    w(3, "Notion 연동 조사", 2, "open", true),
    w(10, "현황판 개선", 2, "open"),
    w(5, "채팅 기능", 3, "open", true),
    w(11, "초대 링크 화면", 3, "open"),
    w(12, "권한 검사 테스트", 3, "closed"),
    w(13, "발표 자료 초안", 4, "open"),
    w(14, "시연 시나리오", 4, "open"),
  ];
}
