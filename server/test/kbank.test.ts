import { describe, expect, it } from "vitest";
import { parseKbank, type ParsedTx } from "../src/ingest/kbank";
import { classify, checkGap } from "../src/ingest/classify";

const kst = (s: string) => new Date(`${s}+09:00`);

// 공기계에서 실제로 받은 알림 2개의 형식 (계좌·카드 번호, 잔액, 가맹점은 가짜 값)
const withdrawal = {
  postedAt: kst("2026-10-02T10:51:12"),
  title: "케이뱅크",
  text: "출금 10,000원\n네이버페이충전 | 입출금통장(1234)\n잔액 48,000원",
};
const cardApproval = {
  postedAt: kst("2026-10-02T18:08:40"),
  title: "케이뱅크",
  text: "승인 5,600원\n버거집\n카드(5678) | 10/02 18:08\n출금가능액 42,200원",
};

function parsed(n: typeof withdrawal): ParsedTx {
  const r = parseKbank(n);
  if (!r.ok) throw new Error("parse failed");
  return r.tx;
}

describe("케이뱅크 알림 파싱 (실제 샘플)", () => {
  it("출금 알림", () => {
    const tx = parsed(withdrawal);
    expect(tx).toMatchObject({ kind: "WITHDRAWAL", amount: 10_000, counterparty: "네이버페이충전", source: "acct:1234", balanceAfter: 48_000 });
  });

  it("카드 승인 알림", () => {
    const tx = parsed(cardApproval);
    expect(tx).toMatchObject({ kind: "CARD_APPROVAL", amount: 5_600, counterparty: "버거집", source: "card:5678", balanceAfter: 42_200 });
    expect(tx.occurredAt.toISOString()).toBe(kst("2026-10-02T18:08:00").toISOString());
  });

  it("같은 알림이 다시 와도 키가 같다", () => {
    const again = { ...cardApproval, postedAt: kst("2026-10-02T18:20:00") };
    expect(parsed(again).dedupKey).toBe(parsed(cardApproval).dedupKey);
    const repost = { ...withdrawal, postedAt: kst("2026-10-02T11:30:00") };
    expect(parsed(repost).dedupKey).toBe(parsed(withdrawal).dedupKey);
  });

  it("모르는 형식은 UNKNOWN", () => {
    expect(parseKbank({ postedAt: new Date(), title: "케이뱅크", text: "이벤트에 당첨되셨어요" }).ok).toBe(false);
  });

  it("카드 취소 (추정 형식)", () => {
    const tx = parsed({ ...cardApproval, text: "승인취소 5,600원\n버거집\n카드(5678) | 10/02 18:30\n출금가능액 47,800원" });
    expect(tx.kind).toBe("CARD_CANCEL");
  });

  it("12월 결제 알림이 1월에 게시되면 작년으로 본다", () => {
    const tx = parsed({ ...cardApproval, postedAt: kst("2027-01-01T00:10:00"), text: "승인 5,600원\n편의점\n카드(5678) | 12/31 23:58\n출금가능액 1,000원" });
    expect(tx.occurredAt.toISOString()).toBe(kst("2026-12-31T23:58:00").toISOString());
  });
});

describe("분류", () => {
  const owner = ["홍길동"];
  it("네이버페이 충전은 지출", () => expect(classify(parsed(withdrawal), owner)).toBe("SPEND"));
  it("카드 승인은 지출", () => expect(classify(parsed(cardApproval), owner)).toBe("SPEND"));
  it("내 이름 입금은 제외, 남의 입금은 엔빵 환급", () => {
    const dep = (who: string) => parsed({ ...withdrawal, text: `입금 30,000원\n${who} | 입출금통장(1234)\n잔액 78,000원` });
    expect(classify(dep("홍길동"), owner)).toBe("EXCLUDE");
    expect(classify(dep("김친구"), owner)).toBe("REFUND");
  });
});

describe("잔액 검증", () => {
  it("실제로 있었던 200원 차이를 놓친 지출로 잡는다", () => {
    expect(checkGap(48_000, parsed(cardApproval))).toEqual({ kind: "MISSING_SPEND", amount: 200 });
  });
  it("맞으면 OK", () => {
    expect(checkGap(58_000, parsed(withdrawal))).toEqual({ kind: "OK" });
  });
});
