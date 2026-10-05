import { ingestNotification, widget, summary, weekView } from "./app";
import { syncCommits } from "./github";
import { syncExercise } from "./dazzang";
import { syncPsat } from "./mydr";
import * as store from "./store";
import type { Env } from "./store";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8" } });

function authorized(req: Request, token: string): boolean {
  return !!token && req.headers.get("authorization") === `Bearer ${token}`;
}

export async function handle(req: Request, env: Env, now = new Date()): Promise<Response> {
  const url = new URL(req.url);
  const route = `${req.method} ${url.pathname}`;

  // 공기계 수집기
  if (route === "POST /ingest/notification" || route === "POST /heartbeat") {
    if (!authorized(req, env.COLLECTOR_TOKEN)) return json({ error: "unauthorized" }, 401);
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const device = typeof body?.device === "string" ? body.device : "collector";
    await store.beat(env.DB, device, now);
    if (route === "POST /heartbeat") return json({ ok: true });

    if (typeof body?.postedAt !== "number" || typeof body.text !== "string") return json({ error: "bad request" }, 400);
    const result = await ingestNotification(
      env,
      { postedAt: new Date(body.postedAt), title: String(body.title ?? ""), text: body.text },
      now,
    );
    return json(result);
  }

  // 아이폰 (위젯, 단축어)
  if (!authorized(req, env.PHONE_TOKEN)) return json({ error: "unauthorized" }, 401);
  switch (route) {
    case "GET /widget":
      return json(await widget(env, now));
    case "GET /week":
      return json(await weekView(env, now));
    case "GET /summary":
      return json(await summary(env, now));
    // 아이폰 단축어 자동화: 공부 집중 모드 켜기/끄기, 말해보카 열기/닫기, 학교 도착
    case "POST /study/start":
      await store.startSession(env.DB, "STUDY", now);
      return json({ ok: true });
    case "POST /study/stop":
      await store.stopSession(env.DB, "STUDY", now);
      return json({ ok: true });
    case "POST /malhae/start":
      await store.startSession(env.DB, "MALHAE", now);
      return json({ ok: true });
    case "POST /malhae/stop":
      await store.stopSession(env.DB, "MALHAE", now);
      return json({ ok: true });
    case "POST /arrive/school":
      await store.insertArrival(env.DB, "SCHOOL", now);
      return json({ ok: true });
    case "POST /arrive/cafe": // 스터디카페 와이파이에 연결될 때
      await store.insertArrival(env.DB, "CAFE", now);
      return json({ ok: true });
    case "POST /sync/github": // 1시간 주기를 기다리지 않고 바로 확인할 때
      return json(await syncCommits(env, now));
    case "POST /sync/dazzang":
      return json(await syncExercise(env, now));
    case "POST /sync/mydr":
      return json(await syncPsat(env, now));
  }
  return json({ error: "not found" }, 404);
}

export default {
  fetch: (req: Request, env: Env) => handle(req, env),
  // wrangler.toml의 cron: 매시 7분에 GitHub 커밋, 다짱 운동 인증, my-dr 풀이일 동기화
  scheduled: (_event: ScheduledController, env: Env, ctx: ExecutionContext) => {
    const now = new Date();
    ctx.waitUntil(Promise.allSettled([syncCommits(env, now), syncExercise(env, now), syncPsat(env, now)]));
  },
};
