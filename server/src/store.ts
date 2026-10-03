// D1 쿼리 모음. 테스트에서는 node:sqlite로 같은 SQL을 돌린다 (test/d1-shim.ts)
import type { ParsedTx } from "./ingest/kbank";
import type { Effect, LedgerTx } from "./engine/budget";

export interface Env {
  DB: D1Database;
  COLLECTOR_TOKEN: string;
  PHONE_TOKEN: string;
  OWNER_NAMES: string;
  FIRST_WEEK: string;
  KBANK_ACCOUNT?: string; // 케이뱅크 계좌번호 (월요일 채우기 토스 링크용)
  SALARY_ACCOUNT?: string; // "은행:계좌번호" 형식의 월급통장 (넘친 돈 빼기 토스 링크용)
  GITHUB_TOKEN?: string; // 비공개 저장소 커밋까지 읽는 읽기 전용 토큰
  GITHUB_USER: string;
  SCHOOL_TIMETABLE?: string; // "mon=09:00,tue=10:30" 요일별 첫 수업 시작 (학교 출석 업적)
}

export interface RawInput {
  postedAt: Date;
  title: string;
  text: string;
}

export async function insertRaw(db: D1Database, n: RawInput, status: string, now: Date): Promise<number | null> {
  const r = await db
    .prepare(
      `INSERT INTO raw_notifications (posted_at, title, text, received_at, parse_status, raw_key)
       VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(raw_key) DO NOTHING`,
    )
    .bind(n.postedAt.toISOString(), n.title, n.text, now.toISOString(), status, `${n.postedAt.toISOString()}|${n.text}`)
    .run();
  return r.meta.changes > 0 ? (r.meta.last_row_id as number) : null;
}

export async function insertTx(
  db: D1Database,
  tx: Pick<ParsedTx, "amount" | "counterparty" | "source" | "occurredAt" | "balanceAfter" | "dedupKey"> & { kind: string },
  effect: Effect,
  rawId: number | null,
): Promise<boolean> {
  const r = await db
    .prepare(
      `INSERT INTO transactions (raw_id, kind, amount, counterparty, source, occurred_at, balance_after, effect, dedup_key)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(dedup_key) DO NOTHING`,
    )
    .bind(rawId, tx.kind, tx.amount, tx.counterparty, tx.source, tx.occurredAt.toISOString(), tx.balanceAfter, effect, tx.dedupKey)
    .run();
  return r.meta.changes > 0;
}

export async function balanceBefore(db: D1Database, at: Date): Promise<number | null> {
  const row = await db
    .prepare(
      `SELECT balance_after FROM transactions
       WHERE balance_after IS NOT NULL AND occurred_at < ? ORDER BY occurred_at DESC, id DESC LIMIT 1`,
    )
    .bind(at.toISOString())
    .first<{ balance_after: number }>();
  return row?.balance_after ?? null;
}

export async function latestBalance(db: D1Database): Promise<number | null> {
  const row = await db
    .prepare(`SELECT balance_after FROM transactions WHERE balance_after IS NOT NULL ORDER BY occurred_at DESC, id DESC LIMIT 1`)
    .first<{ balance_after: number }>();
  return row?.balance_after ?? null;
}

export async function ledgerSince(db: D1Database, since: Date): Promise<LedgerTx[]> {
  const { results } = await db
    .prepare(`SELECT occurred_at, amount, effect, counterparty FROM transactions WHERE occurred_at >= ?`)
    .bind(since.toISOString())
    .all<{ occurred_at: string; amount: number; effect: Effect; counterparty: string }>();
  return results.map((r) => ({ at: new Date(r.occurred_at), amount: r.amount, effect: r.effect, counterparty: r.counterparty }));
}

