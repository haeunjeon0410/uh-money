// 사용자가 확정한 규칙. 금액 단위는 모두 원.
// 바뀌면 이 파일만 고친다 (엔진 코드는 건드리지 않는다).
export const RULES = {
  dailyBase: 5_000,
  weeklyBase: 35_000, // dailyBase × 7. 매주 케이뱅크로 넣는 기본금
  firstWeekFunding: 70_000, // 첫 주만 70,000원으로 시작
  weeklyBudgetMax: 100_000, // 갓생을 아무리 살아도 한 주 예산은 10만 원에서 멈춘다

  // 매일 보상 — "내가 한 일". 합계는 하루 dailyRewardMax까지
  dailyRewardMax: 10_000,
  exercise: 3_000, // 다짱 인증이 있는 날 1회
  studyPer30Min: 500,
  studyMax: 5_000, // 5시간
  studyMinSessionMinutes: 10, // 이보다 짧은 집중 모드는 실수로 켠 것으로 본다
  commit: 100,
  commitMax: 1_000, // 10회
  malhae: 500, // 말해보카를 하루 합쳐 malhaeMinMinutes(15분) 이상 켜 둠
  malhaeMinMinutes: 15,
  psat: 500, // my-dr에서 그날 문제 풀이를 업로드함

  // 업적 — "참은 것·지킨 것". 하루 상한과 별개
  noSpend: 3_000, // 하루 지출 0원
  keptLimit: 500, // 하루가 끝났을 때 오늘 쓸 돈이 0원 이상
  onTime: 500, // 학교에 첫 수업 시작 전 도착
  onTimeGraceMinutes: 0, // 첫 수업 시작 후 몇 분까지 제시간으로 칠지. 정각까지만 인정하고, 실제 감지 지연을 보고 늘린다
  noDelivery: 500, // 배달 결제 0건
  cafe: 500, // 스터디카페 와이파이에 연결됨 (하루 1회)

  allowanceRounding: 100, // 오늘 쓸 돈은 100원 단위 내림
} as const;

export type Rules = typeof RULES;
