import { WatermarkConfig } from '../models/config.model';

export interface WatermarkVars {
  userName: string;
  userId: string;
  date: string;
  dateTime: string;
  page: number;
  totalPages: number;
}

export function resolveWatermarkText(text: string, vars: WatermarkVars): string {
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k: keyof WatermarkVars) => (k in vars ? String(vars[k]) : m));
}

/**
 * Dibuja las marcas de agua directamente en el canvas de la página.
 * Al ir pintadas dentro del bitmap no se pueden quitar borrando un elemento del DOM.
 *
 * @param ctx contexto del canvas
 * @param widthPt ancho de la página en puntos PDF
 * @param heightPt alto de la página en puntos PDF
 * @param pxPerPt píxeles de canvas por punto PDF (incluye zoom y devicePixelRatio)
 */
export function drawWatermarks(
  ctx: CanvasRenderingContext2D,
  watermarks: WatermarkConfig[],
  widthPt: number,
  heightPt: number,
  pxPerPt: number,
  vars: WatermarkVars,
): void {
  for (const wm of watermarks) {
    if (!wm?.text) continue;
    if (wm.pages?.length && !wm.pages.includes(vars.page)) continue;
    const lines = resolveWatermarkText(wm.text, vars).split('\n');
    const mode = wm.mode ?? 'diagonal';
    const tiled = mode === 'tiled';
    const fontSize = (wm.fontSize ?? (tiled ? 22 : 48)) * pxPerPt;
    const weight = wm.fontWeight ?? 'bold';
    const family = wm.fontFamily ?? 'Helvetica, Arial, sans-serif';
    const defaultAngle = mode === 'vertical' ? -90 : mode === 'diagonal' ? -Math.atan2(heightPt, widthPt) * (180 / Math.PI) : tiled ? -30 : 0;
    const angle = ((wm.angle ?? defaultAngle) * Math.PI) / 180;
    const w = widthPt * pxPerPt;
    const h = heightPt * pxPerPt;

    ctx.save();
    ctx.globalAlpha = wm.opacity ?? 0.18;
    ctx.fillStyle = wm.color ?? '#d32f2f';
    ctx.font = `${weight} ${fontSize}px ${family}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const lineH = fontSize * 1.2;
    const blockW = Math.max(...lines.map((l) => ctx.measureText(l).width));
    const blockH = lineH * lines.length;

    const drawBlock = (cx: number, cy: number) => {
      lines.forEach((l, i) => ctx.fillText(l, cx, cy - blockH / 2 + lineH * (i + 0.5)));
    };

    if (!tiled) {
      ctx.translate(w / 2, h / 2);
      ctx.rotate(angle);
      // Reduce el tamaño si el texto no cabe en la página.
      const avail = mode === 'vertical' ? h * 0.9 : mode === 'diagonal' ? Math.hypot(w, h) * 0.8 : w * 0.9;
      if (blockW > avail) {
        const k = avail / blockW;
        ctx.scale(k, k);
      }
      drawBlock(0, 0);
    } else {
      const gap = (wm.gap ?? 90) * pxPerPt;
      const stepX = blockW + gap;
      const stepY = blockH + gap * 0.8;
      const diag = Math.hypot(w, h);
      ctx.translate(w / 2, h / 2);
      ctx.rotate(angle);
      let row = 0;
      for (let y = -diag / 2; y <= diag / 2 + stepY; y += stepY, row++) {
        const offset = row % 2 ? stepX / 2 : 0;
        for (let x = -diag / 2 - stepX; x <= diag / 2 + stepX; x += stepX) drawBlock(x + offset, y);
      }
    }
    ctx.restore();
  }
}
