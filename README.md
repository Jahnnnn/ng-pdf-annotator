# ng-pdf-annotator

[![npm](https://img.shields.io/npm/v/ng-pdf-annotator.svg)](https://www.npmjs.com/package/ng-pdf-annotator)
[![CI](https://github.com/Jahnnnn/ng-pdf-annotator/actions/workflows/ci.yml/badge.svg)](https://github.com/Jahnnnn/ng-pdf-annotator/actions/workflows/ci.yml)
[![licencia](https://img.shields.io/npm/l/ng-pdf-annotator.svg)](LICENSE)

Visor de PDF para **Angular 20+** con anotaciones, comentarios por hilos y flujo de revisión entre varios usuarios.
Componente standalone, basado en signals y en [pdf.js](https://mozilla.github.io/pdf.js/), sin iframes ni visores de terceros.

> **English:** Angular PDF viewer with highlight/underline/strikeout/squiggly/freehand/note annotations, threaded comments with review statuses, watermarks, download/print/right-click blocking, i18n (es/en/pt + custom) and light/dark themes. Annotations are exported/imported as JSON so you can store them in your database.

---

## Características

| | |
|---|---|
| **Barra superior** | Panel lateral (miniaturas e índice), navegación de páginas, alejar/acercar o escribir un zoom exacto (o ajustar al ancho / página completa), buscador (sin distinguir tildes), panel de comentarios, modo **Ver** / **Anotar** |
| **Barra de anotación** | Resaltar, subrayar, tachar, ondulado, mano alzada, resaltador libre y notas. Paleta de colores + color personalizado, grosor y opacidad del pincel |
| **Comentarios** | Agrupados **por página** (plegables y cargados por bloques: un documento de 200 páginas con anotaciones en todas no satura el panel), filtros por texto, estado y página actual, respuestas, edición, nombre de usuario con fecha y hora |
| **Estados** | Aceptado, Rechazado, Cancelado, Completado, Ninguno, Marcado, Sin marcar, con historial de quién y cuándo |
| **Permisos** | Por defecto solo el autor puede eliminar o editar sus anotaciones y respuestas. Todo es parametrizable (incluso con funciones propias) |
| **Protección** | Sin botón de descarga, bloqueo de Ctrl+S, Ctrl+P, impresión y clic derecho; opcional: bloquear copiar texto |
| **Marcas de agua** | Horizontal, vertical, diagonal o en mosaico por toda la página, con variables (`{{userName}}`, `{{date}}`, …). Se pintan dentro del canvas |
| **JSON** | Cada cambio se emite como evento listo para guardar en BD; importación/exportación con esquema versionado |
| **i18n y temas** | Español por defecto, inglés y portugués incluidos, idiomas propios; tema claro, oscuro o automático; todo personalizable con variables CSS |
| **Rendimiento** | Solo se renderizan las páginas cercanas a la vista y se libera la memoria de las lejanas |

## Instalación

```bash
npm install ng-pdf-annotator
```

`pdfjs-dist` se instala automáticamente como dependencia.

### Worker de pdf.js (recomendado)

Por defecto el worker se descarga del CDN de jsDelivr. Para servirlo desde tu propia app (recomendado en producción o redes internas) añade esto a `angular.json` → `projects.<tu-app>.architect.build.options.assets`:

```json
{ "glob": "pdf.worker.min.mjs", "input": "node_modules/pdfjs-dist/build", "output": "assets/pdfjs" }
```

y configúralo una vez:

```ts
// app.config.ts
import { provideNgPdfAnnotator } from 'ng-pdf-annotator';

export const appConfig: ApplicationConfig = {
  providers: [provideNgPdfAnnotator({ workerSrc: 'assets/pdfjs/pdf.worker.min.mjs' })],
};
```

## Uso rápido

```ts
import { Component, signal } from '@angular/core';
import { AnnotationChangeEvent, NgPdfAnnotatorComponent, PdfAnnotation, WatermarkConfig } from 'ng-pdf-annotator';

@Component({
  selector: 'app-revision',
  imports: [NgPdfAnnotatorComponent],
  template: `
    <ng-pdf-annotator
      [src]="pdfUrl"
      [documentId]="docId"
      [user]="{ id: usuario.id, name: usuario.nombre }"
      [annotations]="anotaciones()"
      [watermark]="marcaDeAgua"
      (annotationChange)="guardar($event)"
    />
  `,
  styles: `ng-pdf-annotator { height: 100vh; }`,
})
export class RevisionComponent {
  pdfUrl = '/api/documentos/123/archivo';
  docId = 'documento-123';
  usuario = { id: 'u-17', nombre: 'Ana Pérez' };
  anotaciones = signal<PdfAnnotation[]>([]);
  // Las variables {{...}} van en TypeScript (en la plantilla Angular las interpretaría como interpolación).
  marcaDeAgua: WatermarkConfig = { text: 'CONFIDENCIAL · {{userName}} · {{date}}', mode: 'tiled' };

  constructor(private api: AnotacionesApi) {
    this.api.listar(this.docId).subscribe((lista) => this.anotaciones.set(lista));
  }

  guardar(e: AnnotationChangeEvent) {
    // e.action: 'add' | 'update' | 'delete' | 'reply-add' | 'reply-update' | 'reply-delete' | 'status'
    if (e.action === 'delete') this.api.eliminar(e.annotation.id).subscribe();
    else this.api.guardar(e.annotation).subscribe(); // UPSERT por id
  }
}
```

> El componente ocupa el 100 % del alto de su contenedor: dale una altura (`height: 100vh`, `flex: 1`, etc.).

## Documentación

- [API completa: inputs, outputs y métodos](docs/API.md)
- [Formato JSON y guardado en base de datos](docs/JSON-Y-BASE-DE-DATOS.md)
- [Personalización: idiomas, temas, marcas de agua, permisos y seguridad](docs/PERSONALIZACION.md)
- [Desarrollo, GitHub y publicación en npm](docs/PUBLICAR.md)

## Atajos de teclado

| Atajo | Acción |
|---|---|
| `Ctrl/⌘ + F` | Buscar |
| `Enter` / `Shift + Enter` en la búsqueda | Resultado siguiente / anterior |
| `Ctrl/⌘ + rueda`, `Ctrl/⌘ + +` / `-` | Zoom |
| `Supr` / `Retroceso` | Eliminar la anotación seleccionada (si tienes permiso) |
| `Esc` | Deseleccionar / volver a la herramienta de selección |
| `Ctrl/⌘ + Enter` en un comentario | Guardar |

## Compatibilidad

- Angular **20, 21 y 22** (componentes standalone, signals, zoneless o con zone.js).
- Navegadores modernos (Chrome, Edge, Firefox, Safari).
- SSR: el visor solo carga pdf.js en el navegador.

## Importante sobre la protección del documento

Las protecciones (bloquear descarga, impresión, clic derecho y copia) son **disuasorias**: impiden que un usuario normal descargue o imprima desde el visor, pero ningún visor web puede impedir una captura de pantalla ni que alguien con conocimientos técnicos obtenga el archivo que su navegador ya recibió. Para documentos sensibles combínalas con marcas de agua con el nombre del usuario y con control de acceso en tu backend (URLs firmadas o de corta duración, `httpHeaders` con token). Detalles en [Personalización → Seguridad](docs/PERSONALIZACION.md#seguridad).

## Licencia

[MIT](LICENSE). pdf.js se distribuye bajo licencia Apache-2.0.
