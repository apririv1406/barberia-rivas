using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using BarberiaRivas.Web.Data;
using BarberiaRivas.Web.Models;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);
var connectionString = builder.Configuration.GetConnectionString("DefaultConnection");

if (!string.IsNullOrWhiteSpace(connectionString))
{
    builder.Services.AddDbContext<AppDbContext>(options => options.UseNpgsql(connectionString));
}

builder.Services.AddProblemDetails();
builder.Services.AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme)
    .AddCookie(options =>
    {
        options.Cookie.Name = "BarberiaRivas.Admin";
        options.Cookie.HttpOnly = true;
        options.Cookie.SecurePolicy = builder.Environment.IsDevelopment() ? CookieSecurePolicy.SameAsRequest : CookieSecurePolicy.Always;
        options.Cookie.SameSite = SameSiteMode.Strict;
        options.ExpireTimeSpan = TimeSpan.FromHours(10);
        options.SlidingExpiration = true;
        options.Events.OnRedirectToLogin = context =>
        {
            if (context.Request.Path.StartsWithSegments("/api"))
            {
                context.Response.StatusCode = StatusCodes.Status401Unauthorized;
                return Task.CompletedTask;
            }
            context.Response.Redirect("/admin");
            return Task.CompletedTask;
        };
        options.Events.OnRedirectToAccessDenied = context =>
        {
            context.Response.StatusCode = StatusCodes.Status403Forbidden;
            return Task.CompletedTask;
        };
    });
builder.Services.AddAuthorization();

var app = builder.Build();

if (!string.IsNullOrWhiteSpace(connectionString))
{
    await using var scope = app.Services.CreateAsyncScope();
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    await db.Database.MigrateAsync();
}

if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler();
    app.UseHsts();
}

app.UseHttpsRedirection();
app.UseDefaultFiles();
app.UseStaticFiles();
app.UseAuthentication();
app.UseAuthorization();

app.MapGet("/admin", async (HttpContext context) =>
{
    context.Response.ContentType = "text/html; charset=utf-8";
    await context.Response.SendFileAsync(Path.Combine(app.Environment.WebRootPath!, "admin.html"));
});

app.MapGet("/api/health", () => Results.Ok(new
{
    status = "ok",
    application = "Barbería Rivas",
    timestamp = DateTimeOffset.UtcNow
}));

app.MapGet("/api/services", async (IServiceProvider services) =>
{
    var db = services.GetService<AppDbContext>();
    if (db is null)
        return Results.Problem(title: "Base de datos no configurada", statusCode: 503);

    var items = await db.Services.AsNoTracking()
        .Where(service => service.IsActive)
        .OrderBy(service => service.DisplayOrder)
        .ThenBy(service => service.Name)
        .Select(service => new
        {
            service.Id, service.Name, service.Description,
            service.Price, service.DurationMinutes
        }).ToListAsync();

    return Results.Ok(items);
});

