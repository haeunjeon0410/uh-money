// 다짱에서 내 운동 인증일을 가져온다. 다짱 쪽 읽기 전용 API는 /api/external/exercise-days.
// 하루는 양쪽 모두 06:00 KST 기준이라, 다짱이 돌려주는 "그날 시작 시각"을 그대로 dayKey로 바꿔 쓴다.
import type { Env } from "./store";
import * as store from "./store";
import { dayKey, dayStart } from "./engine/time";

type Fetch = typeof fetch;
const LOOKBACK_MS = 8 * 24 * 60 * 60 * 1000;

export async function syncExercise(env: Env, now: Date, fetchFn: Fetch = fetch) {
  if (!env.DAZZANG_URL || !env.DAZZANG_TOKEN || !env.DAZZANG_USER_ID) return { skipped: true, added: 0 };
  const since = new Date(Math.max(dayStart(env.FIRST_WEEK).getTime(), now.getTime() - LOOKBACK_MS));
  const url = `${env.DAZZANG_URL.replace(/\/$/, "")}/api/external/exercise-days?userId=${encodeURIComponent(env.DAZZANG_USER_ID)}&since=${encodeURIComponent(since.toISOString())}`;
  const res = await fetchFn(url, { headers: { authorization: `Bearer ${env.DAZZANG_TOKEN}` } });
  if (!res.ok) throw new Error(`다짱 ${res.status}`);
  const { days } = (await res.json()) as { days: string[] };
  const keys = days.map((d) => dayKey(new Date(d)));
  await store.putExerciseDays(env.DB, keys);
  return { skipped: false, added: keys.length };
}
