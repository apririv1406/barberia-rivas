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
function withinBusinessHours(value: string, duration: number): boolean {
  const date = new Date(value.slice(0, 10) + "T12:00:00");
  const weekday = date.getDay();
  if (weekday === 0 || weekday === 6) return false;
  const [hour, minute] = value.slice(11, 16).split(":").map(Number);
  const start = hour * 60 + minute;
  const end = start + duration;
  return (start >= 600 && end <= 840) || (start >= 960 && end <= 1200);
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
    SELECT a.id, a.service_id AS serviceId, a.customer_name AS customerName, a.phone,
      a.email, a.notes, a.requested_at AS requestedAt, a.status, a.created_at AS createdAt,
      s.name AS serviceName, s.duration_minutes AS durationMinutes, s.price
    FROM appointments a JOIN services s ON s.id = a.service_id WHERE a.id = ?
  `).bind(id).first<AppointmentRow>();
}
async function createAppointment(env: Env, body: Record<string, unknown>, manual: boolean): Promise<Response> {
  const name = clean(body.name, 100);
  const phone = clean(body.phone, 30);
  const email = body.email == null || body.email === "" ? null : clean(body.email, 150);
  const notes = body.notes == null || body.notes === "" ? null : clean(body.notes, 500);
  const serviceId = typeof body.serviceId === "string" ? body.serviceId : "";
  const requestedAt = body.requestedAt;
  if (!name || !phone || (body.email && !email) || (body.notes && !notes))
    return problem("Datos no válidos", 400, "Revisa el nombre, teléfono, correo y observaciones.");
  if (!/^[0-9a-f-]{36}$/i.test(serviceId)) return problem("Servicio no válido", 400, "Selecciona uno de nuestros servicios.");
  if (!validDateTime(requestedAt)) return problem("Fecha u hora no válida", 400, "Selecciona una fecha y hora válidas.");
  const service = await env.DB.prepare("SELECT id, duration_minutes AS durationMinutes FROM services WHERE id = ? AND is_active = 1")
    .bind(serviceId).first<{ id: string; durationMinutes: number | null }>();
  if (!service) return problem("Servicio no disponible", 400, "El servicio seleccionado ya no está disponible.");
  const duration = service.durationMinutes && service.durationMinutes > 0 ? service.durationMinutes : 30;
  if (requestedAt.slice(0, 16) <= localNow() || !withinBusinessHours(requestedAt, duration))
    return problem("Horario no válido", 400, "Selecciona una fecha futura de lunes a viernes, de 10:00 a 14:00 o de 16:00 a 20:00.");
  const status = manual && body.confirm === false ? "Pendiente" : manual ? "Confirmada" : "Pendiente";
  const id = crypto.randomUUID();
  try {
    await env.DB.prepare(`
      INSERT INTO appointments (id, service_id, customer_name, phone, email, notes, requested_at, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(id, serviceId, name, phone, email, notes, requestedAt.length === 16 ? requestedAt + ":00" : requestedAt, status, new Date().toISOString()).run();
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
      if ((path === "/admin" || path === "/admin/") && method === "GET") {
        const response = await asset(request, env, "/admin.html");
        const headers = new Headers(response.headers);
        headers.set("X-Robots-Tag", "noindex, nofollow");
        return new Response(response.body, { status: response.status, headers });
      }
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
            SELECT a.id, a.service_id AS serviceId, a.customer_name AS customerName, a.phone,
              a.email, a.notes, a.requested_at AS requestedAt, a.status, a.created_at AS createdAt,
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
        if (path === "/api/admin/appointments" && method === "POST") {
          return await createAppointment(env, await request.json() as Record<string, unknown>, true);
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
