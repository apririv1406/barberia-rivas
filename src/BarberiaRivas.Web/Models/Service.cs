namespace BarberiaRivas.Web.Models;

public sealed class Service
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public string Name { get; set; } = string.Empty;

    public string? Description { get; set; }

    public decimal? Price { get; set; }

    public int? DurationMinutes { get; set; }

    public bool IsActive { get; set; } = true;

    public int DisplayOrder { get; set; }
}
