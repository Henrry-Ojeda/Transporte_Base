import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const versionFilePath = path.join(__dirname, '../src/config/version.ts');
const arg = (process.argv[2] || 'diseno').toLowerCase();

let tipo = 'DISEÑO';
if (arg.includes('logica') || arg.includes('logic')) {
  tipo = 'DISEÑO_LOGICA';
} else if (arg.includes('estructura') || arg.includes('major') || arg.includes('struct')) {
  tipo = 'ESTRUCTURA';
} else {
  tipo = 'DISEÑO';
}

const content = fs.readFileSync(versionFilePath, 'utf-8');

const matchMajor = content.match(/major:\s*(\d+)/);
const matchMinor = content.match(/minor:\s*(\d+)/);
const matchPatch = content.match(/patch:\s*(\d+)/);

let major = matchMajor ? parseInt(matchMajor[1], 10) : 2;
let minor = matchMinor ? parseInt(matchMinor[1], 10) : 2;
let patch = matchPatch ? parseInt(matchPatch[1], 10) : 1;

if (tipo === 'DISEÑO') {
  patch += 1;
} else if (tipo === 'DISEÑO_LOGICA') {
  minor += 1;
  patch = 1;
} else if (tipo === 'ESTRUCTURA') {
  major += 1;
  minor = 1;
  patch = 1;
}

const newTag = `v${major}.${minor}.${patch}`;
const today = new Date().toISOString().split('T')[0];

let updated = content.replace(/major:\s*\d+/, `major: ${major}`);
updated = updated.replace(/minor:\s*\d+/, `minor: ${minor}`);
updated = updated.replace(/patch:\s*\d+/, `patch: ${patch}`);
updated = updated.replace(/tag:\s*'[^']+'/, `tag: '${newTag}'`);
updated = updated.replace(/ultimaActualizacion:\s*'[^']+'/, `ultimaActualizacion: '${today}'`);
updated = updated.replace(/tipoUltimoCambio:\s*'[^']+'/, `tipoUltimoCambio: '${tipo}'`);

fs.writeFileSync(versionFilePath, updated, 'utf-8');

console.log(`Versión actualizada exitosamente a ${newTag} (${tipo})`);

