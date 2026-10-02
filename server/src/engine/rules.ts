// 사용자가 확정한 규칙. 금액 단위는 모두 원.
// 바뀌면 이 파일만 고친다 (엔진 코드는 건드리지 않는다).
export const RULES = {
  dailyBase: 5_000,
  weeklyBase: 35_000, // dailyBase × 7. 매주 케이뱅크로 넣는 기본금
  firstWeekFunding: 75_000, // 첫 주만 75,000원으로 시작
  savingsBaseline: 75_000, // 주간 저축 = 75,000 − 그 주 지출
  dailyMax: 15_000, // 기본금 + 보상의 하루 최대

  exercise: 3_000, // 다짱 인증이 있는 날 1회
  studyPer30Min: 500,
  studyMax: 5_000, // 5시간
  studyMinSessionMinutes: 10, // 이보다 짧은 집중 모드는 실수로 켠 것으로 본다
  commit: 100,
  commitMax: 2_000, // 20회

  allowanceRounding: 100, // 오늘 쓸 돈은 100원 단위 내림
} as const;

export type Rules = typeof RULES;
