// 테스트용: node:sqlite 위에 D1 API 중 store.ts가 쓰는 부분만 흉내 낸다.
// 실제 마이그레이션 SQL을 그대로 적용해서 스키마와 쿼리를 함께 검증한다.
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export function createTestDb(): D1Database {
  const db = new DatabaseSync(":memory:");
  const dir = join(import.meta.dirname, "..", "migrations");
  for (const f of readdirSync(dir).sort()) db.exec(readFileSync(join(dir, f), "utf8"));

  const prepare = (sql: string) => {
    let params: unknown[] = [];
    const stmt = {
      bind(...values: unknown[]) {
        params = values.map((v) => (v === undefined ? null : v));
        return stmt;
      },
      async run() {
        const r = db.prepare(sql).run(...(params as never[]));
        return { meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
      },
      async all() {
        return { results: db.prepare(sql).all(...(params as never[])) };
      },
      async first() {
        return db.prepare(sql).get(...(params as never[])) ?? null;
      },
    };
    return stmt;
  };
  return { prepare } as unknown as D1Database;
}
