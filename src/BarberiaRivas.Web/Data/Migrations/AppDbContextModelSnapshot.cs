using BarberiaRivas.Web.Data;
using BarberiaRivas.Web.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BarberiaRivas.Web.Data.Migrations;

[DbContext(typeof(AppDbContext))]
partial class AppDbContextModelSnapshot : ModelSnapshot
{
    protected override void BuildModel(ModelBuilder modelBuilder)
    {
        modelBuilder
            .HasAnnotation("ProductVersion", "10.0.0")
            .HasAnnotation("Relational:MaxIdentifierLength", 63);

        modelBuilder.Entity<BarberiaRivas.Web.Models.Appointment>(entity =>
        {
            entity.Property(x => x.Id).ValueGeneratedNever().HasColumnType("uuid");
            entity.Property(x => x.ServiceId).HasColumnType("uuid");
            entity.Property(x => x.CustomerName).IsRequired().HasMaxLength(100).HasColumnType("character varying(100)");
            entity.Property(x => x.Phone).IsRequired().HasMaxLength(30).HasColumnType("character varying(30)");
            entity.Property(x => x.Email).HasMaxLength(150).HasColumnType("character varying(150)");
            entity.Property(x => x.Notes).HasMaxLength(500).HasColumnType("character varying(500)");
            entity.Property(x => x.RequestedAt).HasColumnType("timestamp without time zone");
            entity.Property(x => x.Status).IsRequired().HasMaxLength(20).HasColumnType("character varying(20)");
            entity.Property(x => x.CreatedAt).HasColumnType("timestamp without time zone");
            entity.HasKey(x => x.Id);
            entity.HasIndex(x => new { x.RequestedAt, x.Status });
            entity.HasIndex(x => x.ServiceId);
            entity.ToTable("appointments");
            entity.HasOne("BarberiaRivas.Web.Models.Service", "Service")
                .WithMany()
                .HasForeignKey("ServiceId")
                .OnDelete(DeleteBehavior.Restrict)
                .IsRequired();
            entity.Navigation("Service");
        });

        modelBuilder.Entity<Service>(entity =>
        {
            entity.Property(x => x.Id).ValueGeneratedNever().HasColumnType("uuid");
            entity.Property(x => x.Name).IsRequired().HasMaxLength(100).HasColumnType("character varying(100)");
            entity.Property(x => x.Description).HasMaxLength(500).HasColumnType("character varying(500)");
            entity.Property(x => x.Price).HasPrecision(10, 2).HasColumnType("numeric(10,2)");
            entity.Property(x => x.DurationMinutes).HasColumnType("integer");
            entity.Property(x => x.IsActive).HasColumnType("boolean");
            entity.Property(x => x.DisplayOrder).HasColumnType("integer");
            entity.HasKey(x => x.Id);
            entity.HasIndex(x => new { x.IsActive, x.DisplayOrder });
            entity.ToTable("services");
            entity.HasData(
                new Service { Id = new Guid("11111111-1111-4111-8111-111111111101"), Name = "Afeitado de barba", IsActive = true, DisplayOrder = 1 },
                new Service { Id = new Guid("11111111-1111-4111-8111-111111111102"), Name = "Corte de barba", IsActive = true, DisplayOrder = 2 },
                new Service { Id = new Guid("11111111-1111-4111-8111-111111111103"), Name = "Corte de pelo", IsActive = true, DisplayOrder = 3 },
                new Service { Id = new Guid("11111111-1111-4111-8111-111111111104"), Name = "Corte de pelo y barba", IsActive = true, DisplayOrder = 4 },
                new Service { Id = new Guid("11111111-1111-4111-8111-111111111105"), Name = "Cuidado de la barba", IsActive = true, DisplayOrder = 5 },
                new Service { Id = new Guid("11111111-1111-4111-8111-111111111106"), Name = "Degradado", IsActive = true, DisplayOrder = 6 });
        });
    }
}
