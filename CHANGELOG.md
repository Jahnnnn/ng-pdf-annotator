# Changelog

Todos los cambios relevantes de este proyecto se documentan aquí.
El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y el proyecto usa [SemVer](https://semver.org/lang/es/).

## [0.1.0] - 2026-11-10

### Añadido
- Componente standalone `<ng-pdf-annotator>` basado en pdf.js 6 y signals (Angular 20+).
- Barra superior: panel lateral (miniaturas e índice), navegación de páginas, zoom (botones, valor exacto, ajustar al ancho, página completa), buscador sin distinguir tildes, panel de comentarios y modos Ver / Anotar.
- Herramientas: resaltar, subrayar, tachar, ondulado, mano alzada, resaltador libre y notas; paleta de colores, color personalizado, grosor y opacidad.
- Panel de comentarios agrupado por página, con filtros, respuestas, edición y carga por bloques.
- Estados Aceptado, Rechazado, Cancelado, Completado, Ninguno, Marcado y Sin marcar, con historial.
- Permisos configurables (por defecto solo el autor elimina y edita).
- Bloqueo de descarga, impresión, clic derecho, arrastre y (opcional) copia.
- Marcas de agua horizontal, vertical, diagonal y en mosaico con variables.
- Exportación/importación JSON con `schemaVersion` y eventos por cambio para persistir en BD.
- Idiomas es (por defecto), en y pt, idiomas personalizados; tema claro, oscuro y automático.
- Renderizado diferido de páginas y liberación de memoria para documentos grandes.
