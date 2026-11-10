# Personalización

## Idiomas

El idioma por defecto es **español**. Incluidos: `es`, `en`, `pt`.

```html
<ng-pdf-annotator [language]="'en'" />
```

### Cambiar algunos textos

```ts
translations = {
  es: { toolbar: { annotate: 'Revisar' }, status: { accepted: 'Aprobado' } },
};
```

```html
<ng-pdf-annotator [translations]="translations" />
```

### Añadir un idioma

Solo tienes que traducir lo que quieras; lo que falte se toma del español.

```ts
import { PdfAnnotatorTranslationsOverride } from 'ng-pdf-annotator';

const FR: PdfAnnotatorTranslationsOverride = {
  toolbar: { search: 'Rechercher', comments: 'Commentaires', view: 'Voir', annotate: 'Annoter' },
  comments: { title: 'Commentaires', reply: 'Répondre', page: 'Page {page}' },
  status: { accepted: 'Accepté', rejected: 'Rejeté', cancelled: 'Annulé', completed: 'Terminé',
            none: 'Aucun', marked: 'Marqué', unmarked: 'Non marqué' },
};
```

```html
<ng-pdf-annotator [language]="'fr'" [translations]="{ fr: FR }" />
```

La lista completa de claves está en el objeto exportado `ES` (`import { ES } from 'ng-pdf-annotator'`). Las fechas se formatean con `Intl.DateTimeFormat` en el idioma activo; el formato se cambia con `dateFormat` en `provideNgPdfAnnotator`.

Para mostrar el selector de idioma en la barra: `[toolbar]="{ languageSelector: true }"`.

## Temas

```html
<ng-pdf-annotator theme="dark" />   <!-- light | dark | auto -->
```

Botón de tema en la barra: `[toolbar]="{ themeToggle: true }"`. Escucha `(themeChange)` para recordarlo.

### Variables CSS

Sobrescríbelas en tu hoja de estilos global:

```css
ng-pdf-annotator {
  --npa-accent: #0f766e;          /* color principal */
  --npa-font: 'Inter', sans-serif;
  --npa-side-width: 380px;        /* panel de comentarios */
  --npa-left-width: 220px;        /* panel de miniaturas */
}

ng-pdf-annotator[data-theme='dark'] {
  --npa-accent: #2dd4bf;
  --npa-bg: #0a0a0a;
}
```

| Variable | Uso |
|---|---|
| `--npa-accent`, `--npa-accent-contrast`, `--npa-accent-soft` | Color principal, texto sobre él y fondo suave |
| `--npa-bg` | Fondo detrás de las páginas |
| `--npa-surface`, `--npa-panel`, `--npa-toolbar`, `--npa-toolbar-2`, `--npa-input` | Superficies |
| `--npa-text`, `--npa-text-muted` | Texto |
| `--npa-border`, `--npa-border-strong`, `--npa-hover` | Bordes y hover |
| `--npa-danger`, `--npa-danger-soft` | Eliminar |
| `--npa-st-accepted`, `--npa-st-rejected`, `--npa-st-cancelled`, `--npa-st-completed`, `--npa-st-none`, `--npa-st-marked`, `--npa-st-unmarked` | Colores de los estados |
| `--npa-page-gap`, `--npa-page-shadow`, `--npa-shadow-lg` | Páginas y sombras |
| `--npa-selection` | Color de la selección de texto |

## Herramientas y colores

```ts
palette = ['#facc15', '#fb7185', '#60a5fa', '#4ade80', '#111827'];
toolStyles = {
  highlight: { color: '#facc15', opacity: 0.35 },
  freehand: { color: '#111827', strokeWidth: 3 },
  freehandHighlight: { strokeWidth: 18, opacity: 0.3 },
};
```

```html
<ng-pdf-annotator [palette]="palette" [toolStyles]="toolStyles" />
```

