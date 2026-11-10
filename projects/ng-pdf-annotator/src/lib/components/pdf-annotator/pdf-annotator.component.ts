import {
  afterNextRender,
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
  ViewEncapsulation,
} from '@angular/core';
import { DOCUMENT } from '@angular/common';
import {
  AnnotationChangeEvent,
  AnnotationExport,
  AnnotationType,
  PdfAnnotation,
  PdfRect,
  PdfUser,
  TEXT_MARKUP_TYPES,
  TextMarkupAnnotation,
  ToolStyle,
} from '../../models/annotation.model';
import {
  PdfAnnotatorLanguage,
  PdfAnnotatorPermissions,
  PdfAnnotatorTheme,
  PdfAnnotatorTranslationsOverride,
  PdfDocumentInfo,
  PdfSecurityConfig,
  PdfSource,
  PdfToolbarConfig,
  PdfViewerMode,
  WatermarkConfig,
  ZoomMode,
} from '../../models/config.model';
import { DEFAULT_PALETTE, DEFAULT_ZOOM_LEVELS, PdfAnnotatorStore } from '../../core/pdf-annotator.store';
import { CSS_UNITS, loadPdfJs, PDFDocumentProxy } from '../../core/pdfjs';
import { annotationsToJson, parseAnnotations, serializeAnnotations } from '../../core/serializer';
import { mergeLineRects } from '../../core/utils';
import { NG_PDF_ANNOTATOR_CONFIG } from '../../provide';
import { NpaToolbarComponent } from '../toolbar/toolbar.component';
import { NpaAnnotateBarComponent } from '../annotate-bar/annotate-bar.component';
import { NpaLeftPanelComponent } from '../left-panel/left-panel.component';
import { NpaCommentsPanelComponent } from '../comments-panel/comments-panel.component';
import { NpaPageComponent } from '../page/page.component';
import { NpaIconComponent } from '../icon.component';

const PAGE_GAP = 16;
const PAD_TOP = 16;

export type SecurityBlockedAction = 'print' | 'download' | 'contextmenu' | 'copy';

/**
 * Visor de PDF con anotaciones y comentarios.
 *
 * ```html
 * <ng-pdf-annotator
 *   [src]="'/docs/contrato.pdf'"
 *   documentId="contrato-123"
 *   [user]="{ id: 'u1', name: 'Ana Pérez' }"
 *   [annotations]="annotationsFromDb"
 *   [watermark]="watermark"
 *   (annotationChange)="save($event)"
 * />
 * ```
 */
@Component({
  selector: 'ng-pdf-annotator',
  imports: [
    NpaToolbarComponent,
    NpaAnnotateBarComponent,
    NpaLeftPanelComponent,
    NpaCommentsPanelComponent,
    NpaPageComponent,
    NpaIconComponent,
  ],
  providers: [PdfAnnotatorStore],
  templateUrl: './pdf-annotator.component.html',
  styleUrl: './pdf-annotator.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    class: 'npa-root',
    '[attr.data-theme]': 'store.theme()',
    '[class.npa-root--no-print]': 'store.security().disablePrint',
    '[class.npa-root--no-copy]': 'store.security().disableCopy',
    '[attr.lang]': 'store.language()',
    '(contextmenu)': 'onContextMenu($event)',
    '(copy)': 'onCopy($event)',
    '(cut)': 'onCopy($event)',
    '(dragstart)': 'onDragStart($event)',
    '(keydown)': 'onKeyDown($event)',
    '(document:keydown)': 'onGlobalKeyDown($event)',
    '(window:beforeprint)': 'onBeforePrint()',
  },
})
export class NgPdfAnnotatorComponent {
  protected readonly store = inject(PdfAnnotatorStore);
  private readonly globalConfig = inject(NG_PDF_ANNOTATOR_CONFIG, { optional: true }) ?? {};
  private readonly destroyRef = inject(DestroyRef);
  private readonly document = inject(DOCUMENT);
  private readonly viewportRef = viewChild<ElementRef<HTMLDivElement>>('viewport');

