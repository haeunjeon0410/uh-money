import { parseKbank } from "./ingest/kbank";
import { classify, checkGap } from "./ingest/classify";
import { rewardFor, studyMinutesByDay, type DayReward } from "./engine/rewards";
import { todayView, weekBudget, spentInWeek, weekSavings, settlementTransfer } from "./engine/budget";
import { dayKey, weekKey, addDays, dayStart } from "./engine/time";
import { RULES } from "./engine/rules";
import * as store from "./store";
import type { Env } from "./store";

const STALE_AFTER_MS = 3 * 60 * 60 * 1000; // 수집기 신호가 3시간 넘게 없으면 위젯에 경고

// --- 알림 수집 ---

export async function ingestNotification(env: Env, n: store.RawInput, now: Date) {
  const parsed = parseKbank(n);
  const rawId = await store.insertRaw(env.DB, n, parsed.ok ? "OK" : "UNKNOWN_FORMAT", now);
  if (rawId === null) return { status: "duplicate" as const };
  if (!parsed.ok) return { status: "unknown" as const };

  const tx = parsed.tx;
  const prev = await store.balanceBefore(env.DB, tx.occurredAt);
  const inserted = await store.insertTx(env.DB, tx, classify(tx, ownerNames(env)), rawId);
  if (!inserted) return { status: "duplicate" as const };

  // 잔액이 예상과 다르면 중간에 놓친 거래가 있다는 뜻
  const gap = checkGap(prev, tx);
  if (gap.kind !== "OK") {
    await store.insertTx(
      env.DB,
      {
        kind: "GAP",
        amount: gap.amount,
        counterparty: gap.kind === "MISSING_SPEND" ? "확인 안 된 지출" : "확인 필요한 입금",
        source: tx.source,
        occurredAt: new Date(tx.occurredAt.getTime() - 1), // 이번 거래 직전에 있었던 것으로 둔다
        balanceAfter: null,
        dedupKey: `gap|${tx.dedupKey}`,
      },
      gap.kind === "MISSING_SPEND" ? "SPEND" : "EXCLUDE",
      rawId,
    );
  }
  return { status: "ok" as const, kind: tx.kind, gap: gap.kind };
}

function ownerNames(env: Env): string[] {
  return (env.OWNER_NAMES ?? "").split(",").map((s) => s.trim()).filter(Boolean);
}

// --- 보상 ---

async function dailyRewards(env: Env, fromDay: string, toDay: string, now: Date): Promise<Map<string, DayReward>> {
  const since = dayStart(fromDay);
  const [exercise, sessions, commits] = await Promise.all([
    store.exerciseDaysSince(env.DB, fromDay),
    store.studySessionsSince(env.DB, since),
    store.commitTimesSince(env.DB, since),
  ]);
  const study = studyMinutesByDay(sessions, now);
  const commitsByDay = new Map<string, number>();
  for (const t of commits) commitsByDay.set(dayKey(t), (commitsByDay.get(dayKey(t)) ?? 0) + 1);

  const out = new Map<string, DayReward>();
  for (let d = fromDay; d <= toDay; d = addDays(d, 1)) {
    out.set(d, rewardFor({ exercised: exercise.has(d), studyMinutes: study.get(d) ?? 0, commits: commitsByDay.get(d) ?? 0 }));
  }
  return out;
}

async function weekRewards(env: Env, week: string, now: Date): Promise<number> {
  const days = await dailyRewards(env, week, addDays(week, 6), now);
  let sum = 0;
  for (const r of days.values()) sum += r.total;
  return sum;
}

// 지난주 보상을 확정한다. 처음 물어볼 때 한 번 계산해 저장하고, 그 뒤엔 저장된 값을 쓴다.
// 정산 뒤 늦게 들어온 보상(예: 일요일 커밋을 월요일에 푸시)은 다음 확정 때 더해준다.
async function frozenRewards(env: Env, week: string, now: Date): Promise<number> {
  const existing = await store.getFreeze(env.DB, week);
  if (existing) return existing.amount;

  const earned = await weekRewards(env, week, now);
  let late = 0;
  const before = addDays(week, -7);
  const prevFreeze = await store.getFreeze(env.DB, before);
  if (prevFreeze) late = Math.max(0, (await weekRewards(env, before, now)) - prevFreeze.earned_at_freeze);
  await store.putFreeze(env.DB, week, earned + late, earned, now);
  return earned + late;
}

export async function budgetFor(env: Env, week: string, now: Date): Promise<number> {
  if (week <= env.FIRST_WEEK) return weekBudget({ isFirstWeek: true, prevWeekRewards: 0 });
  return weekBudget({ isFirstWeek: false, prevWeekRewards: await frozenRewards(env, addDays(week, -7), now) });
}

// --- 위젯 ---

export async function widget(env: Env, now: Date) {
  const week = weekKey(now);
  const today = dayKey(now);
  const [budget, txs, rewards, seen] = await Promise.all([
    budgetFor(env, week, now),
    store.ledgerSince(env.DB, dayStart(week)),
    dailyRewards(env, today, today, now),
    store.lastSeen(env.DB),
  ]);
  const view = todayView(now, budget, txs);
  const r = rewards.get(today)!;
  return {
    remaining: view.remaining,
    allowance: view.allowance,
    spentToday: view.spentToday,
    rewardsToday: { exercise: r.exercise, study: r.study, commit: r.commit },
    stale: !seen || now.getTime() - seen.getTime() > STALE_AFTER_MS,
    asOf: now.toISOString(),
  };
}

// 확인·디버그용 요약. 월요일 정산 금액도 여기서 본다
export async function summary(env: Env, now: Date) {
  const week = weekKey(now);
  const [budget, txs, rewardsSoFar, balance, unknown] = await Promise.all([
    budgetFor(env, week, now),
    store.ledgerSince(env.DB, dayStart(week)),
    weekRewards(env, week, now),
    store.latestBalance(env.DB),
    store.unknownCount(env.DB),
  ]);
  const spent = spentInWeek(txs, week);
  return {
    week,
    budget,
    spent,
    left: budget - spent,
    rewardsThisWeek: rewardsSoFar,
    savingsIfClosedNow: weekSavings(txs, week),
    kbankBalance: balance,
    // 다음 월요일에 맞춰 넣을 금액 (이번 주 보상이 그대로라면)
    nextSettlementPreview: balance === null ? null : settlementTransfer(RULES.weeklyBase + rewardsSoFar, balance),
    unknownNotifications: unknown,
  };
}
