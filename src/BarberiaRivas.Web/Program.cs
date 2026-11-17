using BarberiaRivas.Web.Data;
using BarberiaRivas.Web.Models;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

var connectionString = builder.Configuration.GetConnectionString("DefaultConnection");

if (!string.IsNullOrWhiteSpace(connectionString))
{
    builder.Services.AddDbContext<AppDbContext>(options =>
        options.UseNpgsql(connectionString));
}

builder.Services.AddProblemDetails();

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
    {
        return Results.Problem(
            title: "Base de datos no configurada",
            detail: "Configura ConnectionStrings:DefaultConnection para consultar los servicios.",
            statusCode: StatusCodes.Status503ServiceUnavailable);
    }

    var items = await db.Services
        .AsNoTracking()
        .Where(service => service.IsActive)
        .OrderBy(service => service.DisplayOrder)
        .ThenBy(service => service.Name)
        .Select(service => new
        {
            service.Id,
            service.Name,
            service.Description,
            service.Price,
            service.DurationMinutes
        })
        .ToListAsync();

    return Results.Ok(items);
});

app.MapPost("/api/appointments", async (
    CreateAppointmentRequest request,
    IServiceProvider services) =>
{
    var db = services.GetService<AppDbContext>();
    if (db is null)
    {
        return Results.Problem(
            title: "Reservas no disponibles",
            detail: "El sistema de reservas no está configurado en este momento.",
            statusCode: StatusCodes.Status503ServiceUnavailable);
    }

    var name = request.Name?.Trim();
    var phone = request.Phone?.Trim();
    var email = request.Email?.Trim();
    var notes = request.Notes?.Trim();

    if (string.IsNullOrWhiteSpace(name) || name.Length > 100 ||
        string.IsNullOrWhiteSpace(phone) || phone.Length > 30 ||
        (email?.Length > 150) || (notes?.Length > 500))
    {
        return Results.ValidationProblem(new Dictionary<string, string[]>
        {
            ["customer"] = ["Revisa el nombre, teléfono, correo y observaciones."]
        });
    }

    if (!Guid.TryParse(request.ServiceId, out var serviceId))
    {
        return Results.ValidationProblem(new Dictionary<string, string[]>
        {
            ["serviceId"] = ["Selecciona uno de nuestros servicios."]
        });
    }

    var service = await db.Services
        .AsNoTracking()
        .FirstOrDefaultAsync(item => item.Id == serviceId && item.IsActive);

    if (service is null)
    {
        return Results.ValidationProblem(new Dictionary<string, string[]>
        {
            ["serviceId"] = ["El servicio seleccionado ya no está disponible."]
        });
    }

    var requestedAt = request.RequestedAt;
    var requestedDate = DateOnly.FromDateTime(requestedAt);
    var requestedTime = TimeOnly.FromDateTime(requestedAt);

    if (requestedAt <= DateTime.Now)
    {
        return Results.ValidationProblem(new Dictionary<string, string[]>
        {
            ["requestedAt"] = ["Selecciona una fecha y hora futura."]
        });
    }

    if (requestedDate.DayOfWeek is DayOfWeek.Saturday or DayOfWeek.Sunday ||
        !((requestedTime >= new TimeOnly(10, 0) && requestedTime < new TimeOnly(14, 0)) ||
          (requestedTime >= new TimeOnly(16, 0) && requestedTime < new TimeOnly(20, 0))))
    {
        return Results.ValidationProblem(new Dictionary<string, string[]>
        {
            ["requestedAt"] = ["El horario de atención es de lunes a viernes, de 10:00 a 14:00 y de 16:00 a 20:00."]
        });
    }

    var alreadyRequested = await db.Appointments.AnyAsync(item =>
        item.RequestedAt == requestedAt &&
        (item.Status == AppointmentStatus.Pending || item.Status == AppointmentStatus.Confirmed));

    if (alreadyRequested)
    {
        return Results.Conflict(new
        {
            message = "Ya hay una solicitud o cita para esa hora. Prueba con otra hora."
        });
    }

    var appointment = new Appointment
    {
        Id = Guid.NewGuid(),
        ServiceId = serviceId,
        CustomerName = name,
        Phone = phone,
        Email = string.IsNullOrWhiteSpace(email) ? null : email,
        Notes = string.IsNullOrWhiteSpace(notes) ? null : notes,
        RequestedAt = requestedAt,
        Status = AppointmentStatus.Pending,
        CreatedAt = DateTime.UtcNow
    };

    db.Appointments.Add(appointment);
    await db.SaveChangesAsync();

    return Results.Created($"/api/appointments/{appointment.Id}", new
    {
        appointment.Id,
        status = "pending",
        message = "Hemos recibido tu solicitud. La barbería tiene que confirmar la cita."
    });
});

app.Run();
