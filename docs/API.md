# API de `<ng-pdf-annotator>`

```ts
import { NgPdfAnnotatorComponent } from 'ng-pdf-annotator';
```

Componente standalone. Selector: `ng-pdf-annotator`. Cada instancia tiene su propio estado, así que puedes mostrar varios visores a la vez.

## Inputs

| Input | Tipo | Por defecto | Descripción |
|---|---|---|---|
| `src` | `string \| URL \| ArrayBuffer \| Uint8Array \| Blob \| null` | `null` | PDF a mostrar. Al cambiarlo se carga el nuevo documento. |
| `documentId` | `string \| null` | `null` | Identificador del documento. Se guarda en cada anotación (`documentId`). |
| `user` | `PdfUser \| null` | `null` | Usuario actual `{ id, name, color? }`. **Sin usuario el visor es de solo lectura.** |
| `annotations` | `PdfAnnotation[] \| AnnotationExport \| string \| null` | `null` | Anotaciones a mostrar (desde tu BD). Acepta array, el objeto de exportación o texto JSON. |
| `language` | `'es' \| 'en' \| 'pt' \| string` | `'es'` | Idioma de la interfaz. |
| `translations` | `Record<string, PdfAnnotatorTranslationsOverride>` | — | Textos propios o idiomas nuevos. Ver [Personalización](PERSONALIZACION.md#idiomas). |
| `theme` | `'light' \| 'dark' \| 'auto'` | `'light'` | Tema. `auto` sigue al sistema operativo. |
| `mode` | `'view' \| 'annotate'` | `'view'` | Modo inicial. |
| `readOnly` | `boolean` | `false` | Desactiva crear, editar, responder, cambiar estado y eliminar. |
| `permissions` | `PdfAnnotatorPermissions` | ver abajo | Permisos. |
| `security` | `PdfSecurityConfig` | ver abajo | Bloqueos de descarga, impresión, clic derecho, copia y arrastre. |
| `toolbar` | `PdfToolbarConfig` | ver abajo | Qué botones se muestran en la barra superior. |
| `watermark` | `WatermarkConfig \| WatermarkConfig[] \| null` | `null` | Una o varias marcas de agua. |
| `zoom` | `number \| 'fit-width' \| 'fit-page'` | `'fit-width'` | Zoom inicial (`1` = 100 %). |
| `page` | `number` | `1` | Página inicial. |
| `palette` | `string[]` | 12 colores | Colores de la paleta (`#RRGGBB`). |
| `toolStyles` | `Partial<Record<AnnotationType, Partial<ToolStyle>>>` | — | Color, opacidad y grosor iniciales por herramienta. |
| `showLeftPanel` | `boolean` | `false` | Abre el panel izquierdo al iniciar. |
| `showComments` | `boolean` | `false` | Abre el panel de comentarios al iniciar. |
| `httpHeaders` | `Record<string, string>` | — | Cabeceras para descargar el PDF (p. ej. `Authorization`). |
| `withCredentials` | `boolean` | `false` | Envía cookies en la petición del PDF. |
| `password` | `string` | — | Contraseña de un PDF protegido. |

### `PdfAnnotatorPermissions`

| Propiedad | Por defecto | Descripción |
|---|---|---|
| `canAnnotate` | `true` | Puede crear anotaciones (oculta el modo **Anotar** si es `false`). |
| `canReply` | `true` | Puede responder comentarios. |
| `canChangeStatus` | `true` | Puede cambiar estados. |
| `deleteOwnOnly` | `true` | Solo el autor elimina sus anotaciones/respuestas. |
| `editOwnOnly` | `true` | Solo el autor edita el texto y el color de sus anotaciones/respuestas. |
| `canDelete(item, user)` | — | Función que decide por completo si se puede eliminar (ignora `deleteOwnOnly`). |
| `canEdit(item, user)` | — | Función que decide por completo si se puede editar (ignora `editOwnOnly`). |

```ts
// Ejemplo: los administradores pueden eliminar cualquier cosa
permissions: PdfAnnotatorPermissions = {
  canDelete: (item, user) => !!user && (user.id === item.author.id || this.auth.isAdmin()),
};
```

> Los permisos del visor son de **interfaz**. Valida siempre en tu backend que quien elimina una anotación es su autor.

### `PdfSecurityConfig`

| Propiedad | Por defecto | Descripción |
|---|---|---|
| `disableDownload` | `true` | Bloquea `Ctrl/⌘ + S`. El visor no tiene botón de descarga. |
| `disablePrint` | `true` | Bloquea `Ctrl/⌘ + P` y oculta el visor en la vista de impresión del navegador. |
| `disableContextMenu` | `true` | Bloquea el clic derecho dentro del visor. |
| `disableCopy` | `false` | Bloquea copiar/cortar texto del documento. |
| `disableDrag` | `true` | Impide arrastrar las imágenes de las páginas. |

### `PdfToolbarConfig`

`leftPanel`, `zoom`, `search`, `comments`, `modeSwitch`, `pageNavigation` (por defecto `true`) y `themeToggle`, `languageSelector` (por defecto `false`).

### `WatermarkConfig`

| Propiedad | Por defecto | Descripción |
|---|---|---|
| `text` | — | Texto. Variables: `{{userName}}`, `{{userId}}`, `{{date}}`, `{{dateTime}}`, `{{page}}`, `{{totalPages}}`. `\n` para varias líneas. |
| `mode` | `'diagonal'` | `'horizontal'`, `'vertical'`, `'diagonal'` o `'tiled'` (mosaico por toda la página). |
| `color` | `'#d32f2f'` | Color CSS. |
| `opacity` | `0.18` | 0 – 1. |
| `fontSize` | `48` (`22` en mosaico) | En puntos PDF; escala con el zoom. |
| `fontFamily` / `fontWeight` | Helvetica / `bold` | |
| `angle` | según modo | Grados. En mosaico, por defecto −30; usa `0` para filas horizontales. |
| `gap` | `90` | Separación del mosaico (puntos PDF). |
| `pages` | todas | Páginas (empezando en 1) donde aplicar. |

## Outputs

| Output | Payload | Cuándo |
|---|---|---|
| `annotationChange` | `AnnotationChangeEvent` | **Cada cambio**: crear, editar, eliminar, responder, editar/eliminar respuesta, cambiar estado. Úsalo para persistir. |
| `annotationsChange` | `PdfAnnotation[]` | Lista completa tras cada cambio. |
| `annotationAdd` / `annotationUpdate` / `annotationDelete` | `PdfAnnotation` | Atajos por tipo de acción (respuestas y estados cuentan como `update`). |
| `annotationSelect` | `PdfAnnotation \| null` | Selección de una anotación. |
| `documentLoaded` | `{ numPages, title?, fingerprint }` | PDF cargado. |
| `documentError` | `unknown` | Error al cargar (red, PDF dañado, contraseña…). |
| `pageChange` | `number` | Página actual. |
| `zoomChange` | `number` | Zoom actual (1 = 100 %). |
| `modeChange` | `'view' \| 'annotate'` | |
| `languageChange` / `themeChange` | `string` / `'light' \| 'dark'` | Cuando el usuario los cambia desde la barra. |
| `securityBlocked` | `'print' \| 'download' \| 'contextmenu' \| 'copy'` | Intento bloqueado (útil para auditoría). |

### `AnnotationChangeEvent`

```ts
interface AnnotationChangeEvent {
  action: 'add' | 'update' | 'delete' | 'reply-add' | 'reply-update' | 'reply-delete' | 'status';
  annotation: PdfAnnotation;   // estado final completo (en 'delete', la anotación eliminada)
  reply?: AnnotationReply;     // en acciones reply-*
  status?: AnnotationStatus;   // en 'status'
  user: { id: string; name: string }; // quién hizo el cambio
}
```

## Métodos públicos

Accede con `viewChild(NgPdfAnnotatorComponent)`:

```ts
private viewer = viewChild.required(NgPdfAnnotatorComponent);

exportar() {
  const json = this.viewer().exportAnnotationsJson(true);
}
```

| Método | Descripción |
|---|---|
| `getAnnotations(): PdfAnnotation[]` | Copia de las anotaciones actuales. |
| `exportAnnotations(): AnnotationExport` | Objeto `{ schemaVersion, documentId, exportedAt, annotations }`. |
| `exportAnnotationsJson(pretty?)` | Lo mismo como texto JSON. |
| `importAnnotations(input, { replace? })` | Carga anotaciones (array, objeto o JSON). `replace: false` las fusiona por `id`. No emite eventos. |
| `upsertAnnotation(annotation)` | Añade o reemplaza una anotación sin emitir eventos (p. ej. recibida por WebSocket de otro usuario). |
| `removeAnnotationLocal(id)` | Quita una anotación sin comprobar permisos ni emitir eventos (sincronización remota). |
| `clearAnnotations()` | Vacía el visor (no emite eventos). |
| `goToPage(n)` | Navega a una página. |
| `setZoom(value)` | Número o `'fit-width'` / `'fit-page'`. |
| `setMode('view' \| 'annotate')` | |
| `selectAnnotation(id)` | Selecciona y desplaza la vista hasta la anotación. |
| `currentPage` / `numPages` | Getters. |

## Utilidades exportadas

```ts
import {
  serializeAnnotations, // (annotations, documentId?) => AnnotationExport
  annotationsToJson,    // (annotations, documentId?, pretty?) => string
  parseAnnotations,     // (unknown) => PdfAnnotation[]  (valida y completa campos)
  normalizeAnnotation,  // (unknown) => PdfAnnotation | null
  ES, EN, PT, mergeTranslations,
  DEFAULT_PALETTE, DEFAULT_TOOL_STYLES, DEFAULT_ZOOM_LEVELS,
  provideNgPdfAnnotator,
} from 'ng-pdf-annotator';
```

## Configuración global: `provideNgPdfAnnotator`

Valores por defecto para todos los visores de la app (los inputs tienen prioridad):

```ts
provideNgPdfAnnotator({
  workerSrc: 'assets/pdfjs/pdf.worker.min.mjs',
  cMapUrl: 'assets/pdfjs/cmaps/',     // solo si tienes PDFs con fuentes CJK
  language: 'es',
  theme: 'auto',
  permissions: { deleteOwnOnly: true },
  security: { disableCopy: true },
  toolbar: { themeToggle: true },
  palette: ['#ffd400', '#ff5a5f', '#3b82f6', '#22c55e'],
  toolStyles: { highlight: { color: '#a3e635', opacity: 0.35 } },
  zoomLevels: [0.5, 0.75, 1, 1.5, 2],
  minZoom: 0.25,
  maxZoom: 5,
  dateFormat: { dateStyle: 'short', timeStyle: 'short' },
  translations: { es: { toolbar: { annotate: 'Revisar' } } },
});
```
