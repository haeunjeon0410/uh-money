// 케이뱅크 앱 푸시 알림 파서. 실제로 받은 알림 형식 (값은 가짜로 바꿨다):
//   계좌: "출금 10,000원 / 네이버페이충전 | 입출금통장(1234) / 잔액 48,000원"
//   카드: "승인 5,600원 / 버거집 / 카드(5678) | 10/02 18:08 / 출금가능액 42,200원"
// 취소·입금은 아직 실제 알림을 못 봐서 같은 패턴으로 추정한 것이다. 못 읽으면 UNKNOWN으로 남긴다.

export interface RawNotification {
  postedAt: Date; // 안드로이드가 알려주는 알림 게시 시각
  title: string;
  text: string;
}

export type ParsedKind = "CARD_APPROVAL" | "CARD_CANCEL" | "WITHDRAWAL" | "DEPOSIT";

export interface ParsedTx {
  kind: ParsedKind;
  amount: number;
  counterparty: string; // 가맹점 또는 상대방
  source: string; // "card:5678" / "acct:1234"
  occurredAt: Date;
  balanceAfter: number | null;
  dedupKey: string;
}

export type ParseResult = { ok: true; tx: ParsedTx } | { ok: false; reason: "UNKNOWN_FORMAT" };

const won = (s: string) => Number(s.replace(/,/g, ""));
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

function lines(text: string): string[] {
  return text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
}

// 카드 알림의 "MM/DD HH:mm"(KST)을 실제 시각으로. 연도는 게시 시각 기준이고, 연말·연초가 걸치면 보정한다
function cardTime(postedAt: Date, mm: number, dd: number, hh: number, mi: number): Date {
  const postedKst = new Date(postedAt.getTime() + KST_OFFSET_MS);
  let year = postedKst.getUTCFullYear();
  if (mm === 12 && postedKst.getUTCMonth() === 0) year -= 1;
  return new Date(Date.UTC(year, mm - 1, dd, hh, mi) - KST_OFFSET_MS);
}

export function parseKbank(n: RawNotification): ParseResult {
  const ls = lines(n.text);
  const all = ls.join("\n");

  const card = all.match(/카드\((\d{4})\)\s*\|\s*(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2})/);
  const cardHead = all.match(/(승인취소|취소|승인)\s*([\d,]+)원/);
  if (card && cardHead) {
    const headIdx = ls.findIndex((l) => l.includes(cardHead[0]));
    const merchant = ls[headIdx + 1] && !ls[headIdx + 1].startsWith("카드(") ? ls[headIdx + 1] : "";
    const balance = all.match(/(?:출금가능액|잔액)\s*([\d,]+)원/);
    const [, last4, mm, dd, hh, mi] = card;
    const occurredAt = cardTime(n.postedAt, +mm, +dd, +hh, +mi);
    const kind: ParsedKind = cardHead[1] === "승인" ? "CARD_APPROVAL" : "CARD_CANCEL";
    const amount = won(cardHead[2]);
    const balanceAfter = balance ? won(balance[1]) : null;
    return {
      ok: true,
      tx: {
        kind, amount, counterparty: merchant, source: `card:${last4}`, occurredAt, balanceAfter,
        dedupKey: ["card", last4, kind, amount, merchant, occurredAt.toISOString(), balanceAfter ?? ""].join("|"),
      },
    };
  }

  const acctHead = all.match(/(입금|출금)\s*([\d,]+)원/);
  const acct = all.match(/^(.*?)\s*\|\s*.*?\((\d{4})\)\s*$/m);
  if (acctHead && acct) {
    const balance = all.match(/잔액\s*([\d,]+)원/);
    const kind: ParsedKind = acctHead[1] === "출금" ? "WITHDRAWAL" : "DEPOSIT";
    const amount = won(acctHead[2]);
    const counterparty = acct[1].trim();
    const balanceAfter = balance ? won(balance[1]) : null;
    // 계좌 알림엔 시각이 없어서 게시 시각을 쓴다. 같은 알림이 다시 게시돼도 하나로 보도록
    // 키에는 시각 대신 KST 날짜와 거래 후 잔액을 넣는다 (잔액이 없으면 분 단위 시각)
    const kstDate = new Date(n.postedAt.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
    const minute = new Date(Math.floor(n.postedAt.getTime() / 60_000) * 60_000);
    return {
      ok: true,
      tx: {
        kind, amount, counterparty, source: `acct:${acct[2]}`, occurredAt: n.postedAt, balanceAfter,
        dedupKey: ["acct", acct[2], kind, amount, counterparty, kstDate, balanceAfter ?? minute.toISOString()].join("|"),
      },
    };
  }

  return { ok: false, reason: "UNKNOWN_FORMAT" };
}
