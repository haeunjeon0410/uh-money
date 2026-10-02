// 하루/한 주는 KST 오전 6시에 바뀐다 (다짱과 같은 기준).
// - 하루: 오전 6:00 ~ 다음 날 오전 5:59:59
// - 한 주: 월요일 오전 6:00 ~ 다음 주 월요일 오전 5:59:59
// 날짜 키는 "YYYY-MM-DD" 문자열로 다룬다. 새벽 2시는 전날 키가 된다.
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const RESET_OFFSET_MS = 6 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

// 리셋 시각만큼 당긴 KST 시각. UTC getter로 읽으면 "그날"의 달력 값이 나온다
function shifted(date: Date): Date {
  return new Date(date.getTime() + KST_OFFSET_MS - RESET_OFFSET_MS);
}

function toKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function dayKey(date: Date): string {
  return toKey(shifted(date));
}

// 그 주 월요일의 dayKey
export function weekKey(date: Date): string {
  const d = shifted(date);
  const isoDay = d.getUTCDay() === 0 ? 7 : d.getUTCDay(); // 1=월 ... 7=일
  return toKey(new Date(d.getTime() - (isoDay - 1) * DAY_MS));
}

// 오늘을 포함해 이번 주에 남은 날수. 월=7 ... 일=1
export function daysLeftInWeek(date: Date): number {
  const day = shifted(date).getUTCDay();
  return 8 - (day === 0 ? 7 : day);
}

export function addDays(key: string, days: number): string {
  return toKey(new Date(Date.parse(key) + days * DAY_MS));
}

// dayKey의 하루가 시작되는 실제 시각 (그날 06:00 KST)
export function dayStart(key: string): Date {
  return new Date(Date.parse(key) - KST_OFFSET_MS + RESET_OFFSET_MS);
}
