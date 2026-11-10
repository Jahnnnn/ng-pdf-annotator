# Formato JSON y guardado en base de datos

El visor no guarda nada por sí mismo: **emite cada cambio como JSON** para que tu aplicación lo persista y, al volver a abrir el documento, le pasas las anotaciones guardadas por el input `annotations`.

```
 Tu BD ──(GET anotaciones del documento)──► [annotations]   <ng-pdf-annotator>
 Tu BD ◄──(POST/PUT/DELETE por anotación)── (annotationChange)
```

## Sistema de coordenadas

- Unidades: **puntos PDF** (1 pt = 1/72 pulgada) con zoom 100 %.
- Origen: **esquina superior izquierda** de la página tal como se muestra (ya rotada).
- Así las anotaciones no dependen del zoom, de la pantalla ni del dispositivo.
- `pageSize` guarda el tamaño de la página al crear la anotación por si quieres validar que el documento no cambió.

## Esquema de una anotación

Campos comunes a todos los tipos:

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | `string` (UUID) | Úsalo como clave primaria. |
| `documentId` | `string \| null` | El `documentId` del visor. |
| `type` | `'highlight' \| 'underline' \| 'strikeout' \| 'squiggly' \| 'freehand' \| 'freehandHighlight' \| 'note'` | |
| `page` | `number` | Empieza en 1. |
| `color` | `string` | `#RRGGBB` |
| `opacity` | `number` | 0 – 1 |
| `contents` | `string` | Texto del comentario principal. |
| `author` | `{ id, name }` | Quién la creó. |
| `createdAt` / `updatedAt` | `string` | ISO-8601 (UTC). |
| `status` | `'none' \| 'accepted' \| 'rejected' \| 'cancelled' \| 'completed'` | Estado de revisión. |
| `marked` | `'marked' \| 'unmarked'` | Estado de marcado (independiente). |
| `statusHistory` | `{ status, author, date }[]` | Historial de cambios de estado. |
| `replies` | `{ id, author, contents, createdAt, updatedAt }[]` | Respuestas. |
| `pageSize` | `{ width, height }` | Puntos PDF. |
| `metadata` | `object` (opcional) | Libre para tus datos; se conserva. |

Campos según el tipo:

| Tipo | Campos |
|---|---|
| `highlight`, `underline`, `strikeout`, `squiggly` | `rects: { x, y, width, height }[]` (uno por línea) y `selectedText: string` |
| `freehand`, `freehandHighlight` | `paths: { x, y }[][]` y `strokeWidth: number` |
| `note` | `position: { x, y }` |

### Ejemplo

```json
{
  "id": "4b0c9f0e-2d7a-4e0b-9b1e-0f3a1d2c3b4a",
  "documentId": "contrato-123",
  "type": "highlight",
  "page": 3,
  "color": "#ffd400",
  "opacity": 0.4,
  "contents": "Esta cláusula debe revisarla el área legal.",
  "author": { "id": "u-17", "name": "Ana Pérez" },
  "createdAt": "2026-11-10T15:20:11.482Z",
  "updatedAt": "2026-11-10T15:20:11.482Z",
  "status": "accepted",
  "marked": "unmarked",
  "statusHistory": [
    { "status": "accepted", "author": { "id": "u-08", "name": "Carlos Gómez" }, "date": "2026-11-10T16:02:40.120Z" }
  ],
  "replies": [
    {
      "id": "a1f2…",
      "author": { "id": "u-08", "name": "Carlos Gómez" },
      "contents": "De acuerdo, lo envío hoy.",
      "createdAt": "2026-11-10T16:01:02.004Z",
      "updatedAt": "2026-11-10T16:01:02.004Z"
    }
  ],
  "pageSize": { "width": 612, "height": 792 },
  "rects": [
    { "x": 70.8, "y": 211.5, "width": 452.1, "height": 12.2 },
    { "x": 70.8, "y": 226.1, "width": 301.4, "height": 12.2 }
  ],
  "selectedText": "El contratista entregará la documentación técnica…"
}
```

### Exportación completa

`exportAnnotations()` / `serializeAnnotations()` devuelven:

```json
{ "schemaVersion": 1, "documentId": "contrato-123", "exportedAt": "2026-11-10T17:00:00.000Z", "annotations": [ … ] }
```

`schemaVersion` permite migrar el formato en el futuro sin romper lo que ya tengas guardado.

## Modelo de tabla recomendado

Guarda **una fila por anotación** con el JSON completo en una columna. Las respuestas y el historial de estados viajan dentro del JSON, así que cualquier cambio es un `UPSERT` de una sola fila.

```sql
-- PostgreSQL (en SQL Server usa NVARCHAR(MAX) y ISJSON; en MySQL, JSON)
CREATE TABLE pdf_annotations (
  id           UUID PRIMARY KEY,
  document_id  VARCHAR(100) NOT NULL,
  page         INT          NOT NULL,
  author_id    VARCHAR(100) NOT NULL,
  status       VARCHAR(20)  NOT NULL,
  data         JSONB        NOT NULL,   -- la anotación completa
  created_at   TIMESTAMPTZ  NOT NULL,
  updated_at   TIMESTAMPTZ  NOT NULL
);
CREATE INDEX ix_pdf_annotations_doc ON pdf_annotations (document_id, page);
```

