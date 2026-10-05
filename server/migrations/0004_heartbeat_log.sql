-- 수집기 생존 신호 기록. 신호가 언제 끊겼는지 패턴을 보기 위해 7일치만 남긴다
CREATE TABLE heartbeat_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device TEXT NOT NULL,
  at TEXT NOT NULL
);
CREATE INDEX heartbeat_log_at ON heartbeat_log(at);
