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
} from '@angular/core';
import { PdfAnnotatorStore } from '../../core/pdf-annotator.store';
import { drawWatermarks } from '../../core/watermark';

const THUMB_WIDTH = 120;

/** Miniatura de una página (se renderiza solo cuando es visible en el panel). */
@Component({
  selector: 'npa-thumbnail',
  template: `
    <div
      class="npa-thumb__frame"
      [style.width.px]="width"
      [style.height.px]="height()"
    >
      <canvas #canvas draggable="false"></canvas>
      @if (count(); as c) {
        <span class="npa-thumb__badge">{{ c }}</span>
      }
    </div>
    <span class="npa-thumb__num">{{ pageNumber() }}</span>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
      padding: 6px;
      border-radius: 8px;
      cursor: pointer;
    }
    :host(:hover) {
      background: var(--npa-hover);
    }
    :host(.npa-thumb--active) .npa-thumb__frame {
      outline: 3px solid var(--npa-accent);
      outline-offset: 1px;
    }
    :host(.npa-thumb--active) .npa-thumb__num {
      color: var(--npa-accent);
      font-weight: 700;
    }
    .npa-thumb__frame {
      position: relative;
      background: #fff;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
    }
    canvas {
      width: 100%;
      height: 100%;
      display: block;
      pointer-events: none;
    }
    .npa-thumb__badge {
      position: absolute;
      top: -6px;
      right: -6px;
      min-width: 18px;
      height: 18px;
      padding: 0 5px;
      border-radius: 9px;
      background: var(--npa-accent);
      color: #fff;
      font-size: 11px;
      line-height: 18px;
      text-align: center;
    }
    .npa-thumb__num {
      font-size: 12px;
      color: var(--npa-text-muted);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.npa-thumb--active]': 'store.currentPage() === pageNumber()',
    '(click)': 'store.goToPage(pageNumber())',
    role: 'button',
    tabindex: '0',
    '(keydown.enter)': 'store.goToPage(pageNumber())',
    '[attr.aria-label]': 'store.t().toolbar.page + " " + pageNumber()',
  },
})
export class NpaThumbnailComponent {
  readonly pageNumber = input.required<number>();
  protected readonly store = inject(PdfAnnotatorStore);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');

  protected readonly width = THUMB_WIDTH;
  protected readonly height = computed(() => {
    const s = this.store.pageSizes()[this.pageNumber() - 1];
    return s ? Math.round((THUMB_WIDTH * s.height) / s.width) : 155;
  });
  protected readonly count = computed(() => this.store.annotationsByPage().get(this.pageNumber())?.length ?? 0);

  private readonly visible = signal(false);
  private renderedKey = '';

  constructor() {
    afterNextRender(() => {
      const root = this.host.nativeElement.closest('.npa-left__body');
      const io = new IntersectionObserver((e) => this.visible.set(e[0]?.isIntersecting ?? false), {
        root,
        rootMargin: '300px 0px',
      });
      io.observe(this.host.nativeElement);
      this.destroyRef.onDestroy(() => io.disconnect());
    });
    effect(() => {
      const visible = this.visible();
      const doc = this.store.doc();
      const wm = this.store.watermarks();
      if (!visible || !doc) return;
      const key = doc.fingerprints[0] + JSON.stringify(wm);
      if (key === this.renderedKey) return;
      untracked(() => this.render(key));
    });
  }

  private async render(key: string): Promise<void> {
    const doc = this.store.doc();
    if (!doc) return;
    this.renderedKey = key;
    try {
      const page = await doc.getPage(this.pageNumber());
      const base = page.getViewport({ scale: 1 });
      const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
      const scale = (THUMB_WIDTH / base.width) * dpr;
      const viewport = page.getViewport({ scale });
      const canvas = this.canvas().nativeElement;
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      await page.render({ canvas, canvasContext: ctx, viewport }).promise;
      const wms = this.store.watermarks();
      if (wms.length) {
        const u = this.store.user();
        const now = new Date();
        drawWatermarks(ctx, wms, base.width, base.height, scale, {
          userName: u?.name ?? '',
          userId: u?.id ?? '',
          date: now.toLocaleDateString(this.store.language()),
          dateTime: now.toLocaleString(this.store.language()),
          page: this.pageNumber(),
          totalPages: this.store.numPages(),
        });
      }
    } catch (err) {
      this.renderedKey = '';
      if ((err as { name?: string })?.name !== 'RenderingCancelledException') console.error(err);
    }
  }
}
