import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  signal,
  untracked,
  viewChild,
  ViewEncapsulation,
} from '@angular/core';
import { INK_TYPES, InkAnnotation, NoteAnnotation, PdfAnnotation, PdfPoint, TEXT_MARKUP_TYPES } from '../../models/annotation.model';
import { PdfAnnotatorStore } from '../../core/pdf-annotator.store';
import { CSS_UNITS, loadPdfJs, PDFPageProxy } from '../../core/pdfjs';
import { drawWatermarks } from '../../core/watermark';
import { boundsOf, distToSegment, pointsBounds, simplifyPoints, smoothPath, squigglePath } from '../../core/utils';
import { NpaAnnotationPopoverComponent } from '../annotation-popover/annotation-popover.component';

/** Máximo de píxeles por canvas (evita agotar memoria en zoom alto). */
const MAX_CANVAS_PIXELS = 16_777_216;
const NOTE_SIZE = 22;

@Component({
  selector: 'npa-page',
  imports: [NpaAnnotationPopoverComponent],
  templateUrl: './page.component.html',
  styleUrl: './page.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Sin encapsulación: pdf.js crea los <span> de la capa de texto fuera de Angular.
  encapsulation: ViewEncapsulation.None,
  host: {
    class: 'npa-page',
    '(click)': 'onPageClick($event)',
    '[attr.data-page]': 'pageNumber()',
    '[style.width.px]': 'cssWidth()',
    '[style.height.px]': 'cssHeight()',
    '[style.--total-scale-factor]': 'store.cssScale()',
    '[class.npa-page--tool-ink]': 'isInkTool()',
    '[class.npa-page--tool-note]': 'store.activeTool() === "note"',
    '[class.npa-page--tool-text]': 'isTextTool()',
  },
})
export class NpaPageComponent {
  readonly pageNumber = input.required<number>();

