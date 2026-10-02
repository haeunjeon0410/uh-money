import type { Effect } from "../engine/budget";
import type { ParsedTx } from "./kbank";

// 케이뱅크(생활비 통장) 거래를 한도 계산용 효과로 분류한다.
// - 카드 승인, 출금(네이버페이 충전 포함) → 지출
// - 카드 취소 → 지출 차감 (지난주 결제의 취소도 받은 주에 반영)
// - 남이 보낸 입금 → 엔빵 환급으로 보고 지출 차감
// - 내 이름이 상대방인 입출금 → 월급통장/저축 계좌와의 이동이라 제외
export function classify(tx: ParsedTx, ownerNames: string[]): Effect {
  const isOwn = ownerNames.some((name) => tx.counterparty.includes(name));
  switch (tx.kind) {
    case "CARD_APPROVAL":
      return "SPEND";
    case "CARD_CANCEL":
      return "REFUND";
    case "WITHDRAWAL":
      return isOwn ? "EXCLUDE" : "SPEND";
    case "DEPOSIT":
      return isOwn ? "EXCLUDE" : "REFUND";
  }
}

export type GapCheck =
  | { kind: "OK" }
  | { kind: "MISSING_SPEND"; amount: number } // 잔액이 예상보다 더 줄었다 → 놓친 지출로 처리
  | { kind: "UNEXPLAINED_INCREASE"; amount: number }; // 더 늘었다 → 지출에서 빼지 않고 확인 필요로만 표시

// 직전 잔액과 이번 거래로 계산한 예상 잔액을 실제 알림 잔액과 비교한다
export function checkGap(prevBalance: number | null, tx: ParsedTx): GapCheck {
  if (prevBalance === null || tx.balanceAfter === null) return { kind: "OK" };
  const outflow = tx.kind === "CARD_APPROVAL" || tx.kind === "WITHDRAWAL";
  const expected = outflow ? prevBalance - tx.amount : prevBalance + tx.amount;
  const diff = expected - tx.balanceAfter;
  if (diff > 0) return { kind: "MISSING_SPEND", amount: diff };
  if (diff < 0) return { kind: "UNEXPLAINED_INCREASE", amount: -diff };
  return { kind: "OK" };
}
