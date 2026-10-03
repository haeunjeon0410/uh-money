import { parseKbank } from "./ingest/kbank";
import { classify, checkGap } from "./ingest/classify";
import { rewardFor, sessionMinutesByDay, weekRewardTotal, type DayReward } from "./engine/rewards";
import { moneyAchievements, onTime, parseTimetable, isDelivery } from "./engine/achievements";
import { todayView, weekBudget, spentInWeek, weekSavings, settlementTransfer } from "./engine/budget";
import { dayKey, weekKey, addDays, dayStart } from "./engine/time";
import { RULES } from "./engine/rules";
import { settlementFor } from "./settlement";
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

// fromDay~toDay(같은 주) 하루하루의 매일 보상과 업적. 돈 업적은 하루가 끝난 날만 확정한다
async function dayRewards(env: Env, week: string, fromDay: string, toDay: string, now: Date): Promise<Map<string, DayReward>> {
  const since = dayStart(fromDay);
  const [budget, txs, exercise, study, malhae, commits, psat, arrivals] = await Promise.all([
    budgetFor(env, week, now),
    store.ledgerSince(env.DB, dayStart(week)),
    store.exerciseDaysSince(env.DB, fromDay),
    store.sessionsSince(env.DB, "STUDY", since),
    store.sessionsSince(env.DB, "MALHAE", since),
    store.commitTimesSince(env.DB, since),
    store.psatDaysSince(env.DB, fromDay),
    store.arrivalsSince(env.DB, since),
  ]);
  const studyMin = sessionMinutesByDay(study, now, RULES.studyMinSessionMinutes);
  const malhaeMin = sessionMinutesByDay(malhae, now, 1);
  const commitsByDay = new Map<string, number>();
  for (const t of commits) commitsByDay.set(dayKey(t), (commitsByDay.get(dayKey(t)) ?? 0) + 1);
  const timetable = parseTimetable(env.SCHOOL_TIMETABLE);
  const today = dayKey(now);

  const out = new Map<string, DayReward>();
  for (let d = fromDay; d <= toDay; d = addDays(d, 1)) {
    const money = d < today ? moneyAchievements(d, budget, txs) : { noSpend: false, keptLimit: false, noDelivery: false };
    out.set(
      d,
      rewardFor(
        {
          exercised: exercise.has(d),
          studyMinutes: studyMin.get(d) ?? 0,
          commits: commitsByDay.get(d) ?? 0,
          malhaeMinutes: malhaeMin.get(d) ?? 0,
          psat: psat.has(d),
        },
        { ...money, onTime: onTime(d, arrivals, timetable) },
      ),
    );
  }
  return out;
}

async function weekRewards(env: Env, week: string, now: Date): Promise<number> {
  const days = await dayRewards(env, week, week, addDays(week, 6), now);
  return weekRewardTotal([...days.values()]);
}

// 지난주 보상을 확정한다. 처음 물어볼 때 한 번 계산해 저장하고, 그 뒤엔 저장된 값을 쓴다.
// 정산 뒤 늦게 들어온 보상(예: 일요일 커밋을 월요일에 푸시)은 다음 확정 때 더하되, 주간 상한은 넘지 않는다.
async function frozenRewards(env: Env, week: string, now: Date): Promise<number> {
  const existing = await store.getFreeze(env.DB, week);
  if (existing) return existing.amount;

  const earned = await weekRewards(env, week, now);
  let late = 0;
  const before = addDays(week, -7);
  const prevFreeze = await store.getFreeze(env.DB, before);
  if (prevFreeze) late = Math.max(0, (await weekRewards(env, before, now)) - prevFreeze.earned_at_freeze);
  const amount = Math.min(earned + late, RULES.weeklyRewardMax);
  await store.putFreeze(env.DB, week, amount, earned, now);
  return amount;
}

export async function budgetFor(env: Env, week: string, now: Date): Promise<number> {
  if (week <= env.FIRST_WEEK) return weekBudget({ isFirstWeek: true, prevWeekRewards: 0 });
  return weekBudget({ isFirstWeek: false, prevWeekRewards: await frozenRewards(env, addDays(week, -7), now) });
}

