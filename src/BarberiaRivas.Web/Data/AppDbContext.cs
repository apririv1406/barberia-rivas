using BarberiaRivas.Web.Models;
using Microsoft.EntityFrameworkCore;

namespace BarberiaRivas.Web.Data;

public sealed class AppDbContext(DbContextOptions<AppDbContext> options)
    : DbContext(options)
{
    public DbSet<Service> Services => Set<Service>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

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
        });
    }
}
