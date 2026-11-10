import { computed, Injectable, signal } from '@angular/core';
import { Subject } from 'rxjs';
import {
  AnnotationAuthor,
  AnnotationChangeEvent,
  AnnotationReply,
  AnnotationStatus,
  AnnotationType,
  MARKED_STATUSES,
  PdfAnnotation,
  PdfRect,
  PdfUser,
  ToolStyle,
} from '../models/annotation.model';
import {
  PdfAnnotatorPermissions,
  PdfAnnotatorTheme,
  PdfSecurityConfig,
  PdfToolbarConfig,
  PdfViewerMode,
  WatermarkConfig,
  ZoomMode,
} from '../models/config.model';
import { BUILT_IN_TRANSLATIONS, ES, interpolate, mergeTranslations, PdfAnnotatorTranslations } from '../i18n/translations';
import { CSS_UNITS, PDFDocumentProxy } from './pdfjs';
import { nowIso, uid } from './utils';

export type ActiveTool = 'select' | AnnotationType;

export interface SearchMatch {
  page: number;
  rects: PdfRect[];
}

export interface PageSize {
  width: number;
  height: number;
}

export const DEFAULT_PALETTE = [
  '#ffd400',
  '#ff9f1c',
  '#ff5a5f',
  '#e11d74',
  '#a855f7',
  '#3b82f6',
  '#06b6d4',
  '#22c55e',
  '#84cc16',
  '#111827',
  '#6b7280',
  '#ffffff',
];

export const DEFAULT_TOOL_STYLES: Record<AnnotationType, ToolStyle> = {
  highlight: { color: '#ffd400', opacity: 0.4, strokeWidth: 0 },
  underline: { color: '#3b82f6', opacity: 1, strokeWidth: 0 },
  strikeout: { color: '#ff5a5f', opacity: 1, strokeWidth: 0 },
  squiggly: { color: '#22c55e', opacity: 1, strokeWidth: 0 },
  freehand: { color: '#e11d74', opacity: 1, strokeWidth: 2 },
  freehandHighlight: { color: '#ffd400', opacity: 0.4, strokeWidth: 14 },
  note: { color: '#ff9f1c', opacity: 1, strokeWidth: 0 },
};

export const DEFAULT_ZOOM_LEVELS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];

/**
 * Estado interno de una instancia del visor. Se provee a nivel de componente,
 * así que puedes tener varios visores en la misma página.
 */
@Injectable()
export class PdfAnnotatorStore {
  // ---------- Configuración (la escribe el componente raíz a partir de los inputs) ----------
  readonly documentId = signal<string | null>(null);
  readonly user = signal<PdfUser | null>(null);
  readonly language = signal<string>('es');
  readonly customTranslations = signal<Record<string, unknown>>({});
  readonly themeSetting = signal<PdfAnnotatorTheme>('light');
  readonly systemDark = signal(false);
  readonly permissions = signal<PdfAnnotatorPermissions>({});
  readonly security = signal<Required<PdfSecurityConfig>>({
    disableDownload: true,
    disablePrint: true,
    disableContextMenu: true,
    disableCopy: false,
    disableDrag: true,
  });
  readonly toolbar = signal<Required<PdfToolbarConfig>>({
    leftPanel: true,
    zoom: true,
    search: true,
    comments: true,
    modeSwitch: true,
    pageNavigation: true,
    themeToggle: false,
    languageSelector: false,
  });
  readonly watermarks = signal<WatermarkConfig[]>([]);
  readonly palette = signal<string[]>(DEFAULT_PALETTE);
  readonly zoomLevels = signal<number[]>(DEFAULT_ZOOM_LEVELS);
  readonly minZoom = signal(0.25);
  readonly maxZoom = signal(5);
  readonly dateFormat = signal<Intl.DateTimeFormatOptions>({ dateStyle: 'medium', timeStyle: 'short' });
  readonly readOnly = signal(false);