app.MapPost("/api/appointments", async (CreateAppointmentRequest request, IServiceProvider services) =>
{
    var db = services.GetService<AppDbContext>();
    if (db is null)
        return Results.Problem(title: "Reservas no disponibles", statusCode: 503);

    var name = request.Name?.Trim();
    var phone = request.Phone?.Trim();
    var email = request.Email?.Trim();
    var notes = request.Notes?.Trim();

    if (string.IsNullOrWhiteSpace(name) || name.Length > 100 ||
        string.IsNullOrWhiteSpace(phone) || phone.Length > 30 ||
        (email?.Length > 150) || (notes?.Length > 500))
        return Results.ValidationProblem(new Dictionary<string, string[]>
        {
            ["customer"] = ["Revisa el nombre, teléfono, correo y observaciones."]
        });

    if (!Guid.TryParse(request.ServiceId, out var serviceId))
        return Results.ValidationProblem(new Dictionary<string, string[]>
        {
            ["serviceId"] = ["Selecciona uno de nuestros servicios."]
        });

    var service = await db.Services.AsNoTracking()
        .FirstOrDefaultAsync(item => item.Id == serviceId && item.IsActive);
    if (service is null)
        return Results.ValidationProblem(new Dictionary<string, string[]>
        {
            ["serviceId"] = ["El servicio seleccionado ya no está disponible."]
        });

    var requestedAt = request.RequestedAt;
    var duration = service.DurationMinutes is > 0 ? service.DurationMinutes.Value : 30;
    if (requestedAt <= GetBusinessNow() || !IsWithinBusinessHours(requestedAt, duration))
        return Results.ValidationProblem(new Dictionary<string, string[]>
        {
            ["requestedAt"] = ["Selecciona una fecha futura dentro del horario: lunes a viernes, de 10:00 a 14:00 y de 16:00 a 20:00."]
        });

    if (await HasAppointmentOverlap(db, requestedAt, duration))
        return Results.Conflict(new { message = "Ese horario ya no está disponible. Prueba con otra hora." });

    var appointment = new Appointment
    {
        Id = Guid.NewGuid(), ServiceId = serviceId, CustomerName = name,
        Phone = phone, Email = string.IsNullOrWhiteSpace(email) ? null : email,
        Notes = string.IsNullOrWhiteSpace(notes) ? null : notes,
        RequestedAt = requestedAt, Status = AppointmentStatus.Pending,
        CreatedAt = DateTime.UtcNow
    };

    db.Appointments.Add(appointment);
    await db.SaveChangesAsync();

    return Results.Created($"/api/appointments/{appointment.Id}", new
    {
        appointment.Id, status = "pending",
        message = "Hemos recibido tu solicitud. La barbería tiene que confirmar la cita."
    });
});

app.MapPost("/api/admin/login", async (AdminLoginRequest request, HttpContext context, IConfiguration configuration) =>
{
    var configuredPassword = configuration["Admin:Password"];
    if (string.IsNullOrWhiteSpace(configuredPassword))
        return Results.Problem(
            title: "Acceso de administración sin configurar",
            detail: "Configura la variable de entorno Admin__Password antes de utilizar el panel.",
            statusCode: StatusCodes.Status503ServiceUnavailable);

    var supplied = Encoding.UTF8.GetBytes(request.Password ?? string.Empty);
    var expected = Encoding.UTF8.GetBytes(configuredPassword);
    if (supplied.Length != expected.Length ||
        !CryptographicOperations.FixedTimeEquals(supplied, expected))
        return Results.BadRequest(new { message = "La contraseña no es correcta." });

    var claims = new[]
    {
        new Claim(ClaimTypes.NameIdentifier, "barberia-admin"),
        new Claim(ClaimTypes.Name, "Administración Barbería Rivas"),
        new Claim(ClaimTypes.Role, "Admin")
    };
    var identity = new ClaimsIdentity(claims, CookieAuthenticationDefaults.AuthenticationScheme);
    await context.SignInAsync(
        CookieAuthenticationDefaults.AuthenticationScheme,
        new ClaimsPrincipal(identity),
        new AuthenticationProperties { IsPersistent = request.Remember, AllowRefresh = true });

    return Results.Ok(new { authenticated = true });
});

var admin = app.MapGroup("/api/admin").RequireAuthorization();

admin.MapGet("/me", (ClaimsPrincipal user) => Results.Ok(new
{
    authenticated = user.Identity?.IsAuthenticated ?? false,
    name = user.Identity?.Name
}));

admin.MapPost("/logout", async (HttpContext context) =>
{
    await context.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
    return Results.Ok(new { authenticated = false });
});

admin.MapGet("/summary", async (IServiceProvider services, DateOnly? day) =>
{
    var db = services.GetService<AppDbContext>();
    if (db is null) return Results.Problem(title: "Base de datos no configurada", statusCode: 503);
    var today = day ?? DateOnly.FromDateTime(GetBusinessNow());
    var start = today.ToDateTime(TimeOnly.MinValue);
    var end = start.AddDays(1);
    var appointments = await db.Appointments.AsNoTracking()
        .Where(item => item.RequestedAt >= start && item.RequestedAt < end)
        .ToListAsync();

    return Results.Ok(new
    {
        pending = await db.Appointments.CountAsync(item => item.Status == AppointmentStatus.Pending),
        today = appointments.Count(item => item.Status is AppointmentStatus.Pending or AppointmentStatus.Confirmed),
        confirmedToday = appointments.Count(item => item.Status == AppointmentStatus.Confirmed),
        day = today.ToString("yyyy-MM-dd")
    });
});

