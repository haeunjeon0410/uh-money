// 업적 판정. 돈 관련 업적은 하루가 끝나야(다음 날 06:00) 확정된다.
import { RULES, type Rules } from "./rules";
import { dayKey, dayStart, addDays } from "./time";
import { todayView, type LedgerTx } from "./budget";

// 배달로 보는 결제: 배달은 네이버페이 머니로 하므로 충전도 배달로 친다 (다른 쇼핑이어도 엄격한 쪽을 택함)
const DELIVERY = /네이버페이|배달의민족|배민|쿠팡이츠|요기요/;

export function isDelivery(counterparty: string): boolean {
  return DELIVERY.test(counterparty);
}

export interface MoneyAchievements {
  noSpend: boolean;
  keptLimit: boolean;
  noDelivery: boolean;
}

// 끝난 하루의 돈 업적. budget은 그날이 속한 주의 예산
export function moneyAchievements(day: string, budget: number, txs: LedgerTx[], rules: Rules = RULES): MoneyAchievements {
  const spends = txs.filter((t) => t.effect === "SPEND" && dayKey(t.at) === day);
  const lastMoment = new Date(dayStart(addDays(day, 1)).getTime() - 1);
  return {
    noSpend: spends.length === 0,
    keptLimit: todayView(lastMoment, budget, txs, rules).remaining >= 0,
    noDelivery: !spends.some((t) => isDelivery(t.counterparty ?? "")),
  };
}

// 시간표: "mon=09:00,tue=10:30,thu=13:00" → 요일(1=월 ... 7=일)별 첫 수업 시작(분)
const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

export function parseTimetable(value?: string): Map<number, number> {
  const table = new Map<number, number>();
  for (const part of (value ?? "").split(",")) {
    const m = part.trim().toLowerCase().match(/^(mon|tue|wed|thu|fri|sat|sun)=(\d{1,2}):(\d{2})$/);
    if (m) table.set(DAYS.indexOf(m[1]) + 1, +m[2] * 60 + +m[3]);
  }
  return table;
}

// 그날 첫 학교 도착이 첫 수업 시작(+여유) 전이면 제시간. 수업 없는 날은 false (불이익도 없음)
export function onTime(day: string, arrivals: Date[], timetable: Map<number, number>, rules: Rules = RULES): boolean {
  const isoDay = ((new Date(Date.parse(day)).getUTCDay() + 6) % 7) + 1;
  const start = timetable.get(isoDay);
  if (start === undefined) return false;
  const deadline = new Date(Date.parse(day) - 9 * 60 * 60 * 1000 + (start + rules.onTimeGraceMinutes) * 60_000);
  return arrivals.some((a) => dayKey(a) === day && a.getTime() <= deadline.getTime());
}