El usuario puede cambiar color, grosor y opacidad desde el botón de pincel de la barra **Anotar**, y el color de sus propias anotaciones desde la tarjeta flotante.

## Marcas de agua

```ts
// Mosaico por toda la página (diagonal)
watermark: WatermarkConfig = { text: 'CONFIDENCIAL · {{userName}} · {{dateTime}}', mode: 'tiled' };

// Mosaico en filas horizontales
watermark: WatermarkConfig = { text: 'COPIA CONTROLADA', mode: 'tiled', angle: 0, gap: 60 };

// Una sola línea horizontal centrada
watermark: WatermarkConfig = { text: 'BORRADOR', mode: 'horizontal', fontSize: 72, color: '#64748b' };

// Vertical
watermark: WatermarkConfig = { text: 'Uso interno', mode: 'vertical', opacity: 0.12 };

// Varias a la vez, solo en algunas páginas
watermarks: WatermarkConfig[] = [
  { text: 'CONFIDENCIAL', mode: 'diagonal' },
  { text: '{{userName}} · {{userId}}\n{{date}}', mode: 'horizontal', fontSize: 14, opacity: 0.35, pages: [1] },
];
```

> Escribe el texto en TypeScript. Si lo pones directamente en la plantilla, Angular interpretará `{{ }}` como interpolación.

Las marcas se dibujan **dentro del canvas** de cada página (y en las miniaturas), por lo que no se pueden quitar borrando un elemento del DOM.

## Permisos

```html
<!-- Todos pueden eliminar o editar cualquier anotación -->
<ng-pdf-annotator [permissions]="{ deleteOwnOnly: false, editOwnOnly: false }" />

<!-- Solo lectura total -->
<ng-pdf-annotator [readOnly]="true" />

<!-- Puede comentar y cambiar estados, pero no crear anotaciones nuevas -->
<ng-pdf-annotator [permissions]="{ canAnnotate: false }" />
```

Con funciones para reglas propias (roles, estados, etc.):

```ts
permissions: PdfAnnotatorPermissions = {
  canDelete: (item, user) => user?.id === item.author.id || this.roles.has('admin'),
  canEdit: (item, user) => user?.id === item.author.id && ('status' in item ? item.status === 'none' : true),
};
```

`item` puede ser una anotación (`PdfAnnotation`) o una respuesta (`AnnotationReply`).

## Barra de herramientas

```html
<ng-pdf-annotator
  [toolbar]="{ leftPanel: true, zoom: true, search: true, comments: true, modeSwitch: true,
               pageNavigation: true, themeToggle: false, languageSelector: false }"
/>
```

## Seguridad

Por defecto el visor:

- No tiene botón de descarga ni de impresión.
- Bloquea `Ctrl/⌘ + S` y `Ctrl/⌘ + P` mientras está en pantalla (muestra un aviso y emite `securityBlocked`).
- Se oculta en la vista de impresión del navegador (`@media print`): si alguien imprime la página desde el menú del navegador, el documento no aparece.
- Bloquea el clic derecho y el arrastre de imágenes dentro del visor.
- Opcionalmente bloquea copiar texto: `[security]="{ disableCopy: true }"` (en modo **Anotar** se puede seguir seleccionando texto para resaltar, pero no copiarlo).

**Limitaciones (importante):** todo PDF que se muestra en un navegador llega antes a ese navegador. Estas medidas impiden la descarga e impresión "normales", pero no las capturas de pantalla, las herramientas de desarrollador ni las extensiones. Recomendaciones para documentos sensibles:

1. Marca de agua con `{{userName}}` / `{{userId}}` y fecha (disuade y permite rastrear filtraciones).
2. Sirve el PDF desde un endpoint autenticado (`httpHeaders`, `withCredentials`) o con URLs firmadas de corta duración; no lo publiques en una ruta estática.
3. Registra los eventos `securityBlocked` si necesitas auditoría.
4. Si el documento es extremadamente sensible, considera renderizar las páginas como imágenes en el servidor.
