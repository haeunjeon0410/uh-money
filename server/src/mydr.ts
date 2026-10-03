// my-dr에서 "오늘의 문제 풀이를 올린 날"을 가져온다 (피셋 보상).
// my-dr은 한국 달력 날짜로, uh-money는 06시 기준 날짜로 하루를 나누는데, 풀이일은 my-dr 날짜를 그대로 그날로 친다.
import type { Env } from "./store";
import * as store from "./store";
import { dayKey, dayStart } from "./engine/time";

type Fetch = typeof fetch;
const LOOKBACK_MS = 8 * 24 * 60 * 60 * 1000;

export async function syncPsat(env: Env, now: Date, fetchFn: Fetch = fetch) {
  if (!env.MYDR_URL || !env.MYDR_TOKEN) return { skipped: true, added: 0 };
  const since = dayKey(new Date(Math.max(dayStart(env.FIRST_WEEK).getTime(), now.getTime() - LOOKBACK_MS)));
  const res = await fetchFn(`${env.MYDR_URL.replace(/\/$/, "")}/api/external/solved-days?since=${since}`, {
    headers: { "x-access-token": env.MYDR_TOKEN },
  });
  if (!res.ok) throw new Error(`my-dr ${res.status}`);
  const { days } = (await res.json()) as { days: string[] };
  await store.putPsatDays(env.DB, days);
  return { skipped: false, added: days.length };
}
