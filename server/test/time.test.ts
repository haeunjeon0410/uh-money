import { describe, expect, it } from "vitest";
import { dayKey, weekKey, daysLeftInWeek } from "../src/engine/time";

// KST 시각 문자열 → Date
const kst = (s: string) => new Date(`${s}+09:00`);

describe("06:00 KST 경계", () => {
  it("새벽 시각은 전날로 친다", () => {
    expect(dayKey(kst("2026-10-06T02:00:00"))).toBe("2026-10-05");
    expect(dayKey(kst("2026-10-06T06:00:00"))).toBe("2026-10-06");
  });

  it("주는 월요일 06:00에 시작한다", () => {
    expect(weekKey(kst("2026-10-05T05:59:00"))).toBe("2026-09-28");
    expect(weekKey(kst("2026-10-05T06:00:00"))).toBe("2026-10-05");
    expect(weekKey(kst("2026-10-11T23:00:00"))).toBe("2026-10-05");
  });

  it("남은 날수는 오늘 포함", () => {
    expect(daysLeftInWeek(kst("2026-10-05T07:00:00"))).toBe(7);
    expect(daysLeftInWeek(kst("2026-10-11T23:00:00"))).toBe(1);
    expect(daysLeftInWeek(kst("2026-10-12T03:00:00"))).toBe(1); // 월요일 새벽 = 아직 일요일
  });
});
