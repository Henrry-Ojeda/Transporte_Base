import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const assetsDir = path.join(distDir, 'assets');
const swSourcePath = path.join(rootDir, 'public/sw.js');
const swDistPath = path.join(distDir, 'sw.js');
const versionFilePath = path.join(rootDir, 'src/config/version.ts');

// 1. Obtener la versión actual
let version = 'v2.3.1';
try {
  const versionContent = fs.readFileSync(versionFilePath, 'utf-8');
  const match = versionContent.match(/tag:\s*'([^']+)'/);
  if (match) version = match[1];
} catch (e) {
  console.warn('No se pudo leer version.ts, usando fallback:', version);
}

// 2. Obtener la lista real de assets compilados en dist/assets
let assetFiles = [];
if (fs.existsSync(assetsDir)) {
  const files = fs.readdirSync(assetsDir);
  assetFiles = files
    .filter((f) => !f.endsWith('.map'))
    .map((f) => `/assets/${f}`);
}

console.log(`[SW-Inject] Encontrados ${assetFiles.length} assets en dist/assets.`);

// 3. Lista completa de activos a pre-cachear en offline
const staticAssets = [
  '/',
  '/app',
  '/movil',
  '/login',
  '/index.html',
  '/manifest.json',
  '/favicon.svg',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css',
  ...assetFiles,
];

// 4. Leer sw.js y reemplazar CACHE_NAME y STATIC_ASSETS
let swContent = fs.readFileSync(swSourcePath, 'utf-8');

swContent = swContent.replace(
  /const CACHE_NAME = '[^']+';/,
  `const CACHE_NAME = 'rutas-movil-${version}';`
);

const assetsArrayString = JSON.stringify(staticAssets, null, 2);
swContent = swContent.replace(
  /const STATIC_ASSETS = \[[^\]]*\];/s,
  `const STATIC_ASSETS = ${assetsArrayString};`
);

// 5. Guardar en dist/sw.js y en public/sw.js
fs.writeFileSync(swDistPath, swContent, 'utf-8');
fs.writeFileSync(swSourcePath, swContent, 'utf-8');

// 6. Si existe Backend/src/Transporte.API/wwwroot, copiar allí también
const backendWwwrootSw = path.resolve(rootDir, '../Backend/src/Transporte.API/wwwroot/sw.js');
if (fs.existsSync(path.dirname(backendWwwrootSw))) {
  fs.writeFileSync(backendWwwrootSw, swContent, 'utf-8');
}

console.log(`[SW-Inject] ¡sw.js actualizado exitosamente con ${staticAssets.length} activos para offline en ${version}!`);
