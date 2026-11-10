/*
 * API pública de ng-pdf-annotator
 */

// Componente principal
export { NgPdfAnnotatorComponent } from './lib/components/pdf-annotator/pdf-annotator.component';
export type { SecurityBlockedAction } from './lib/components/pdf-annotator/pdf-annotator.component';

// Configuración global
export { provideNgPdfAnnotator, NG_PDF_ANNOTATOR_CONFIG } from './lib/provide';

// Modelos
export * from './lib/models/annotation.model';
export * from './lib/models/config.model';

// Idiomas
export {
  ES,
  EN,
  PT,
  BUILT_IN_TRANSLATIONS,
  LANGUAGE_NAMES,
  mergeTranslations,
} from './lib/i18n/translations';
export type { PdfAnnotatorTranslations } from './lib/i18n/translations';

// Utilidades de JSON (útiles también en el backend o en servicios)
export {
  serializeAnnotations,
  annotationsToJson,
  parseAnnotations,
  normalizeAnnotation,
} from './lib/core/serializer';

export { DEFAULT_PALETTE, DEFAULT_TOOL_STYLES, DEFAULT_ZOOM_LEVELS } from './lib/core/pdf-annotator.store';
