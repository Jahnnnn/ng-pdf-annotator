import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, signal } from '@angular/core';
import { ActiveTool, PdfAnnotatorStore } from '../../core/pdf-annotator.store';
import { AnnotationType, INK_TYPES, TEXT_MARKUP_TYPES, ToolStyle } from '../../models/annotation.model';
import { NpaIconComponent } from '../icon.component';

/** Segunda barra (modo "Anotar"): herramientas, paleta de colores y pincel. */
@Component({
  selector: 'npa-annotate-bar',
  imports: [NpaIconComponent],
  templateUrl: './annotate-bar.component.html',
  styleUrl: './annotate-bar.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'npa-annotate-bar',
    role: 'toolbar',
    '(document:click)': 'onDocClick($event)',
  },
})
export class NpaAnnotateBarComponent {
  protected readonly store = inject(PdfAnnotatorStore);
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly tools: ActiveTool[] = [
    'select',
    'highlight',
    'underline',
    'strikeout',
    'squiggly',
    'freehand',
    'freehandHighlight',
    'note',
  ];

  protected readonly brushOpen = signal(false);
  protected readonly brushPos = signal({ top: 0, left: 0 });

  protected readonly styledTool = computed<AnnotationType | null>(() => {
    const t = this.store.activeTool();
    return t === 'select' ? null : t;
  });
  protected readonly style = computed<ToolStyle | null>(() => {
    const t = this.styledTool();
    return t ? this.store.toolStyles()[t] : null;
  });
  protected readonly isInk = computed(() => (INK_TYPES as readonly string[]).includes(this.store.activeTool()));
  protected readonly hint = computed(() => {
    const t = this.store.t().tools;
    const tool = this.store.activeTool();
    if ((TEXT_MARKUP_TYPES as readonly string[]).includes(tool)) return t.textHint;
    if (this.isInk()) return t.inkHint;
    if (tool === 'note') return t.noteHint;
    return '';
  });
  protected readonly maxWidth = computed(() => (this.store.activeTool() === 'freehandHighlight' ? 40 : 20));

  protected label(tool: ActiveTool): string {
    const t = this.store.t().tools;
    return t[tool];
  }

  protected icon(tool: ActiveTool): string {
    return tool;
  }

  protected pick(tool: ActiveTool): void {
    this.store.activeTool.set(tool);
    this.store.select(null);
    globalThis.getSelection?.()?.removeAllRanges();
  }

  protected setStyle(patch: Partial<ToolStyle>): void {
    const tool = this.styledTool();
    if (!tool) return;
    this.store.toolStyles.update((s) => ({ ...s, [tool]: { ...s[tool], ...patch } }));
    // Si hay una anotación propia seleccionada del mismo tipo, también se actualiza.
    const sel = this.store.selected();
    if (sel && sel.type === tool && (patch.color || patch.opacity !== undefined)) {
      this.store.updateStyle(sel.id, {
        ...(patch.color ? { color: patch.color } : {}),
        ...(patch.opacity !== undefined ? { opacity: patch.opacity } : {}),
      });
    }
  }

  protected toggleBrush(ev: MouseEvent): void {
    const r = (ev.currentTarget as HTMLElement).getBoundingClientRect();
    const left = Math.max(8, Math.min(r.left, globalThis.innerWidth - 266));
    this.brushPos.set({ top: r.bottom + 6, left });
    this.brushOpen.update((v) => !v);
  }

  protected onDocClick(ev: MouseEvent): void {
    if (this.brushOpen() && !this.el.nativeElement.querySelector('.npa-brush')?.contains(ev.target as Node))
      this.brushOpen.set(false);
  }
}
