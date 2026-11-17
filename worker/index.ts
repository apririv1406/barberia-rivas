export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  ADMIN_PASSWORD?: string;
  SESSION_SECRET?: string;
  SITE_URL?: string;
}

type ServiceRow = {
  id: string; name: string; description: string | null; price: number | null;
  durationMinutes: number | null; isActive: number; displayOrder: number;
};
type AppointmentRow = {
  id: string; serviceId: string; customerName: string; phone: string;
  email: string | null; notes: string | null; requestedAt: string;
  status: string; createdAt: string; serviceName: string;
  durationMinutes: number | null; price: number | null;
  customerId?: string | null; outcome?: string; internalNotes?: string | null;
};

const ACTIVE = ["Pendiente", "Confirmada"];
const STATUSES = ["Confirmada", "Rechazada", "Cancelada"];

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: { ...securityHeaders(), "Cache-Control": "no-store" } });
}
function securityHeaders(): Record<string, string> {
  return {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Frame-Options": "DENY",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()"
  };
}
function problem(title: string, status: number, detail?: string): Response {
  return json({ title, message: detail || title, status, ...(detail ? { detail } : {}) }, status);
}
function getCookie(request: Request, name: string): string | null {
  const cookie = request.headers.get("Cookie") || "";
  const match = cookie.split(";").map(v => v.trim()).find(v => v.startsWith(name + "="));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}
function base64Url(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach(value => binary += String.fromCharCode(value));
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
function fromBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized + "=".repeat((4 - normalized.length % 4) % 4));
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}
async function hmac(secret: string, value: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)));
}
async function createSession(secret: string, remember: boolean): Promise<string> {
  const payload = base64Url(new TextEncoder().encode(JSON.stringify({
    sub: "barberia-admin", exp: Math.floor(Date.now() / 1000) + (remember ? 30 : 10) * 86400
  })));
  return payload + "." + base64Url(await hmac(secret, payload));
}
async function validSession(request: Request, secret: string): Promise<boolean> {
  const token = getCookie(request, "br_admin");
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  try {
    const expected = await hmac(secret, parts[0]);
    const supplied = fromBase64Url(parts[1]);
    if (expected.length !== supplied.length || !expected.every((v, i) => v === supplied[i])) return false;
    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(parts[0])));
    return payload.sub === "barberia-admin" && Number(payload.exp) > Math.floor(Date.now() / 1000);
  } catch { return false; }
}
async function passwordMatches(supplied: string, expected: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const a = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(supplied)));
  const b = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(expected)));
  return a.length === b.length && a.every((value, index) => value === b[index]);
}
function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("Origin");
  return !origin || origin === new URL(request.url).origin;
}
function localNow(): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23"
  }).formatToParts(new Date());
  const get = (type: string) => parts.find(part => part.type === type)?.value || "";
  return get("year") + "-" + get("month") + "-" + get("day") + "T" + get("hour") + ":" + get("minute");
}
function localToday(): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(new Date());
  const get = (type: string) => parts.find(part => part.type === type)?.value || "";
  return get("year") + "-" + get("month") + "-" + get("day");
}
function validDateTime(value: unknown): value is string {
  return typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(value) &&
    !Number.isNaN(Date.parse(value));
}
type BusinessHour = { weekday: number; period: number; startTime: string; endTime: string };
async function getBusinessHours(env: Env): Promise<BusinessHour[]> {
  const result = await env.DB.prepare(
    "SELECT weekday, period, start_time AS startTime, end_time AS endTime FROM business_hours ORDER BY weekday, period"
  ).all<BusinessHour>();
  return result.results;
}
function weekdayFor(value: string): number {
  return new Date(value.slice(0, 10) + "T12:00:00Z").getUTCDay();
}
function timeMinutes(value: string): number {
  const parts = value.split(":").map(Number);
  return parts[0] * 60 + parts[1];
}
function fitsBusinessHours(value: string, duration: number, hours: BusinessHour[]): boolean {
  const weekday = weekdayFor(value);
  const start = timeMinutes(value.slice(11, 16));
  return hours.some(period => period.weekday === weekday &&
    start >= timeMinutes(period.startTime) &&
    start + duration <= timeMinutes(period.endTime));
}
async function isBlocked(env: Env, startAt: string, endAt: string): Promise<boolean> {
  const result = await env.DB.prepare(
    "SELECT id FROM availability_blocks WHERE start_at < ? AND end_at > ? LIMIT 1"
  ).bind(endAt, startAt).first<{ id: string }>();
  return !!result;
}
function clean(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const result = value.trim();
  return result && result.length <= max ? result : null;
}
function dateQuery(value: string | null): string | null {
  if (!value) return null;
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value) ? value : null;
}
async function adminOnly(request: Request, env: Env): Promise<Response | null> {
  if (!env.SESSION_SECRET) return problem("Panel no configurado", 503, "Falta configurar SESSION_SECRET en Cloudflare.");
  return await validSession(request, env.SESSION_SECRET) ? null : problem("No has iniciado sesión", 401);
}
async function asset(request: Request, env: Env, path?: string): Promise<Response> {
  const url = new URL(request.url);
  if (path) url.pathname = path;
  const response = await env.ASSETS.fetch(new Request(url, request));
  const headers = new Headers(response.headers);
  Object.entries(securityHeaders()).forEach(([key, value]) => headers.set(key, value));
  return new Response(response.body, { status: response.status, headers });
}
async function listServices(env: Env): Promise<ServiceRow[]> {
  const result = await env.DB.prepare(
    "SELECT id, name, description, price, duration_minutes AS durationMinutes, is_active AS isActive, display_order AS displayOrder FROM services WHERE is_active = 1 ORDER BY display_order, name"
  ).all<ServiceRow>();
  return result.results;
}
async function getAppointment(env: Env, id: string): Promise<AppointmentRow | null> {
  return await env.DB.prepare(`
    SELECT a.id, a.service_id AS serviceId, a.customer_id AS customerId, a.customer_name AS customerName, a.phone,
      a.email, a.notes, a.internal_notes AS internalNotes, a.outcome, a.requested_at AS requestedAt, a.status, a.created_at AS createdAt,
      s.name AS serviceName, s.duration_minutes AS durationMinutes, s.price
    FROM appointments a JOIN services s ON s.id = a.service_id WHERE a.id = ?
  `).bind(id).first<AppointmentRow>();
}