  // ---------- Documento ----------
  readonly doc = signal<PDFDocumentProxy | null>(null);
  readonly numPages = signal(0);
  readonly pageSizes = signal<PageSize[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  // ---------- Vista ----------
  readonly zoom = signal(1);
  readonly zoomMode = signal<ZoomMode | null>('fit-width');
  readonly currentPage = signal(1);
  readonly mode = signal<PdfViewerMode>('view');
  readonly activeTool = signal<ActiveTool>('select');
  readonly toolStyles = signal<Record<AnnotationType, ToolStyle>>(structuredClone(DEFAULT_TOOL_STYLES));
  readonly leftPanelOpen = signal(false);
  readonly commentsOpen = signal(false);
  readonly searchOpen = signal(false);
  /** Se incrementa para pedir el foco en la caja de búsqueda. */
  readonly searchFocus = signal(0);

  // ---------- Anotaciones ----------
  readonly annotations = signal<PdfAnnotation[]>([]);
  readonly selectedId = signal<string | null>(null);
  /** Id de la anotación cuyo comentario se está editando (por ejemplo, nota recién creada). */
  readonly editingId = signal<string | null>(null);

  // ---------- Búsqueda ----------
  readonly searchQuery = signal('');
  readonly searchMatchCase = signal(false);
  readonly searchResults = signal<SearchMatch[]>([]);
  readonly searchIndex = signal(-1);
  readonly searching = signal(false);

  // ---------- Eventos ----------
  /** Cambios de anotaciones (el componente raíz los reemite como outputs). */
  readonly changes$ = new Subject<AnnotationChangeEvent>();
  /** Peticiones de desplazamiento hacia una página / posición. */
  readonly scrollTo$ = new Subject<{ page: number; y?: number; smooth?: boolean }>();

  // ---------- Derivados ----------
  readonly t = computed<PdfAnnotatorTranslations>(() => {
    const lang = this.language();
    const base = BUILT_IN_TRANSLATIONS[lang] ?? ES;
    return mergeTranslations(base, this.customTranslations()[lang]);
  });

  readonly availableLanguages = computed(() => {
    const set = new Set([...Object.keys(BUILT_IN_TRANSLATIONS), ...Object.keys(this.customTranslations())]);
    return [...set];
  });

  readonly theme = computed<'light' | 'dark'>(() => {
    const s = this.themeSetting();
    return s === 'auto' ? (this.systemDark() ? 'dark' : 'light') : s;
  });

  /** Píxeles CSS por punto PDF. */
  readonly cssScale = computed(() => this.zoom() * CSS_UNITS);

  readonly annotationsByPage = computed(() => {
    const map = new Map<number, PdfAnnotation[]>();
    for (const a of this.annotations()) {
      const list = map.get(a.page);
      if (list) list.push(a);
      else map.set(a.page, [a]);
    }
    for (const list of map.values()) list.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return map;
  });

  readonly searchByPage = computed(() => {
    const map = new Map<number, { rects: PdfRect[]; index: number }[]>();
    this.searchResults().forEach((m, index) => {
      const list = map.get(m.page) ?? [];
      list.push({ rects: m.rects, index });
      map.set(m.page, list);
    });
    return map;
  });

  readonly selected = computed(() => {
    const id = this.selectedId();
    return id ? (this.annotations().find((a) => a.id === id) ?? null) : null;
  });

  readonly canAnnotate = computed(
    () => !this.readOnly() && !!this.user() && this.permissions().canAnnotate !== false,
  );

  // ---------- Textos ----------
  tr(text: string, params: Record<string, string | number>): string {
    return interpolate(text, params);
  }

  formatDate(iso: string): string {
    try {
      return new Intl.DateTimeFormat(this.language(), this.dateFormat()).format(new Date(iso));
    } catch {
      return iso;
    }
  }

  statusLabel(status: AnnotationStatus): string {
    return this.t().status[status] ?? status;
  }

  // ---------- Zoom / navegación ----------
  setZoom(value: number, mode: ZoomMode | null = null): void {
    const z = Math.min(this.maxZoom(), Math.max(this.minZoom(), value));
    this.zoomMode.set(mode);
    this.zoom.set(Math.round(z * 1000) / 1000);
  }

  zoomIn(): void {
    const z = this.zoom();
    const next = this.zoomLevels().find((l) => l > z + 0.001);
    this.setZoom(next ?? z * 1.25);
  }

  zoomOut(): void {
    const z = this.zoom();
    const prev = [...this.zoomLevels()].reverse().find((l) => l < z - 0.001);
    this.setZoom(prev ?? z / 1.25);
  }

  goToPage(page: number, smooth = false): void {
    const p = Math.min(this.numPages(), Math.max(1, Math.round(page)));
    if (!p) return;
    this.currentPage.set(p);
    this.scrollTo$.next({ page: p, smooth });
  }

  goToSearchResult(index: number): void {
    const results = this.searchResults();
    if (!results.length) return;
    const i = ((index % results.length) + results.length) % results.length;
    this.searchIndex.set(i);
    const m = results[i];
    this.currentPage.set(m.page);
    this.scrollTo$.next({ page: m.page, y: Math.min(...m.rects.map((r) => r.y)), smooth: false });
  }

  clearSearch(): void {
    this.searchQuery.set('');
    this.searchResults.set([]);
    this.searchIndex.set(-1);
  }

  // ---------- Permisos ----------
  isOwner(item: PdfAnnotation | AnnotationReply): boolean {
    const u = this.user();
    return !!u && item.author.id === u.id;
  }

  canDelete(item: PdfAnnotation | AnnotationReply): boolean {
    if (this.readOnly()) return false;
    const p = this.permissions();
    if (p.canDelete) return p.canDelete(item, this.user());
    if (!this.user()) return false;
    return p.deleteOwnOnly === false ? true : this.isOwner(item);
  }

  canEdit(item: PdfAnnotation | AnnotationReply): boolean {
    if (this.readOnly()) return false;
    const p = this.permissions();
    if (p.canEdit) return p.canEdit(item, this.user());
    if (!this.user()) return false;
    return p.editOwnOnly === false ? true : this.isOwner(item);
  }

  canReply(): boolean {
    return !this.readOnly() && !!this.user() && this.permissions().canReply !== false;
  }

  canChangeStatus(): boolean {
    return !this.readOnly() && !!this.user() && this.permissions().canChangeStatus !== false;
  }

  // ---------- Mutaciones ----------
  private author(): AnnotationAuthor {
    const u = this.user();
    return u ? { id: u.id, name: u.name } : { id: 'anonymous', name: 'Anónimo' };
  }

  private emit(e: Omit<AnnotationChangeEvent, 'user'>): void {
    this.changes$.next({ ...e, annotation: structuredClone(e.annotation), user: this.author() });
  }

  private patch(id: string, fn: (a: PdfAnnotation) => PdfAnnotation): PdfAnnotation | null {
    let result: PdfAnnotation | null = null;
    this.annotations.update((list) =>
      list.map((a) => {
        if (a.id !== id) return a;
        result = fn(a);
        return result;
      }),
    );
    return result;
  }

  /** Construye los campos comunes de una anotación nueva. */
  newBase(type: AnnotationType, page: number) {
    const style = this.toolStyles()[type];
    const now = nowIso();
    const size = this.pageSizes()[page - 1] ?? { width: 0, height: 0 };
    return {
      id: uid(),
      documentId: this.documentId(),
      type,
      page,
      color: style.color,
      opacity: style.opacity,
      contents: '',
      author: this.author(),
      createdAt: now,
      updatedAt: now,
      status: 'none' as const,
      marked: 'unmarked' as const,
      statusHistory: [],
      replies: [],
      pageSize: { width: Math.round(size.width * 100) / 100, height: Math.round(size.height * 100) / 100 },
    };
  }

  /** Momento de la última creación (evita que el clic que la sigue deseleccione). */
  lastCreatedAt = 0;

  add(annotation: PdfAnnotation): void {
    if (!this.canAnnotate()) return;
    this.lastCreatedAt = Date.now();
    this.annotations.update((l) => [...l, annotation]);
    this.emit({ action: 'add', annotation });
  }

  updateContents(id: string, contents: string): void {
    const current = this.annotations().find((a) => a.id === id);
    if (!current || !this.canEdit(current)) return;
    if (current.contents === contents) return;
    const updated = this.patch(id, (a) => ({ ...a, contents, updatedAt: nowIso() }));
    if (updated) this.emit({ action: 'update', annotation: updated });
  }

  updateStyle(id: string, style: Partial<Pick<PdfAnnotation, 'color' | 'opacity'>>): void {
    const current = this.annotations().find((a) => a.id === id);
    if (!current || !this.canEdit(current)) return;
    const updated = this.patch(id, (a) => ({ ...a, ...style, updatedAt: nowIso() }) as PdfAnnotation);
    if (updated) this.emit({ action: 'update', annotation: updated });
  }

  remove(id: string): void {
    const current = this.annotations().find((a) => a.id === id);
    if (!current || !this.canDelete(current)) return;
    this.annotations.update((l) => l.filter((a) => a.id !== id));
    if (this.selectedId() === id) this.selectedId.set(null);
    if (this.editingId() === id) this.editingId.set(null);
    this.emit({ action: 'delete', annotation: current });
  }

  addReply(id: string, contents: string): void {
    if (!this.canReply() || !contents.trim()) return;
    const now = nowIso();
    const reply: AnnotationReply = { id: uid(), author: this.author(), contents: contents.trim(), createdAt: now, updatedAt: now };
    const updated = this.patch(id, (a) => ({ ...a, replies: [...a.replies, reply] }));
    if (updated) this.emit({ action: 'reply-add', annotation: updated, reply });
  }

  updateReply(id: string, replyId: string, contents: string): void {
    const ann = this.annotations().find((a) => a.id === id);
    const reply = ann?.replies.find((r) => r.id === replyId);
    if (!ann || !reply || !this.canEdit(reply) || !contents.trim()) return;
    const newReply = { ...reply, contents: contents.trim(), updatedAt: nowIso() };
    const updated = this.patch(id, (a) => ({ ...a, replies: a.replies.map((r) => (r.id === replyId ? newReply : r)) }));
    if (updated) this.emit({ action: 'reply-update', annotation: updated, reply: newReply });
  }

  removeReply(id: string, replyId: string): void {
    const ann = this.annotations().find((a) => a.id === id);
    const reply = ann?.replies.find((r) => r.id === replyId);
    if (!ann || !reply || !this.canDelete(reply)) return;
    const updated = this.patch(id, (a) => ({ ...a, replies: a.replies.filter((r) => r.id !== replyId) }));
    if (updated) this.emit({ action: 'reply-delete', annotation: updated, reply });
  }

  setStatus(id: string, status: AnnotationStatus): void {
    if (!this.canChangeStatus()) return;
    const change = { status, author: this.author(), date: nowIso() };
    const isMarked = (MARKED_STATUSES as readonly string[]).includes(status);
    const updated = this.patch(id, (a) => ({
      ...a,
      ...(isMarked ? { marked: status as PdfAnnotation['marked'] } : { status: status as PdfAnnotation['status'] }),
      statusHistory: [...a.statusHistory, change],
    }));
    if (updated) this.emit({ action: 'status', annotation: updated, status });
  }

  select(id: string | null, scroll = false): void {
    this.selectedId.set(id);
    if (id && scroll) {
      const a = this.annotations().find((x) => x.id === id);
      if (a) this.scrollTo$.next({ page: a.page, y: annotationTop(a), smooth: true });
    }
  }
}

/** Coordenada Y superior de una anotación (puntos PDF). */
export function annotationTop(a: PdfAnnotation): number {
  switch (a.type) {
    case 'note':
      return a.position.y;
    case 'freehand':
    case 'freehandHighlight':
      return Math.min(...a.paths.flat().map((p) => p.y));
    default:
      return Math.min(...a.rects.map((r) => r.y));
  }
}
