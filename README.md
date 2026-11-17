# Barbería Rivas

Aplicación web para Barbería Rivas, en Puente Genil (Córdoba), con web pública y gestión privada de solicitudes de cita.

## Funcionalidades

- Web pública responsive con información del negocio, servicios y contacto.
- Solicitud de cita desde la web con aprobación manual.
- Acceso directo a WhatsApp.
- Panel privado en `/admin` con autenticación mediante contraseña.
- Calendario mensual, agenda diaria y resumen de citas.
- Bandeja de solicitudes pendientes.
- Acciones para confirmar, rechazar y cancelar citas.
- Alta manual de citas desde el panel, por ejemplo para las recibidas por teléfono o WhatsApp.
- Comprobación de solapamientos teniendo en cuenta la duración configurada del servicio.

## Tecnologías

- .NET 10 / ASP.NET Core
- Entity Framework Core
- PostgreSQL
- HTML, CSS y JavaScript

## Datos del negocio

- **Dirección:** C. Miguel Romero, 2, 14500 Puente Genil, Córdoba.
- **Teléfono:** +34 666 23 22 76
- **Instagram:** https://www.instagram.com/barberia_rivas/

## Configuración

Configura estas variables de entorno en el entorno donde se despliegue la aplicación:

- `ConnectionStrings__DefaultConnection`: cadena de conexión de PostgreSQL.
- `Admin__Password`: contraseña privada y robusta para acceder al panel.

No guardes la contraseña del panel en el repositorio ni en archivos públicos. Si `Admin__Password` no está configurada, el inicio de sesión permanecerá deshabilitado.

## Desarrollo local

Requisitos: .NET 10 SDK y PostgreSQL.

En PowerShell, antes de iniciar la aplicación:

```powershell
$env:ConnectionStrings__DefaultConnection="Host=localhost;Database=barberia_rivas;Username=postgres;Password=TU_PASSWORD"
$env:Admin__Password="ELIGE_UNA_PASSWORD_LARGA_Y_UNICA"
dotnet run --project src/BarberiaRivas.Web
```

Abre la web pública en la dirección que indique ASP.NET Core y el panel en la ruta `/admin`.

Las migraciones de Entity Framework se aplican al iniciar la aplicación cuando existe una cadena de conexión configurada.

## Estado

La web pública, la recepción de solicitudes y la primera versión del panel privado están implementadas. La aplicación utiliza la hora local de Puente Genil para validar y mostrar las citas.