  // =================== Inputs ===================
  /** URL, `ArrayBuffer`, `Uint8Array` o `Blob` del PDF. */
  readonly src = input<PdfSource | null>(null);
  /** Id del documento; se guarda en cada anotación (`documentId`). */
  readonly documentId = input<string | null>(null);
  /** Usuario actual. Sin usuario el visor queda en solo lectura. */
  readonly user = input<PdfUser | null>(null);
  /** Anotaciones a cargar (array, JSON de exportación o string JSON). */
  readonly annotations = input<PdfAnnotation[] | AnnotationExport | string | null>(null);
  /** Idioma. Por defecto `es`. */
  readonly language = input<PdfAnnotatorLanguage | undefined>(undefined);
  /** Textos propios o idiomas nuevos: `{ fr: {...}, es: { toolbar: { search: 'Encontrar' } } }`. */
  readonly translations = input<Record<string, PdfAnnotatorTranslationsOverride> | undefined>(undefined);
  /** `light` | `dark` | `auto`. Por defecto `light`. */
  readonly theme = input<PdfAnnotatorTheme | undefined>(undefined);
  /** Modo inicial: `view` o `annotate`. */
  readonly mode = input<PdfViewerMode>('view');
  /** Bloquea toda creación/edición. */
  readonly readOnly = input(false);
  readonly permissions = input<PdfAnnotatorPermissions | undefined>(undefined);
  readonly security = input<PdfSecurityConfig | undefined>(undefined);
  readonly toolbar = input<PdfToolbarConfig | undefined>(undefined);
  /** Una o varias marcas de agua. */
  readonly watermark = input<WatermarkConfig | WatermarkConfig[] | null>(null);
  /** Zoom inicial: número (1 = 100 %), `fit-width` o `fit-page`. */
  readonly zoom = input<number | ZoomMode>('fit-width');
  /** Página inicial. */
  readonly page = input(1);
  readonly palette = input<string[] | undefined>(undefined);
  readonly toolStyles = input<Partial<Record<AnnotationType, Partial<ToolStyle>>> | undefined>(undefined);
  readonly showLeftPanel = input(false);
  readonly showComments = input(false);
  /** Cabeceras HTTP para descargar el PDF (p. ej. `Authorization`). */
  readonly httpHeaders = input<Record<string, string> | undefined>(undefined);
  readonly withCredentials = input(false);
  /** Contraseña si el PDF está protegido. */
  readonly password = input<string | undefined>(undefined);

  // =================== Outputs ===================
  readonly documentLoaded = output<PdfDocumentInfo>();
  readonly documentError = output<unknown>();
  /** Cada cambio individual (añadir, editar, borrar, responder, estado). Ideal para persistir en BD. */
  readonly annotationChange = output<AnnotationChangeEvent>();
  /** Lista completa de anotaciones tras cada cambio. */
  readonly annotationsChange = output<PdfAnnotation[]>();
  readonly annotationAdd = output<PdfAnnotation>();
  readonly annotationUpdate = output<PdfAnnotation>();
  readonly annotationDelete = output<PdfAnnotation>();
  readonly annotationSelect = output<PdfAnnotation | null>();
  readonly pageChange = output<number>();
  readonly zoomChange = output<number>();
  readonly modeChange = output<PdfViewerMode>();
  readonly languageChange = output<string>();
  readonly themeChange = output<'light' | 'dark'>();
  /** Intento bloqueado de imprimir, descargar, clic derecho o copiar. */
  readonly securityBlocked = output<SecurityBlockedAction>();

  // =================== Estado de la vista ===================
  protected readonly pages = computed(() => Array.from({ length: this.store.numPages() }, (_, i) => i + 1));
  protected readonly toast = signal<string | null>(null);
  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  private loadToken = 0;
  private lastScale = 0;
  private lastEmittedPage = 0;
  private lastSelectedId: string | null = null;
  private initialPageApplied = false;

  /** Posición superior de cada página dentro del scroll (px). */
  private readonly pageTops = computed(() => {
    const scale = this.store.cssScale();
    const tops: number[] = [];
    let y = PAD_TOP;
    for (const s of this.store.pageSizes()) {
      tops.push(y);
      y += Math.floor(s.height * scale) + PAGE_GAP;
    }
    return tops;
  });