// --- 위젯 ---

export async function widget(env: Env, now: Date) {
  const week = weekKey(now);
  const today = dayKey(now);
  const [budget, txs, rewards, seen, balance] = await Promise.all([
    budgetFor(env, week, now),
    store.ledgerSince(env.DB, dayStart(week)),
    dayRewards(env, week, today, today, now),
    store.lastSeen(env.DB),
    store.latestBalance(env.DB),
  ]);
  const view = todayView(now, budget, txs);
  const r = rewards.get(today)!;
  const left = budget - spentInWeek(txs, week);

  // 돈 업적은 하루가 끝나야 확정되니 오늘은 "아직 지키는 중(ongoing)"인지 "이미 깨짐(failed)"인지만 보여준다
  const todaySpends = txs.filter((t) => t.effect === "SPEND" && dayKey(t.at) === today);
  const state = (holding: boolean) => (holding ? "ongoing" : "failed");
  return {
    week,
    remaining: view.remaining,
    allowance: view.allowance,
    spentToday: view.spentToday,
    // 매일 보상: 위젯 아이콘 아래 막대 = amount / max
    rewardsToday: {
      exercise: { amount: r.exercise, max: RULES.exercise },
      study: { amount: r.study, max: RULES.studyMax },
      commit: { amount: r.commit, max: RULES.commitMax },
      malhae: { amount: r.malhae, max: RULES.malhae },
      psat: { amount: r.psat, max: RULES.psat },
    },
    achievementsToday: {
      noSpend: state(todaySpends.length === 0),
      keptLimit: state(view.remaining >= 0),
      noDelivery: state(!todaySpends.some((t) => isDelivery(t.counterparty ?? ""))),
      onTime: r.achievements.onTime > 0 ? "earned" : "none",
    },
    stale: !seen || now.getTime() - seen.getTime() > STALE_AFTER_MS,
    // 케이뱅크 잔액이 이번 주에 쓸 돈과 다르면 채우기/빼기 안내 (위젯이 알림과 토스 링크로 띄운다)
    settlement: settlementFor(left, balance, { kbank: env.KBANK_ACCOUNT, salary: env.SALARY_ACCOUNT }),
    asOf: now.toISOString(),
  };
}

// 위젯을 누르면 열리는 주간 모아보기. 이번 주 보상이 그대로 다음 주 예산이 된다
export async function weekView(env: Env, now: Date) {
  const week = weekKey(now);
  const today = dayKey(now);
  const [days, txs] = await Promise.all([
    dayRewards(env, week, week, addDays(week, 6), now),
    store.ledgerSince(env.DB, dayStart(week)),
  ]);
  const list = [...days.entries()];
  const sum = (pick: (r: DayReward) => number) => list.reduce((s, [, r]) => s + pick(r), 0);
  const count = (pick: (r: DayReward) => number) => list.filter(([, r]) => pick(r) > 0).length;
  const achievements = (r: DayReward) =>
    r.achievements.noSpend + r.achievements.keptLimit + r.achievements.onTime + r.achievements.noDelivery;
  const rewards = weekRewardTotal(list.map(([, r]) => r));
  return {
    week,
    today,
    rewards,
    rewardsMax: RULES.weeklyRewardMax,
    nextBudget: RULES.weeklyBase + rewards,
    categories: {
      exercise: { amount: sum((r) => r.exercise), days: count((r) => r.exercise) },
      study: { amount: sum((r) => r.study), days: count((r) => r.study) },
      commit: { amount: sum((r) => r.commit), days: count((r) => r.commit) },
      malhae: { amount: sum((r) => r.malhae), days: count((r) => r.malhae) },
      psat: { amount: sum((r) => r.psat), days: count((r) => r.psat) },
      achievements: { amount: sum(achievements), days: count(achievements) },
    },
    days: list.map(([day, r]) => ({ day, total: r.total })),
    spent: spentInWeek(txs, week),
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