async function availability(env: Env, date: string, serviceId: string): Promise<Response> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date + "T12:00:00Z")))
    return problem("Fecha no válida", 400, "Selecciona una fecha válida.");
  if (!/^[0-9a-f-]{36}$/i.test(serviceId))
    return problem("Servicio no válido", 400, "Selecciona un servicio.");

  const service = await env.DB.prepare(
    "SELECT duration_minutes AS durationMinutes FROM services WHERE id = ? AND is_active = 1"
  ).bind(serviceId).first<{ durationMinutes: number | null }>();
  if (!service) return problem("Servicio no disponible", 400, "El servicio seleccionado no está disponible.");

  const duration = service.durationMinutes && service.durationMinutes > 0 ? service.durationMinutes : 30;
  const lastDate = new Date(date + "T12:00:00Z");
  lastDate.setUTCDate(lastDate.getUTCDate() + 61);
  const lastDay = lastDate.toISOString().slice(0, 10);
  const occupied = await env.DB.prepare(`
    SELECT a.requested_at AS requestedAt, COALESCE(s.duration_minutes, 30) AS durationMinutes
    FROM appointments a LEFT JOIN services s ON s.id = a.service_id
    WHERE a.requested_at >= ? AND a.requested_at < ?
      AND a.status IN ('Pendiente', 'Confirmada')
  `).bind(date + "T00:00:00", lastDay + "T00:00:00").all<{ requestedAt: string; durationMinutes: number }>();
  const hours = await getBusinessHours(env);
  const blocks = await env.DB.prepare(
    "SELECT start_at AS startAt, end_at AS endAt FROM availability_blocks WHERE start_at < ? AND end_at > ?"
  ).bind(lastDay + "T00:00:00", date + "T00:00:00").all<{ startAt: string; endAt: string }>();

  const now = localNow();
  const availableTimes: string[] = [];
  let nextAvailable: string | null = null;
  for (let offset = 0; offset <= 60; offset++) {
    if (offset > 0 && nextAvailable) break;
    const dayDate = new Date(date + "T12:00:00Z");
    dayDate.setUTCDate(dayDate.getUTCDate() + offset);
    const day = dayDate.toISOString().slice(0, 10);
    const weekday = dayDate.getUTCDay();
    const periods = hours.filter(item => item.weekday === weekday)
      .sort((a, b) => a.period - b.period);
    for (const period of periods) {
      const periodStart = timeMinutes(period.startTime);
      const periodEnd = timeMinutes(period.endTime);
      for (let minute = periodStart; minute < periodEnd; minute += 30) {
        const hour = String(Math.floor(minute / 60)).padStart(2, "0");
        const mins = String(minute % 60).padStart(2, "0");
        const candidate = day + "T" + hour + ":" + mins;
        if (candidate <= now || minute + duration > periodEnd) continue;
        const candidateStart = Date.parse(candidate + ":00Z");
        const candidateEnd = candidateStart + duration * 60000;
        const overlapsAppointment = occupied.results.some(item => {
          const start = Date.parse(item.requestedAt.replace(" ", "T") + (item.requestedAt.length === 16 ? ":00" : "") + "Z");
          const end = start + (item.durationMinutes > 0 ? item.durationMinutes : 30) * 60000;
          return candidateStart < end && candidateEnd > start;
        });
        const overlapsBlock = blocks.results.some(item => {
          const start = Date.parse(item.startAt.replace(" ", "T") + (item.startAt.length === 16 ? ":00" : "") + "Z");
          const end = Date.parse(item.endAt.replace(" ", "T") + (item.endAt.length === 16 ? ":00" : "") + "Z");
          return candidateStart < end && candidateEnd > start;
        });
        if (overlapsAppointment || overlapsBlock) continue;
        if (offset === 0) availableTimes.push(hour + ":" + mins);
        if (!nextAvailable) nextAvailable = candidate;
      }
    }
  }
  return json({ date, availableTimes, nextAvailable });
}

