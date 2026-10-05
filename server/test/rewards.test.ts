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
  it("매일 보상 10,000원 + 무지출 3,000 + 한도 500 + 출석 500 + 배달 안 함 500 + 스카 500 = 15,000원", () => {
    const r = rewardFor(
      { exercised: true, studyMinutes: 400, commits: 25, malhaeMinutes: 30, psat: true },
      { noSpend: true, keptLimit: true, onTime: true, noDelivery: true, cafe: true },
    );
    expect(r.total).toBe(15_000);
  });
});

describe("주간 보상", () => {
  it("주간 상한은 없고 하루 보상을 그대로 합친다", () => {
    const max = rewardFor(
      { exercised: true, studyMinutes: 400, commits: 25, malhaeMinutes: 30, psat: true },
      { noSpend: true, keptLimit: true, onTime: true, noDelivery: true, cafe: true },
    );
    expect(weekRewardTotal(Array(7).fill(max))).toBe(15_000 * 7);
    expect(weekRewardTotal([rewardFor({ ...none, exercised: true })])).toBe(3_000);
  });
});

describe("켜고 끈 세션 → 날짜별 분", () => {
  it("끄는 걸 잊으면 06:00에 끊고 시작한 날로 친다", () => {
    const m = sessionMinutesByDay([{ start: kst("2026-10-05T23:00:00"), end: null }], kst("2026-10-06T10:00:00"));
    expect(m.get("2026-10-05")).toBe(7 * 60);
  });

  it("짧은 세션이 여러 번이면 초 단위로 합친 뒤 하루 합계로 판단한다 (세션마다 내림하지 않는다)", () => {
    const parts = [30, 30, 30, 30].map((sec, i) => ({
      start: kst(`2026-10-05T10:0${i}:00`),
      end: new Date(kst(`2026-10-05T10:0${i}:00`).getTime() + sec * 1000),
    }));
    const m = sessionMinutesByDay(parts, kst("2026-10-05T12:00:00"), 0);
    expect(m.get("2026-10-05")).toBeCloseTo(2, 5);
    // 14분 55초 → 15분 미만, 15분 정각 → 인정
    expect(rewardFor({ ...none, malhaeMinutes: 14 + 55 / 60 }).malhae).toBe(0);
    expect(rewardFor({ ...none, malhaeMinutes: 15 }).malhae).toBe(500);
  });

  it("최소 시간보다 짧으면 버린다", () => {
    const m = sessionMinutesByDay(
      [{ start: kst("2026-10-05T10:00:00"), end: kst("2026-10-05T10:05:00") }],
      kst("2026-10-05T12:00:00"),
    );
    expect(m.size).toBe(0);
  });
});
