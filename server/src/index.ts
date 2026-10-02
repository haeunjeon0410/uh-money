import { ingestNotification, widget, summary } from "./app";
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
    case "GET /summary":
      return json(await summary(env, now));
    case "POST /study/start":
      await store.startStudy(env.DB, now);
      return json({ ok: true });
    case "POST /study/stop":
      await store.stopStudy(env.DB, now);
      return json({ ok: true });
  }
  return json({ error: "not found" }, 404);
}

export default { fetch: (req: Request, env: Env) => handle(req, env) };
