import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, input, signal } from '@angular/core';
import { AnnotationReply, PdfAnnotation } from '../../models/annotation.model';
import { PdfAnnotatorStore } from '../../core/pdf-annotator.store';
import { colorFromString, initials } from '../../core/utils';
import { NpaIconComponent } from '../icon.component';
import { NpaStatusMenuComponent } from '../status-menu/status-menu.component';

/** Tarjeta de un comentario/anotación en el panel de comentarios, con sus respuestas. */
@Component({
  selector: 'npa-comment-card',
  imports: [NpaIconComponent, NpaStatusMenuComponent],
  templateUrl: './comment-card.component.html',
  styleUrl: './comment-card.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'npa-card',
    '[class.npa-card--selected]': 'isSelected()',
    '[attr.data-id]': 'annotation().id',
    '(click)': 'select()',
  },
})
export class NpaCommentCardComponent {
  readonly annotation = input.required<PdfAnnotation>();

  protected readonly store = inject(PdfAnnotatorStore);
  readonly el = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly isSelected = computed(() => this.store.selectedId() === this.annotation().id);
  protected readonly showReplies = signal(false);
  protected readonly editingMain = signal(false);
  protected readonly editingReplyId = signal<string | null>(null);
  protected readonly confirmId = signal<string | null>(null);
  protected readonly replyDraft = signal('');
  protected readonly editDraft = signal('');

  protected readonly visibleReplies = computed(() => {
    const replies = this.annotation().replies;
    return this.showReplies() || replies.length <= 2 ? replies : replies.slice(-1);
  });
  protected readonly hiddenReplies = computed(() => this.annotation().replies.length - this.visibleReplies().length);
  protected readonly lastStatus = computed(() => {
    const h = this.annotation().statusHistory;
    return h.length ? h[h.length - 1] : null;
  });
  protected readonly quote = computed(() => {
    const a = this.annotation();
    return 'selectedText' in a ? a.selectedText : '';
  });

  protected avatarColor(id: string): string {
    return colorFromString(id);
  }

  protected initials(name: string): string {
    return initials(name);
  }

  protected isEdited(item: { createdAt: string; updatedAt: string }): boolean {
    return item.updatedAt !== item.createdAt;
  }

  protected select(): void {
    if (!this.isSelected()) this.store.select(this.annotation().id, true);
  }

  protected goTo(ev: Event): void {
    ev.stopPropagation();
    this.store.select(this.annotation().id, true);
  }

  // --- Comentario principal ---
  protected startEditMain(ev: Event): void {
    ev.stopPropagation();
    this.editDraft.set(this.annotation().contents);
    this.editingMain.set(true);
  }

  protected saveMain(): void {
    this.store.updateContents(this.annotation().id, this.editDraft().trim());
    this.editingMain.set(false);
  }

  // --- Respuestas ---
  protected sendReply(): void {
    const text = this.replyDraft().trim();
    if (!text) return;
    this.store.addReply(this.annotation().id, text);
    this.replyDraft.set('');
    this.showReplies.set(true);
  }

  protected onReplyKey(ev: KeyboardEvent): void {
    ev.stopPropagation();
    if (ev.key === 'Enter' && !ev.shiftKey) {
      ev.preventDefault();
      this.sendReply();
    }
  }

  protected startEditReply(ev: Event, r: AnnotationReply): void {
    ev.stopPropagation();
    this.editDraft.set(r.contents);
    this.editingReplyId.set(r.id);
  }

  protected saveReply(r: AnnotationReply): void {
    this.store.updateReply(this.annotation().id, r.id, this.editDraft());
    this.editingReplyId.set(null);
  }

  protected onMainKey(ev: KeyboardEvent): void {
    ev.stopPropagation();
    if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) this.saveMain();
    if (ev.key === 'Escape') this.editingMain.set(false);
  }

  protected onReplyEditKey(ev: KeyboardEvent, r: AnnotationReply): void {
    ev.stopPropagation();
    if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) this.saveReply(r);
    if (ev.key === 'Escape') this.editingReplyId.set(null);
  }

  // --- Eliminar ---
  protected askDelete(ev: Event, id: string): void {
    ev.stopPropagation();
    this.confirmId.set(id);
  }

  protected confirmDelete(): void {
    const id = this.confirmId();
    const a = this.annotation();
    if (id === a.id) this.store.remove(a.id);
    else if (id) this.store.removeReply(a.id, id);
    this.confirmId.set(null);
  }
}
