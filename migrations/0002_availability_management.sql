CREATE TABLE IF NOT EXISTS business_hours (
  weekday INTEGER NOT NULL CHECK(weekday BETWEEN 0 AND 6),
  period INTEGER NOT NULL CHECK(period IN (1, 2)),
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  PRIMARY KEY (weekday, period),
  CHECK(start_time < end_time)
);

INSERT OR IGNORE INTO business_hours (weekday, period, start_time, end_time) VALUES
(1, 1, '10:00', '14:00'), (1, 2, '16:00', '20:00'),
(2, 1, '10:00', '14:00'), (2, 2, '16:00', '20:00'),
(3, 1, '10:00', '14:00'), (3, 2, '16:00', '20:00'),
(4, 1, '10:00', '14:00'), (4, 2, '16:00', '20:00'),
(5, 1, '10:00', '14:00'), (5, 2, '16:00', '20:00');

CREATE TABLE IF NOT EXISTS availability_blocks (
  id TEXT PRIMARY KEY NOT NULL,
  start_at TEXT NOT NULL,
  end_at TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('vacaciones', 'personal')),
  label TEXT NOT NULL CHECK(length(label) <= 120),
  created_at TEXT NOT NULL,
  CHECK(start_at < end_at)
);

CREATE INDEX IF NOT EXISTS idx_availability_blocks_dates ON availability_blocks(start_at, end_at);
