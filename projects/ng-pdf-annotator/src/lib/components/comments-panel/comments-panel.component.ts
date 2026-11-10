import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { AnnotationStatus, MARKED_STATUSES, PdfAnnotation, REVIEW_STATUSES } from '../../models/annotation.model';
import { PdfAnnotatorStore } from '../../core/pdf-annotator.store';
import { NpaIconComponent } from '../icon.component';
import { NpaCommentCardComponent } from '../comment-card/comment-card.component';

/** Número de grupos (páginas) que se pintan de una vez. */
const GROUP_CHUNK = 25;

/**
 * Panel de comentarios agrupado por página.
 * Para documentos grandes: solo se pintan las tarjetas de los grupos expandidos y los grupos
 * se cargan por bloques, así el panel no se satura aunque haya cientos de páginas anotadas.
 */
@Component({
  selector: 'npa-comments-panel',
  imports: [NpaIconComponent, NpaCommentCardComponent],
  templateUrl: './comments-panel.component.html',
  styleUrl: './comments-panel.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NpaCommentsPanelComponent {
  protected readonly store = inject(PdfAnnotatorStore);
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly filterText = signal('');
  protected readonly filterStatus = signal<AnnotationStatus | 'all'>('all');
  protected readonly currentPageOnly = signal(false);
  protected readonly expanded = signal<Set<number>>(new Set());
  protected readonly groupLimit = signal(GROUP_CHUNK);
  protected readonly statuses = [...REVIEW_STATUSES, ...MARKED_STATUSES];

  private readonly filtered = computed(() => {
    const text = this.filterText().trim().toLowerCase();
    const status = this.filterStatus();
    const only = this.currentPageOnly() ? this.store.currentPage() : null;
    const match = (a: PdfAnnotation) => {
      if (only && a.page !== only) return false;
      if (status !== 'all' && a.status !== status && a.marked !== status) return false;
      if (!text) return true;
      return (
        a.contents.toLowerCase().includes(text) ||
        a.author.name.toLowerCase().includes(text) ||
        ('selectedText' in a && a.selectedText.toLowerCase().includes(text)) ||
        a.replies.some((r) => r.contents.toLowerCase().includes(text) || r.author.name.toLowerCase().includes(text))
      );
    };
    return this.store.annotations().filter(match);
  });

  protected readonly total = computed(() => this.filtered().length);

  protected readonly groups = computed(() => {
    const map = new Map<number, PdfAnnotation[]>();
    for (const a of this.filtered()) {
      const l = map.get(a.page);
      if (l) l.push(a);
      else map.set(a.page, [a]);
    }
    return [...map.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([page, items]) => ({
        page,
        items: items.sort((x, y) => x.createdAt.localeCompare(y.createdAt)),
        replies: items.reduce((n, i) => n + i.replies.length, 0),
      }));
  });

  protected readonly visibleGroups = computed(() => this.groups().slice(0, this.groupLimit()));

  private pendingScrollId: string | null = null;

  constructor() {
    // Expande automáticamente la página actual la primera vez y el grupo de la anotación seleccionada.
    effect(() => {
      const page = this.store.currentPage();
      untracked(() => {
        if (this.expanded().size === 0) this.expanded.set(new Set([page]));
      });
    });
    effect(() => {
      const sel = this.store.selected();
      if (!sel) return;
      untracked(() => {
        if (!this.expanded().has(sel.page)) this.expanded.update((s) => new Set(s).add(sel.page));
        const idx = this.groups().findIndex((g) => g.page === sel.page);
        if (idx >= this.groupLimit()) this.groupLimit.set(idx + GROUP_CHUNK);
        this.pendingScrollId = sel.id;
      });
    });
    afterRenderEffect(() => {
      this.store.selectedId();
      this.expanded();
      const id = this.pendingScrollId;
      if (!id) return;
      const card = this.el.nativeElement.querySelector(`[data-id="${CSS.escape(id)}"]`);
      if (card) {
        card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        this.pendingScrollId = null;
      }
    });
  }

  protected isExpanded(page: number): boolean {
    return this.expanded().has(page);
  }

  protected toggle(page: number): void {
    this.expanded.update((s) => {
      const n = new Set(s);
      if (n.has(page)) n.delete(page);
      else n.add(page);
      return n;
    });
  }

  protected expandAll(): void {
    this.expanded.set(new Set(this.groups().map((g) => g.page)));
  }

  protected collapseAll(): void {
    this.expanded.set(new Set([-1]));
  }

  protected goToPage(ev: Event, page: number): void {
    ev.stopPropagation();
    this.store.goToPage(page, true);
  }
}
