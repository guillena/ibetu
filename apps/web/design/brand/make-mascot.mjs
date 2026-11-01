// Quita el fondo negro conectado a los bordes del JPG de la mascota y genera los PNG.
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";

const [, , src, outDir] = process.argv;
const BG = 45; // canal máximo por debajo del cual un pixel de borde es fondo
const FEATHER = 100; // rampa de suavizado en el contorno

const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: w, height: h } = info;
const idx = (x, y) => (y * w + x) * 4;
const isDark = (i) => Math.max(data[i], data[i + 1], data[i + 2]) < BG;

const bg = new Uint8Array(w * h);
const stack = [];
const push = (x, y) => {
  if (x < 0 || y < 0 || x >= w || y >= h) return;
  const p = y * w + x;
  if (bg[p] || !isDark(p * 4)) return;
  bg[p] = 1;
  stack.push(p);
};
for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
while (stack.length) {
  const p = stack.pop();
  const x = p % w, y = (p / w) | 0;
  push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1);
}

for (let y = 0; y < h; y++) {
  for (let x = 0; x < w; x++) {
    const p = y * w + x, i = p * 4;
    if (bg[p]) { data[i + 3] = 0; continue; }
    // Suaviza el contorno: pixel pegado al fondo y todavía oscuro.
    const near =
      (x > 0 && bg[p - 1]) || (x < w - 1 && bg[p + 1]) || (y > 0 && bg[p - w]) || (y < h - 1 && bg[p + w]);
    if (near) {
      const m = Math.max(data[i], data[i + 1], data[i + 2]);
      if (m < FEATHER) data[i + 3] = Math.round(Math.max(0, Math.min(255, ((m - BG) / (FEATHER - BG)) * 255)));
    }
  }
}

const full = sharp(data, { raw: { width: w, height: h, channels: 4 } });
const trimmed = await full.clone().trim({ threshold: 0 }).png().toBuffer({ resolveWithObject: true });
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "mascot.png"), trimmed.data);
console.log("mascot.png", trimmed.info.width + "x" + trimmed.info.height);

// Lienzo cuadrado con margen para los íconos.
async function square(size, file, background = { r: 0, g: 0, b: 0, alpha: 0 }, pad = 0.08) {
  const inner = Math.round(size * (1 - pad * 2));
  const img = await sharp(trimmed.data).resize(inner, inner, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background } })
    .composite([{ input: img, gravity: "center" }])
    .png()
    .toFile(file);
  console.log(path.basename(file), size);
}
const appDir = process.argv[4];
await square(512, path.join(appDir, "icon.png"));
await square(180, path.join(appDir, "apple-icon.png"), { r: 249, g: 249, b: 255, alpha: 1 }, 0.1);
for (const s of [16, 32, 48]) await square(s, path.join(outDir, `_ico-${s}.png`), undefined, 0.04);
