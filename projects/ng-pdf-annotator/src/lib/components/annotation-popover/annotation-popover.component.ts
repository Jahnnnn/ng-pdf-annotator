import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { PdfAnnotation } from '../../models/annotation.model';
import { PdfAnnotatorStore } from '../../core/pdf-annotator.store';
import { colorFromString, initials } from '../../core/utils';
import { NpaIconComponent } from '../icon.component';
import { NpaStatusMenuComponent } from '../status-menu/status-menu.component';

const WIDTH = 272;

/** Tarjeta flotante que aparece al seleccionar una anotación en la página. */
@Component({
  selector: 'npa-annotation-popover',
  imports: [NpaIconComponent, NpaStatusMenuComponent],
  templateUrl: './annotation-popover.component.html',
  styleUrl: './annotation-popover.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'npa-popover',
    '[style.left.px]': 'left()',
    '[style.top.px]': 'above() ? anchorTop() - 8 : anchorBottom() + 8',
    '[class.npa-popover--above]': 'above()',
    '(click)': '$event.stopPropagation()',
    '(pointerdown)': '$event.stopPropagation()',
    '(mouseup)': '$event.stopPropagation()',
  },
})
export class NpaAnnotationPopoverComponent {
  readonly annotation = input.required<PdfAnnotation>();
  readonly anchorX = input(0);
  readonly anchorTop = input(0);
  readonly anchorBottom = input(0);
  readonly pageWidth = input(0);
  readonly pageHeight = input(0);

  protected readonly store = inject(PdfAnnotatorStore);
  private readonly textarea = viewChild<ElementRef<HTMLTextAreaElement>>('textarea');

  protected readonly confirmDelete = signal(false);
  protected readonly localEditing = signal(false);
  protected readonly draft = signal('');

  protected readonly left = computed(() => Math.max(4, Math.min(this.anchorX(), this.pageWidth() - WIDTH - 4)));
  protected readonly above = computed(
    () => this.anchorBottom() + 230 > this.pageHeight() && this.anchorTop() > 230,
  );
  protected readonly editing = computed(
    () => (this.localEditing() || this.store.editingId() === this.annotation().id) && this.store.canEdit(this.annotation()),
  );
  protected readonly canEdit = computed(() => this.store.canEdit(this.annotation()));
  protected readonly canDelete = computed(() => this.store.canDelete(this.annotation()));
  protected readonly avatarColor = computed(() => colorFromString(this.annotation().author.id));
  protected readonly initials = computed(() => initials(this.annotation().author.name));

  constructor() {
    afterRenderEffect(() => {
      if (this.editing()) {
        const ta = this.textarea()?.nativeElement;
        if (ta && document.activeElement !== ta) {
          this.draft.set(this.annotation().contents);
          ta.value = this.annotation().contents;
          ta.focus();
        }
      }
    });
  }

  protected startEdit(): void {
    this.draft.set(this.annotation().contents);
    this.localEditing.set(true);
  }

  protected save(): void {
    this.store.updateContents(this.annotation().id, this.draft().trim());
    this.stopEdit();
  }

  protected stopEdit(): void {
    this.localEditing.set(false);
    if (this.store.editingId() === this.annotation().id) this.store.editingId.set(null);
  }

  protected onKey(ev: KeyboardEvent): void {
    ev.stopPropagation();
    if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) this.save();
    if (ev.key === 'Escape') this.stopEdit();
  }

  protected setColor(color: string): void {
    this.store.updateStyle(this.annotation().id, { color });
  }

  protected openInPanel(): void {
    this.store.commentsOpen.set(true);
  }

  protected remove(): void {
    this.store.remove(this.annotation().id);
  }

  protected close(): void {
    this.stopEdit();
    this.store.select(null);
  }
}
