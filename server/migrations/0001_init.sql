-- 시각은 모두 UTC ISO 문자열. 날짜/주 계산은 코드(engine/time.ts)에서 한다.

-- 공기계가 보낸 알림 원문. 고치지 않고 쌓기만 한다
CREATE TABLE raw_notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  posted_at TEXT NOT NULL,
  title TEXT NOT NULL,
  text TEXT NOT NULL,
  received_at TEXT NOT NULL,
  parse_status TEXT NOT NULL, -- OK | UNKNOWN_FORMAT
  raw_key TEXT NOT NULL UNIQUE -- 업로드 재시도로 같은 알림이 또 와도 한 줄만 남긴다
);

-- 파싱된 거래 + 잔액 누락으로 만든 GAP 거래
CREATE TABLE transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  raw_id INTEGER REFERENCES raw_notifications(id),
  kind TEXT NOT NULL, -- CARD_APPROVAL | CARD_CANCEL | WITHDRAWAL | DEPOSIT | GAP
  amount INTEGER NOT NULL,
  counterparty TEXT NOT NULL,
  source TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  balance_after INTEGER,
  effect TEXT NOT NULL, -- SPEND | REFUND | EXCLUDE
  dedup_key TEXT NOT NULL UNIQUE
);
CREATE INDEX transactions_occurred_at ON transactions(occurred_at);

-- 공부 집중 모드 세션 (아이폰 단축어)
CREATE TABLE study_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  start_at TEXT NOT NULL,
  end_at TEXT
);

-- 다짱 운동 인증이 있는 날 (06:00 기준 dayKey)
CREATE TABLE exercise_days (
  day TEXT PRIMARY KEY
);

-- GitHub 커밋. 같은 커밋이 여러 브랜치에 푸시돼도 sha로 한 번만 센다
CREATE TABLE commits (
  sha TEXT PRIMARY KEY,
  committed_at TEXT NOT NULL
);

-- 지난주 보상을 월요일에 확정해 둔 값. 정산 뒤에 늦게 들어온 보상은 다음 확정 때 더한다
CREATE TABLE reward_freezes (
  week TEXT PRIMARY KEY, -- 보상이 발생한 주 (월요일 dayKey)
  amount INTEGER NOT NULL, -- 다음 주 예산에 들어간 금액
  earned_at_freeze INTEGER NOT NULL, -- 확정 시점에 계산된 그 주 보상
  frozen_at TEXT NOT NULL
);

-- 수집기 생존 신호
CREATE TABLE heartbeats (
  device TEXT PRIMARY KEY,
  last_seen TEXT NOT NULL
);
