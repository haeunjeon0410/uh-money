import { RULES, type Rules } from "./rules";
import { dayKey, dayStart, addDays } from "./time";

export interface StudySession {
  start: Date;
  end: Date | null; // 아직 켜져 있으면 null
}

// 매일 보상의 재료 — "내가 한 일"
export interface DayActivity {
  exercised: boolean; // 다짱 인증 여부 ('사정 봐달라기'는 제외된 상태로 들어온다)
  studyMinutes: number;
  commits: number;
  malhaeMinutes: number;
  psat: boolean;
}

// 업적의 재료 — "참은 것·지킨 것". 아직 하루가 안 끝나 판정할 수 없는 건 false로 들어온다
export interface DayAchievements {
  noSpend: boolean;
  keptLimit: boolean;
  onTime: boolean;
  noDelivery: boolean;
}

export interface DayReward {
  exercise: number;
  study: number;
  commit: number;
  malhae: number;
  psat: number;
  daily: number; // 매일 보상 합계 (하루 상한 적용)
  achievements: { noSpend: number; keptLimit: number; onTime: number; noDelivery: number };
  total: number; // daily + 업적. 기본금은 포함하지 않는다
}

export const NO_ACHIEVEMENTS: DayAchievements = { noSpend: false, keptLimit: false, onTime: false, noDelivery: false };

export function rewardFor(a: DayActivity, ach: DayAchievements = NO_ACHIEVEMENTS, rules: Rules = RULES): DayReward {
  const exercise = a.exercised ? rules.exercise : 0;
  const study = Math.min(Math.floor(a.studyMinutes / 30) * rules.studyPer30Min, rules.studyMax);
  const commit = Math.min(a.commits * rules.commit, rules.commitMax);
  const malhae = a.malhaeMinutes >= rules.malhaeMinMinutes ? rules.malhae : 0;
  const psat = a.psat ? rules.psat : 0;
  const daily = Math.min(exercise + study + commit + malhae + psat, rules.dailyRewardMax);

  const achievements = {
    noSpend: ach.noSpend ? rules.noSpend : 0,
    keptLimit: ach.keptLimit ? rules.keptLimit : 0,
    onTime: ach.onTime ? rules.onTime : 0,
    noDelivery: ach.noDelivery ? rules.noDelivery : 0,
  };
  const total = daily + achievements.noSpend + achievements.keptLimit + achievements.onTime + achievements.noDelivery;
  return { exercise, study, commit, malhae, psat, daily, achievements, total };
}

// 한 주 보상 합계. 주간 상한 때문에 다음 주 예산은 최대 35,000 + 40,000 = 75,000원
export function weekRewardTotal(days: DayReward[], rules: Rules = RULES): number {
  return Math.min(days.reduce((sum, d) => sum + d.total, 0), rules.weeklyRewardMax);
}

// 켜고 끈 세션(공부 집중 모드, 말해보카)을 날짜별 분으로 바꾼다.
// 세션은 시작한 날에 귀속되고, 끄는 걸 잊었으면 그날 06:00 경계에서 자동 종료한다.
export function sessionMinutesByDay(
  sessions: StudySession[],
  now: Date,
  minSessionMinutes: number = RULES.studyMinSessionMinutes,
): Map<string, number> {
  const byDay = new Map<string, number>();
  for (const s of sessions) {
    const key = dayKey(s.start);
    const dayEnd = dayStart(addDays(key, 1));
    const rawEnd = s.end ?? now;
    const end = rawEnd.getTime() > dayEnd.getTime() ? dayEnd : rawEnd;
    const minutes = Math.floor((end.getTime() - s.start.getTime()) / 60_000);
    if (minutes < minSessionMinutes) continue;
    byDay.set(key, (byDay.get(key) ?? 0) + minutes);
  }
  return byDay;
}