  constructor() {
    const g = this.globalConfig;

    // ---------- Sincroniza inputs → store ----------
    effect(() => this.store.documentId.set(this.documentId()));
    effect(() => this.store.user.set(this.user()));
    effect(() => this.store.language.set(this.language() ?? g.language ?? 'es'));
    effect(() => this.store.customTranslations.set({ ...(g.translations ?? {}), ...(this.translations() ?? {}) }));
    effect(() => this.store.themeSetting.set(this.theme() ?? g.theme ?? 'light'));
    effect(() => this.store.readOnly.set(this.readOnly()));
    effect(() => this.store.permissions.set({ ...(g.permissions ?? {}), ...(this.permissions() ?? {}) }));
    effect(() =>
      this.store.security.set({
        disableDownload: true,
        disablePrint: true,
        disableContextMenu: true,
        disableCopy: false,
        disableDrag: true,
        ...(g.security ?? {}),
        ...(this.security() ?? {}),
      }),
    );
    effect(() =>
      this.store.toolbar.set({
        leftPanel: true,
        zoom: true,
        search: true,
        comments: true,
        modeSwitch: true,
        pageNavigation: true,
        themeToggle: false,
        languageSelector: false,
        ...(g.toolbar ?? {}),
        ...(this.toolbar() ?? {}),
      }),
    );
    effect(() => {
      const w = this.watermark();
      this.store.watermarks.set(w ? (Array.isArray(w) ? w : [w]) : []);
    });
    effect(() => this.store.palette.set(this.palette() ?? g.palette ?? DEFAULT_PALETTE));
    effect(() => {
      const custom = { ...(g.toolStyles ?? {}), ...(this.toolStyles() ?? {}) };
      untracked(() =>
        this.store.toolStyles.update((s) => {
          const next = { ...s };
          for (const [k, v] of Object.entries(custom)) next[k as AnnotationType] = { ...s[k as AnnotationType], ...v };
          return next;
        }),
      );
    });
    effect(() => {
      this.store.zoomLevels.set(g.zoomLevels ?? DEFAULT_ZOOM_LEVELS);
      if (g.minZoom) this.store.minZoom.set(g.minZoom);
      if (g.maxZoom) this.store.maxZoom.set(g.maxZoom);
      if (g.dateFormat) this.store.dateFormat.set(g.dateFormat);
    });
    effect(() => {
      const m = this.mode();
      untracked(() => {
        this.store.mode.set(m);
        if (m === 'view') this.store.activeTool.set('select');
      });
    });
    effect(() => {
      const z = this.zoom();
      untracked(() => (typeof z === 'number' ? this.store.setZoom(z) : this.store.zoomMode.set(z)));
    });
    effect(() => this.store.leftPanelOpen.set(this.showLeftPanel()));
    effect(() => this.store.commentsOpen.set(this.showComments()));
    effect(() => {
      const list = this.annotations();
      untracked(() => this.store.annotations.set(list ? parseAnnotations(list) : []));
    });

    // ---------- Carga del documento ----------
    effect(() => {
      const src = this.src();
      const headers = this.httpHeaders();
      const withCredentials = this.withCredentials();
      const password = this.password();
      untracked(() => this.load(src, headers, withCredentials, password));
    });

    // ---------- Store → outputs ----------
    const sub = this.store.changes$.subscribe((e) => {
      this.annotationChange.emit(e);
      this.annotationsChange.emit(structuredClone(this.store.annotations()));
      if (e.action === 'add') this.annotationAdd.emit(e.annotation);
      else if (e.action === 'delete') this.annotationDelete.emit(e.annotation);
      else this.annotationUpdate.emit(e.annotation);
    });
    this.destroyRef.onDestroy(() => sub.unsubscribe());

    effect(() => {
      const p = this.store.currentPage();
      if (p !== this.lastEmittedPage && this.store.numPages()) {
        this.lastEmittedPage = p;
        untracked(() => this.pageChange.emit(p));
      }
    });
    effect(() => {
      const z = this.store.zoom();
      untracked(() => this.zoomChange.emit(z));
    });
    effect(() => {
      const m = this.store.mode();
      untracked(() => this.modeChange.emit(m));
    });
    effect(() => {
      const s = this.store.selected();
      if ((s?.id ?? null) !== this.lastSelectedId) {
        this.lastSelectedId = s?.id ?? null;
        untracked(() => this.annotationSelect.emit(s ? structuredClone(s) : null));
      }
    });

    // ---------- Scroll, tamaño y tema del sistema ----------
    afterNextRender(() => {
      const vp = this.viewportRef()?.nativeElement;
      if (vp) {
        const ro = new ResizeObserver(() => this.applyZoomMode());
        ro.observe(vp);
        this.destroyRef.onDestroy(() => ro.disconnect());
        const wheel = (e: WheelEvent) => this.onWheel(e);
        vp.addEventListener('wheel', wheel, { passive: false });
        this.destroyRef.onDestroy(() => vp.removeEventListener('wheel', wheel));
      }
      const mq = globalThis.matchMedia?.('(prefers-color-scheme: dark)');
      if (mq) {
        this.store.systemDark.set(mq.matches);
        const fn = (e: MediaQueryListEvent) => this.store.systemDark.set(e.matches);
        mq.addEventListener('change', fn);
        this.destroyRef.onDestroy(() => mq.removeEventListener('change', fn));
      }
    });

    effect(() => {
      this.store.zoomMode();
      this.store.pageSizes();
      this.store.leftPanelOpen();
      this.store.commentsOpen();
      untracked(() => queueMicrotask(() => this.applyZoomMode()));
    });

    // Mantiene la posición de lectura al cambiar el zoom.
    afterRenderEffect(() => {
      const scale = this.store.cssScale();
      const vp = this.viewportRef()?.nativeElement;
      if (!vp) return;
      if (this.lastScale && this.lastScale !== scale) {
        const ratio = scale / this.lastScale;
        const centerY = vp.scrollTop + vp.clientHeight / 2;
        const centerX = vp.scrollLeft + vp.clientWidth / 2;
        vp.scrollTop = (centerY - PAD_TOP) * ratio + PAD_TOP - vp.clientHeight / 2;
        vp.scrollLeft = centerX * ratio - vp.clientWidth / 2;
      }
      this.lastScale = scale;
    });

    const scrollSub = this.store.scrollTo$.subscribe(({ page, y, smooth }) => {
      const vp = this.viewportRef()?.nativeElement;
      const top = this.pageTops()[page - 1];
      if (!vp || top === undefined) return;
      const offset = y !== undefined ? y * this.store.cssScale() - vp.clientHeight / 3 : -PAD_TOP / 2;
      vp.scrollTo({ top: Math.max(0, top + offset), behavior: smooth ? 'smooth' : 'auto' });
    });
    this.destroyRef.onDestroy(() => {
      scrollSub.unsubscribe();
      void this.store.doc()?.loadingTask.destroy();
    });
  }

