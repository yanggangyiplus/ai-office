import type { Db } from "@/db";
import { NotConnectedError } from "./connections";
import { demoMode, demoWork } from "./demo";
import { fetchWork, makeGithub, type GithubLike, type WorkItem } from "./github";

// Loads team work with the viewer's own GitHub token. Never throws: problems come back as a Korean `note`.
export async function loadWork(
  db: Db,
  userId: string,
  repos: string[],
  client: (db: Db, userId: string) => Promise<GithubLike> = makeGithub,
): Promise<{ items: WorkItem[]; note: string }> {
  if (!repos.length) return { items: [], note: "관리자가 팀 설정에서 저장소를 등록하면 현황판이 채워집니다." };
  if (demoMode(process.env)) return { items: demoWork(repos), note: "" }; // dev-only sample data
  try {
    return { items: await fetchWork(await client(db, userId), repos), note: "" };
  } catch (e) {
    if (e instanceof NotConnectedError) {
      return { items: [], note: "먼저 내 공간에서 GitHub를 연결하면 현황판이 채워집니다." };
    }
    return { items: [], note: "GitHub에서 현황을 불러오지 못했습니다. 내 토큰과 저장소 이름을 확인하세요." };
  }
}
