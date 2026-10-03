// 케이뱅크 잔액을 이번 주에 쓸 수 있는 돈에 맞추는 정산 안내.
// 보통은 월요일에 월급통장 → 케이뱅크로 채우고(FILL), 지난주에 아주 적게 써서 잔액이 넘치면
// 케이뱅크 → 월급통장으로 뺀다(WITHDRAW). 남은 돈은 다음 주로 넘어가지 않는 규칙 때문이다.

export interface Settlement {
  action: "FILL" | "WITHDRAW";
  amount: number;
  url: string | null; // 토스 송금 화면을 받는 계좌·금액이 채워진 채로 연다. 계좌가 설정 안 됐으면 null
}

// 은행 앱 반올림 같은 자잘한 차이로 알림이 뜨지 않게
const THRESHOLD = 100;

export function settlementFor(
  left: number, // 이번 주에 아직 쓸 수 있는 돈 (예산 − 지출)
  kbankBalance: number | null,
  accounts: { kbank?: string; salary?: string },
): Settlement | null {
  if (kbankBalance === null) return null;
  const diff = left - kbankBalance;
  if (Math.abs(diff) < THRESHOLD) return null;
  if (diff > 0) {
    return { action: "FILL", amount: diff, url: accounts.kbank ? tossSendUrl("케이뱅크", accounts.kbank, diff) : null };
  }
  const salary = parseAccount(accounts.salary);
  return { action: "WITHDRAW", amount: -diff, url: salary ? tossSendUrl(salary.bank, salary.accountNo, -diff) : null };
}

// 토스 송금 딥링크. 공식 문서는 없고 정산 서비스들이 쓰는 형식이다
export function tossSendUrl(bank: string, accountNo: string, amount: number): string {
  const digits = accountNo.replace(/\D/g, "");
  return `supertoss://send?bank=${encodeURIComponent(bank)}&accountNo=${digits}&amount=${Math.round(amount)}`;
}

// "국민:1234567890" → { bank: "국민", accountNo: "1234567890" }
export function parseAccount(value?: string): { bank: string; accountNo: string } | null {
  if (!value) return null;
  const [bank, accountNo] = value.split(":").map((s) => s.trim());
  return bank && accountNo ? { bank, accountNo } : null;
}
