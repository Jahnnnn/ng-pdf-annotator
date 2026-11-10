// Copia README, LICENSE y CHANGELOG de la raíz a la librería para que se incluyan en el paquete npm.
import { copyFileSync, mkdirSync, cpSync } from 'node:fs';

const lib = 'projects/ng-pdf-annotator';
for (const f of ['README.md', 'LICENSE', 'CHANGELOG.md']) copyFileSync(f, `${lib}/${f}`);
mkdirSync(`${lib}/docs`, { recursive: true });
cpSync('docs', `${lib}/docs`, { recursive: true });
console.log('Documentación copiada a la librería');