  // =================== Carga ===================
  private async load(
    src: PdfSource | null,
    httpHeaders?: Record<string, string>,
    withCredentials = false,
    password?: string,
  ): Promise<void> {
    const token = ++this.loadToken;
    void this.store.doc()?.loadingTask.destroy();
    this.store.doc.set(null);
    this.store.numPages.set(0);
    this.store.pageSizes.set([]);
    this.store.error.set(null);
    this.store.clearSearch();
    this.initialPageApplied = false;
    if (!src) return;
    if (typeof window === 'undefined') return; // SSR
    this.store.loading.set(true);
    try {
      const pdfjs = await loadPdfJs(this.globalConfig.workerSrc);
      let data: Uint8Array | undefined;
      let url: string | undefined;
      if (src instanceof Blob) data = new Uint8Array(await src.arrayBuffer());
      else if (src instanceof ArrayBuffer) data = new Uint8Array(src.slice(0));
      else if (src instanceof Uint8Array) data = src.slice();
      else url = String(src);
      const task = pdfjs.getDocument({
        url,
        data,
        httpHeaders,
        withCredentials,
        password,
        cMapUrl: this.globalConfig.cMapUrl,
        cMapPacked: true,
      });
      const doc = await task.promise;
      if (token !== this.loadToken) {
        void doc.loadingTask.destroy();
        return;
      }
      const first = (await doc.getPage(1)).getViewport({ scale: 1 });
      this.store.pageSizes.set(Array.from({ length: doc.numPages }, () => ({ width: first.width, height: first.height })));
      this.store.numPages.set(doc.numPages);
      this.store.doc.set(doc);
      this.store.loading.set(false);
      this.applyZoomMode();
      const startPage = Math.min(Math.max(1, this.page()), doc.numPages);
      this.store.currentPage.set(startPage);
      void this.loadAllPageSizes(doc, token);
      const meta = await doc.getMetadata().catch(() => null);
      const info = meta?.info as { Title?: string } | undefined;
      this.documentLoaded.emit({ numPages: doc.numPages, title: info?.Title, fingerprint: doc.fingerprints[0] ?? '' });
      setTimeout(() => {
        if (!this.initialPageApplied && startPage > 1) this.store.goToPage(startPage);
        this.initialPageApplied = true;
      });
    } catch (err: unknown) {
      if (token !== this.loadToken) return;
      this.store.loading.set(false);
      const name = (err as { name?: string })?.name;
      const t = this.store.t().messages;
      this.store.error.set(name === 'PasswordException' ? t.password : t.error);
      this.documentError.emit(err);
      console.error('[ng-pdf-annotator]', err);
    }
  }

