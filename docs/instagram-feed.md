# Conectar Instagram con la web de Barbería Rivas

La sección «Últimos trabajos» obtiene las publicaciones desde el endpoint público `/api/instagram-feed`. El token nunca se envía al navegador: la consulta a Meta se realiza desde el Cloudflare Worker.

## Requisitos

- La cuenta `@barberia_rivas` debe ser profesional (Empresa o Creador). La API oficial no permite leer publicaciones de cuentas personales.
- Crear una aplicación en Meta for Developers y añadir el producto Instagram API con Instagram Login.
- Autorizar la cuenta de Barbería Rivas con el permiso `instagram_business_basic`.
- Obtener un token de usuario de Instagram válido y de larga duración.

Documentación oficial:
- https://developers.facebook.com/docs/instagram-platform/
- https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/
- https://developers.facebook.com/docs/instagram-platform/reference/instagram-media/

## Configuración del Worker

Desde la raíz del repositorio, guardar el token como secreto (no añadirlo a archivos del repositorio):

```bash
npx wrangler secret put INSTAGRAM_ACCESS_TOKEN
```

Opcionalmente, se puede fijar la versión de Graph API como variable de entorno:

```bash
npx wrangler secret put INSTAGRAM_API_VERSION
```

Si se configura como secreto, introducir el valor `v27.0`. La versión por defecto del Worker es `v27.0`.

Después, desplegar:

```bash
npx wrangler deploy
```

## Funcionamiento

- El Worker consulta `/me/media` de Instagram con los campos de imagen/vídeo, texto, enlace y fecha.
- La web muestra hasta nueve publicaciones recientes (se visualizan hasta seis tarjetas).
- Las publicaciones se almacenan en caché durante diez minutos; una publicación nueva aparecerá automáticamente al actualizarse la caché.
- Los reels usan la miniatura facilitada por Meta cuando está disponible.
- Si la conexión no está configurada o Instagram falla, la web mantiene el enlace al perfil como alternativa.

## Renovación del token

Los tokens de larga duración tienen caducidad y deben renovarse antes de que expiren siguiendo el flujo vigente de Meta. Si caduca, la sección seguirá mostrando el acceso al perfil y el Worker registrará el error sin exponer el token.
