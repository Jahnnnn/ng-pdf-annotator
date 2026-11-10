import { EnvironmentProviders, InjectionToken, makeEnvironmentProviders } from '@angular/core';
import { PdfAnnotatorConfig } from './models/config.model';

/** Token con la configuración global del visor. */
export const NG_PDF_ANNOTATOR_CONFIG = new InjectionToken<PdfAnnotatorConfig>('NG_PDF_ANNOTATOR_CONFIG');

/**
 * Configuración global opcional. Los inputs del componente tienen prioridad sobre estos valores.
 *
 * ```ts
 * bootstrapApplication(App, {
 *   providers: [provideNgPdfAnnotator({ workerSrc: '/assets/pdfjs/pdf.worker.min.mjs', theme: 'auto' })],
 * });
 * ```
 */
export function provideNgPdfAnnotator(config: PdfAnnotatorConfig): EnvironmentProviders {
  return makeEnvironmentProviders([{ provide: NG_PDF_ANNOTATOR_CONFIG, useValue: config }]);
}
