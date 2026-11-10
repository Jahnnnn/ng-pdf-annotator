import { mergeLineRects, simplifyPoints, initials } from './utils';
import { mergeTranslations, ES, interpolate } from '../i18n/translations';
import { resolveWatermarkText } from './watermark';

describe('utils', () => {
  it('une rectángulos de la misma línea', () => {
    const r = mergeLineRects([
      { x: 0, y: 10, width: 50, height: 12 },
      { x: 50, y: 10, width: 40, height: 12 },
      { x: 0, y: 30, width: 60, height: 12 },
    ]);
    expect(r).toEqual([
      { x: 0, y: 10, width: 90, height: 12 },
      { x: 0, y: 30, width: 60, height: 12 },
    ]);
  });

  it('simplifica puntos cercanos', () => {
    const pts = Array.from({ length: 50 }, (_, i) => ({ x: i * 0.1, y: 0 }));
    expect(simplifyPoints(pts).length).toBeLessThan(10);
  });

  it('calcula iniciales', () => {
    expect(initials('Ana María Pérez')).toBe('AP');
    expect(initials('')).toBe('?');
  });

  it('mezcla traducciones parciales', () => {
    const t = mergeTranslations(ES, { toolbar: { search: 'Encontrar' } });
    expect(t.toolbar.search).toBe('Encontrar');
    expect(t.toolbar.zoomIn).toBe(ES.toolbar.zoomIn);
  });

  it('interpola parámetros', () => {
    expect(interpolate('{current} de {total}', { current: 1, total: 3 })).toBe('1 de 3');
  });

  it('resuelve variables de la marca de agua', () => {
    const text = resolveWatermarkText('{{userName}} - {{page}}/{{totalPages}}', {
      userName: 'Ana',
      userId: 'u1',
      date: '',
      dateTime: '',
      page: 2,
      totalPages: 9,
    });
    expect(text).toBe('Ana - 2/9');
  });
});
