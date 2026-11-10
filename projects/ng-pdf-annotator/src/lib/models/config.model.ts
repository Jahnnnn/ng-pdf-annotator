import { AnnotationReply, PdfAnnotation, PdfUser, ToolStyle, AnnotationType } from './annotation.model';
import { PdfAnnotatorTranslations } from '../i18n/translations';

/** Idiomas incluidos. Puedes registrar cualquier otro con `translations`. */
export type PdfAnnotatorLanguage = 'es' | 'en' | 'pt' | (string & {});

/** Tema visual. `auto` sigue la preferencia del sistema operativo. */
export type PdfAnnotatorTheme = 'light' | 'dark' | 'auto';

/** Modo del visor. */
export type PdfViewerMode = 'view' | 'annotate';

/** Fuente del PDF. */
export type PdfSource = string | URL | Uint8Array | ArrayBuffer | Blob;

/**
 * Disposición de la marca de agua:
 * - `horizontal`: un texto centrado en horizontal en cada página.
 * - `vertical`: un texto centrado girado 90° (de abajo hacia arriba).
 * - `diagonal`: un texto centrado en diagonal.
 * - `tiled`: el texto repetido en mosaico por toda la página (ángulo configurable, 0 = horizontal).
 */
export type WatermarkMode = 'horizontal' | 'vertical' | 'diagonal' | 'tiled';

export interface WatermarkConfig {
  /**
   * Texto. Admite variables: `{{userName}}`, `{{userId}}`, `{{date}}`, `{{dateTime}}`, `{{page}}`, `{{totalPages}}`.
   * Usa `\n` para varias líneas.
   */
  text: string;
  mode?: WatermarkMode;
  /** Color CSS. Por defecto `#d32f2f`. */
  color?: string;
  /** Opacidad 0-1. Por defecto 0.18. */
  opacity?: number;
  /** Tamaño de fuente en puntos PDF (escala con el zoom). Por defecto 48 (single) / 22 (tiled). */
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: 'normal' | 'bold' | number;
  /** Ángulo en grados. Solo `tiled` o para sobrescribir el del modo. */
  angle?: number;
  /** Separación entre repeticiones en modo `tiled` (puntos PDF). Por defecto 90. */
  gap?: number;
  /** Páginas en las que se aplica (1-based). Por defecto todas. */
  pages?: number[];
}

/** Permisos. Por defecto cada usuario solo puede eliminar/editar lo que creó. */
export interface PdfAnnotatorPermissions {
  /** Puede crear anotaciones. Por defecto `true`. */
  canAnnotate?: boolean;
  /** Puede responder comentarios. Por defecto `true`. */
  canReply?: boolean;
  /** Puede cambiar el estado de las anotaciones. Por defecto `true`. */
  canChangeStatus?: boolean;
  /** Solo el autor puede eliminar sus anotaciones/respuestas. Por defecto `true`. */
  deleteOwnOnly?: boolean;
  /** Solo el autor puede editar el texto de sus anotaciones/respuestas. Por defecto `true`. */
  editOwnOnly?: boolean;
  /** Control total: si se define, decide si `user` puede eliminar `item` (ignora `deleteOwnOnly`). */
  canDelete?: (item: PdfAnnotation | AnnotationReply, user: PdfUser | null) => boolean;
  /** Control total: si se define, decide si `user` puede editar `item` (ignora `editOwnOnly`). */
  canEdit?: (item: PdfAnnotation | AnnotationReply, user: PdfUser | null) => boolean;
}

/** Medidas de protección del documento (disuasorias: ver la documentación). */
export interface PdfSecurityConfig {
  /** Bloquea Ctrl/Cmd+S. Por defecto `true`. No existe botón de descarga. */
  disableDownload?: boolean;
  /** Bloquea Ctrl/Cmd+P y oculta el visor al imprimir. Por defecto `true`. */
  disablePrint?: boolean;
  /** Bloquea el clic derecho dentro del visor. Por defecto `true`. */
  disableContextMenu?: boolean;
  /** Bloquea copiar texto (Ctrl+C) del documento. Por defecto `false`. */
  disableCopy?: boolean;
  /** Impide arrastrar las imágenes de las páginas. Por defecto `true`. */
  disableDrag?: boolean;
}

/** Botones visibles de la barra superior. */
export interface PdfToolbarConfig {
  leftPanel?: boolean;
  zoom?: boolean;
  search?: boolean;
  comments?: boolean;
  modeSwitch?: boolean;
  pageNavigation?: boolean;
  themeToggle?: boolean;
  languageSelector?: boolean;
}

/** Configuración global (se puede dar con `provideNgPdfAnnotator`). */
export interface PdfAnnotatorConfig {
  /** URL del worker de pdf.js. Por defecto el CDN de jsDelivr de la versión instalada. */
  workerSrc?: string;
  /** URL de los cmaps de pdf.js (para PDFs con fuentes CJK). */
  cMapUrl?: string;
  language?: PdfAnnotatorLanguage;
  translations?: Record<string, PdfAnnotatorTranslationsOverride>;
  theme?: PdfAnnotatorTheme;
  permissions?: PdfAnnotatorPermissions;
  security?: PdfSecurityConfig;
  toolbar?: PdfToolbarConfig;
  /** Colores de la paleta. */
  palette?: string[];
  /** Estilo inicial de cada herramienta. */
  toolStyles?: Partial<Record<AnnotationType, Partial<ToolStyle>>>;
  /** Opciones del selector de zoom (1 = 100 %). */
  zoomLevels?: number[];
  minZoom?: number;
  maxZoom?: number;
  /** Formato de fecha (Intl.DateTimeFormatOptions). */
  dateFormat?: Intl.DateTimeFormatOptions;
}

/** Sobrescritura parcial (profunda) de textos. */
export type PdfAnnotatorTranslationsOverride = DeepPartial<PdfAnnotatorTranslations>;

export type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

/** Información del documento cargado. */
export interface PdfDocumentInfo {
  numPages: number;
  title?: string;
  fingerprint: string;
}

/** Zoom especial. */
export type ZoomMode = 'fit-width' | 'fit-page';
