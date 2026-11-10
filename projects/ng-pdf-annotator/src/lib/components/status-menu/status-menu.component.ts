import { ChangeDetectionStrategy, Component, ElementRef, inject, input, signal } from '@angular/core';
import { AnnotationStatus, MARKED_STATUSES, PdfAnnotation, REVIEW_STATUSES } from '../../models/annotation.model';
import { PdfAnnotatorStore } from '../../core/pdf-annotator.store';
import { NpaIconComponent } from '../icon.component';

/** Botón + menú para cambiar el estado (Aceptado, Rechazado, …, Marcado, Sin marcar). */
@Component({
  selector: 'npa-status-menu',
  imports: [NpaIconComponent],
  template: `
    @let t = store.t();
    @let a = annotation();
    <button
      type="button"
      class="npa-icon-btn npa-status-trigger"
      [attr.aria-label]="t.comments.setStatus"
      [title]="store.canChangeStatus() ? t.comments.setStatus : t.comments.noPermission"
      [disabled]="!store.canChangeStatus()"
      [attr.aria-expanded]="open()"
      (click)="toggle($event)"
    >
      <npa-icon name="status" [size]="16" />
      <span class="npa-status-trigger__label">{{ store.statusLabel(a.status) }}</span>
      @if (a.marked === 'marked') {
        <npa-icon name="check" [size]="13" />
      }
    </button>
    @if (open()) {
      <div class="npa-menu" role="menu" [class.npa-menu--up]="openUp()">
        <div class="npa-menu__title">{{ t.comments.status }}</div>
        @for (s of review; track s) {
          <button type="button" role="menuitemradio" class="npa-menu__item" [attr.aria-checked]="a.status === s" (click)="set(s)">
            <span class="npa-status-dot" [attr.data-status]="s"></span>
            {{ store.statusLabel(s) }}
            @if (a.status === s) {
              <npa-icon name="check" [size]="14" class="npa-menu__check" />
            }
          </button>
        }
        <div class="npa-menu__sep"></div>
        @for (s of marked; track s) {
          <button type="button" role="menuitemradio" class="npa-menu__item" [attr.aria-checked]="a.marked === s" (click)="set(s)">
            <span class="npa-status-dot" [attr.data-status]="s"></span>
            {{ store.statusLabel(s) }}
            @if (a.marked === s) {
              <npa-icon name="check" [size]="14" class="npa-menu__check" />
            }
          </button>
        }
      </div>
    }
  `,
  styles: `
    :host {
      position: relative;
      display: inline-flex;
    }
    .npa-status-trigger {
      width: auto;
      gap: 4px;
      padding: 0 6px;
      font-size: 12px;
    }
    .npa-status-trigger__label {
      max-width: 90px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:click)': 'onDocClick($event)',
    '(keydown.escape)': 'open.set(false)',
  },
})
export class NpaStatusMenuComponent {
  readonly annotation = input.required<PdfAnnotation>();
  protected readonly store = inject(PdfAnnotatorStore);
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly open = signal(false);
  protected readonly openUp = signal(false);
  protected readonly review = REVIEW_STATUSES;
  protected readonly marked = MARKED_STATUSES;

  protected toggle(ev: MouseEvent): void {
    ev.stopPropagation();
    const r = this.el.nativeElement.getBoundingClientRect();
    this.openUp.set(r.bottom + 290 > globalThis.innerHeight && r.top > 290);
    this.open.update((v) => !v);
  }

  protected set(s: AnnotationStatus): void {
    this.store.setStatus(this.annotation().id, s);
    this.open.set(false);
  }

  protected onDocClick(ev: MouseEvent): void {
    if (this.open() && !this.el.nativeElement.contains(ev.target as Node)) this.open.set(false);
  }
}