  /** Lee el tamaño real de todas las páginas en segundo plano (pueden ser distintos). */
  private async loadAllPageSizes(doc: PDFDocumentProxy, token: number): Promise<void> {
    const sizes = [...this.store.pageSizes()];
    let changed = false;
    for (let i = 2; i <= doc.numPages; i++) {
      if (token !== this.loadToken) return;
      const vp = (await doc.getPage(i)).getViewport({ scale: 1 });
      const s = sizes[i - 1];
      if (Math.abs(s.width - vp.width) > 0.5 || Math.abs(s.height - vp.height) > 0.5) {
        sizes[i - 1] = { width: vp.width, height: vp.height };
        changed = true;
      }
      if (changed && i % 25 === 0) {
        this.store.pageSizes.set([...sizes]);
        changed = false;
      }
    }
    if (changed && token === this.loadToken) this.store.pageSizes.set(sizes);
  }

  private applyZoomMode(): void {
    const mode = this.store.zoomMode();
    const vp = this.viewportRef()?.nativeElement;
    const sizes = this.store.pageSizes();
    if (!mode || !vp || !sizes.length || !vp.clientWidth) return;
    const maxW = Math.max(...sizes.map((s) => s.width));
    const fitW = (vp.clientWidth - 40) / (maxW * CSS_UNITS);
    let z = fitW;
    if (mode === 'fit-page') {
      const s = sizes[this.store.currentPage() - 1] ?? sizes[0];
      z = Math.min((vp.clientWidth - 40) / (s.width * CSS_UNITS), (vp.clientHeight - PAD_TOP * 2) / (s.height * CSS_UNITS));
    }
    z = Math.max(this.store.minZoom(), Math.min(this.store.maxZoom(), z));
    if (Math.abs(z - this.store.zoom()) > 0.001) {
      this.store.zoom.set(Math.round(z * 1000) / 1000);
      // En "página completa" se alinea la página actual al borde superior.
      if (mode === 'fit-page') requestAnimationFrame(() => this.store.goToPage(this.store.currentPage()));
    }
  }

