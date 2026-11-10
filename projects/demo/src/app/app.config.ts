import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideNgPdfAnnotator } from 'ng-pdf-annotator';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // Worker de pdf.js servido desde la propia app (ver "assets" en angular.json).
    provideNgPdfAnnotator({ workerSrc: 'assets/pdfjs/pdf.worker.min.mjs' }),
  ],
};
