-- 보상 다양화: 말해보카 세션, 피셋(my-dr) 풀이일, 학교 도착 기록

-- 켜고 끄는 세션을 종류별로 구분한다 (기존 행은 공부 집중 모드)
ALTER TABLE study_sessions ADD COLUMN kind TEXT NOT NULL DEFAULT 'STUDY'; -- STUDY | MALHAE

-- my-dr에서 그날 문제 풀이를 업로드한 날 (06:00 기준 dayKey)
CREATE TABLE psat_days (
  day TEXT PRIMARY KEY
);

-- 단축어 "학교 도착" 자동화가 보낸 시각
CREATE TABLE arrivals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL
);