Las columnas `page`, `author_id` y `status` se duplican del JSON solo para filtrar o hacer informes.

## Integración en Angular

```ts
@Injectable({ providedIn: 'root' })
export class AnotacionesApi {
  private http = inject(HttpClient);

  listar(documentId: string) {
    return this.http.get<PdfAnnotation[]>(`/api/documentos/${documentId}/anotaciones`);
  }
  guardar(a: PdfAnnotation) {
    return this.http.put(`/api/anotaciones/${a.id}`, a); // UPSERT
  }
  eliminar(id: string) {
    return this.http.delete(`/api/anotaciones/${id}`);
  }
}
```

```ts
@Component({
  imports: [NgPdfAnnotatorComponent],
  template: `
    <ng-pdf-annotator
      [src]="url"
      [documentId]="documentId"
      [user]="usuario"
      [annotations]="anotaciones()"
      (annotationChange)="onChange($event)"
      (documentError)="error($event)"
    />
  `,
})
export class VisorComponent {
  private api = inject(AnotacionesApi);
  documentId = 'contrato-123';
  url = `/api/documentos/${this.documentId}/pdf`;
  usuario = { id: 'u-17', name: 'Ana Pérez' };
  anotaciones = toSignal(this.api.listar(this.documentId), { initialValue: [] });

  onChange(e: AnnotationChangeEvent) {
    const req = e.action === 'delete' ? this.api.eliminar(e.annotation.id) : this.api.guardar(e.annotation);
    req.subscribe({ error: () => console.error('No se pudo guardar', e) });
  }
}
```

### Cola de guardado (opcional)

Si un usuario hace muchos cambios rápidos sobre la misma anotación (por ejemplo, cambia de color varias veces), puedes agruparlos por `id`:

```ts
private pendientes = new Map<string, AnnotationChangeEvent>();
private flush = debounce(() => {
  for (const e of this.pendientes.values()) { /* guardar o eliminar */ }
  this.pendientes.clear();
}, 800);

onChange(e: AnnotationChangeEvent) {
  this.pendientes.set(e.annotation.id, e);
  this.flush();
}
```

## Backend de ejemplo (Node.js + Express + PostgreSQL)

```js
app.get('/api/documentos/:doc/anotaciones', async (req, res) => {
  const { rows } = await db.query(
    'SELECT data FROM pdf_annotations WHERE document_id = $1 ORDER BY page, created_at',
    [req.params.doc],
  );
  res.json(rows.map((r) => r.data));
});

app.put('/api/anotaciones/:id', async (req, res) => {
  const a = req.body;
  const existente = await db.query('SELECT author_id, data FROM pdf_annotations WHERE id = $1', [a.id]);
  if (existente.rowCount && existente.rows[0].author_id !== req.user.id) {
    // Otro usuario: solo puede añadir respuestas o cambiar el estado, no el contenido ni la forma.
    const antes = existente.rows[0].data;
    const { replies: _r1, status: _s1, marked: _m1, statusHistory: _h1, ...restoNuevo } = a;
    const { replies: _r2, status: _s2, marked: _m2, statusHistory: _h2, ...restoAntes } = antes;
    if (JSON.stringify(restoNuevo) !== JSON.stringify(restoAntes)) return res.status(403).end();
  }
  await db.query(
    `INSERT INTO pdf_annotations (id, document_id, page, author_id, status, data, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (id) DO UPDATE SET status = $5, data = $6, updated_at = $8`,
    [a.id, a.documentId, a.page, a.author.id, a.status, a, a.createdAt, a.updatedAt],
  );
  res.status(204).end();
});

app.delete('/api/anotaciones/:id', async (req, res) => {
  const r = await db.query('DELETE FROM pdf_annotations WHERE id = $1 AND author_id = $2', [req.params.id, req.user.id]);
  res.status(r.rowCount ? 204 : 403).end();
});
```

> Nunca confíes en el `author` que llega del navegador para decidir permisos: usa el usuario autenticado en tu backend.

## Colaboración en tiempo real (opcional)

Si varios revisores trabajan a la vez, reenvía los eventos por WebSocket/SignalR y aplícalos en los demás visores sin volver a emitirlos:

```ts
socket.on('annotation', (e: AnnotationChangeEvent) => {
  if (e.action === 'delete') this.viewer().removeAnnotationLocal(e.annotation.id);
  else this.viewer().upsertAnnotation(e.annotation);
});
```

## Validación al importar

`parseAnnotations()` (que usa también el input `annotations`) acepta:

- el objeto de exportación completo,
- un array de anotaciones,
- una sola anotación,
- un array de strings JSON (una columna JSON por fila),
- cualquiera de los anteriores como texto JSON.

Descarta lo que no sea válido (avisa por consola) y completa los campos opcionales que falten (`status`, `replies`, `statusHistory`…).
