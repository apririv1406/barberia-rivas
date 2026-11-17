namespace BarberiaRivas.Web.Models;

public static class AppointmentStatus
{
    public const string Pending = "Pendiente";
    public const string Confirmed = "Confirmada";
    public const string Rejected = "Rechazada";
    public const string Cancelled = "Cancelada";
}

public sealed class Appointment
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid ServiceId { get; set; }

    public Service? Service { get; set; }

    public string CustomerName { get; set; } = string.Empty;

    public string Phone { get; set; } = string.Empty;

    public string? Email { get; set; }

    public string? Notes { get; set; }

    // Hora local de Puente Genil, seleccionada por el cliente.
    public DateTime RequestedAt { get; set; }

    public string Status { get; set; } = AppointmentStatus.Pending;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public sealed class CreateAppointmentRequest
{
    public string? ServiceId { get; set; }
    public string? Name { get; set; }
    public string? Phone { get; set; }
    public string? Email { get; set; }
    public string? Notes { get; set; }
    public DateTime RequestedAt { get; set; }
}
