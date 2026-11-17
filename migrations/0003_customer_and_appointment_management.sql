ALTER TABLE appointments ADD COLUMN customer_id TEXT;
ALTER TABLE appointments ADD COLUMN outcome TEXT NOT NULL DEFAULT 'Pendiente'
  CHECK(outcome IN ('Pendiente', 'Completada', 'No presentado'));
ALTER TABLE appointments ADD COLUMN internal_notes TEXT
  CHECK(internal_notes IS NULL OR length(internal_notes) <= 1000);

CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL CHECK(length(name) <= 100),
  phone TEXT NOT NULL CHECK(length(phone) <= 30),
  email TEXT CHECK(email IS NULL OR length(email) <= 150),
  notes TEXT CHECK(notes IS NULL OR length(notes) <= 1000),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);

INSERT OR IGNORE INTO customers (id, name, phone, email, notes, created_at, updated_at)
SELECT lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)),2) || '-a' || substr(hex(randomblob(2)),2) || '-' || hex(randomblob(6))),
       customer_name, phone, MAX(email), NULL, MIN(created_at), MAX(created_at)
FROM appointments
GROUP BY phone;

UPDATE appointments
SET customer_id = (SELECT id FROM customers WHERE customers.phone = appointments.phone)
WHERE customer_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_appointments_customer ON appointments(customer_id);
CREATE INDEX IF NOT EXISTS idx_appointments_outcome ON appointments(outcome);

CREATE TABLE IF NOT EXISTS appointment_history (
  id TEXT PRIMARY KEY NOT NULL,
  appointment_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK(length(action) <= 40),
  detail TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_appointment_history_appointment ON appointment_history(appointment_id, created_at);

CREATE TABLE IF NOT EXISTS waitlist (
  id TEXT PRIMARY KEY NOT NULL,
  customer_name TEXT NOT NULL CHECK(length(customer_name) <= 100),
  phone TEXT NOT NULL CHECK(length(phone) <= 30),
  service_id TEXT,
  preferred_date TEXT,
  preferred_time TEXT CHECK(preferred_time IS NULL OR preferred_time IN ('Mañana', 'Tarde', 'Indiferente')),
  notes TEXT CHECK(notes IS NULL OR length(notes) <= 500),
  status TEXT NOT NULL DEFAULT 'Pendiente' CHECK(status IN ('Pendiente', 'Avisado', 'Resuelto', 'Descartado')),
  created_at TEXT NOT NULL,
  FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_waitlist_status_date ON waitlist(status, preferred_date);

CREATE TABLE IF NOT EXISTS reminder_log (
  id TEXT PRIMARY KEY NOT NULL,
  appointment_id TEXT NOT NULL,
  reminder_type TEXT NOT NULL CHECK(reminder_type IN ('24h', 'same_day', 'manual')),
  sent_at TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'WhatsApp',
  FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_reminder_log_appointment ON reminder_log(appointment_id, sent_at);
