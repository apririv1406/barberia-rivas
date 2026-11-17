using System;
using BarberiaRivas.Web.Data;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BarberiaRivas.Web.Data.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20261117130000_InitialCreate")]
public partial class InitialCreate : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "services",
            columns: table => new
            {
                Id = table.Column<Guid>(type: "uuid", nullable: false),
                Name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                Description = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                Price = table.Column<decimal>(type: "numeric(10,2)", precision: 10, scale: 2, nullable: true),
                DurationMinutes = table.Column<int>(type: "integer", nullable: true),
                IsActive = table.Column<bool>(type: "boolean", nullable: false),
                DisplayOrder = table.Column<int>(type: "integer", nullable: false)
            },
            constraints: table => table.PrimaryKey("PK_services", x => x.Id));

        migrationBuilder.CreateIndex(
            name: "IX_services_IsActive_DisplayOrder",
            table: "services",
            columns: new[] { "IsActive", "DisplayOrder" });

        migrationBuilder.InsertData(
            table: "services",
            columns: new[] { "Id", "Name", "Description", "Price", "DurationMinutes", "IsActive", "DisplayOrder" },
            values: new object[,]
            {
                { new Guid("11111111-1111-4111-8111-111111111101"), "Afeitado de barba", null, null, null, true, 1 },
                { new Guid("11111111-1111-4111-8111-111111111102"), "Corte de barba", null, null, null, true, 2 },
                { new Guid("11111111-1111-4111-8111-111111111103"), "Corte de pelo", null, null, null, true, 3 },
                { new Guid("11111111-1111-4111-8111-111111111104"), "Corte de pelo y barba", null, null, null, true, 4 },
                { new Guid("11111111-1111-4111-8111-111111111105"), "Cuidado de la barba", null, null, null, true, 5 },
                { new Guid("11111111-1111-4111-8111-111111111106"), "Degradado", null, null, null, true, 6 }
            });
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(name: "services");
    }
}