export async function unknownCount(db: D1Database): Promise<number> {
  const row = await db
    .prepare(`SELECT COUNT(*) AS n FROM raw_notifications WHERE parse_status = 'UNKNOWN_FORMAT'`)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

// --- 켜고 끄는 세션: 공부 집중 모드(STUDY), 말해보카(MALHAE) ---

export type SessionKind = "STUDY" | "MALHAE";

export async function startSession(db: D1Database, kind: SessionKind, now: Date): Promise<void> {
  const open = await db.prepare(`SELECT id FROM study_sessions WHERE end_at IS NULL AND kind = ? LIMIT 1`).bind(kind).first();
  if (open) return; // 이미 켜져 있으면 무시 (단축어가 두 번 불려도 안전)
  await db.prepare(`INSERT INTO study_sessions (start_at, kind) VALUES (?, ?)`).bind(now.toISOString(), kind).run();
}

export async function stopSession(db: D1Database, kind: SessionKind, now: Date): Promise<void> {
  await db.prepare(`UPDATE study_sessions SET end_at = ? WHERE end_at IS NULL AND kind = ?`).bind(now.toISOString(), kind).run();
}

export async function sessionsSince(db: D1Database, kind: SessionKind, since: Date) {
  const { results } = await db
    .prepare(`SELECT start_at, end_at FROM study_sessions WHERE start_at >= ? AND kind = ?`)
    .bind(since.toISOString(), kind)
    .all<{ start_at: string; end_at: string | null }>();
  return results.map((r) => ({ start: new Date(r.start_at), end: r.end_at ? new Date(r.end_at) : null }));
}

// --- 피셋(my-dr), 학교 도착 ---

export async function putPsatDays(db: D1Database, days: string[]): Promise<void> {
  for (const day of days) await db.prepare(`INSERT INTO psat_days (day) VALUES (?) ON CONFLICT(day) DO NOTHING`).bind(day).run();
}

export async function psatDaysSince(db: D1Database, sinceDay: string): Promise<Set<string>> {
  const { results } = await db.prepare(`SELECT day FROM psat_days WHERE day >= ?`).bind(sinceDay).all<{ day: string }>();
  return new Set(results.map((r) => r.day));
}

export async function insertArrival(db: D1Database, at: Date): Promise<void> {
  await db.prepare(`INSERT INTO arrivals (at) VALUES (?)`).bind(at.toISOString()).run();
}

export async function arrivalsSince(db: D1Database, since: Date): Promise<Date[]> {
  const { results } = await db.prepare(`SELECT at FROM arrivals WHERE at >= ?`).bind(since.toISOString()).all<{ at: string }>();
  return results.map((r) => new Date(r.at));
}

// --- 운동, 커밋 (4단계에서 다짱/GitHub 동기화가 채운다) ---

export async function exerciseDaysSince(db: D1Database, sinceDay: string): Promise<Set<string>> {
  const { results } = await db.prepare(`SELECT day FROM exercise_days WHERE day >= ?`).bind(sinceDay).all<{ day: string }>();
  return new Set(results.map((r) => r.day));
}

export async function insertCommit(db: D1Database, sha: string, at: Date): Promise<boolean> {
  const r = await db
    .prepare(`INSERT INTO commits (sha, committed_at) VALUES (?, ?) ON CONFLICT(sha) DO NOTHING`)
    .bind(sha, at.toISOString())
    .run();
  return r.meta.changes > 0;
}

export async function commitTimesSince(db: D1Database, since: Date): Promise<Date[]> {
  const { results } = await db
    .prepare(`SELECT committed_at FROM commits WHERE committed_at >= ?`)
    .bind(since.toISOString())
    .all<{ committed_at: string }>();
  return results.map((r) => new Date(r.committed_at));
}

// --- 보상 확정 ---

export interface RewardFreeze {
  amount: number;
  earned_at_freeze: number;
}

export async function getFreeze(db: D1Database, week: string): Promise<RewardFreeze | null> {
  return db.prepare(`SELECT amount, earned_at_freeze FROM reward_freezes WHERE week = ?`).bind(week).first<RewardFreeze>();
}

export async function putFreeze(db: D1Database, week: string, amount: number, earned: number, now: Date): Promise<void> {
  await db
    .prepare(`INSERT INTO reward_freezes (week, amount, earned_at_freeze, frozen_at) VALUES (?, ?, ?, ?) ON CONFLICT(week) DO NOTHING`)
    .bind(week, amount, earned, now.toISOString())
    .run();
}

// --- 수집기 생존 신호 ---

export async function beat(db: D1Database, device: string, now: Date): Promise<void> {
  await db
    .prepare(`INSERT INTO heartbeats (device, last_seen) VALUES (?, ?) ON CONFLICT(device) DO UPDATE SET last_seen = excluded.last_seen`)
    .bind(device, now.toISOString())
    .run();
}

export async function lastSeen(db: D1Database): Promise<Date | null> {
  const row = await db.prepare(`SELECT MAX(last_seen) AS t FROM heartbeats`).first<{ t: string | null }>();
  return row?.t ? new Date(row.t) : null;
}
