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

// 2. Obtener el grafo completo de assets core + móvil desde dist/.vite/manifest.json
//    (garantiza que TODOS los chunks compartidos que importa AppMovilPage queden pre-cacheados para modo offline)
let assetFiles = [];
const manifestPath = path.join(distDir, '.vite', 'manifest.json');
if (fs.existsSync(manifestPath)) {
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    const visited = new Set();
    const collected = new Set();

    const collectDeps = (key) => {
      if (!key || visited.has(key)) return;
      visited.add(key);
      const entry = manifest[key];
      if (!entry) return;
      if (entry.file) collected.add(`/${entry.file.replace(/^\/+/, '')}`);
      if (Array.isArray(entry.css)) {
        entry.css.forEach((c) => collected.add(`/${c.replace(/^\/+/, '')}`));
      }
      if (Array.isArray(entry.imports)) {
        entry.imports.forEach((imp) => collectDeps(imp));
      }
    };

    collectDeps('index.html');
    collectDeps('src/modules/movil/AppMovilPage.tsx');
    assetFiles = Array.from(collected);
  } catch (err) {
    console.warn('[SW-Inject] Error leyendo manifest.json, usando fallback de dist/assets:', err);
  }
}

if (assetFiles.length === 0 && fs.existsSync(assetsDir)) {
  const files = fs.readdirSync(assetsDir);
  assetFiles = files
    .filter((f) => {
      if (f.endsWith('.map')) return false;
      return !f.startsWith('vendor-excel-') && !f.startsWith('ReportesPage-') && !f.startsWith('LeafletMapPicker-');
    })
    .map((f) => `/assets/${f}`);
}

console.log(`[SW-Inject] Encontrados ${assetFiles.length} assets core+móvil en grafo de dependencias.`);

// 3. Lista completa de activos a pre-cachear en offline (locales primero, CDN al final)
const staticAssets = [
  '/',
  '/app',
  '/movil',
  '/login',
  '/index.html',
  '/manifest.json',
  '/favicon.svg',
  ...assetFiles,
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css',
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

