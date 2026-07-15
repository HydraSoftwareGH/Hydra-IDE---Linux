// Genera build/icon.ico (multi-tamaño) a partir de build/icon.png usando
// nativeImage de Electron (sin dependencias externas). Ensambla un .ico con
// imágenes PNG embebidas (soportado por Windows Vista+).
const { app, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SIZES = [256, 128, 64, 48, 32, 16];

function buildIco(images) {
  const count = images.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);      // reservado
  header.writeUInt16LE(1, 2);      // tipo: 1 = icono
  header.writeUInt16LE(count, 4);  // cantidad de imágenes
  const dir = Buffer.alloc(16 * count);
  let offset = 6 + 16 * count;
  const blobs = [];
  images.forEach((img, i) => {
    const e = 16 * i;
    dir.writeUInt8(img.size >= 256 ? 0 : img.size, e + 0); // ancho (0 = 256)
    dir.writeUInt8(img.size >= 256 ? 0 : img.size, e + 1); // alto  (0 = 256)
    dir.writeUInt8(0, e + 2);             // paleta
    dir.writeUInt8(0, e + 3);             // reservado
    dir.writeUInt16LE(1, e + 4);          // planos
    dir.writeUInt16LE(32, e + 6);         // bits por pixel
    dir.writeUInt32LE(img.buf.length, e + 8);  // tamaño de la imagen
    dir.writeUInt32LE(offset, e + 12);    // offset
    offset += img.buf.length;
    blobs.push(img.buf);
  });
  return Buffer.concat([header, dir, ...blobs]);
}

app.whenReady().then(() => {
  const src = nativeImage.createFromPath(path.join(ROOT, 'build', 'icon.png'));
  if (src.isEmpty()) { console.error('[ico] no se pudo leer build/icon.png'); app.exit(1); return; }
  const images = SIZES.map((s) => ({ size: s, buf: src.resize({ width: s, height: s, quality: 'best' }).toPNG() }));
  const ico = buildIco(images);
  const out = path.join(ROOT, 'build', 'icon.ico');
  fs.writeFileSync(out, ico);
  console.log('[ico] escrito', out, ico.length, 'bytes,', SIZES.length, 'tamaños');
  app.quit();
}).catch((e) => { console.error('[ico] error', e); app.exit(1); });
