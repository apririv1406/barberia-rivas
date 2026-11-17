# Barbería Rivas

Aplicación web para la presencia online y la futura gestión de reservas de Barbería Rivas, en Puente Genil (Córdoba).

## Objetivos

- Web pública responsive con información del negocio y contacto directo.
- Catálogo de servicios y precios gestionable desde administración.
- Solicitudes de cita con aprobación manual del barbero.
- Panel privado para agenda, clientes, servicios, horarios y bloqueos.
- Backend ASP.NET Core y PostgreSQL.

## Tecnologías previstas

- .NET 10 / ASP.NET Core
- Entity Framework Core
- PostgreSQL
- HTML, CSS y JavaScript para la interfaz pública

## Datos del negocio

- **Dirección:** C. Miguel Romero, 2, 14500 Puente Genil, Córdoba.
- **Teléfono:** +34 666 23 22 76
- **Instagram:** https://www.instagram.com/barberia_rivas/

## Desarrollo local

Requisitos: .NET 10 SDK y PostgreSQL.

1. Configura la cadena de conexión mediante la variable de entorno `ConnectionStrings__DefaultConnection`.
2. Ejecuta `dotnet restore`.
3. Ejecuta `dotnet run --project src/BarberiaRivas.Web`.

La configuración de base de datos y las migraciones se documentarán conforme se complete el modelo de reservas.

## Estado

Proyecto inicializado. La primera fase establece la estructura de ASP.NET Core y la web pública. La gestión de citas y el panel de administración se desarrollarán por fases, manteniendo las solicitudes pendientes de aprobación manual.
