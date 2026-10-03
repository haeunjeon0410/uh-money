import { describe, expect, it, beforeEach } from "vitest";
import { handle } from "../src/index";
import type { Env } from "../src/store";
import { createTestDb } from "./d1-shim";

const kst = (s: string) => new Date(`${s}+09:00`);

let env: Env;
beforeEach(() => {
  env = { DB: createTestDb(), COLLECTOR_TOKEN: "c-token", PHONE_TOKEN: "p-token", OWNER_NAMES: "홍길동", FIRST_WEEK: "2026-10-05", GITHUB_USER: "me" };
});

function call(method: string, path: string, now: Date, token: string, body?: unknown) {
  const req = new Request(`https://uh-money.test${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return handle(req, env, now).then(async (r) => ({ status: r.status, body: (await r.json()) as any }));
}

const notify = (at: string, text: string) =>
  call("POST", "/ingest/notification", kst(at), "c-token", { postedAt: kst(at).getTime(), title: "케이뱅크", text });

describe("인증", () => {
  it("토큰이 없거나 틀리면 401", async () => {
    expect((await call("GET", "/widget", new Date(), "wrong")).status).toBe(401);
    expect((await call("POST", "/ingest/notification", new Date(), "p-token", {})).status).toBe(401);
  });
});

describe("알림 수집 → 위젯", () => {
  it("첫 주 월요일: 75,000 ÷ 7 = 10,700원, 결제하면 그만큼 줄어든다", async () => {
    let w = await call("GET", "/widget", kst("2026-10-05T09:00:00"), "p-token");
    expect(w.body.allowance).toBe(10_700);

    await notify("2026-10-05T12:30:00", "승인 5,600원\n버거집\n카드(5678) | 10/05 12:30\n출금가능액 69,400원");
    w = await call("GET", "/widget", kst("2026-10-05T13:00:00"), "p-token");
    expect(w.body).toMatchObject({ allowance: 10_700, spentToday: 5_600, remaining: 5_100, stale: false });
  });

  it("같은 알림이 두 번 와도 한 번만 차감", async () => {
    const text = "출금 10,000원\n네이버페이충전 | 입출금통장(1234)\n잔액 65,000원";
    expect((await notify("2026-10-05T10:51:00", text)).body.status).toBe("ok");
    expect((await notify("2026-10-05T10:51:00", text)).body.status).toBe("duplicate");
    const w = await call("GET", "/widget", kst("2026-10-05T11:00:00"), "p-token");
    expect(w.body.spentToday).toBe(10_000);
  });

  it("잔액이 비면 놓친 지출로 잡는다", async () => {
    await notify("2026-10-05T10:00:00", "출금 10,000원\n네이버페이충전 | 입출금통장(1234)\n잔액 65,000원");
    const r = await notify("2026-10-05T18:00:00", "승인 5,000원\n편의점\n카드(5678) | 10/05 18:00\n출금가능액 59,800원");
    expect(r.body.gap).toBe("MISSING_SPEND");
    const w = await call("GET", "/widget", kst("2026-10-05T19:00:00"), "p-token");
    expect(w.body.spentToday).toBe(15_200);
  });

  it("모르는 알림은 저장만 하고 계산엔 안 넣는다", async () => {
    expect((await notify("2026-10-05T10:00:00", "케이뱅크 이벤트 안내")).body.status).toBe("unknown");
    const s = await call("GET", "/summary", kst("2026-10-05T11:00:00"), "p-token");
    expect(s.body.unknownNotifications).toBe(1);
    expect(s.body.spent).toBe(0);
  });
});

describe("공부 → 보상 → 다음 주 예산", () => {
  it("집중 모드 2시간이면 오늘 공부 보상 2,000원, 다음 주 예산은 35,000 + 2,000", async () => {
    await call("POST", "/study/start", kst("2026-10-06T14:00:00"), "p-token");
    await call("POST", "/study/start", kst("2026-10-06T14:10:00"), "p-token"); // 중복 호출은 무시
    await call("POST", "/study/stop", kst("2026-10-06T16:05:00"), "p-token");

    const w = await call("GET", "/widget", kst("2026-10-06T17:00:00"), "p-token");
    expect(w.body.rewardsToday.study).toEqual({ amount: 2_000, max: 5_000 });
    expect(w.body.rewardsToday.exercise.amount).toBe(0);

    // 다음 주 예산 = 35,000 + 공부 2,000 + 화요일 이후 아무것도 안 쓴 날들의 돈 업적
    // (화~일 6일 × 무지출 3,000 + 한도 500 + 배달 안 함 500 = 24,000, 월요일은 지출 없음이라 4,000 추가)
    const next = await call("GET", "/summary", kst("2026-10-12T09:00:00"), "p-token");
    expect(next.body.budget).toBe(35_000 + 2_000 + 7 * 4_000);
  });
});

describe("수집기 생존 신호", () => {
  it("3시간 넘게 신호가 없으면 stale", async () => {
    await call("POST", "/heartbeat", kst("2026-10-05T06:00:00"), "c-token", { device: "galaxy" });
    expect((await call("GET", "/widget", kst("2026-10-05T08:00:00"), "p-token")).body.stale).toBe(false);
    expect((await call("GET", "/widget", kst("2026-10-05T10:00:00"), "p-token")).body.stale).toBe(true);
  });
});

describe("위젯 정산 안내", () => {
  it("첫 주 월요일에 케이뱅크 잔액이 모자라면 채우기 링크가 붙고, 채우면 사라진다", async () => {
    env.KBANK_ACCOUNT = "100200300400";
    await notify("2026-10-05T07:00:00", "출금 1,000원\n편의점 | 입출금통장(1234)\n잔액 50,080원");
    let w = await call("GET", "/widget", kst("2026-10-05T08:00:00"), "p-token");
    expect(w.body.settlement).toMatchObject({ action: "FILL", amount: 23_920 }); // 75,000 − 1,000 − 50,080
    expect(w.body.settlement.url).toContain("amount=23920");

    await notify("2026-10-05T09:00:00", "입금 23,920원\n홍길동 | 입출금통장(1234)\n잔액 74,000원");
    w = await call("GET", "/widget", kst("2026-10-05T09:05:00"), "p-token");
    expect(w.body.settlement).toBeNull();
  });
});

describe("말해보카·학교 도착", () => {
  it("말해보카 10분 넘게 켜면 오늘 500원, 시간표보다 일찍 도착하면 출석 업적", async () => {
    env.SCHOOL_TIMETABLE = "mon=09:00";
    await call("POST", "/malhae/start", kst("2026-10-05T07:30:00"), "p-token");
    await call("POST", "/malhae/stop", kst("2026-10-05T07:45:00"), "p-token");
    await call("POST", "/arrive/school", kst("2026-10-05T08:50:00"), "p-token");
    const w = await call("GET", "/widget", kst("2026-10-05T12:00:00"), "p-token");
    expect(w.body.rewardsToday.malhae.amount).toBe(500);
    expect(w.body.achievementsToday).toEqual({ noSpend: "ongoing", keptLimit: "ongoing", noDelivery: "ongoing", onTime: "earned" });
  });
});

describe("주간 모아보기", () => {
  it("항목별 합계와 다음 주 예산", async () => {
    await call("POST", "/study/start", kst("2026-10-06T14:00:00"), "p-token");
    await call("POST", "/study/stop", kst("2026-10-06T15:00:00"), "p-token");
    const v = await call("GET", "/week", kst("2026-10-06T16:00:00"), "p-token");
    // 월요일: 지출 없음 → 무지출 3,000 + 한도 500 + 배달 안 함 500, 화요일: 공부 1시간 1,000 (오늘이라 돈 업적은 아직)
    expect(v.body.categories.study).toEqual({ amount: 1_000, days: 1 });
    expect(v.body.categories.achievements).toEqual({ amount: 4_000, days: 1 });
    expect(v.body.rewards).toBe(5_000);
    expect(v.body.nextBudget).toBe(40_000);
    expect(v.body.days).toHaveLength(7);
  });
});
