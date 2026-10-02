import { RULES, type Rules } from "./rules";
import { dayKey, dayStart, addDays } from "./time";

export interface StudySession {
  start: Date;
  end: Date | null; // 아직 집중 모드가 켜져 있으면 null
}

export interface DayActivity {
  exercised: boolean; // 다짱 인증 여부 ('사정 봐달라기'는 제외된 상태로 들어온다)
  studyMinutes: number;
  commits: number;
}

export interface DayReward {
  exercise: number;
  study: number;
  commit: number;
  total: number; // 기본금 제외한 보상 합계
}

export function rewardFor(a: DayActivity, rules: Rules = RULES): DayReward {
  const exercise = a.exercised ? rules.exercise : 0;
  const study = Math.min(Math.floor(a.studyMinutes / 30) * rules.studyPer30Min, rules.studyMax);
  const commit = Math.min(a.commits * rules.commit, rules.commitMax);
  // 항목별 상한만으로 15,000원에 맞춰져 있지만, 규칙이 바뀌어도 하루 최대는 넘지 않게 한 번 더 막는다
  const total = Math.min(exercise + study + commit, rules.dailyMax - rules.dailyBase);
  return { exercise, study, commit, total };
}

// 집중 모드 세션을 날짜별 공부 시간(분)으로 바꾼다.
// 세션은 시작한 날에 귀속되고, 끄는 걸 잊었으면 그날 06:00 경계에서 자동 종료한다.
export function studyMinutesByDay(
  sessions: StudySession[],
  now: Date,
  rules: Rules = RULES,
): Map<string, number> {
  const byDay = new Map<string, number>();
  for (const s of sessions) {
    const key = dayKey(s.start);
    const dayEnd = dayStart(addDays(key, 1));
    const rawEnd = s.end ?? now;
    const end = rawEnd.getTime() > dayEnd.getTime() ? dayEnd : rawEnd;
    const minutes = Math.floor((end.getTime() - s.start.getTime()) / 60_000);
    if (minutes < rules.studyMinSessionMinutes) continue;
    byDay.set(key, (byDay.get(key) ?? 0) + minutes);
  }
  return byDay;
}
