import { PdfRect } from '../models/annotation.model';
import { PDFDocumentProxy, PageViewport } from './pdfjs';
import { SearchMatch } from './pdf-annotator.store';

interface PageIndex {
  /** Texto normalizado de la página (minúsculas opcionales se aplican al buscar). */
  text: string;
  /** Texto con mayúsculas originales pero sin tildes. */
  raw: string;
  /** Para cada carácter de `text`: índice del item y offset dentro del item. */
  map: { item: number; offset: number }[];
  items: { rect: PdfRect; length: number }[];
}

const cache = new WeakMap<PDFDocumentProxy, Map<number, Promise<PageIndex>>>();

/** Quita tildes manteniendo una correspondencia 1:1 de caracteres. */
function fold(ch: string): string {
  const f = ch.normalize('NFD').replace(/[̀-ͯ]/g, '');
  return f.length === 1 ? f : ch;
}

function indexPage(doc: PDFDocumentProxy, pageNumber: number): Promise<PageIndex> {
  let docCache = cache.get(doc);
  if (!docCache) {
    docCache = new Map();
    cache.set(doc, docCache);
  }
  let p = docCache.get(pageNumber);
  if (!p) {
    p = (async () => {
      const page = await doc.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const index: PageIndex = { text: '', raw: '', map: [], items: [] };
      let raw = '';
      for (const it of content.items) {
        if (!('str' in it)) continue;
        const itemIdx = index.items.length;
        index.items.push({ rect: itemRect(it.transform, it.width, it.height, viewport), length: it.str.length });
        for (let i = 0; i < it.str.length; i++) {
          raw += fold(it.str[i]);
          index.map.push({ item: itemIdx, offset: i });
        }
        if (it.hasEOL) {
          // Unimos líneas con un espacio (y se elimina el guion de corte de palabra al final).
          if (raw.endsWith('-')) {
            raw = raw.slice(0, -1);
            index.map.pop();
          } else {
            raw += ' ';
            index.map.push({ item: itemIdx, offset: it.str.length });
          }
        }
      }
      index.raw = raw;
      index.text = raw.toLowerCase();
      return index;
    })();
    docCache.set(pageNumber, p);
  }
  return p;
}

function itemRect(t: number[], width: number, height: number, vp: PageViewport): PdfRect {
  const fontH = height || Math.hypot(t[2], t[3]);
  const [x1, y1] = vp.convertToViewportPoint(t[4], t[5] - fontH * 0.2);
  const [x2, y2] = vp.convertToViewportPoint(t[4] + width, t[5] + fontH * 0.9);
  return {
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    width: Math.abs(x2 - x1),
    height: Math.abs(y2 - y1),
  };
}

/**
 * Busca un texto en todo el documento (sin distinguir tildes).
 * Devuelve un resultado por coincidencia con los rectángulos a resaltar.
 */
export async function searchDocument(
  doc: PDFDocumentProxy,
  query: string,
  matchCase: boolean,
  signal?: { cancelled: boolean },
  onProgress?: (partial: SearchMatch[]) => void,
): Promise<SearchMatch[]> {
  const q0 = [...query.trim().replace(/\s+/g, ' ')].map(fold).join('');
  if (!q0) return [];
  const q = matchCase ? q0 : q0.toLowerCase();
  const results: SearchMatch[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    if (signal?.cancelled) return results;
    const idx = await indexPage(doc, n);
    const hay = matchCase ? idx.raw : idx.text;
    let from = 0;
    let pos: number;
    while ((pos = hay.indexOf(q, from)) !== -1) {
      results.push({ page: n, rects: matchRects(idx, pos, q.length) });
      from = pos + q.length;
    }
    if (onProgress && n % 10 === 0) onProgress([...results]);
  }
  return results;
}

function matchRects(idx: PageIndex, start: number, length: number): PdfRect[] {
  const perItem = new Map<number, { from: number; to: number }>();
  for (let i = start; i < start + length; i++) {
    const m = idx.map[i];
    if (!m) continue;
    const cur = perItem.get(m.item);
    if (cur) cur.to = Math.max(cur.to, m.offset + 1);
    else perItem.set(m.item, { from: m.offset, to: m.offset + 1 });
  }
  const rects: PdfRect[] = [];
  for (const [item, range] of perItem) {
    const it = idx.items[item];
    if (!it || !it.length) continue;
    const to = Math.min(range.to, it.length);
    const vertical = it.rect.height > it.rect.width * 3 && it.length > 2;
    if (vertical) {
      const ch = it.rect.height / it.length;
      rects.push({ x: it.rect.x, y: it.rect.y + ch * range.from, width: it.rect.width, height: ch * (to - range.from) });
    } else {
      const cw = it.rect.width / it.length;
      rects.push({ x: it.rect.x + cw * range.from, y: it.rect.y, width: cw * (to - range.from), height: it.rect.height });
    }
  }
  return rects;
}
