import { describe, expect, it } from "vitest";
import { rewardFor, studyMinutesByDay } from "../src/engine/rewards";

const kst = (s: string) => new Date(`${s}+09:00`);

describe("보상", () => {
  it("공부는 30분 단위 500원, 2시간 40분이면 2,500원", () => {
    expect(rewardFor({ exercised: false, studyMinutes: 160, commits: 0 }).study).toBe(2_500);
  });

  it("공부는 5시간(5,000원), 커밋은 20회(2,000원)에서 멈춘다", () => {
    const r = rewardFor({ exercised: true, studyMinutes: 400, commits: 25 });
    expect(r).toEqual({ exercise: 3_000, study: 5_000, commit: 2_000, total: 10_000 });
  });

  it("아무것도 안 한 날은 0원", () => {
    expect(rewardFor({ exercised: false, studyMinutes: 0, commits: 0 }).total).toBe(0);
  });
});

describe("집중 모드 → 공부 시간", () => {
  it("끄는 걸 잊으면 06:00에 끊고 시작한 날로 친다", () => {
    const m = studyMinutesByDay([{ start: kst("2026-10-05T23:00:00"), end: null }], kst("2026-10-06T10:00:00"));
    expect(m.get("2026-10-05")).toBe(7 * 60);
  });

  it("10분 미만은 버린다", () => {
    const m = studyMinutesByDay(
      [{ start: kst("2026-10-05T10:00:00"), end: kst("2026-10-05T10:05:00") }],
      kst("2026-10-05T12:00:00"),
    );
    expect(m.size).toBe(0);
  });
});
