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

describe("GitHub 커밋 동기화", () => {
  it("푸시된 브랜치들에서 내 커밋을 모으고 같은 커밋은 한 번만 센다", async () => {
    const e = env();
    const { fetchFn } = fakeGitHub({
      "/users/me/events": [
        { type: "PushEvent", created_at: "2026-10-06T03:00:00Z", repo: { name: "me/a" }, payload: { head: "h1" } },
        { type: "PushEvent", created_at: "2026-10-06T04:00:00Z", repo: { name: "me/a" }, payload: { head: "h2" } },
        { type: "WatchEvent", created_at: "2026-10-06T04:00:00Z", repo: { name: "x/y" }, payload: {} },
      ],
      "/repos/me/a/commits?sha=h1": [{ sha: "c1", commit: { author: { date: "2026-10-06T02:00:00Z" } } }],
      "/repos/me/a/commits?sha=h2": [
        { sha: "c1", commit: { author: { date: "2026-10-06T02:00:00Z" } } },
        { sha: "c2", commit: { author: { date: "2026-10-06T03:30:00Z" } } },
      ],
    });
    expect(await syncCommits(e, kst("2026-10-06T14:00:00"), fetchFn)).toEqual({ skipped: false, added: 2 });
    expect(await syncCommits(e, kst("2026-10-06T15:00:00"), fetchFn)).toEqual({ skipped: false, added: 0 });
  });

  it("첫 주 전 푸시는 보지 않는다", async () => {
    const { fetchFn, calls } = fakeGitHub({
      "/users/me/events": [{ type: "PushEvent", created_at: "2026-10-03T03:00:00Z", repo: { name: "me/a" }, payload: { head: "old" } }],
    });
    await syncCommits(env(), kst("2026-10-06T14:00:00"), fetchFn);
    expect(calls.some((c) => c.includes("sha=old"))).toBe(false);
  });

  it("토큰이 없으면 건너뛴다", async () => {
    expect(await syncCommits({ ...env(), GITHUB_TOKEN: undefined }, new Date())).toEqual({ skipped: true, added: 0 });
  });
});
