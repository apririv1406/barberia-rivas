using System;
using BarberiaRivas.Web.Data;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BarberiaRivas.Web.Data.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20261117143000_AddAppointments")]
public partial class AddAppointments : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "appointments",
            columns: table => new
            {
                Id = table.Column<Guid>(type: "uuid", nullable: false),
                ServiceId = table.Column<Guid>(type: "uuid", nullable: false),
                CustomerName = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                Phone = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                Email = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: true),
                Notes = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                RequestedAt = table.Column<DateTime>(type: "timestamp without time zone", nullable: false),
                Status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                CreatedAt = table.Column<DateTime>(type: "timestamp without time zone", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_appointments", x => x.Id);
                table.ForeignKey(
                    name: "FK_appointments_services_ServiceId",
                    column: x => x.ServiceId,
                    principalTable: "services",
                    principalColumn: "Id",
                    onDelete: ReferentialAction.Restrict);
            });

        migrationBuilder.CreateIndex(
            name: "IX_appointments_RequestedAt_Status",
            table: "appointments",
            columns: new[] { "RequestedAt", "Status" });

        migrationBuilder.CreateIndex(
            name: "IX_appointments_ServiceId",
            table: "appointments",
            column: "ServiceId");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(name: "appointments");
    }
}
