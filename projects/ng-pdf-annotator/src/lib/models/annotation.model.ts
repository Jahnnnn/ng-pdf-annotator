/**
 * Modelos de datos de las anotaciones.
 *
 * SISTEMA DE COORDENADAS
 * ----------------------
 * Todas las coordenadas se guardan en "puntos PDF" (1 pt = 1/72 pulgada) sobre la página
 * tal como se muestra (ya rotada) con zoom 100 %, con el origen (0,0) en la ESQUINA SUPERIOR
 * IZQUIERDA. Así las anotaciones son independientes del zoom, del tamaño de pantalla y del
 * dispositivo, y se pueden guardar en BD y volver a pintar exactamente en el mismo sitio.
 */

/** Herramientas de anotación disponibles. */
export type AnnotationType =
  | 'highlight'
  | 'underline'
  | 'strikeout'
  | 'squiggly'
  | 'freehand'
  | 'freehandHighlight'
  | 'note';

/** Tipos que se crean seleccionando texto. */
export const TEXT_MARKUP_TYPES: readonly AnnotationType[] = ['highlight', 'underline', 'strikeout', 'squiggly'];

/** Tipos que se dibujan a mano alzada. */
export const INK_TYPES: readonly AnnotationType[] = ['freehand', 'freehandHighlight'];

/** Estado de revisión de una anotación o comentario. */
export type ReviewStatus = 'none' | 'accepted' | 'rejected' | 'cancelled' | 'completed';

/** Estado de marcado (independiente del estado de revisión). */
export type MarkedStatus = 'marked' | 'unmarked';

/** Cualquiera de los 7 estados que se pueden asignar desde el botón de estado. */
export type AnnotationStatus = ReviewStatus | MarkedStatus;

export const REVIEW_STATUSES: readonly ReviewStatus[] = ['accepted', 'rejected', 'cancelled', 'completed', 'none'];
export const MARKED_STATUSES: readonly MarkedStatus[] = ['marked', 'unmarked'];

/** Usuario que crea o modifica anotaciones. */
export interface PdfUser {
  /** Identificador único (el de tu sistema/BD). Se usa para los permisos. */
  id: string;
  /** Nombre que se muestra en anotaciones y comentarios. */
  name: string;
  /** Color opcional del avatar (si no se envía se calcula a partir del id). */
  color?: string;
}

/** Autor guardado dentro de cada anotación/respuesta. */
export interface AnnotationAuthor {
  id: string;
  name: string;
}

/** Rectángulo en puntos PDF (origen arriba-izquierda). */
export interface PdfRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Punto en puntos PDF (origen arriba-izquierda). */
export interface PdfPoint {
  x: number;
  y: number;
}

/** Entrada del historial de cambios de estado. */
export interface StatusChange {
  status: AnnotationStatus;
  author: AnnotationAuthor;
  /** Fecha ISO-8601. */
  date: string;
}

/** Respuesta a un comentario/anotación. */
export interface AnnotationReply {
  id: string;
  author: AnnotationAuthor;
  contents: string;
  /** Fecha ISO-8601. */
  createdAt: string;
  /** Fecha ISO-8601. */
  updatedAt: string;
}

/** Campos comunes a todas las anotaciones. */
export interface PdfAnnotationBase {
  /** Id único (UUID). Úsalo como clave primaria en tu BD. */
  id: string;
  /** Id del documento al que pertenece (el `documentId` configurado en el visor). */
  documentId: string | null;
  type: AnnotationType;
  /** Número de página, empezando en 1. */
  page: number;
  /** Color en formato #RRGGBB. */
  color: string;
  /** Opacidad de 0 a 1. */
  opacity: number;
  /** Texto del comentario asociado (puede estar vacío). */
  contents: string;
  author: AnnotationAuthor;
  /** Fecha ISO-8601. */
  createdAt: string;
  /** Fecha ISO-8601. */
  updatedAt: string;
  status: ReviewStatus;
  marked: MarkedStatus;
  statusHistory: StatusChange[];
  replies: AnnotationReply[];
  /** Tamaño de la página (puntos PDF) cuando se creó. Útil para validar o escalar. */
  pageSize: { width: number; height: number };
  /** Campo libre para tus propios datos (se respeta al importar/exportar). */
  metadata?: Record<string, unknown>;
}

/** Resaltado, subrayado, tachado u ondulado sobre texto. */
export interface TextMarkupAnnotation extends PdfAnnotationBase {
  type: 'highlight' | 'underline' | 'strikeout' | 'squiggly';
  /** Un rectángulo por línea de texto seleccionada. */
  rects: PdfRect[];
  /** Texto que estaba seleccionado. */
  selectedText: string;
}

/** Trazo libre (lápiz) o resaltador libre. */
export interface InkAnnotation extends PdfAnnotationBase {
  type: 'freehand' | 'freehandHighlight';
  /** Uno o varios trazos; cada trazo es una lista de puntos. */
  paths: PdfPoint[][];
  /** Grosor del pincel en puntos PDF. */
  strokeWidth: number;
}

/** Nota adhesiva (comentario anclado a un punto). */
export interface NoteAnnotation extends PdfAnnotationBase {
  type: 'note';
  /** Esquina superior izquierda del icono de la nota. */
  position: PdfPoint;
}

export type PdfAnnotation = TextMarkupAnnotation | InkAnnotation | NoteAnnotation;

/** Formato del JSON de exportación/importación. */
export interface AnnotationExport {
  /** Versión del esquema, para migraciones futuras. */
  schemaVersion: 1;
  documentId: string | null;
  /** Fecha ISO-8601 de la exportación. */
  exportedAt: string;
  annotations: PdfAnnotation[];
}

/** Configuración del pincel de cada herramienta. */
export interface ToolStyle {
  color: string;
  opacity: number;
  /** Solo aplica a freehand / freehandHighlight. */
  strokeWidth: number;
}

/** Tipos de cambio que emite el visor. */
export type AnnotationChangeAction =
  | 'add'
  | 'update'
  | 'delete'
  | 'reply-add'
  | 'reply-update'
  | 'reply-delete'
  | 'status';

/** Evento que se emite cada vez que cambian las anotaciones (para persistir en BD). */
export interface AnnotationChangeEvent {
  action: AnnotationChangeAction;
  /** Anotación en su estado final (en `delete` es la anotación eliminada). */
  annotation: PdfAnnotation;
  /** Respuesta afectada en acciones `reply-*`. */
  reply?: AnnotationReply;
  /** Estado aplicado en acciones `status`. */
  status?: AnnotationStatus;
  /** Usuario que hizo el cambio. */
  user: AnnotationAuthor;
}
