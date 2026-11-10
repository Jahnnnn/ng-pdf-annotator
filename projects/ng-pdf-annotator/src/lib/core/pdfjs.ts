import type * as PdfJs from 'pdfjs-dist';

export type PdfJsModule = typeof PdfJs;
export type PDFDocumentProxy = PdfJs.PDFDocumentProxy;
export type PDFPageProxy = PdfJs.PDFPageProxy;
export type PageViewport = PdfJs.PageViewport;

/** 100 % de zoom = 96 px por pulgada, igual que el visor oficial de pdf.js. */
export const CSS_UNITS = 96 / 72;

let modulePromise: Promise<PdfJsModule> | null = null;

/**
 * pdf.js 5+ usa `Promise.try` y `Promise.withResolvers`. Con zone.js, `Promise` se sustituye por
 * `ZoneAwarePromise`, que puede no tenerlos, así que se añaden si faltan.
 */
function ensurePromiseHelpers(): void {
  const P = Promise as unknown as Record<string, unknown>;
  if (typeof P['withResolvers'] !== 'function') {
    P['withResolvers'] = function <T>() {
      let resolve!: (v: T) => void;
      let reject!: (e: unknown) => void;
      const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
      });
      return { promise, resolve, reject };
    };
  }
  if (typeof P['try'] !== 'function') {
    P['try'] = function <T>(fn: (...a: unknown[]) => T, ...args: unknown[]) {
      return new Promise<T>((resolve) => resolve(fn(...args)));
    };
  }
}

/**
 * Carga pdf.js de forma diferida (solo en el navegador; compatible con SSR) y configura el worker.
 */
export function loadPdfJs(workerSrc?: string): Promise<PdfJsModule> {
  ensurePromiseHelpers();
  if (!modulePromise) {
    modulePromise = import('pdfjs-dist').then((m) => {
      const mod = ((m as unknown as { default?: PdfJsModule }).default ?? m) as PdfJsModule;
      if (!mod.GlobalWorkerOptions.workerSrc) {
        mod.GlobalWorkerOptions.workerSrc =
          workerSrc ?? `https://cdn.jsdelivr.net/npm/pdfjs-dist@${mod.version}/build/pdf.worker.min.mjs`;
      }
      return mod;
    });
  } else if (workerSrc) {
    modulePromise.then((mod) => (mod.GlobalWorkerOptions.workerSrc = workerSrc));
  }
  return modulePromise;
}
