import { Component, computed, signal, viewChild } from '@angular/core';
import {
  AnnotationChangeEvent,
  NgPdfAnnotatorComponent,
  PdfAnnotation,
  PdfAnnotatorTheme,
  PdfAnnotatorTranslationsOverride,
  PdfUser,
  WatermarkConfig,
  WatermarkMode,
} from 'ng-pdf-annotator';

/**
 * "Base de datos" simulada con localStorage.
 * En tu proyecto real esto sería un servicio que llama a tu API (POST/PUT/DELETE por anotación).
 */
class FakeDb {
  private key(docId: string) {
    return `npa-demo:${docId}`;
  }
  load(docId: string): PdfAnnotation[] {
    try {
      return JSON.parse(localStorage.getItem(this.key(docId)) ?? '[]');
    } catch {
      return [];
    }
  }
  apply(docId: string, e: AnnotationChangeEvent): void {
    const list = this.load(docId).filter((a) => a.id !== e.annotation.id);
    if (e.action !== 'delete') list.push(e.annotation);
    localStorage.setItem(this.key(docId), JSON.stringify(list));
  }
  clear(docId: string): void {
    localStorage.removeItem(this.key(docId));
  }
}

const FRENCH: PdfAnnotatorTranslationsOverride = {
  toolbar: { search: 'Rechercher', comments: 'Commentaires', view: 'Voir', annotate: 'Annoter', zoomIn: 'Zoom avant', zoomOut: 'Zoom arrière' },
  comments: { title: 'Commentaires', reply: 'Répondre', replyPlaceholder: 'Écrire une réponse…', page: 'Page {page}' },
  status: { accepted: 'Accepté', rejected: 'Rejeté', cancelled: 'Annulé', completed: 'Terminé', none: 'Aucun', marked: 'Marqué', unmarked: 'Non marqué' },
};

@Component({
  selector: 'app-root',
  imports: [NgPdfAnnotatorComponent],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  private readonly db = new FakeDb();
  private readonly viewer = viewChild(NgPdfAnnotatorComponent);

  readonly users: PdfUser[] = [
    { id: 'u-ana', name: 'Ana Pérez' },
    { id: 'u-carlos', name: 'Carlos Gómez' },
    { id: 'u-lucia', name: 'Lucía Rodríguez' },
  ];

  readonly documentId = signal('propuesta-001');
  readonly src = signal<string | Blob>('sample.pdf');
  readonly user = signal<PdfUser>(this.users[0]);
  readonly language = signal('es');
  readonly theme = signal<PdfAnnotatorTheme>('light');
  readonly watermarkMode = signal<WatermarkMode | 'none'>('tiled');
  readonly watermarkText = signal('CONFIDENCIAL · {{userName}} · {{date}}');
  readonly deleteOwnOnly = signal(true);
  readonly readOnly = signal(false);
  readonly blockCopy = signal(false);
  readonly showJson = signal(false);
  readonly lastEvent = signal<string>('');
  readonly annotations = signal<PdfAnnotation[]>(this.db.load('propuesta-001'));
  readonly translations = { fr: FRENCH };

  readonly watermark = computed<WatermarkConfig | null>(() => {
    const mode = this.watermarkMode();
    return mode === 'none' ? null : { text: this.watermarkText(), mode };
  });
  readonly permissions = computed(() => ({ deleteOwnOnly: this.deleteOwnOnly(), editOwnOnly: this.deleteOwnOnly() }));
  readonly security = computed(() => ({ disableCopy: this.blockCopy() }));
  readonly json = signal('');

  onChange(e: AnnotationChangeEvent): void {
    // Aquí guardarías en tu BD. Cada evento trae la anotación completa, lista para un UPSERT/DELETE.
    this.db.apply(this.documentId(), e);
    this.lastEvent.set(`${e.action} · ${e.annotation.type} · p.${e.annotation.page} · ${e.user.name}`);
    if (this.showJson()) this.refreshJson();
  }

  setUser(id: string): void {
    this.user.set(this.users.find((u) => u.id === id) ?? this.users[0]);
  }

  refreshJson(): void {
    this.json.set(this.viewer()?.exportAnnotationsJson(true) ?? '');
  }

  toggleJson(): void {
    this.showJson.update((v) => !v);
    if (this.showJson()) this.refreshJson();
  }

  downloadJson(): void {
    const blob = new Blob([this.viewer()?.exportAnnotationsJson(true) ?? '[]'], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${this.documentId()}-anotaciones.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async importJson(ev: Event): Promise<void> {
    const file = (ev.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const list = this.viewer()?.importAnnotations(await file.text()) ?? [];
    for (const a of list) this.db.apply(this.documentId(), { action: 'add', annotation: a, user: a.author });
    (ev.target as HTMLInputElement).value = '';
  }

  openPdf(ev: Event): void {
    const file = (ev.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const id = file.name;
    this.documentId.set(id);
    this.annotations.set(this.db.load(id));
    this.src.set(file);
  }

  reset(): void {
    this.db.clear(this.documentId());
    this.viewer()?.clearAnnotations();
    this.refreshJson();
  }
}
