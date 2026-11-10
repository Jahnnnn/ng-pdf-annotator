import {
  AnnotationExport,
  AnnotationType,
  MARKED_STATUSES,
  PdfAnnotation,
  REVIEW_STATUSES,
} from '../models/annotation.model';
import { nowIso, uid } from './utils';

const TYPES: AnnotationType[] = [
  'highlight',
  'underline',
  'strikeout',
  'squiggly',
  'freehand',
  'freehandHighlight',
  'note',
];

/**
 * Convierte una lista de anotaciones al JSON de exportación.
 *
 * ```ts
 * const json = serializeAnnotations(viewer.getAnnotations(), 'contrato-123');
 * await http.post('/api/annotations', json);
 * ```
 */
export function serializeAnnotations(annotations: PdfAnnotation[], documentId: string | null = null): AnnotationExport {
  return {
    schemaVersion: 1,
    documentId,
    exportedAt: nowIso(),
    annotations: structuredClone(annotations),
  };
}

/** Igual que `serializeAnnotations` pero devuelve el texto JSON. */
export function annotationsToJson(annotations: PdfAnnotation[], documentId: string | null = null, pretty = false): string {
  return JSON.stringify(serializeAnnotations(annotations, documentId), null, pretty ? 2 : 0);
}

/**
 * Lee anotaciones desde cualquiera de estos formatos:
 * - el objeto/texto de exportación completo (`{ schemaVersion, annotations: [...] }`)
 * - un array de anotaciones
 * - una sola anotación (por ejemplo, una fila de tu BD)
 * - un array de strings JSON (una columna JSON por fila)
 *
 * Las anotaciones inválidas se descartan (se avisa por consola) y los campos que falten se completan.
 */
export function parseAnnotations(input: unknown): PdfAnnotation[] {
  let data: unknown = input;
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data);
    } catch {
      console.warn('[ng-pdf-annotator] JSON de anotaciones inválido');
      return [];
    }
  }
  if (!data) return [];
  let list: unknown[];
  if (Array.isArray(data)) list = data;
  else if (typeof data === 'object' && Array.isArray((data as AnnotationExport).annotations))
    list = (data as AnnotationExport).annotations;
  else list = [data];

  const out: PdfAnnotation[] = [];
  for (const raw of list) {
    const item = typeof raw === 'string' ? safeParse(raw) : raw;
    const normalized = normalizeAnnotation(item);
    if (normalized) out.push(normalized);
    else console.warn('[ng-pdf-annotator] Anotación descartada por formato inválido', item);
  }
  return out;
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

const num = (v: unknown, d = 0) => (typeof v === 'number' && isFinite(v) ? v : d);
const str = (v: unknown, d = '') => (typeof v === 'string' ? v : d);

/** Valida y completa una anotación. Devuelve `null` si no es válida. */
export function normalizeAnnotation(raw: unknown): PdfAnnotation | null {
  if (!raw || typeof raw !== 'object') return null;
  const a = raw as Record<string, any>;
  if (!TYPES.includes(a['type'])) return null;
  const page = Math.round(num(a['page'], 0));
  if (page < 1) return null;
  const now = nowIso();
  const author = a['author'] && typeof a['author'] === 'object' ? a['author'] : {};
  const base = {
    id: str(a['id']) || uid(),
    documentId: typeof a['documentId'] === 'string' ? a['documentId'] : null,
    type: a['type'],
    page,
    color: str(a['color'], '#ffd400'),
    opacity: num(a['opacity'], 1),
    contents: str(a['contents']),
    author: { id: str(author.id, 'unknown'), name: str(author.name, 'Desconocido') },
    createdAt: str(a['createdAt'], now),
    updatedAt: str(a['updatedAt'], str(a['createdAt'], now)),
    status: REVIEW_STATUSES.includes(a['status']) ? a['status'] : 'none',
    marked: MARKED_STATUSES.includes(a['marked']) ? a['marked'] : 'unmarked',
    statusHistory: Array.isArray(a['statusHistory']) ? a['statusHistory'] : [],
    replies: (Array.isArray(a['replies']) ? a['replies'] : [])
      .filter((r: any) => r && typeof r === 'object')
      .map((r: any) => ({
        id: str(r.id) || uid(),
        author: { id: str(r.author?.id, 'unknown'), name: str(r.author?.name, 'Desconocido') },
        contents: str(r.contents),
        createdAt: str(r.createdAt, now),
        updatedAt: str(r.updatedAt, str(r.createdAt, now)),
      })),
    pageSize: {
      width: num(a['pageSize']?.width, 0),
      height: num(a['pageSize']?.height, 0),
    },
    ...(a['metadata'] && typeof a['metadata'] === 'object' ? { metadata: a['metadata'] } : {}),
  };

  switch (a['type'] as AnnotationType) {
    case 'highlight':
    case 'underline':
    case 'strikeout':
    case 'squiggly': {
      const rects = (Array.isArray(a['rects']) ? a['rects'] : [])
        .map((r: any) => ({ x: num(r?.x), y: num(r?.y), width: num(r?.width), height: num(r?.height) }))
        .filter((r: any) => r.width > 0 && r.height > 0);
      if (!rects.length) return null;
      return { ...base, type: a['type'], rects, selectedText: str(a['selectedText']) } as PdfAnnotation;
    }
    case 'freehand':
    case 'freehandHighlight': {
      const paths = (Array.isArray(a['paths']) ? a['paths'] : [])
        .filter(Array.isArray)
        .map((p: any[]) => p.map((pt) => ({ x: num(pt?.x), y: num(pt?.y) })))
        .filter((p: any[]) => p.length > 0);
      if (!paths.length) return null;
      return {
        ...base,
        type: a['type'],
        paths,
        strokeWidth: num(a['strokeWidth'], a['type'] === 'freehand' ? 2 : 14),
      } as PdfAnnotation;
    }
    case 'note': {
      const p = a['position'];
      if (!p || typeof p !== 'object') return null;
      return { ...base, type: 'note', position: { x: num(p.x), y: num(p.y) } } as PdfAnnotation;
    }
  }
}
