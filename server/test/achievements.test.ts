import { describe, expect, it } from "vitest";
import { moneyAchievements, onTime, parseTimetable, isDelivery } from "../src/engine/achievements";
import type { LedgerTx } from "../src/engine/budget";

const kst = (s: string) => new Date(`${s}+09:00`);
const spend = (at: string, amount: number, counterparty = "편의점"): LedgerTx => ({ at: kst(at), amount, effect: "SPEND", counterparty });

describe("돈 업적", () => {
  it("아무것도 안 쓴 날은 무지출·한도·배달 안 함 모두 달성", () => {
    expect(moneyAchievements("2026-10-06", 70_000, [])).toEqual({ noSpend: true, keptLimit: true, noDelivery: true });
  });

  it("네이버페이 충전이나 배달앱 결제가 있으면 배달 안 함 실패", () => {
    expect(isDelivery("네이버페이충전")).toBe(true);
    expect(isDelivery("쿠팡이츠")).toBe(true);
    expect(isDelivery("버거집")).toBe(false);
    const r = moneyAchievements("2026-10-06", 70_000, [spend("2026-10-06T19:00:00", 15_000, "네이버페이충전")]);
    expect(r).toEqual({ noSpend: false, keptLimit: false, noDelivery: false }); // 화요일 한도 10,000원을 넘김
  });

  it("한도 안에서 쓰면 한도 지키기만 달성", () => {
    const r = moneyAchievements("2026-10-05", 70_000, [spend("2026-10-05T12:00:00", 6_000)]);
    expect(r).toEqual({ noSpend: false, keptLimit: true, noDelivery: true });
  });

  it("다음 날 새벽 결제는 그날로 친다", () => {
    const r = moneyAchievements("2026-10-05", 70_000, [spend("2026-10-06T02:00:00", 6_000)]);
    expect(r.noSpend).toBe(false);
  });
});

describe("학교 출석", () => {
  const table = parseTimetable("mon=09:00, tue=10:30, thu=13:00");

  it("시간표 읽기", () => {
    expect(table.get(1)).toBe(540);
    expect(table.get(2)).toBe(630);
    expect(table.has(3)).toBe(false);
  });

  it("첫 수업 전에 도착하면 제시간, 3분까지는 봐주고 그 뒤는 아님", () => {
    expect(onTime("2026-10-05", [kst("2026-10-05T08:55:00")], table)).toBe(true);
    expect(onTime("2026-10-05", [kst("2026-10-05T09:03:00")], table)).toBe(true);
    expect(onTime("2026-10-05", [kst("2026-10-05T09:04:00")], table)).toBe(false);
  });

  it("수업 없는 날은 도착해도 없음", () => {
    expect(onTime("2026-10-07", [kst("2026-10-07T08:00:00")], table)).toBe(false);
  });
});
