import { RULES, type Rules } from "./rules";
import { dayKey, weekKey, daysLeftInWeek } from "./time";

// 한도 계산에 들어가는 거래. 파싱/분류가 끝난 뒤의 모습이다.
// SPEND: 지출 / REFUND: 지출 차감(결제 취소, 엔빵 환급) / EXCLUDE: 계산 제외(내 계좌 간 이동)
export type Effect = "SPEND" | "REFUND" | "EXCLUDE";

export interface LedgerTx {
  at: Date;
  amount: number; // 항상 양수
  effect: Effect;
  counterparty?: string; // 가맹점·상대방 (배달 판정에 쓴다)
}

function signed(tx: LedgerTx): number {
  if (tx.effect === "SPEND") return tx.amount;
  if (tx.effect === "REFUND") return -tx.amount;
  return 0;
}

export function spentInWeek(txs: LedgerTx[], week: string): number {
  return txs.filter((t) => weekKey(t.at) === week).reduce((sum, t) => sum + signed(t), 0);
}

// 이번 주에 쓸 수 있는 돈 = 월요일에 케이뱅크에 맞춰 넣는 금액
// 첫 주만 75,000원, 그다음부터는 기본금 35,000원 + 지난주 보상
export function weekBudget(opts: { isFirstWeek: boolean; prevWeekRewards: number }, rules: Rules = RULES): number {
  return opts.isFirstWeek ? rules.firstWeekFunding : nextWeekBudget(opts.prevWeekRewards, rules);
}

export interface TodayView {
  allowance: number; // 오늘 06:00에 정해진 오늘 쓸 돈
  spentToday: number;
  remaining: number; // 위젯 가운데 숫자. 음수면 초과
}

// 다음 주 예산 = 기본금 + 지난주 보상, 단 weeklyBudgetMax(10만 원)를 넘지 않는다
export function nextWeekBudget(rewards: number, rules: Rules = RULES): number {
  return Math.min(rules.weeklyBase + rewards, rules.weeklyBudgetMax);
}

// 오늘 쓸 돈 = (오늘 시작 시점 주간 잔액) ÷ (오늘 포함 남은 날수), 100원 단위 내림.
// 하루 동안은 고정하고, 쓴 만큼만 뺀다. 덜 쓰면 다음 날 금액이 늘어나는 게 곧 이월이다.
export function todayView(now: Date, budget: number, txs: LedgerTx[], rules: Rules = RULES): TodayView {
  const week = weekKey(now);
  const today = dayKey(now);
  let spentBefore = 0;
  let spentToday = 0;
  for (const t of txs) {
    if (weekKey(t.at) !== week) continue;
    if (dayKey(t.at) === today) spentToday += signed(t);
    else if (dayKey(t.at) < today) spentBefore += signed(t);
  }
  const left = Math.max(0, budget - spentBefore);
  const step = rules.allowanceRounding;
  const allowance = Math.floor(left / daysLeftInWeek(now) / step) * step;
  return { allowance, spentToday, remaining: allowance - spentToday };
}

// 주간 마감 시 확정되는 저축 = 그 주 예산 − 지출. 예산이 늘어도 실제로 안 쓴 돈만 저축으로 센다 (실제 돈은 월급통장에 남아 있다)
export function weekSavings(txs: LedgerTx[], week: string, budget: number): number {
  return budget - spentInWeek(txs, week);
}

// 월요일 정산 이체 금액. 양수면 월급통장 → 케이뱅크, 음수면 케이뱅크 → 저축으로 빼야 한다.
export function settlementTransfer(nextWeekBudget: number, kbankBalance: number): number {
  return nextWeekBudget - kbankBalance;
}
