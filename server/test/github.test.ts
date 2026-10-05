import { describe, expect, it } from "vitest";
import { syncCommits } from "../src/github";
import type { Env } from "../src/store";
import { createTestDb } from "./d1-shim";

const kst = (s: string) => new Date(`${s}+09:00`);

function fakeGitHub(routes: Record<string, unknown>) {
  const calls: string[] = [];
  const fetchFn = (async (url: string) => {
    const path = url.replace("https://api.github.com", "");
    calls.push(path);
    const key = Object.keys(routes).find((k) => path.startsWith(k));
    return new Response(JSON.stringify(key ? routes[key] : []), { status: key ? 200 : 404 });
  }) as unknown as typeof fetch;
  return { fetchFn, calls };
}

const env = (): Env => ({
  DB: createTestDb(), COLLECTOR_TOKEN: "c", PHONE_TOKEN: "p", OWNER_NAMES: "", FIRST_WEEK: "2026-10-05",
  GITHUB_TOKEN: "gh", GITHUB_USER: "me",
});

const commit = (sha: string, date: string) => ({ sha, commit: { author: { date } } });

describe("GitHub 커밋 동기화", () => {
  it("비공개 저장소 포함, 최근 푸시된 저장소의 브랜치들에서 내 커밋을 모으고 같은 커밋은 한 번만 센다", async () => {
    const e = env();
    const { fetchFn } = fakeGitHub({
      "/user/repos": [
        { full_name: "me/private-a", pushed_at: "2026-10-06T03:00:00Z", default_branch: "main" },
        { full_name: "me/old", pushed_at: "2026-09-01T00:00:00Z", default_branch: "main" }, // 첫 주 전에 푸시 → 건너뜀
      ],
      "/repos/me/private-a/branches": [{ name: "main" }, { name: "dev" }],
      "/repos/me/private-a/commits?sha=main": [commit("c1", "2026-10-06T02:00:00Z"), commit("c2", "2026-10-06T03:30:00Z")],
      "/repos/me/private-a/commits?sha=dev": [commit("c2", "2026-10-06T03:30:00Z"), commit("c3", "2026-10-06T04:00:00Z")],
    });
    expect(await syncCommits(e, kst("2026-10-06T14:00:00"), fetchFn)).toEqual({ skipped: false, added: 3 });
    expect(await syncCommits(e, kst("2026-10-06T15:00:00"), fetchFn)).toEqual({ skipped: false, added: 0 });
  });

  it("첫 주 전에 푸시된 저장소는 보지 않는다", async () => {
    const { fetchFn, calls } = fakeGitHub({
      "/user/repos": [{ full_name: "me/old", pushed_at: "2026-10-03T03:00:00Z", default_branch: "main" }],
    });
    await syncCommits(env(), kst("2026-10-06T14:00:00"), fetchFn);
    expect(calls.some((c) => c.includes("/repos/me/old"))).toBe(false);
  });

  it("토큰이 없으면 건너뛴다", async () => {
    expect(await syncCommits({ ...env(), GITHUB_TOKEN: undefined }, new Date())).toEqual({ skipped: true, added: 0 });
  });
});