admin.MapGet("/appointments", async (IServiceProvider services, DateTime? from, DateTime? to, string? status) =>
{
    var db = services.GetService<AppDbContext>();
    if (db is null) return Results.Problem(title: "Base de datos no configurada", statusCode: 503);
    var query = db.Appointments.AsNoTracking().Include(item => item.Service).AsQueryable();
    if (from.HasValue) query = query.Where(item => item.RequestedAt >= from.Value);
    if (to.HasValue) query = query.Where(item => item.RequestedAt < to.Value);
    if (!string.IsNullOrWhiteSpace(status) && status != "Todas")
        query = query.Where(item => item.Status == status);

    var items = await query.OrderBy(item => item.RequestedAt).Select(item => new
    {
        item.Id, item.CustomerName, item.Phone, item.Email, item.Notes,
        item.RequestedAt, item.Status, item.CreatedAt,
        serviceId = item.ServiceId,
        serviceName = item.Service!.Name,
        durationMinutes = item.Service.DurationMinutes ?? 30,
        price = item.Service.Price
    }).ToListAsync();

    return Results.Ok(items);
});

admin.MapPatch("/appointments/{id:guid}/status", async (
    Guid id, UpdateAppointmentStatusRequest request, IServiceProvider services) =>
{
    var db = services.GetService<AppDbContext>();
    if (db is null) return Results.Problem(title: "Base de datos no configurada", statusCode: 503);
    var allowed = new[] { AppointmentStatus.Confirmed, AppointmentStatus.Rejected, AppointmentStatus.Cancelled };
    if (request.Status is null || !allowed.Contains(request.Status))
        return Results.ValidationProblem(new Dictionary<string, string[]>
        {
            ["status"] = ["Estado no válido."]
        });

    var appointment = await db.Appointments.Include(item => item.Service)
        .FirstOrDefaultAsync(item => item.Id == id);
    if (appointment is null) return Results.NotFound();

    if (request.Status == AppointmentStatus.Confirmed)
    {
        var duration = appointment.Service?.DurationMinutes is > 0
            ? appointment.Service.DurationMinutes.Value : 30;
        if (await HasAppointmentOverlap(db, appointment.RequestedAt, duration, appointment.Id))
            return Results.Conflict(new
            {
                message = "No se puede confirmar: ese horario se solapa con otra cita pendiente o confirmada."
            });
    }

    appointment.Status = request.Status;
    await db.SaveChangesAsync();
    return Results.Ok(new { appointment.Id, appointment.Status });
});

admin.MapPost("/appointments", async (AdminCreateAppointmentRequest request, IServiceProvider services) =>
{
    var db = services.GetService<AppDbContext>();
    if (db is null) return Results.Problem(title: "Base de datos no configurada", statusCode: 503);
    var name = request.Name?.Trim();
    var phone = request.Phone?.Trim();
    if (string.IsNullOrWhiteSpace(name) || name.Length > 100 ||
        string.IsNullOrWhiteSpace(phone) || phone.Length > 30)
        return Results.ValidationProblem(new Dictionary<string, string[]>
        {
            ["customer"] = ["Indica el nombre y un teléfono válido."]
        });

    var service = await db.Services.FirstOrDefaultAsync(item => item.Id == request.ServiceId && item.IsActive);
    if (service is null) return Results.BadRequest(new { message = "Selecciona un servicio activo." });

    var duration = service.DurationMinutes is > 0 ? service.DurationMinutes.Value : 30;
    if (!IsWithinBusinessHours(request.RequestedAt, duration) || request.RequestedAt <= GetBusinessNow())
        return Results.BadRequest(new { message = "La cita debe estar en un horario de apertura y ser futura." });

    if (await HasAppointmentOverlap(db, request.RequestedAt, duration))
        return Results.Conflict(new { message = "Ya existe una cita o solicitud que ocupa ese horario." });

    var appointment = new Appointment
    {
        Id = Guid.NewGuid(), ServiceId = service.Id, CustomerName = name, Phone = phone,
        Email = string.IsNullOrWhiteSpace(request.Email) ? null : request.Email.Trim(),
        Notes = string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim(),
        RequestedAt = request.RequestedAt,
        Status = request.Confirm ? AppointmentStatus.Confirmed : AppointmentStatus.Pending,
        CreatedAt = DateTime.UtcNow
    };

    db.Appointments.Add(appointment);
    await db.SaveChangesAsync();
    return Results.Created($"/api/admin/appointments/{appointment.Id}", new { appointment.Id, appointment.Status });
});


