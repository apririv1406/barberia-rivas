using BarberiaRivas.Web.Models;
using Microsoft.EntityFrameworkCore;

namespace BarberiaRivas.Web.Data;

public sealed class AppDbContext(DbContextOptions<AppDbContext> options)
    : DbContext(options)
{
    public DbSet<Service> Services => Set<Service>();

    public DbSet<Appointment> Appointments => Set<Appointment>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<Appointment>(entity =>
        {
            entity.ToTable("appointments");
            entity.HasKey(appointment => appointment.Id);
            entity.Property(appointment => appointment.CustomerName).HasMaxLength(100).IsRequired();
            entity.Property(appointment => appointment.Phone).HasMaxLength(30).IsRequired();
            entity.Property(appointment => appointment.Email).HasMaxLength(150);
            entity.Property(appointment => appointment.Notes).HasMaxLength(500);
            entity.Property(appointment => appointment.Status).HasMaxLength(20).IsRequired();
            entity.HasIndex(appointment => new { appointment.RequestedAt, appointment.Status });
            entity.HasOne(appointment => appointment.Service)
                .WithMany()
                .HasForeignKey(appointment => appointment.ServiceId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<Service>(entity =>
        {
            entity.ToTable("services");
            entity.HasKey(service => service.Id);
            entity.Property(service => service.Name)
                .HasMaxLength(100)
                .IsRequired();
            entity.Property(service => service.Description)
                .HasMaxLength(500);
            entity.Property(service => service.Price)
                .HasPrecision(10, 2);
            entity.HasIndex(service => new { service.IsActive, service.DisplayOrder });

            entity.HasData(
            new() { Id = Guid.Parse("11111111-1111-4111-8111-111111111101"), Name = "Afeitado de barba", IsActive = true, DisplayOrder = 1 },
            new() { Id = Guid.Parse("11111111-1111-4111-8111-111111111102"), Name = "Corte de barba", IsActive = true, DisplayOrder = 2 },
            new() { Id = Guid.Parse("11111111-1111-4111-8111-111111111103"), Name = "Corte de pelo", IsActive = true, DisplayOrder = 3 },
            new() { Id = Guid.Parse("11111111-1111-4111-8111-111111111104"), Name = "Corte de pelo y barba", IsActive = true, DisplayOrder = 4 },
            new() { Id = Guid.Parse("11111111-1111-4111-8111-111111111105"), Name = "Cuidado de la barba", IsActive = true, DisplayOrder = 5 },
            new() { Id = Guid.Parse("11111111-1111-4111-8111-111111111106"), Name = "Degradado", IsActive = true, DisplayOrder = 6 });
        });
    }
}
