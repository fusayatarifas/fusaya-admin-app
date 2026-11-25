# FUSAYA MOTOS — Pilotos y Documentos

Módulo independiente sobre la hoja privada **FUSAYA NUEVO - Pilotos y Documentos - Base privada**. No lee ni escribe en la base contable ni en la aplicación anterior.

## Funciones
- Alta/edición y archivo lógico de fichas; códigos consecutivos `01_Alias`, `02_Alias`.
- WhatsApp del piloto y dos contactos de emergencia completos.
- Cédula y licencia por ambos lados, antecedentes judiciales, SOAT y tecnomecánica.
- Consulta de documentos desde la ficha; PDFs, JPG y PNG, máximo 8 MiB por archivo.
- SOAT/tecnomecánica con vencimiento y alertas: vigente, por vencer en 30 días, vencido o faltante.
- Historial de carga y auditoría; no se elimina el documento anterior al reemplazarlo.
- Archivos y base privados; el módulo valida un ID token OAuth de Google contra una lista exacta de administradores.

## Instalación pendiente en Google Apps Script
1. Crear un proyecto Apps Script nuevo y agregar `Code.gs` y un archivo HTML llamado `Index` con el contenido de `Index.html`.
2. En **Configuración del proyecto → Propiedades del script**, definir `FUSAYA_DOCS_SPREADSHEET_ID` con el ID de la hoja privada de Pilotos y Documentos y `FUSAYA_DOCS_PILOT_ROOT_FOLDER_ID` con el ID de la carpeta privada de expedientes.
3. Confirmar que `Configuracion!B5` (ADMIN_EMAILS) y `Administradores` contengan los correos administrativos completos y exactos. Ningún correo pendiente se autoriza.
4. Comprobar que el cliente OAuth indicado tenga `script.google.com` en orígenes autorizados y que el ID de cliente coincida. El inicio con Google falla cerrado si no coincide.
5. Desplegar como aplicación web que se ejecuta como la cuenta propietaria y restringir audiencia según los administradores. Probar con una cuenta autorizada y otra externa antes de usar.
6. No compartir la hoja ni la carpeta raíz; el servidor entrega documentos solo tras autorizar cada solicitud.

## Datos nuevos
El código asignado en el alta empieza en `01_`. No se precargan los pilotos existentes ni se cargan documentos de ejemplo. Antes de altas reales, revisar quién administra el OAuth/Apps Script y completar los correos faltantes.

## Seguridad y límites
- Las solicitudes de lectura/escritura pasan por `api()`, que valida cuenta y allowlist en el servidor.
- El archivo nunca se hace público ni se crea enlace de compartir.
- El máximo de 8 MiB evita fallos por tamaño de llamadas de Apps Script; comprime fotos o escanea en PDF si supera el límite.
- La aplicación todavía no está desplegada. Este código debe instalarse y probarse en el proyecto Apps Script nuevo antes de llamarla operativa.