app.MapGet("/robots.txt", (HttpContext context, IConfiguration configuration) =>
{
    var baseUrl = configuration["Site:BaseUrl"]?.TrimEnd('/');
    if (string.IsNullOrWhiteSpace(baseUrl))
        baseUrl = $"{context.Request.Scheme}://{context.Request.Host}";

    var content = $"User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\nSitemap: {baseUrl}/sitemap.xml\n";
    return Results.Text(content, "text/plain; charset=utf-8");
});

app.MapGet("/sitemap.xml", (HttpContext context, IConfiguration configuration) =>
{
    var baseUrl = configuration["Site:BaseUrl"]?.TrimEnd('/');
    if (string.IsNullOrWhiteSpace(baseUrl))
        baseUrl = $"{context.Request.Scheme}://{context.Request.Host}";

    var xml = $"""
        <?xml version="1.0" encoding="UTF-8"?>
        <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
          <url>
            <loc>{System.Security.SecurityElement.Escape(baseUrl + "/")}</loc>
            <changefreq>weekly</changefreq>
            <priority>1.0</priority>
          </url>
        </urlset>
        """;
    return Results.Text(xml, "application/xml; charset=utf-8");
});

app.Run();

static DateTime GetBusinessNow()
{
    var madrid = TimeZoneInfo.FindSystemTimeZoneById("Europe/Madrid");
    return TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, madrid);
}

static bool IsWithinBusinessHours(DateTime start, int durationMinutes)
{
    if (start.DayOfWeek is DayOfWeek.Saturday or DayOfWeek.Sunday) return false;
    var end = start.AddMinutes(durationMinutes);
    var morningStart = start.Date.AddHours(10);
    var morningEnd = start.Date.AddHours(14);
    var afternoonStart = start.Date.AddHours(16);
    var afternoonEnd = start.Date.AddHours(20);
    return (start >= morningStart && end <= morningEnd) ||
           (start >= afternoonStart && end <= afternoonEnd);
}

static async Task<bool> HasAppointmentOverlap(
    AppDbContext db, DateTime start, int durationMinutes, Guid? excludeId = null)
{
    var end = start.AddMinutes(durationMinutes);
    var dayStart = start.Date;
    var dayEnd = dayStart.AddDays(1);

    var sameDay = await db.Appointments
        .Include(item => item.Service)
        .Where(item => item.RequestedAt >= dayStart && item.RequestedAt < dayEnd &&
            (item.Status == AppointmentStatus.Pending || item.Status == AppointmentStatus.Confirmed) &&
            (!excludeId.HasValue || item.Id != excludeId.Value))
        .ToListAsync();

    return sameDay.Any(item =>
    {
        var existingDuration = item.Service?.DurationMinutes is > 0
            ? item.Service.DurationMinutes.Value : 30;
        var existingEnd = item.RequestedAt.AddMinutes(existingDuration);
        return start < existingEnd && end > item.RequestedAt;
    });
}

public sealed record AdminLoginRequest(string? Password, bool Remember = false);
public sealed record UpdateAppointmentStatusRequest(string? Status);
public sealed record AdminCreateAppointmentRequest(
    Guid ServiceId, string? Name, string? Phone, string? Email,
    string? Notes, DateTime RequestedAt, bool Confirm);