async function createAppointment(env: Env, body: Record<string, unknown>, manual: boolean): Promise<Response> {
  const name = clean(body.name, 100);
  const phone = clean(body.phone, 30);
  const email = body.email == null || body.email === "" ? null : clean(body.email, 150);
  const notes = body.notes == null || body.notes === "" ? null : clean(body.notes, 500);
  const serviceId = typeof body.serviceId === "string" ? body.serviceId : "";
  const requestedAt = body.requestedAt;
  if (!name || !phone || (body.notes && !notes))
    return problem("Datos no válidos", 400, "Revisa el nombre, teléfono y observaciones.");
  if (!/^[0-9a-f-]{36}$/i.test(serviceId)) return problem("Servicio no válido", 400, "Selecciona uno de nuestros servicios.");
  if (!validDateTime(requestedAt)) return problem("Fecha u hora no válida", 400, "Selecciona una fecha y hora válidas.");
  const service = await env.DB.prepare("SELECT id, duration_minutes AS durationMinutes FROM services WHERE id = ? AND is_active = 1")
    .bind(serviceId).first<{ id: string; durationMinutes: number | null }>();
  if (!service) return problem("Servicio no disponible", 400, "El servicio seleccionado ya no está disponible.");
  const duration = service.durationMinutes && service.durationMinutes > 0 ? service.durationMinutes : 30;
  const hours = await getBusinessHours(env);
  const endAt = new Date(Date.parse(requestedAt.slice(0, 16) + ":00Z") + duration * 60000)
    .toISOString().slice(0, 16);
  if (requestedAt.slice(0, 16) <= localNow() || !fitsBusinessHours(requestedAt, duration, hours))
    return problem("Horario no válido", 400, "La fecha y hora no están dentro del horario de atención configurado.");
  if (await isBlocked(env, requestedAt.slice(0, 16), endAt))
    return problem("Horario no disponible", 409, "Ese horario está reservado o la barbería permanece cerrada.");
  const status = manual && body.confirm === false ? "Pendiente" : manual ? "Confirmada" : "Pendiente";
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const customerId = crypto.randomUUID();
  await env.DB.prepare("INSERT INTO customers (id, name, phone, email, notes, created_at, updated_at) VALUES (?, ?, ?, ?, NULL, ?, ?) ON CONFLICT(phone) DO UPDATE SET name = excluded.name, email = COALESCE(excluded.email, customers.email), updated_at = excluded.updated_at")
    .bind(customerId, name, phone, email, now, now).run();
  const customer = await env.DB.prepare("SELECT id FROM customers WHERE phone = ?").bind(phone).first<{ id: string }>();
  try {
    await env.DB.prepare("INSERT INTO appointments (id, service_id, customer_id, customer_name, phone, email, notes, requested_at, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(id, serviceId, customer?.id || customerId, name, phone, email, notes, requestedAt.length === 16 ? requestedAt + ":00" : requestedAt, status, now).run();
    await env.DB.prepare("INSERT INTO appointment_history (id, appointment_id, action, detail, created_at) VALUES (?, ?, 'Creada', ?, ?)")
      .bind(crypto.randomUUID(), id, manual ? "Cita creada desde administración" : "Solicitud recibida desde la web", now).run();
  } catch (error) {
    const message = String(error);
    if (message.includes("APPOINTMENT_OVERLAP")) return problem("Horario ocupado", 409, "Ese horario se solapa con otra cita pendiente o confirmada.");
    throw error;
  }
  return json({ id, status: status.toLowerCase(), message: manual ? "Cita guardada correctamente." : "Hemos recibido tu solicitud. La barbería tiene que confirmar la cita." }, 201);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method.toUpperCase();

    try {
      if (path === "/api/health" && method === "GET") return json({ status: "ok", application: "Barbería Rivas", timestamp: new Date().toISOString(), database: "Cloudflare D1" });
      if (path === "/robots.txt" && method === "GET") {
        return new Response("User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\nSitemap: " + (env.SITE_URL || url.origin).replace(/\/$/, "") + "/sitemap.xml\n", {
          headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" }
        });
      }
      if (path === "/sitemap.xml" && method === "GET") {
        const base = (env.SITE_URL || url.origin).replace(/\/$/, "");
        return new Response('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>' + base + '/</loc></url></urlset>', {
          headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" }
        });
      }
      if ((path === "/" || path === "/index.html") && method === "GET") return asset(request, env, "/index.html");
      if ((path === "/admin" || path === "/admin/") && method === "GET") {
        const response = await asset(request, env, "/admin.html");
        const headers = new Headers(response.headers);
        headers.set("X-Robots-Tag", "noindex, nofollow");
        return new Response(response.body, { status: response.status, headers });
      }
      if (path === "/api/availability" && method === "GET") {
        const date = url.searchParams.get("date") || "";
        const serviceId = url.searchParams.get("serviceId") || "";
        return await availability(env, date, serviceId);
      }
      if (path === "/api/hours" && method === "GET") return json(await getBusinessHours(env));
      if (path === "/api/services" && method === "GET") return json(await listServices(env));
      if (path === "/api/appointments" && method === "POST") {
        if (!isSameOrigin(request)) return problem("Origen no permitido", 403);
        return await createAppointment(env, await request.json() as Record<string, unknown>, false);
      }
      if (path === "/api/admin/login" && method === "POST") {
        if (!isSameOrigin(request) || request.headers.get("X-Requested-With") !== "fetch") return problem("Solicitud no permitida", 403);
        if (!env.ADMIN_PASSWORD || !env.SESSION_SECRET) return problem("Acceso de administración sin configurar", 503, "Configura ADMIN_PASSWORD y SESSION_SECRET en los secretos del Worker.");
        const body = await request.json() as Record<string, unknown>;
        const supplied = typeof body.password === "string" ? body.password : "";
        if (!await passwordMatches(supplied, env.ADMIN_PASSWORD)) return problem("Contraseña incorrecta", 401);
        const remember = body.remember === true;
        const token = await createSession(env.SESSION_SECRET, remember);
        const maxAge = remember ? 30 * 86400 : 10 * 3600;
        return new Response(JSON.stringify({ authenticated: true }), {
          headers: { ...securityHeaders(), "Content-Type": "application/json", "Set-Cookie": "br_admin=" + encodeURIComponent(token) + "; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=" + maxAge }
        });
      }
      if (path.startsWith("/api/admin/")) {
        const authError = await adminOnly(request, env);
        if (authError) return authError;
        if (method !== "GET" && (!isSameOrigin(request) || request.headers.get("X-Requested-With") !== "fetch"))
          return problem("Solicitud no permitida", 403);

        if (path === "/api/admin/me" && method === "GET") return json({ authenticated: true, name: "Administración Barbería Rivas" });
        if (path === "/api/admin/availability" && method === "GET") {
          const hours = await env.DB.prepare("SELECT weekday, period, start_time AS startTime, end_time AS endTime FROM business_hours ORDER BY weekday, period").all<BusinessHour>();
          const blocks = await env.DB.prepare("SELECT id, start_at AS startAt, end_at AS endAt, kind, label FROM availability_blocks ORDER BY start_at").all();
          return json({ hours: hours.results, blocks: blocks.results });
        }
        if (path === "/api/admin/availability/hours" && method === "PUT") {
          const body = await request.json() as Record<string, unknown>;
          const rows = Array.isArray(body.hours) ? body.hours as Record<string, unknown>[] : [];
          if (rows.length > 14 || rows.some(row =>
            !Number.isInteger(row.weekday) || Number(row.weekday) < 0 || Number(row.weekday) > 6 ||
            ![1, 2].includes(Number(row.period)) ||
            typeof row.startTime !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(row.startTime) ||
            typeof row.endTime !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(row.endTime) ||
            row.startTime >= row.endTime))
            return problem("Horario no válido", 400, "Revisa los días y las horas. La hora de fin debe ser posterior a la de inicio.");
          for (let index = 0; index < rows.length; index++) {
            for (let other = index + 1; other < rows.length; other++) {
              const first = rows[index];
              const second = rows[other];
              if (Number(first.weekday) === Number(second.weekday) &&
                  String(first.startTime) < String(second.endTime) &&
                  String(second.startTime) < String(first.endTime))
                return problem("Turnos solapados", 400, "Los dos turnos de un mismo día no pueden coincidir.");
            }
          }
          const batch = [
            env.DB.prepare("DELETE FROM business_hours"),
            ...rows.map(row => env.DB.prepare("INSERT INTO business_hours (weekday, period, start_time, end_time) VALUES (?, ?, ?, ?)")
              .bind(Number(row.weekday), Number(row.period), row.startTime as string, row.endTime as string))
          ];
          await env.DB.batch(batch);
          return json({ message: "Horario de atención actualizado." });
        }
        if (path === "/api/admin/availability/blocks" && method === "POST") {
          const body = await request.json() as Record<string, unknown>;
          const startAt = typeof body.startAt === "string" ? body.startAt : "";
          const endAt = typeof body.endAt === "string" ? body.endAt : "";
          const kind = body.kind === "vacaciones" ? "vacaciones" : body.kind === "personal" ? "personal" : "";
          const label = clean(body.label, 120);
          if (!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d$/.test(startAt) ||
              !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d$/.test(endAt) ||
              startAt >= endAt || !kind || !label)
            return problem("Datos no válidos", 400, "Indica un periodo correcto y un motivo.");
          const conflict = await env.DB.prepare(`
            SELECT a.id FROM appointments a JOIN services s ON s.id = a.service_id
            WHERE a.status IN ('Pendiente', 'Confirmada')
              AND datetime(a.requested_at, '+' || COALESCE(s.duration_minutes, 30) || ' minutes') > datetime(?)
              AND a.requested_at < ? LIMIT 1
          `).bind(startAt, endAt).first<{ id: string }>();
          if (conflict) return problem("Hay citas en ese periodo", 409, "Antes de cerrar este horario, cambia o cancela las citas que ya estén reservadas.");
          const id = crypto.randomUUID();
          await env.DB.prepare("INSERT INTO availability_blocks (id, start_at, end_at, kind, label, created_at) VALUES (?, ?, ?, ?, ?, ?)")
            .bind(id, startAt, endAt, kind, label, new Date().toISOString()).run();
          return json({ id, message: "Periodo bloqueado correctamente." }, 201);
        }
        const blockMatch = path.match(/^\/api\/admin\/availability\/blocks\/([0-9a-f-]{36})$/i);
        if (blockMatch && method === "DELETE") {
          const result = await env.DB.prepare("DELETE FROM availability_blocks WHERE id = ?").bind(blockMatch[1]).run();
          if (!result.meta.changes) return problem("Periodo no encontrado", 404);
          return json({ message: "Periodo eliminado. El horario vuelve a estar disponible." });
        }
        if (path === "/api/admin/logout" && method === "POST") {
          return new Response(JSON.stringify({ authenticated: false }), {
            headers: { ...securityHeaders(), "Content-Type": "application/json", "Set-Cookie": "br_admin=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0" }
          });
        }
        if (path === "/api/admin/services" && method === "GET") {
          const rows = await env.DB.prepare(
            "SELECT id, name, description, price, duration_minutes AS durationMinutes, is_active AS isActive, display_order AS displayOrder FROM services ORDER BY is_active DESC, display_order, name"
          ).all<ServiceRow>();
          return json(rows.results);
        }
        if (path === "/api/admin/services" && method === "POST") {
          const body = await request.json() as Record<string, unknown>;
          const name = clean(body.name, 100);
          const description = body.description == null || body.description === "" ? null : clean(body.description, 500);
          const price = body.price == null || body.price === "" ? null : Number(body.price);
          const duration = body.durationMinutes == null || body.durationMinutes === "" ? null : Number(body.durationMinutes);
          const displayOrder = body.displayOrder == null || body.displayOrder === "" ? 0 : Number(body.displayOrder);
          if (!name || (body.description && !description) ||
              (price !== null && (!Number.isFinite(price) || price < 0 || price > 100000)) ||
              (duration !== null && (!Number.isInteger(duration) || duration < 5 || duration > 480)) ||
              !Number.isInteger(displayOrder) || displayOrder < 0 || displayOrder > 999)
            return problem("Datos no válidos", 400, "Revisa el nombre, descripción, precio, duración y orden del servicio.");
          const id = crypto.randomUUID();
          await env.DB.prepare(
            "INSERT INTO services (id, name, description, price, duration_minutes, is_active, display_order) VALUES (?, ?, ?, ?, ?, 1, ?)"
          ).bind(id, name, description, price, duration, displayOrder).run();
          return json({ id, message: "Servicio creado correctamente." }, 201);
        }
        const serviceMatch = path.match(/^\/api\/admin\/services\/([0-9a-f-]{36})$/i);
        if (serviceMatch && method === "PATCH") {
          const body = await request.json() as Record<string, unknown>;
          const current = await env.DB.prepare(
            "SELECT id, name, description, price, duration_minutes AS durationMinutes, is_active AS isActive, display_order AS displayOrder FROM services WHERE id = ?"
          ).bind(serviceMatch[1]).first<ServiceRow>();
          if (!current) return problem("Servicio no encontrado", 404);
          const name = body.name === undefined ? current.name : clean(body.name, 100);
          const description = body.description === undefined ? current.description : (body.description === "" || body.description === null ? null : clean(body.description, 500));
          const price = body.price === undefined ? current.price : (body.price === "" || body.price === null ? null : Number(body.price));
          const duration = body.durationMinutes === undefined ? current.durationMinutes : (body.durationMinutes === "" || body.durationMinutes === null ? null : Number(body.durationMinutes));
          const displayOrder = body.displayOrder === undefined ? current.displayOrder : Number(body.displayOrder);
          const isActive = body.isActive === undefined ? current.isActive : (body.isActive === true ? 1 : body.isActive === false ? 0 : -1);
          if (!name || (body.description !== undefined && body.description && !description) ||
              (price !== null && (!Number.isFinite(price) || price < 0 || price > 100000)) ||
              (duration !== null && (!Number.isInteger(duration) || duration < 5 || duration > 480)) ||
              !Number.isInteger(displayOrder) || displayOrder < 0 || displayOrder > 999 ||
              ![0, 1].includes(isActive))
            return problem("Datos no válidos", 400, "Revisa los datos del servicio. La duración debe estar entre 5 y 480 minutos.");
          await env.DB.prepare(
            "UPDATE services SET name = ?, description = ?, price = ?, duration_minutes = ?, is_active = ?, display_order = ? WHERE id = ?"
          ).bind(name, description, price, duration, isActive, displayOrder, serviceMatch[1]).run();
          return json({ id: serviceMatch[1], message: "Servicio actualizado correctamente." });
        }
        if (path === "/api/admin/summary" && method === "GET") {
          const today = url.searchParams.get("day") || localToday();
          const rows = await env.DB.prepare("SELECT requested_at AS requestedAt, status FROM appointments WHERE substr(requested_at, 1, 10) = ?").bind(today).all<{ requestedAt: string; status: string }>();
          const pending = await env.DB.prepare("SELECT COUNT(*) AS count FROM appointments WHERE status = 'Pendiente'").first<{ count: number }>();
          return json({
            pending: pending?.count || 0,
            today: rows.results.filter(item => ACTIVE.includes(item.status)).length,
            confirmedToday: rows.results.filter(item => item.status === "Confirmada").length,
            day: today
          });
        }
        if (path === "/api/admin/appointments" && method === "GET") {
          const from = dateQuery(url.searchParams.get("from"));
          const to = dateQuery(url.searchParams.get("to"));
          const status = url.searchParams.get("status");
          let sql = `
            SELECT a.id, a.service_id AS serviceId, a.customer_id AS customerId, a.customer_name AS customerName, a.phone,
              a.email, a.notes, a.internal_notes AS internalNotes, a.outcome, a.requested_at AS requestedAt, a.status, a.created_at AS createdAt,
              s.name AS serviceName, s.duration_minutes AS durationMinutes, s.price
            FROM appointments a JOIN services s ON s.id = a.service_id WHERE 1 = 1`;
          const values: string[] = [];
          if (from) { sql += " AND a.requested_at >= ?"; values.push(from); }
          if (to) { sql += " AND a.requested_at < ?"; values.push(to); }
          if (status && status !== "Todas") { sql += " AND a.status = ?"; values.push(status); }
          sql += " ORDER BY a.requested_at";
          const statement = env.DB.prepare(sql);
          const rows = await (values.length ? statement.bind(...values) : statement).all<AppointmentRow>();
          return json(rows.results);
        }
        if (path === "/api/admin/customers" && method === "GET") {
          const q = (url.searchParams.get("q") || "").trim().slice(0, 100);
          const rows = await env.DB.prepare("SELECT c.id, c.name, c.phone, c.email, c.notes, c.created_at AS createdAt, c.updated_at AS updatedAt, COUNT(a.id) AS appointmentCount, MAX(a.requested_at) AS lastAppointment FROM customers c LEFT JOIN appointments a ON a.customer_id = c.id WHERE (? = '' OR c.name LIKE '%' || ? || '%' OR c.phone LIKE '%' || ? || '%') GROUP BY c.id ORDER BY c.name LIMIT 200").bind(q, q, q).all();
          return json(rows.results);
        }
        if (path === "/api/admin/customers" && method === "POST") {
          const body = await request.json() as Record<string, unknown>;
          const name = clean(body.name, 100), phone = clean(body.phone, 30);
          const email = body.email == null || body.email === "" ? null : clean(body.email, 150);
          const notes = body.notes == null || body.notes === "" ? null : clean(body.notes, 1000);
          if (!name || !phone || (body.email && !email) || (body.notes && !notes)) return problem("Datos no válidos", 400, "Indica un nombre y teléfono válidos.");
          const now = new Date().toISOString(), id = crypto.randomUUID();
          await env.DB.prepare("INSERT INTO customers (id, name, phone, email, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(phone) DO UPDATE SET name = excluded.name, email = excluded.email, notes = excluded.notes, updated_at = excluded.updated_at").bind(id, name, phone, email, notes, now, now).run();
          return json(await env.DB.prepare("SELECT id, name, phone, email, notes FROM customers WHERE phone = ?").bind(phone).first(), 201);
        }
        const customerMatch = path.match(/^\/api\/admin\/customers\/([0-9a-f-]{36})$/i);
        if (customerMatch && method === "GET") {
          const customer = await env.DB.prepare("SELECT id, name, phone, email, notes, created_at AS createdAt, updated_at AS updatedAt FROM customers WHERE id = ?").bind(customerMatch[1]).first();
          if (!customer) return problem("Cliente no encontrado", 404);
          const appointments = await env.DB.prepare("SELECT a.id, a.customer_name AS customerName, a.phone, a.requested_at AS requestedAt, a.status, a.outcome, s.name AS serviceName, s.duration_minutes AS durationMinutes, s.price FROM appointments a JOIN services s ON s.id = a.service_id WHERE a.customer_id = ? ORDER BY a.requested_at DESC LIMIT 100").bind(customerMatch[1]).all();
          return json({ customer, appointments: appointments.results });
        }
        if (customerMatch && method === "PATCH") {
          const body = await request.json() as Record<string, unknown>;
          const current = await env.DB.prepare("SELECT id, name, phone, email, notes FROM customers WHERE id = ?").bind(customerMatch[1]).first<{id:string;name:string;phone:string;email:string|null;notes:string|null}>();
          if (!current) return problem("Cliente no encontrado", 404);
          const name = body.name === undefined ? current.name : clean(body.name, 100);
          const phone = body.phone === undefined ? current.phone : clean(body.phone, 30);
          const email = body.email === undefined ? current.email : (body.email === "" || body.email === null ? null : clean(body.email, 150));
          const notes = body.notes === undefined ? current.notes : (body.notes === "" || body.notes === null ? null : clean(body.notes, 1000));
          if (!name || !phone || (body.email && !email) || (body.notes && !notes)) return problem("Datos no válidos", 400, "Revisa los datos del cliente.");
          try {
            await env.DB.prepare("UPDATE customers SET name = ?, phone = ?, email = ?, notes = ?, updated_at = ? WHERE id = ?").bind(name, phone, email, notes, new Date().toISOString(), customerMatch[1]).run();
            await env.DB.prepare("UPDATE appointments SET customer_name = ?, phone = ?, email = ? WHERE customer_id = ?").bind(name, phone, email, customerMatch[1]).run();
          } catch (error) {
            if (String(error).includes("UNIQUE")) return problem("Teléfono ya registrado", 409, "Ese teléfono pertenece a otro cliente.");
            throw error;
          }
          return json({ message: "Cliente actualizado." });
        }
        if (path === "/api/admin/waitlist" && method === "GET") {
          const rows = await env.DB.prepare("SELECT w.id, w.customer_name AS customerName, w.phone, w.service_id AS serviceId, s.name AS serviceName, w.preferred_date AS preferredDate, w.preferred_time AS preferredTime, w.notes, w.status, w.created_at AS createdAt FROM waitlist w LEFT JOIN services s ON s.id = w.service_id WHERE w.status IN ('Pendiente', 'Avisado') ORDER BY w.created_at").all();
          return json(rows.results);
        }
        if (path === "/api/admin/waitlist" && method === "POST") {
          const body = await request.json() as Record<string, unknown>;
          const name = clean(body.name, 100), phone = clean(body.phone, 30);
          const serviceId = body.serviceId ? String(body.serviceId) : null;
          const preferredDate = body.preferredDate ? String(body.preferredDate) : null;
          const preferredTime = body.preferredTime ? String(body.preferredTime) : null;
          const notes = body.notes == null || body.notes === "" ? null : clean(body.notes, 500);
          if (!name || !phone || (preferredDate && !/^\d{4}-\d{2}-\d{2}$/.test(preferredDate)) || (preferredTime && !["Mañana", "Tarde", "Indiferente"].includes(preferredTime)) || (serviceId && !/^[0-9a-f-]{36}$/i.test(serviceId)) || (body.notes && !notes)) return problem("Datos no válidos", 400, "Revisa los datos de la lista de espera.");
          const id = crypto.randomUUID();
          await env.DB.prepare("INSERT INTO waitlist (id, customer_name, phone, service_id, preferred_date, preferred_time, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(id, name, phone, serviceId, preferredDate, preferredTime, notes, new Date().toISOString()).run();
          return json({ id, message: "Añadido a la lista de espera." }, 201);
        }
        const waitlistMatch = path.match(/^\/api\/admin\/waitlist\/([0-9a-f-]{36})$/i);
        if (waitlistMatch && method === "PATCH") {
          const body = await request.json() as Record<string, unknown>;
          if (!["Pendiente", "Avisado", "Resuelto", "Descartado"].includes(String(body.status))) return problem("Estado no válido", 400);
          const result = await env.DB.prepare("UPDATE waitlist SET status = ? WHERE id = ?").bind(body.status, waitlistMatch[1]).run();
          if (!result.meta.changes) return problem("Registro no encontrado", 404);
          return json({ message: "Lista de espera actualizada." });
        }
        if (waitlistMatch && method === "DELETE") {
          await env.DB.prepare("DELETE FROM waitlist WHERE id = ?").bind(waitlistMatch[1]).run();
          return json({ message: "Registro eliminado." });
        }
        const resultMatch = path.match(/^\/api\/admin\/appointments\/([0-9a-f-]{36})\/result$/i);
        if (resultMatch && method === "PATCH") {
          const body = await request.json() as Record<string, unknown>;
          if (!["Pendiente", "Completada", "No presentado"].includes(String(body.outcome))) return problem("Resultado no válido", 400);
          const result = await env.DB.prepare("UPDATE appointments SET outcome = ? WHERE id = ? AND status = 'Confirmada'").bind(body.outcome, resultMatch[1]).run();
          if (!result.meta.changes) return problem("Cita no encontrada", 404, "Solo puedes registrar el resultado de una cita confirmada.");
          await env.DB.prepare("INSERT INTO appointment_history (id, appointment_id, action, detail, created_at) VALUES (?, ?, ?, ?, ?)").bind(crypto.randomUUID(), resultMatch[1], body.outcome, "Resultado de la cita actualizado", new Date().toISOString()).run();
          return json({ message: "Resultado de la cita actualizado." });
        }
        const editAppointmentMatch = path.match(/^\/api\/admin\/appointments\/([0-9a-f-]{36})$/i);
        if (editAppointmentMatch && method === "PATCH") {
          const body = await request.json() as Record<string, unknown>;
          const current = await getAppointment(env, editAppointmentMatch[1]);
          if (!current) return problem("Cita no encontrada", 404);
          const name = body.name === undefined ? current.customerName : clean(body.name, 100);
          const phone = body.phone === undefined ? current.phone : clean(body.phone, 30);
          const serviceId = body.serviceId === undefined ? current.serviceId : String(body.serviceId);
          const requestedAt = body.requestedAt === undefined ? current.requestedAt : body.requestedAt;
          const notes = body.notes === undefined ? current.notes : (body.notes === "" || body.notes === null ? null : clean(body.notes, 500));
          const internalNotes = body.internalNotes === undefined ? current.internalNotes : (body.internalNotes === "" || body.internalNotes === null ? null : clean(body.internalNotes, 1000));
          if (!name || !phone || !/^[0-9a-f-]{36}$/i.test(serviceId) || !validDateTime(requestedAt) || (body.notes && !notes) || (body.internalNotes && !internalNotes))
            return problem("Datos no válidos", 400, "Revisa los datos de la cita.");
          const service = await env.DB.prepare("SELECT duration_minutes AS durationMinutes FROM services WHERE id = ?").bind(serviceId).first<{durationMinutes:number|null}>();
          if (!service) return problem("Servicio no encontrado", 404);
          const duration = service.durationMinutes && service.durationMinutes > 0 ? service.durationMinutes : 30;
          const endAt = new Date(Date.parse(requestedAt.slice(0,16) + ":00Z") + duration * 60000).toISOString().slice(0,16);
          if (current.status === "Confirmada" || current.status === "Pendiente") {
            if (!fitsBusinessHours(requestedAt, duration, await getBusinessHours(env))) return problem("Horario no válido", 400, "La cita debe estar dentro del horario de atención.");
            if (await isBlocked(env, requestedAt.slice(0,16), endAt)) return problem("Horario bloqueado", 409, "Ese periodo está cerrado o reservado.");
          }
          try {
            await env.DB.prepare("UPDATE appointments SET service_id = ?, customer_name = ?, phone = ?, requested_at = ?, notes = ?, internal_notes = ? WHERE id = ?")
              .bind(serviceId, name, phone, requestedAt, notes, internalNotes, editAppointmentMatch[1]).run();
          } catch (error) {
            if (String(error).includes("APPOINTMENT_OVERLAP")) return problem("Horario ocupado", 409, "El cambio se solapa con otra cita.");
            throw error;
          }
          if (current.customerId) {
            await env.DB.prepare("UPDATE customers SET name = ?, phone = ?, updated_at = ? WHERE id = ?")
              .bind(name, phone, new Date().toISOString(), current.customerId).run();
          }
          await env.DB.prepare("INSERT INTO appointment_history (id, appointment_id, action, detail, created_at) VALUES (?, ?, 'Modificada', ?, ?)")
            .bind(crypto.randomUUID(), editAppointmentMatch[1], "Se modificaron los datos de la cita", new Date().toISOString()).run();
          return json({ message: "Cita actualizada correctamente." });
        }
        if (path === "/api/admin/appointment-history" && method === "GET") {
          const appointmentId = url.searchParams.get("appointmentId") || "";
          if (!/^[0-9a-f-]{36}$/i.test(appointmentId)) return problem("Cita no válida", 400);
          const rows = await env.DB.prepare("SELECT action, detail, created_at AS createdAt FROM appointment_history WHERE appointment_id = ? ORDER BY created_at DESC").bind(appointmentId).all();
          return json(rows.results);
        }
        const statusMatch = path.match(/^\/api\/admin\/appointments\/([0-9a-f-]{36})\/status$/i);
        if (statusMatch && method === "PATCH") {
          const body = await request.json() as Record<string, unknown>;
          const status = body.status;
          if (typeof status !== "string" || !STATUSES.includes(status)) return problem("Estado no válido", 400);
          try {
            const result = await env.DB.prepare("UPDATE appointments SET status = ? WHERE id = ?")
              .bind(status, statusMatch[1]).run();
            if (!result.meta.changes) return problem("Cita no encontrada", 404);
          } catch (error) {
            if (String(error).includes("APPOINTMENT_OVERLAP")) return problem("No se puede confirmar", 409, "Ese horario se solapa con otra cita pendiente o confirmada.");
            throw error;
          }
          return json({ id: statusMatch[1], status });
        }
        return problem("Recurso no encontrado", 404);
      }

      return asset(request, env);
    } catch (error) {
      console.error("Worker error:", error);
      return problem("Error interno", 500, "No se ha podido completar la operación. Inténtalo de nuevo.");
    }
  }
};
