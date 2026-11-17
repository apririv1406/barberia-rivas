using BarberiaRivas.Web.Data;
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

app.Run();
