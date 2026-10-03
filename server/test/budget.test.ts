import { describe, expect, it } from "vitest";
import { todayView, weekBudget, weekSavings, settlementTransfer, type LedgerTx } from "../src/engine/budget";

const kst = (s: string) => new Date(`${s}+09:00`);
const spend = (at: string, amount: number): LedgerTx => ({ at: kst(at), amount, effect: "SPEND" });

describe("주간 예산", () => {
  it("첫 주는 70,000원, 그다음은 35,000원 + 지난주 보상", () => {
    expect(weekBudget({ isFirstWeek: true, prevWeekRewards: 0 })).toBe(70_000);
    expect(weekBudget({ isFirstWeek: false, prevWeekRewards: 23_000 })).toBe(58_000);
  });
});

describe("오늘 쓸 돈 = 잔액 ÷ 남은 날", () => {
  it("70,000원이면 월요일은 하루 10,000원", () => {
    expect(todayView(kst("2026-10-05T09:00:00"), 70_000, []).allowance).toBe(10_000);
  });

  it("월요일에 20,000원 쓰면 화요일은 50,000 ÷ 6 → 8,300원", () => {
    const txs = [spend("2026-10-05T12:00:00", 20_000)];
    expect(todayView(kst("2026-10-05T20:00:00"), 70_000, txs).remaining).toBe(-10_000);
    expect(todayView(kst("2026-10-06T09:00:00"), 70_000, txs).allowance).toBe(8_300);
  });

  it("하루 동안은 금액이 고정되고 쓴 만큼만 줄어든다", () => {
    const txs = [spend("2026-10-05T12:00:00", 6_000)];
    expect(todayView(kst("2026-10-05T13:00:00"), 70_000, txs)).toEqual({ allowance: 10_000, spentToday: 6_000, remaining: 4_000 });
  });

  it("환급과 제외 거래를 반영한다", () => {
    const txs: LedgerTx[] = [
      spend("2026-10-05T12:00:00", 40_000),
      { at: kst("2026-10-05T13:00:00"), amount: 30_000, effect: "REFUND" }, // 엔빵으로 돌려받음
      { at: kst("2026-10-05T14:00:00"), amount: 50_000, effect: "EXCLUDE" }, // 월급통장에서 충전
    ];
    expect(todayView(kst("2026-10-05T15:00:00"), 70_000, txs).spentToday).toBe(10_000);
  });

  it("지난주 거래는 이번 주 계산에 안 들어간다", () => {
    const txs = [spend("2026-10-05T05:00:00", 9_000)]; // 월요일 새벽 = 지난주 일요일
    expect(todayView(kst("2026-10-05T09:00:00"), 70_000, txs).allowance).toBe(10_000);
  });
});

describe("주간 마감과 정산", () => {
  it("저축 = 그 주 예산 − 지출 (예산이 늘어도 안 쓴 돈만 저축)", () => {
    const txs = [spend("2026-10-06T12:00:00", 60_000)];
    expect(weekSavings(txs, "2026-10-05", 70_000)).toBe(10_000);
    expect(weekSavings(txs, "2026-10-05", 83_000)).toBe(23_000);
    expect(weekSavings(txs, "2026-10-05", 35_000)).toBe(-25_000); // 예산보다 더 쓰면 마이너스로 그대로 기록
  });

  it("정산 이체 = 다음 주 예산 − 케이뱅크 잔액, 음수면 저축으로 뺀다", () => {
    expect(settlementTransfer(35_000 + 23_000, 8_000)).toBe(50_000);
    expect(settlementTransfer(35_000 + 3_000, 45_000)).toBe(-7_000);
  });
});
