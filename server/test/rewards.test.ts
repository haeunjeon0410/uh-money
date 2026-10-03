import { describe, expect, it } from "vitest";
import { rewardFor, sessionMinutesByDay, weekRewardTotal } from "../src/engine/rewards";

const kst = (s: string) => new Date(`${s}+09:00`);
const none = { exercised: false, studyMinutes: 0, commits: 0, malhaeMinutes: 0, psat: false };

describe("매일 보상", () => {
  it("공부는 30분 단위 500원, 2시간 40분이면 2,500원", () => {
    expect(rewardFor({ ...none, studyMinutes: 160 }).study).toBe(2_500);
  });

  it("커밋은 1회 100원, 10회(1,000원)에서 멈춘다", () => {
    expect(rewardFor({ ...none, commits: 3 }).commit).toBe(300);
    expect(rewardFor({ ...none, commits: 25 }).commit).toBe(1_000);
  });

  it("말해보카는 15분 이상이면 500원, 피셋은 500원", () => {
    expect(rewardFor({ ...none, malhaeMinutes: 14 }).malhae).toBe(0);
    expect(rewardFor({ ...none, malhaeMinutes: 15 }).malhae).toBe(500);
    expect(rewardFor({ ...none, psat: true }).psat).toBe(500);
  });

  it("전부 다 하면 매일 보상은 정확히 10,000원", () => {
    const r = rewardFor({ exercised: true, studyMinutes: 400, commits: 25, malhaeMinutes: 30, psat: true });
    expect(r.daily).toBe(10_000);
  });
});

describe("업적은 하루 상한과 별개", () => {
  it("매일 보상 10,000원 + 무지출 3,000 + 한도 500 + 출석 500 + 배달 안 함 500 = 14,500원", () => {
    const r = rewardFor(
      { exercised: true, studyMinutes: 400, commits: 25, malhaeMinutes: 30, psat: true },
      { noSpend: true, keptLimit: true, onTime: true, noDelivery: true },
    );
    expect(r.total).toBe(14_500);
  });
});

describe("주간 보상 상한", () => {
  it("한 주 합계는 40,000원에서 멈춘다 (다음 주 예산 최대 75,000원)", () => {
    const max = rewardFor(
      { exercised: true, studyMinutes: 400, commits: 25, malhaeMinutes: 30, psat: true },
      { noSpend: true, keptLimit: true, onTime: true, noDelivery: true },
    );
    expect(weekRewardTotal(Array(7).fill(max))).toBe(40_000);
    expect(weekRewardTotal([rewardFor({ ...none, exercised: true })])).toBe(3_000);
  });
});

describe("켜고 끈 세션 → 날짜별 분", () => {
  it("끄는 걸 잊으면 06:00에 끊고 시작한 날로 친다", () => {
    const m = sessionMinutesByDay([{ start: kst("2026-10-05T23:00:00"), end: null }], kst("2026-10-06T10:00:00"));
    expect(m.get("2026-10-05")).toBe(7 * 60);
  });

  it("최소 시간보다 짧으면 버린다", () => {
    const m = sessionMinutesByDay(
      [{ start: kst("2026-10-05T10:00:00"), end: kst("2026-10-05T10:05:00") }],
      kst("2026-10-05T12:00:00"),
    );
    expect(m.size).toBe(0);
  });
});
