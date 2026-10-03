import { describe, expect, it } from "vitest";
import { settlementFor, tossSendUrl, parseAccount } from "../src/settlement";

const accounts = { kbank: "100-200-300400", salary: "국민:9876543210" };

describe("정산 안내", () => {
  it("잔액이 모자라면 케이뱅크로 채우는 토스 링크", () => {
    const s = settlementFor(75_000, 50_080, accounts);
    expect(s).toEqual({
      action: "FILL",
      amount: 24_920,
      url: `supertoss://send?bank=${encodeURIComponent("케이뱅크")}&accountNo=100200300400&amount=24920`,
    });
  });

  it("잔액이 넘치면 월급통장으로 빼는 링크", () => {
    const s = settlementFor(38_000, 45_000, accounts);
    expect(s?.action).toBe("WITHDRAW");
    expect(s?.amount).toBe(7_000);
    expect(s?.url).toContain(`bank=${encodeURIComponent("국민")}&accountNo=9876543210&amount=7000`);
  });

  it("맞거나 100원 미만 차이면 안내 없음", () => {
    expect(settlementFor(40_000, 40_000, accounts)).toBeNull();
    expect(settlementFor(40_050, 40_000, accounts)).toBeNull();
  });

  it("잔액을 아직 모르면 안내 없음, 계좌가 없으면 링크만 없음", () => {
    expect(settlementFor(40_000, null, accounts)).toBeNull();
    expect(settlementFor(40_000, 30_000, {})?.url).toBeNull();
  });

  it("계좌 형식 처리", () => {
    expect(parseAccount("국민 : 123-45")).toEqual({ bank: "국민", accountNo: "123-45" });
    expect(parseAccount("국민")).toBeNull();
    expect(tossSendUrl("국민", "123-45", 1000.4)).toBe(`supertoss://send?bank=${encodeURIComponent("국민")}&accountNo=12345&amount=1000`);
  });
});