  protected readonly store = inject(PdfAnnotatorStore);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);

  private readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly textLayerRef = viewChild.required<ElementRef<HTMLDivElement>>('textLayer');
  private readonly svgRef = viewChild.required<ElementRef<SVGSVGElement>>('svg');

  protected readonly visible = signal(false);
  protected readonly rendered = signal(false);
  protected readonly drawing = signal<PdfPoint[] | null>(null);

  protected readonly size = computed(() => this.store.pageSizes()[this.pageNumber() - 1] ?? { width: 612, height: 792 });
  protected readonly cssWidth = computed(() => Math.floor(this.size().width * this.store.cssScale()));
  protected readonly cssHeight = computed(() => Math.floor(this.size().height * this.store.cssScale()));

  protected readonly annotations = computed(() => this.store.annotationsByPage().get(this.pageNumber()) ?? []);
  protected readonly searchHits = computed(() => this.store.searchByPage().get(this.pageNumber()) ?? []);
  protected readonly selected = computed(() => {
    const s = this.store.selected();
    return s && s.page === this.pageNumber() ? s : null;
  });

  protected readonly isInkTool = computed(() =>
    this.store.mode() === 'annotate' && (INK_TYPES as readonly string[]).includes(this.store.activeTool()),
  );
  protected readonly isTextTool = computed(() =>
    this.store.mode() === 'annotate' && (TEXT_MARKUP_TYPES as readonly string[]).includes(this.store.activeTool()),
  );
  protected readonly drawingPath = computed(() => {
    const pts = this.drawing();
    return pts ? smoothPath(pts) : '';
  });
  protected readonly drawingStyle = computed(() => {
    const tool = this.store.activeTool();
    return tool === 'select' ? null : this.store.toolStyles()[tool];
  });

  protected readonly noteSize = NOTE_SIZE;

  private page: PDFPageProxy | null = null;
  private renderTask: { cancel(): void; promise: Promise<unknown> } | null = null;
  private textLayerDone = false;
  private renderedKey = '';
  private renderTimer: ReturnType<typeof setTimeout> | null = null;
  private releaseTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    afterNextRender(() => {
      const root = this.host.nativeElement.closest('.npa-viewport');
      const io = new IntersectionObserver(
        (entries) => {
          for (const e of entries) this.visible.set(e.isIntersecting);
        },
        { root, rootMargin: '150% 0px' },
      );
      io.observe(this.host.nativeElement);
      this.destroyRef.onDestroy(() => io.disconnect());
    });

    // Renderiza cuando la página es visible o cambia el zoom/documento/marca de agua.
    effect(() => {
      const visible = this.visible();
      const doc = this.store.doc();
      const scale = this.store.cssScale();
      const wm = this.store.watermarks();
      const user = this.store.user();
      untracked(() => {
        if (this.releaseTimer) clearTimeout(this.releaseTimer);
        if (!visible || !doc) {
          // Si la página sale de la vista antes de renderizarse, se cancela el render pendiente.
          if (this.renderTimer) clearTimeout(this.renderTimer);
          this.renderTimer = null;
          if (!visible) this.renderTask?.cancel();
          // Libera la memoria del canvas cuando la página se aleja del área visible.
          if (!visible && this.rendered()) this.releaseTimer = setTimeout(() => this.release(), 1500);
          return;
        }
        const key = `${doc.fingerprints[0]}|${scale}|${JSON.stringify(wm)}|${user?.id}|${user?.name}`;
        if (key === this.renderedKey) return;
        if (this.renderTimer) clearTimeout(this.renderTimer);
        this.renderTimer = setTimeout(() => this.render(key), this.rendered() ? 120 : 0);
      });
    });

    this.destroyRef.onDestroy(() => {
      this.renderTask?.cancel();
      if (this.renderTimer) clearTimeout(this.renderTimer);
      if (this.releaseTimer) clearTimeout(this.releaseTimer);
    });
  }

  private release(): void {
    this.renderTask?.cancel();
    const c = this.canvasRef().nativeElement;
    c.width = 0;
    c.height = 0;
    this.renderedKey = '';
    this.rendered.set(false);
  }

  private async render(key: string): Promise<void> {
    const doc = this.store.doc();
    if (!doc) return;
    try {
      this.page ??= await doc.getPage(this.pageNumber());
      const page = this.page;
      const scale = this.store.cssScale();
      const viewport = page.getViewport({ scale });
      const dpr = globalThis.devicePixelRatio || 1;
      let outputScale = dpr;
      const pixels = viewport.width * viewport.height * dpr * dpr;
      if (pixels > MAX_CANVAS_PIXELS) outputScale = Math.sqrt(MAX_CANVAS_PIXELS / (viewport.width * viewport.height));

      // Renderizamos en un canvas temporal y luego copiamos, para no dejar la página en blanco durante el zoom.
      const tmp = document.createElement('canvas');
      tmp.width = Math.floor(viewport.width * outputScale);
      tmp.height = Math.floor(viewport.height * outputScale);
      const ctx = tmp.getContext('2d', { alpha: false });
      if (!ctx) return;

      this.renderTask?.cancel();
      const task = page.render({
        canvas: tmp,
        canvasContext: ctx,
        viewport,
        transform: outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined,
      });
      this.renderTask = task;
      await task.promise;
      this.renderTask = null;
      if (!this.visible()) {
        tmp.width = 0;
        return;
      }

      const wms = this.store.watermarks();
      if (wms.length) {
        const user = this.store.user();
        const now = new Date();
        drawWatermarks(ctx, wms, viewport.width / scale, viewport.height / scale, scale * outputScale, {
          userName: user?.name ?? '',
          userId: user?.id ?? '',
          date: now.toLocaleDateString(this.store.language()),
          dateTime: now.toLocaleString(this.store.language()),
          page: this.pageNumber(),
          totalPages: this.store.numPages(),
        });
      }

      const canvas = this.canvasRef().nativeElement;
      canvas.width = tmp.width;
      canvas.height = tmp.height;
      canvas.getContext('2d')?.drawImage(tmp, 0, 0);
      tmp.width = 0;
      this.renderedKey = key;
      this.rendered.set(true);

      if (!this.textLayerDone) {
        this.textLayerDone = true;
        await this.renderTextLayer(page);
      }
    } catch (err: unknown) {
      if ((err as { name?: string })?.name !== 'RenderingCancelledException') {
        console.error('[ng-pdf-annotator] Error al renderizar la página', this.pageNumber(), err);
      }
    }
  }

  private async renderTextLayer(page: PDFPageProxy): Promise<void> {
    const pdfjs = await loadPdfJs();
    const container = this.textLayerRef().nativeElement;
    container.replaceChildren();
    // La capa de texto se escala sola con la variable CSS --total-scale-factor.
    const textLayer = new pdfjs.TextLayer({
      textContentSource: page.streamTextContent(),
      container,
      viewport: page.getViewport({ scale: 1 }),
    });
    await textLayer.render();
  }

  // ---------- Geometría ----------
  /** Convierte un evento de puntero a puntos PDF de esta página. */
  private toPdf(ev: PointerEvent | MouseEvent): PdfPoint {
    const r = this.svgRef().nativeElement.getBoundingClientRect();
    const s = this.size();
    return {
      x: ((ev.clientX - r.left) / r.width) * s.width,
      y: ((ev.clientY - r.top) / r.height) * s.height,
    };
  }

  // ---------- Dibujo a mano alzada / notas ----------
  protected onPointerDown(ev: PointerEvent): void {
    if (ev.button !== 0) return;
    if (this.isInkTool()) {
      if (!this.store.canAnnotate()) return;
      ev.preventDefault();
      (ev.target as Element).setPointerCapture?.(ev.pointerId);
      this.drawing.set([this.toPdf(ev)]);
      return;
    }
    if (this.store.mode() === 'annotate' && this.store.activeTool() === 'note') {
      if (!this.store.canAnnotate()) return;
      ev.preventDefault();
      const p = this.toPdf(ev);
      const s = this.size();
      const note: NoteAnnotation = {
        ...this.store.newBase('note', this.pageNumber()),
        type: 'note',
        position: {
          x: Math.round(Math.min(Math.max(0, p.x - NOTE_SIZE / 2), s.width - NOTE_SIZE) * 100) / 100,
          y: Math.round(Math.min(Math.max(0, p.y - NOTE_SIZE / 2), s.height - NOTE_SIZE) * 100) / 100,
        },
      };
      this.store.add(note);
      this.store.select(note.id);
      this.store.editingId.set(note.id);
      this.store.activeTool.set('select');
    }
  }

  protected onPointerMove(ev: PointerEvent): void {
    const pts = this.drawing();
    if (!pts) return;
    ev.preventDefault();
    const events = (ev.getCoalescedEvents?.() ?? []).length ? ev.getCoalescedEvents() : [ev];
    this.drawing.set([...pts, ...events.map((e) => this.toPdf(e))]);
  }

  protected onPointerUp(): void {
    const pts = this.drawing();
    if (!pts) return;
    this.drawing.set(null);
    const tool = this.store.activeTool();
    if (tool !== 'freehand' && tool !== 'freehandHighlight') return;
    const style = this.store.toolStyles()[tool];
    const ink: InkAnnotation = {
      ...this.store.newBase(tool, this.pageNumber()),
      type: tool,
      paths: [simplifyPoints(pts)],
      strokeWidth: style.strokeWidth,
    };
    this.store.add(ink);
  }

  /** Clic sobre una anotación existente. */
  protected onAnnotationClick(ev: MouseEvent, a: PdfAnnotation): void {
    if (this.isInkTool() || this.isTextTool() || (this.store.mode() === 'annotate' && this.store.activeTool() === 'note'))
      return;
    ev.stopPropagation();
    this.store.select(a.id);
  }

  /** Clic en la página vacía: deselecciona, o selecciona trazos cercanos. */
  protected onPageClick(ev: MouseEvent): void {
    if (this.isInkTool() || this.drawing()) return;
    if ((ev.target as Element).closest('.npa-popover')) return;
    // El clic que sigue inmediatamente a crear una anotación no debe deseleccionarla.
    if (this.store.lastCreatedAt && Date.now() - this.store.lastCreatedAt < 600) {
      this.store.lastCreatedAt = 0;
      return;
    }
    const sel = globalThis.getSelection?.();
    if (sel && !sel.isCollapsed) return;
    const p = this.toPdf(ev);
    const hit = this.annotations()
      .filter((a): a is InkAnnotation => a.type === 'freehand' || a.type === 'freehandHighlight')
      .find((a) =>
        a.paths.some((path) =>
          path.some((pt, i) => i > 0 && distToSegment(p, path[i - 1], pt) <= Math.max(4, a.strokeWidth / 2 + 2)),
        ),
      );
    this.store.select(hit?.id ?? null);
  }

  // ---------- Helpers de plantilla ----------
  protected inkPath(path: PdfPoint[]): string {
    return smoothPath(path);
  }

  protected squiggle(r: { x: number; y: number; width: number; height: number }): string {
    return squigglePath(r);
  }

  protected strokeFor(h: number): number {
    return Math.max(0.8, h * 0.08);
  }

  protected tooltip(a: PdfAnnotation): string {
    const t = this.store.t();
    return `${t.annotationTypes[a.type]} · ${a.author.name} · ${this.store.formatDate(a.createdAt)}${
      a.contents ? '\n' + a.contents : ''
    }`;
  }

  protected selectionBox(a: PdfAnnotation): { x: number; y: number; width: number; height: number } {
    const pad = 2;
    let b;
    switch (a.type) {
      case 'note':
        b = { x: a.position.x, y: a.position.y, width: NOTE_SIZE, height: NOTE_SIZE };
        break;
      case 'freehand':
      case 'freehandHighlight':
        b = pointsBounds(a.paths, a.strokeWidth / 2);
        break;
      default:
        b = boundsOf(a.rects);
    }
    return { x: b.x - pad, y: b.y - pad, width: b.width + pad * 2, height: b.height + pad * 2 };
  }

  protected readonly cssUnits = CSS_UNITS;
}
