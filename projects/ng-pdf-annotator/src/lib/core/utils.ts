import { PdfPoint, PdfRect } from '../models/annotation.model';

/** Genera un id único (UUID v4 cuando está disponible). */
export function uid(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c?.randomUUID) return c.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/** Redondea a 2 decimales para JSON más compactos. */
export function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

/** Color estable a partir de un texto (para avatares). */
export function colorFromString(text: string): string {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) % 360;
  return `hsl(${h} 55% 45%)`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

/** Une rectángulos de la misma línea y descarta duplicados o vacíos. */
export function mergeLineRects(rects: PdfRect[]): PdfRect[] {
  const valid = rects.filter((r) => r.width > 0.5 && r.height > 0.5).sort((a, b) => a.y - b.y || a.x - b.x);
  const out: PdfRect[] = [];
  for (const r of valid) {
    const last = out[out.length - 1];
    const sameLine =
      last &&
      Math.abs(last.y + last.height / 2 - (r.y + r.height / 2)) < Math.min(last.height, r.height) * 0.5 &&
      r.x <= last.x + last.width + 3;
    if (sameLine) {
      const x = Math.min(last.x, r.x);
      const y = Math.min(last.y, r.y);
      const right = Math.max(last.x + last.width, r.x + r.width);
      const bottom = Math.max(last.y + last.height, r.y + r.height);
      out[out.length - 1] = { x, y, width: right - x, height: bottom - y };
    } else {
      // Evita rectángulos contenidos en otro (algunos navegadores devuelven duplicados).
      const contained = out.some(
        (o) => r.x >= o.x - 1 && r.y >= o.y - 1 && r.x + r.width <= o.x + o.width + 1 && r.y + r.height <= o.y + o.height + 1,
      );
      if (!contained) out.push({ ...r });
    }
  }
  return out.map((r) => ({ x: round2(r.x), y: round2(r.y), width: round2(r.width), height: round2(r.height) }));
}

/** Path SVG suavizado (curvas cuadráticas por puntos medios). */
export function smoothPath(points: PdfPoint[]): string {
  if (!points.length) return '';
  if (points.length === 1) {
    const p = points[0];
    return `M${p.x} ${p.y} L${p.x + 0.01} ${p.y + 0.01}`;
  }
  let d = `M${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i];
    const n = points[i + 1];
    d += ` Q${p.x} ${p.y} ${round2((p.x + n.x) / 2)} ${round2((p.y + n.y) / 2)}`;
  }
  const last = points[points.length - 1];
  return d + ` L${last.x} ${last.y}`;
}

/** Simplifica un trazo descartando puntos muy cercanos (reduce el tamaño del JSON). */
export function simplifyPoints(points: PdfPoint[], minDist = 0.8): PdfPoint[] {
  if (points.length < 3) return points.map((p) => ({ x: round2(p.x), y: round2(p.y) }));
  const out: PdfPoint[] = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const l = out[out.length - 1];
    if (Math.hypot(points[i].x - l.x, points[i].y - l.y) >= minDist) out.push(points[i]);
  }
  out.push(points[points.length - 1]);
  return out.map((p) => ({ x: round2(p.x), y: round2(p.y) }));
}

/** Path SVG ondulado para "squiggly" bajo un rectángulo. */
export function squigglePath(r: PdfRect): string {
  const amp = Math.max(0.8, r.height * 0.08);
  const wave = Math.max(2, r.height * 0.25);
  const y = r.y + r.height - amp;
  let d = `M${round2(r.x)} ${round2(y)}`;
  let up = true;
  for (let x = r.x; x < r.x + r.width; x += wave / 2) {
    const nx = Math.min(x + wave / 2, r.x + r.width);
    d += ` Q${round2((x + nx) / 2)} ${round2(y + (up ? -amp : amp) * 2)} ${round2(nx)} ${round2(y)}`;
    up = !up;
  }
  return d;
}

/** Bounding box de una anotación (para el popover y para centrar la vista). */
export function boundsOf(rects: PdfRect[]): PdfRect {
  if (!rects.length) return { x: 0, y: 0, width: 0, height: 0 };
  const x = Math.min(...rects.map((r) => r.x));
  const y = Math.min(...rects.map((r) => r.y));
  const r = Math.max(...rects.map((r) => r.x + r.width));
  const b = Math.max(...rects.map((r) => r.y + r.height));
  return { x, y, width: r - x, height: b - y };
}

export function pointsBounds(paths: PdfPoint[][], pad = 0): PdfRect {
  const pts = paths.flat();
  if (!pts.length) return { x: 0, y: 0, width: 0, height: 0 };
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const x = Math.min(...xs) - pad;
  const y = Math.min(...ys) - pad;
  return { x, y, width: Math.max(...xs) + pad - x, height: Math.max(...ys) + pad - y };
}

/** Distancia de un punto a un segmento (para seleccionar trazos con clic). */
export function distToSegment(p: PdfPoint, a: PdfPoint, b: PdfPoint): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = dx * dx + dy * dy;
  const t = len ? clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / len, 0, 1) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}
