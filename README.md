# Barbería Rivas

Web pública y panel privado de gestión de citas para Barbería Rivas, en Puente Genil (Córdoba).

## Arquitectura cloud

- **Cloudflare Workers:** API y lógica de negocio, sin servidor propio.
- **Cloudflare D1:** base de datos SQL gestionada.
- **Workers Static Assets:** sirve la web, imágenes, estilos y scripts.
- **GitHub Actions:** comprobación automática del proyecto.

La aplicación desplegada ya no necesita .NET ni PostgreSQL. El código ASP.NET Core anterior queda como referencia histórica; el despliegue activo se realiza desde el Worker definido en `worker/index.ts`.

## Funcionalidades

- Web responsive con servicios, contacto, horario y acceso a WhatsApp.
- Solicitudes de cita desde la web con aprobación manual.
- Panel privado en `/admin`, protegido mediante contraseña y cookie segura.
- Calendario mensual, agenda diaria, resumen y bandeja de solicitudes pendientes.
- Confirmar, rechazar y cancelar citas.
- Alta manual de citas recibidas por teléfono o WhatsApp.
- Bloqueo de solapamientos por duración del servicio, también protegido en la propia base de datos.
- Horario: lunes a viernes, 10:00–14:00 y 16:00–20:00.
- SEO local: metadatos, datos estructurados, `robots.txt`, `sitemap.xml` y exclusión del panel de administración.

## Datos del negocio

- **Dirección:** C. Miguel Romero, 2, 14500 Puente Genil, Córdoba.
- **Teléfono:** +34 666 23 22 76
- **Instagram:** https://www.instagram.com/barberia_rivas/

## Primera configuración en Cloudflare

Requisitos: Node.js LTS y una cuenta gratuita de Cloudflare.

1. Clona el repositorio y entra en su carpeta:
   ```bash
   git clone https://github.com/apririv1406/barberia-rivas.git
   cd barberia-rivas
   npm install
   ```
2. Inicia sesión en Cloudflare:
   ```bash
   npx wrangler login
   ```
3. Crea la base de datos D1:
   ```bash
   npx wrangler d1 create barberia-rivas
   ```
   Copia el `database_id` que muestra el comando y sustituye `REEMPLAZAR_CON_ID_DE_D1` en `wrangler.jsonc`.
4. Aplica la estructura y los seis servicios iniciales en la base de datos remota:
   ```bash
   npx wrangler d1 migrations apply barberia-rivas --remote
   ```
5. Configura los secretos. No los escribas en el repositorio:
   ```bash
   npx wrangler secret put ADMIN_PASSWORD
   npx wrangler secret put SESSION_SECRET
   ```
   Para `ADMIN_PASSWORD`, introduce una contraseña larga y exclusiva para el panel. Para `SESSION_SECRET`, genera una clave aleatoria de al menos 32 bytes, por ejemplo con PowerShell:
   ```powershell
   [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
   ```
   Copia el resultado y pégalo cuando Wrangler solicite el valor de `SESSION_SECRET`.
6. Comprueba los tipos y despliega:
   ```bash
   npm run check
   npx wrangler deploy
   ```

Cloudflare asignará una dirección `*.workers.dev`. El panel estará en esa dirección seguida de `/admin`.

## Desarrollo local

La base local de D1 es independiente de la base de producción:

```bash
npm install
npx wrangler d1 migrations apply barberia-rivas --local
npm run dev
```

Crea un archivo local `.dev.vars` (no se sube a Git) con:

```dotenv
ADMIN_PASSWORD="una-contraseña-local-larga"
SESSION_SECRET="una-clave-local-aleatoria-de-32-bytes-o-más"
```

Wrangler utiliza la base D1 local al ejecutar `npm run dev` sin `--remote`.

## Variables y bindings

- `DB`: binding de Cloudflare D1 configurado en `wrangler.jsonc`.
- `ASSETS`: binding de archivos estáticos.
- `ADMIN_PASSWORD`: secreto del acceso al panel.
- `SESSION_SECRET`: secreto HMAC para firmar las sesiones.
- `SITE_URL`: dominio público opcional, sin barra final. Si no se configura, sitemap y robots usan el dominio de la petición.

## Importante

- No compartas ni guardes los secretos en GitHub.
- No ejecutes las migraciones remotas hasta haber creado D1 y sustituido su identificador.
- El despliegue no está publicado automáticamente al crear los archivos: requiere completar la vinculación de D1 y autenticar Wrangler con tu cuenta Cloudflare.
- El panel no sincroniza WhatsApp automáticamente. Las citas acordadas por WhatsApp se anotan en el calendario con **Nueva cita**.
