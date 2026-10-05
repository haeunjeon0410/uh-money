-- 도착 기록을 종류별로 구분한다 (기존 행은 학교)
ALTER TABLE arrivals ADD COLUMN kind TEXT NOT NULL DEFAULT 'SCHOOL'; -- SCHOOL | CAFE
