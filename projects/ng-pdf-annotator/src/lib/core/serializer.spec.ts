import { annotationsToJson, normalizeAnnotation, parseAnnotations, serializeAnnotations } from './serializer';
import { PdfAnnotation } from '../models/annotation.model';

const highlight: PdfAnnotation = {
  id: 'a1',
  documentId: 'doc-1',
  type: 'highlight',
  page: 2,
  color: '#ffd400',
  opacity: 0.4,
  contents: 'Revisar',
  author: { id: 'u1', name: 'Ana' },
  createdAt: '2026-01-01T10:00:00.000Z',
  updatedAt: '2026-01-01T10:00:00.000Z',
  status: 'accepted',
  marked: 'unmarked',
  statusHistory: [],
  replies: [],
  pageSize: { width: 612, height: 792 },
  rects: [{ x: 10, y: 20, width: 100, height: 12 }],
  selectedText: 'hola',
};

describe('serializer', () => {
  it('exporta con schemaVersion y documentId', () => {
    const out = serializeAnnotations([highlight], 'doc-1');
    expect(out.schemaVersion).toBe(1);
    expect(out.documentId).toBe('doc-1');
    expect(out.annotations[0]).toEqual(highlight);
    expect(out.annotations[0]).not.toBe(highlight);
  });

  it('ida y vuelta por JSON sin pérdidas', () => {
    expect(parseAnnotations(annotationsToJson([highlight], 'doc-1'))).toEqual([highlight]);
  });

  it('acepta array, objeto suelto y array de strings', () => {
    expect(parseAnnotations([highlight])).toHaveLength(1);
    expect(parseAnnotations(highlight)).toHaveLength(1);
    expect(parseAnnotations([JSON.stringify(highlight)])).toHaveLength(1);
  });

  it('descarta anotaciones inválidas', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(parseAnnotations([{ type: 'nope', page: 1 }, { ...highlight, rects: [] }, { ...highlight, page: 0 }])).toEqual([]);
    expect(parseAnnotations('{no json')).toEqual([]);
    warn.mockRestore();
  });

  it('completa campos que faltan', () => {
    const a = normalizeAnnotation({ type: 'note', page: 1, position: { x: 5, y: 6 } });
    expect(a).not.toBeNull();
    expect(a!.id).toBeTruthy();
    expect(a!.status).toBe('none');
    expect(a!.marked).toBe('unmarked');
    expect(a!.replies).toEqual([]);
  });

  it('normaliza trazos a mano alzada', () => {
    const a = normalizeAnnotation({ type: 'freehand', page: 3, paths: [[{ x: 1, y: 2 }, { x: 3, y: 4 }]] });
    expect(a?.type).toBe('freehand');
    expect((a as { strokeWidth: number }).strokeWidth).toBe(2);
  });
});
