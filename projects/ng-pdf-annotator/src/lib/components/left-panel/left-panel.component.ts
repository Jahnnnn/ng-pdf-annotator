import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { PdfAnnotatorStore } from '../../core/pdf-annotator.store';
import { NpaIconComponent } from '../icon.component';
import { NpaThumbnailComponent } from './thumbnail.component';
import { NgTemplateOutlet } from '@angular/common';

export interface OutlineNode {
  title: string;
  dest: string | unknown[] | null;
  items: OutlineNode[];
}

/** Panel izquierdo: miniaturas e índice (outline) del documento. */
@Component({
  selector: 'npa-left-panel',
  imports: [NpaIconComponent, NpaThumbnailComponent, NgTemplateOutlet],
  template: `
    @let t = store.t();
    <div class="npa-tabs" role="tablist">
      <button type="button" role="tab" class="npa-tab" [class.npa-tab--active]="tab() === 'thumbs'" [attr.aria-selected]="tab() === 'thumbs'" (click)="tab.set('thumbs')">
        <npa-icon name="grid" [size]="16" /> {{ t.leftPanel.thumbnails }}
      </button>
      <button type="button" role="tab" class="npa-tab" [class.npa-tab--active]="tab() === 'outline'" [attr.aria-selected]="tab() === 'outline'" (click)="tab.set('outline')">
        <npa-icon name="list" [size]="16" /> {{ t.leftPanel.outline }}
      </button>
    </div>
    <div class="npa-left__body">
      @if (tab() === 'thumbs') {
        <div class="npa-thumbs">
          @for (p of pages(); track p) {
            <npa-thumbnail [pageNumber]="p" />
          }
        </div>
      } @else {
        @if (outline().length) {
          <ng-container [ngTemplateOutlet]="tree" [ngTemplateOutletContext]="{ $implicit: outline() }" />
        } @else {
          <p class="npa-empty-text">{{ t.leftPanel.noOutline }}</p>
        }
      }
    </div>

    <ng-template #tree let-nodes>
      <ul class="npa-outline">
        @for (n of nodes; track $index) {
          <li>
            <button type="button" class="npa-outline__item" (click)="open(n)">{{ n.title }}</button>
            @if (n.items?.length) {
              <ng-container [ngTemplateOutlet]="tree" [ngTemplateOutletContext]="{ $implicit: n.items }" />
            }
          </li>
        }
      </ul>
    </ng-template>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      min-height: 0;
      background: var(--npa-panel);
      color: var(--npa-text);
    }
    .npa-left__body {
      flex: 1;
      overflow: auto;
      overscroll-behavior: contain;
    }
    .npa-thumbs {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
      padding: 10px 0 20px;
    }
    .npa-outline {
      list-style: none;
      margin: 0;
      padding: 4px 0 4px 10px;
    }
    .npa-thumbs + .npa-outline,
    .npa-left__body > .npa-outline {
      padding: 8px;
    }
    .npa-outline__item {
      display: block;
      width: 100%;
      text-align: left;
      padding: 5px 8px;
      border: 0;
      border-radius: 6px;
      background: none;
      color: var(--npa-text);
      font: inherit;
      font-size: 13px;
      cursor: pointer;
    }
    .npa-outline__item:hover {
      background: var(--npa-hover);
    }
    .npa-empty-text {
      padding: 20px 16px;
      color: var(--npa-text-muted);
      font-size: 13px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NpaLeftPanelComponent {
  protected readonly store = inject(PdfAnnotatorStore);
  protected readonly tab = signal<'thumbs' | 'outline'>('thumbs');
  protected readonly outline = signal<OutlineNode[]>([]);
  protected readonly pages = computed(() => Array.from({ length: this.store.numPages() }, (_, i) => i + 1));

  constructor() {
    effect(() => {
      const doc = this.store.doc();
      this.outline.set([]);
      doc
        ?.getOutline()
        .then((o) => this.outline.set((o ?? []) as unknown as OutlineNode[]))
        .catch(() => this.outline.set([]));
    });
  }

  protected async open(node: OutlineNode): Promise<void> {
    const doc = this.store.doc();
    if (!doc || !node.dest) return;
    try {
      const dest = typeof node.dest === 'string' ? await doc.getDestination(node.dest) : node.dest;
      if (!dest?.length) return;
      const ref = dest[0];
      const index =
        typeof ref === 'number' ? ref : await doc.getPageIndex(ref as Parameters<typeof doc.getPageIndex>[0]);
      this.store.goToPage(index + 1, true);
    } catch {
      /* destino inválido */
    }
  }
}
