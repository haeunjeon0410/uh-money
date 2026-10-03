import { describe, expect, it } from "vitest";
import { syncPsat } from "../src/mydr";
import * as store from "../src/store";
import type { Env } from "../src/store";
import { createTestDb } from "./d1-shim";

const kst = (s: string) => new Date(`${s}+09:00`);
const env = (): Env => ({
  DB: createTestDb(), COLLECTOR_TOKEN: "c", PHONE_TOKEN: "p", OWNER_NAMES: "", FIRST_WEEK: "2026-10-05", GITHUB_USER: "me",
  MYDR_URL: "https://mydr.test/", MYDR_TOKEN: "tok",
});

describe("my-dr 풀이일 동기화", () => {
  it("my-dr이 준 날짜를 저장하고 접근 토큰 헤더를 보낸다", async () => {
    const e = env();
    let seen = "";
    const fetchFn = (async (url: string, init: RequestInit) => {
      seen = `${url}|${(init.headers as Record<string, string>)["x-access-token"]}`;
      return new Response(JSON.stringify({ days: ["2026-10-06", "2026-10-08"] }));
    }) as unknown as typeof fetch;

    expect(await syncPsat(e, kst("2026-10-09T10:00:00"), fetchFn)).toEqual({ skipped: false, added: 2 });
    expect(seen).toBe("https://mydr.test/api/external/solved-days?since=2026-10-05|tok");
    expect([...(await store.psatDaysSince(e.DB, "2026-10-05"))].sort()).toEqual(["2026-10-06", "2026-10-08"]);
  });

  it("설정이 없으면 건너뛴다", async () => {
    expect(await syncPsat({ ...env(), MYDR_TOKEN: undefined }, new Date())).toEqual({ skipped: true, added: 0 });
  });
});
