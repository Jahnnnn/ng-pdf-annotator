import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { PdfAnnotatorStore } from '../../core/pdf-annotator.store';
import { searchDocument } from '../../core/search';
import { LANGUAGE_NAMES } from '../../i18n/translations';
import { PdfViewerMode } from '../../models/config.model';
import { NpaIconComponent } from '../icon.component';

/** Barra de acciones superior. */
@Component({
  selector: 'npa-toolbar',
  imports: [NpaIconComponent],
  templateUrl: './toolbar.component.html',
  styleUrl: './toolbar.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'npa-toolbar',
    role: 'toolbar',
    '(document:click)': 'onDocClick($event)',
  },
})
export class NpaToolbarComponent {
  protected readonly store = inject(PdfAnnotatorStore);
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');

  /** Se emite cuando el usuario cambia el idioma o el tema desde la barra. */
  readonly languageChange = output<string>();
  readonly themeChange = output<'light' | 'dark'>();

  protected readonly zoomMenuOpen = signal(false);
  protected readonly zoomPercent = computed(() => Math.round(this.store.zoom() * 100));
  protected readonly commentCount = computed(() => this.store.annotations().length);
  protected readonly languageNames = LANGUAGE_NAMES;

  private lastFocus = 0;
  private searchTimer: ReturnType<typeof setTimeout> | null = null;
  private searchToken = { cancelled: false };

  constructor() {
    afterRenderEffect(() => {
      if (this.store.searchFocus() && this.store.searchOpen()) {
        const el = this.searchInput()?.nativeElement;
        if (el && this.lastFocus !== this.store.searchFocus()) {
          this.lastFocus = this.store.searchFocus();
          el.focus();
          el.select();
        }
      }
    });
    this.destroyRef.onDestroy(() => {
      this.searchToken.cancelled = true;
      if (this.searchTimer) clearTimeout(this.searchTimer);
    });
  }

  // ---------- Páginas ----------
  protected onPageInput(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const n = parseInt(input.value, 10);
    if (Number.isFinite(n)) this.store.goToPage(n);
    input.value = String(this.store.currentPage());
  }

  // ---------- Zoom ----------
  protected onZoomInput(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const n = parseFloat(input.value.replace('%', '').replace(',', '.'));
    if (Number.isFinite(n) && n > 0) this.store.setZoom(n / 100);
    input.value = this.zoomPercent() + '%';
    input.blur();
  }

  protected pickZoom(value: number | 'fit-width' | 'fit-page'): void {
    this.zoomMenuOpen.set(false);
    if (typeof value === 'number') this.store.setZoom(value);
    else this.store.zoomMode.set(value);
  }

  // ---------- Modo ----------
  protected setMode(mode: PdfViewerMode): void {
    this.store.mode.set(mode);
    if (mode === 'view') this.store.activeTool.set('select');
  }

  // ---------- Búsqueda ----------
  protected toggleSearch(): void {
    const open = !this.store.searchOpen();
    this.store.searchOpen.set(open);
    if (open) this.store.searchFocus.update((n) => n + 1);
    else this.closeSearch();
  }

  protected closeSearch(): void {
    this.searchToken.cancelled = true;
    this.store.searchOpen.set(false);
    this.store.clearSearch();
    this.store.searching.set(false);
  }

  protected onSearchInput(value: string): void {
    this.store.searchQuery.set(value);
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.runSearch(), 300);
  }

  protected toggleMatchCase(): void {
    this.store.searchMatchCase.update((v) => !v);
    this.runSearch();
  }

  protected onSearchKey(ev: KeyboardEvent): void {
    ev.stopPropagation();
    if (ev.key === 'Enter') {
      ev.preventDefault();
      if (this.searchTimer) {
        clearTimeout(this.searchTimer);
        this.searchTimer = null;
        this.runSearch();
        return;
      }
      this.store.goToSearchResult(this.store.searchIndex() + (ev.shiftKey ? -1 : 1));
    }
    if (ev.key === 'Escape') this.closeSearch();
  }

  private async runSearch(): Promise<void> {
    this.searchTimer = null;
    this.searchToken.cancelled = true;
    const token = { cancelled: false };
    this.searchToken = token;
    const doc = this.store.doc();
    const q = this.store.searchQuery();
    if (!doc || q.trim().length < 1) {
      this.store.searchResults.set([]);
      this.store.searchIndex.set(-1);
      return;
    }
    this.store.searching.set(true);
    const results = await searchDocument(doc, q, this.store.searchMatchCase(), token, (partial) => {
      if (!token.cancelled) this.store.searchResults.set(partial);
    });
    if (token.cancelled) return;
    this.store.searching.set(false);
    this.store.searchResults.set(results);
    if (results.length) {
      // Primer resultado a partir de la página actual.
      const from = results.findIndex((r) => r.page >= this.store.currentPage());
      this.store.goToSearchResult(from === -1 ? 0 : from);
    } else this.store.searchIndex.set(-1);
  }

  // ---------- Tema / idioma ----------
  protected toggleTheme(): void {
    const next = this.store.theme() === 'dark' ? 'light' : 'dark';
    this.store.themeSetting.set(next);
    this.themeChange.emit(next);
  }

  protected setLanguage(lang: string): void {
    this.store.language.set(lang);
    this.languageChange.emit(lang);
  }

  protected onDocClick(ev: MouseEvent): void {
    if (this.zoomMenuOpen() && !this.el.nativeElement.querySelector('.npa-zoom')?.contains(ev.target as Node))
      this.zoomMenuOpen.set(false);
  }
}
