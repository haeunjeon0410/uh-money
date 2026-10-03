import { describe, expect, it } from "vitest";
import { syncExercise } from "../src/dazzang";
import * as store from "../src/store";
import type { Env } from "../src/store";
import { createTestDb } from "./d1-shim";

const kst = (s: string) => new Date(`${s}+09:00`);
const env = (): Env => ({
  DB: createTestDb(), COLLECTOR_TOKEN: "c", PHONE_TOKEN: "p", OWNER_NAMES: "", FIRST_WEEK: "2026-10-05", GITHUB_USER: "me",
  DAZZANG_URL: "https://dazzang.test", DAZZANG_TOKEN: "t", DAZZANG_USER_ID: "u1",
});

describe("다짱 운동 인증 동기화", () => {
  it("다짱이 준 하루 시작 시각을 06:00 기준 날짜 키로 저장한다", async () => {
    const e = env();
    let seen = "";
    const fetchFn = (async (url: string, init: RequestInit) => {
      seen = `${url}|${(init.headers as Record<string, string>).authorization}`;
      return new Response(JSON.stringify({ days: [kst("2026-10-06T06:00:00").toISOString(), kst("2026-10-08T06:00:00").toISOString()] }));
    }) as unknown as typeof fetch;

    expect(await syncExercise(e, kst("2026-10-09T10:00:00"), fetchFn)).toEqual({ skipped: false, added: 2 });
    expect(seen).toContain("userId=u1");
    expect(seen).toContain("Bearer t");
    expect([...(await store.exerciseDaysSince(e.DB, "2026-10-05"))].sort()).toEqual(["2026-10-06", "2026-10-08"]);
  });

  it("설정이 없으면 건너뛴다", async () => {
    expect(await syncExercise({ ...env(), DAZZANG_TOKEN: undefined }, new Date())).toEqual({ skipped: true, added: 0 });
  });
});