  // =================== Eventos de la vista ===================
  protected onScroll(): void {
    const vp = this.viewportRef()?.nativeElement;
    if (!vp) return;
    const tops = this.pageTops();
    const probe = vp.scrollTop + vp.clientHeight * 0.35;
    let lo = 0;
    let hi = tops.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (tops[mid] <= probe) lo = mid;
      else hi = mid - 1;
    }
    const page = lo + 1;
    if (page !== this.store.currentPage() && tops.length) this.store.currentPage.set(page);
  }

  private onWheel(e: WheelEvent): void {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    const factor = Math.exp(-e.deltaY * 0.002);
    this.store.setZoom(this.store.zoom() * factor);
  }

  /** Crea resaltado/subrayado/tachado/ondulado a partir de la selección de texto. */
  protected onMouseUp(): void {
    const tool = this.store.activeTool();
    if (this.store.mode() !== 'annotate' || !(TEXT_MARKUP_TYPES as readonly string[]).includes(tool)) return;
    if (!this.store.canAnnotate()) return;
    const sel = this.document.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    const vp = this.viewportRef()?.nativeElement;
    if (!vp) return;
    const scale = this.store.cssScale();
    const created: string[] = [];

    vp.querySelectorAll<HTMLElement>('npa-page').forEach((pageEl) => {
      const textLayer = pageEl.querySelector('.textLayer');
      if (!textLayer || !range.intersectsNode(textLayer)) return;
      const pr = this.document.createRange();
      pr.selectNodeContents(textLayer);
      const r = range.cloneRange();
      if (r.compareBoundaryPoints(Range.START_TO_START, pr) < 0) r.setStart(pr.startContainer, pr.startOffset);
      if (r.compareBoundaryPoints(Range.END_TO_END, pr) > 0) r.setEnd(pr.endContainer, pr.endOffset);
      // Los saltos de línea de pdf.js son <br>: se convierten en espacios.
      const frag = r.cloneContents();
      frag.querySelectorAll('br').forEach((br) => br.replaceWith(' '));
      const text = (frag.textContent ?? '').replace(/\s+/g, ' ').trim();
      if (!text) return;
      const box = pageEl.getBoundingClientRect();
      const page = Number(pageEl.dataset['page']);
      const size = this.store.pageSizes()[page - 1];
      let rects: PdfRect[] = [...r.getClientRects()]
        .filter((cr) => cr.width > 0.5 && cr.height > 0.5)
        .map((cr) => {
          const x = Math.max(0, (cr.left - box.left) / scale);
          const y = Math.max(0, (cr.top - box.top) / scale);
          return {
            x,
            y,
            width: Math.min(size.width, (cr.right - box.left) / scale) - x,
            height: Math.min(size.height, (cr.bottom - box.top) / scale) - y,
          };
        })
        .filter((rc) => rc.width > 0 && rc.height > 0);
      if (!rects.length) return;
      // Descarta rectángulos anómalos (contenedores) mucho más altos que una línea de texto.
      const heights = rects.map((rc) => rc.height).sort((a, b) => a - b);
      const median = heights[Math.floor(heights.length / 2)];
      rects = mergeLineRects(rects.filter((rc) => rc.height <= median * 2.5));
      if (!rects.length) return;
      const annotation: TextMarkupAnnotation = {
        ...this.store.newBase(tool as AnnotationType, page),
        type: tool as TextMarkupAnnotation['type'],
        rects,
        selectedText: text,
      };
      this.store.add(annotation);
      created.push(annotation.id);
    });
    if (created.length) {
      sel.removeAllRanges();
      this.store.select(created[created.length - 1]);
    }
  }

  // =================== Seguridad ===================
  protected onContextMenu(e: MouseEvent): void {
    if (!this.store.security().disableContextMenu) return;
    const target = e.target as HTMLElement;
    if (target.closest('input, textarea')) return;
    e.preventDefault();
    this.securityBlocked.emit('contextmenu');
  }

  protected onCopy(e: ClipboardEvent): void {
    if (!this.store.security().disableCopy) return;
    if ((e.target as HTMLElement).closest?.('input, textarea')) return;
    e.preventDefault();
    this.securityBlocked.emit('copy');
  }

  protected onDragStart(e: DragEvent): void {
    if (!this.store.security().disableDrag) return;
    if ((e.target as HTMLElement).closest?.('.npa-viewport')) {
      e.preventDefault();
    }
  }

  protected onGlobalKeyDown(e: KeyboardEvent): void {
    const mod = e.ctrlKey || e.metaKey;
    if (!mod) return;
    const key = e.key.toLowerCase();
    const sec = this.store.security();
    if (key === 'p' && sec.disablePrint) {
      e.preventDefault();
      e.stopPropagation();
      this.showToast(this.store.t().messages.printBlocked);
      this.securityBlocked.emit('print');
    } else if (key === 's' && sec.disableDownload) {
      e.preventDefault();
      e.stopPropagation();
      this.showToast(this.store.t().messages.downloadBlocked);
      this.securityBlocked.emit('download');
    }
  }

  protected onBeforePrint(): void {
    if (this.store.security().disablePrint) this.securityBlocked.emit('print');
  }

  protected onKeyDown(e: KeyboardEvent): void {
    const target = e.target as HTMLElement;
    const typing = !!target.closest('input, textarea, select, [contenteditable]');
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'f' && this.store.toolbar().search) {
      e.preventDefault();
      this.store.searchOpen.set(true);
      this.store.searchFocus.update((n) => n + 1);
      return;
    }
    if (typing) return;
    if (e.key === 'Escape') {
      if (this.store.selectedId()) this.store.select(null);
      else this.store.activeTool.set('select');
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && this.store.selectedId()) {
      e.preventDefault();
      this.store.remove(this.store.selectedId()!);
    } else if (mod && (e.key === '+' || e.key === '=')) {
      e.preventDefault();
      this.store.zoomIn();
    } else if (mod && e.key === '-') {
      e.preventDefault();
      this.store.zoomOut();
    }
  }

  private showToast(msg: string): void {
    this.toast.set(msg);
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toast.set(null), 2500);
  }

  protected onToolbarLanguage(lang: string): void {
    this.languageChange.emit(lang);
  }

  protected onToolbarTheme(theme: 'light' | 'dark'): void {
    this.themeChange.emit(theme);
  }

  // =================== API pública ===================
  /** Copia de todas las anotaciones actuales. */
  getAnnotations(): PdfAnnotation[] {
    return structuredClone(this.store.annotations());
  }

  /** Objeto de exportación (`schemaVersion`, `documentId`, `exportedAt`, `annotations`). */
  exportAnnotations(): AnnotationExport {
    return serializeAnnotations(this.store.annotations(), this.store.documentId());
  }

  /** Igual que `exportAnnotations` pero como texto JSON. */
  exportAnnotationsJson(pretty = false): string {
    return annotationsToJson(this.store.annotations(), this.store.documentId(), pretty);
  }

  /**
   * Carga anotaciones (de tu BD, por ejemplo). Acepta array, objeto de exportación o string JSON.
   * Con `replace: false` se añaden/actualizan por `id` sin borrar las existentes.
   */
  importAnnotations(input: unknown, options: { replace?: boolean } = {}): PdfAnnotation[] {
    const parsed = parseAnnotations(input);
    if (options.replace !== false) this.store.annotations.set(parsed);
    else {
      const map = new Map(this.store.annotations().map((a) => [a.id, a]));
      for (const a of parsed) map.set(a.id, a);
      this.store.annotations.set([...map.values()]);
    }
    return parsed;
  }

  /** Añade o reemplaza una anotación (por ejemplo, recibida en tiempo real por WebSocket) sin emitir eventos. */
  upsertAnnotation(annotation: PdfAnnotation): void {
    this.importAnnotations([annotation], { replace: false });
  }

  /** Elimina una anotación localmente sin comprobar permisos ni emitir eventos (sincronización remota). */
  removeAnnotationLocal(id: string): void {
    this.store.annotations.update((l) => l.filter((a) => a.id !== id));
    if (this.store.selectedId() === id) this.store.select(null);
  }

  /** Elimina todas las anotaciones del visor (no emite eventos). */
  clearAnnotations(): void {
    this.store.annotations.set([]);
    this.store.select(null);
  }

  goToPage(page: number): void {
    this.store.goToPage(page);
  }

  setZoom(value: number | ZoomMode): void {
    if (typeof value === 'number') this.store.setZoom(value);
    else this.store.zoomMode.set(value);
  }

  setMode(mode: PdfViewerMode): void {
    this.store.mode.set(mode);
    if (mode === 'view') this.store.activeTool.set('select');
  }

  /** Selecciona una anotación y desplaza la vista hasta ella. */
  selectAnnotation(id: string | null): void {
    this.store.select(id, true);
  }

  get currentPage(): number {
    return this.store.currentPage();
  }

  get numPages(): number {
    return this.store.numPages();
  }
}
