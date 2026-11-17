CREATE TABLE IF NOT EXISTS services (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL CHECK(length(name) <= 100),
  description TEXT,
  price REAL,
  duration_minutes INTEGER,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
  display_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS appointments (
  id TEXT PRIMARY KEY NOT NULL,
  service_id TEXT NOT NULL,
  customer_name TEXT NOT NULL CHECK(length(customer_name) <= 100),
  phone TEXT NOT NULL CHECK(length(phone) <= 30),
  email TEXT CHECK(email IS NULL OR length(email) <= 150),
  notes TEXT CHECK(notes IS NULL OR length(notes) <= 500),
  requested_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('Pendiente', 'Confirmada', 'Rechazada', 'Cancelada')),
  created_at TEXT NOT NULL,
  FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_appointments_requested_status ON appointments(requested_at, status);
CREATE INDEX IF NOT EXISTS idx_appointments_service ON appointments(service_id);
CREATE INDEX IF NOT EXISTS idx_services_active_order ON services(is_active, display_order);

INSERT OR IGNORE INTO services (id, name, description, price, duration_minutes, is_active, display_order) VALUES
('11111111-1111-4111-8111-111111111101', 'Afeitado de barba', NULL, NULL, 30, 1, 1),
('11111111-1111-4111-8111-111111111102', 'Corte de barba', NULL, NULL, 30, 1, 2),
('11111111-1111-4111-8111-111111111103', 'Corte de pelo', NULL, NULL, 30, 1, 3),
('11111111-1111-4111-8111-111111111104', 'Corte de pelo y barba', NULL, NULL, 45, 1, 4),
('11111111-1111-4111-8111-111111111105', 'Cuidado de la barba', NULL, NULL, 30, 1, 5),
('11111111-1111-4111-8111-111111111106', 'Degradado', NULL, NULL, 30, 1, 6);

CREATE TRIGGER IF NOT EXISTS appointments_no_overlap_insert
BEFORE INSERT ON appointments
WHEN NEW.status IN ('Pendiente', 'Confirmada')
BEGIN
  SELECT RAISE(ABORT, 'APPOINTMENT_OVERLAP')
  WHERE EXISTS (
    SELECT 1 FROM appointments a
    JOIN services old_service ON old_service.id = a.service_id
    JOIN services new_service ON new_service.id = NEW.service_id
    WHERE a.status IN ('Pendiente', 'Confirmada')
      AND julianday(a.requested_at) < julianday(NEW.requested_at, '+' || COALESCE(new_service.duration_minutes, 30) || ' minutes')
      AND julianday(NEW.requested_at) < julianday(a.requested_at, '+' || COALESCE(old_service.duration_minutes, 30) || ' minutes')
  );
END;

CREATE TRIGGER IF NOT EXISTS appointments_no_overlap_update
BEFORE UPDATE OF status, requested_at, service_id ON appointments
WHEN NEW.status IN ('Pendiente', 'Confirmada')
BEGIN
  SELECT RAISE(ABORT, 'APPOINTMENT_OVERLAP')
  WHERE EXISTS (
    SELECT 1 FROM appointments a
    JOIN services old_service ON old_service.id = a.service_id
    JOIN services new_service ON new_service.id = NEW.service_id
    WHERE a.id <> NEW.id
      AND a.status IN ('Pendiente', 'Confirmada')
      AND julianday(a.requested_at) < julianday(NEW.requested_at, '+' || COALESCE(new_service.duration_minutes, 30) || ' minutes')
      AND julianday(NEW.requested_at) < julianday(a.requested_at, '+' || COALESCE(old_service.duration_minutes, 30) || ' minutes')
  );
END;
