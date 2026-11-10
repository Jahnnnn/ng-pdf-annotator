# Cómo contribuir

¡Gracias por tu interés! 

1. Haz un fork y crea una rama: `git checkout -b feat/mi-mejora`.
2. `npm install` y `npm start` para abrir la demo.
3. Añade o actualiza pruebas en `projects/ng-pdf-annotator/src/**/*.spec.ts` y ejecuta `npm test`.
4. Formatea con Prettier (`npx prettier --write .`).
5. Usa mensajes de commit tipo [Conventional Commits](https://www.conventionalcommits.org/es/) (`feat:`, `fix:`, `docs:`…).
6. Abre un pull request describiendo el cambio y, si afecta a la interfaz, adjunta una captura.

Si cambias el formato JSON de las anotaciones, sube `schemaVersion` y documenta la migración en `docs/JSON-Y-BASE-DE-DATOS.md`.
