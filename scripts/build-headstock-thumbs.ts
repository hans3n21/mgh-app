// Erzeugt verkleinerte Headstock-Logo-Bilder fuer PDF und Formular-Vorschau.
// Die Originale liegen in public/images/logos/headstocks/, die Thumbs landen in
// .../thumbs/. Nur noetig, wenn ein Logo-Foto ausgetauscht/ergaenzt wurde.
// Aufruf: npx tsx scripts/build-headstock-thumbs.ts
import { promises as fs } from 'fs';
import path from 'path';
import sharp from 'sharp';

const SRC_DIR = path.join(process.cwd(), 'public', 'images', 'logos', 'headstocks');
const OUT_DIR = path.join(SRC_DIR, 'thumbs');

// 420 px reichen fuer ~110 pt Breite im PDF (ca. 270 dpi) und die Web-Vorschau.
const WIDTH = 420;
const QUALITY = 72;

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const files = (await fs.readdir(SRC_DIR)).filter((f) => /\.(jpe?g|png)$/i.test(f));

  if (files.length === 0) {
    console.log('Keine Bilder in', SRC_DIR);
    return;
  }

  for (const file of files) {
    const src = path.join(SRC_DIR, file);
    const out = path.join(OUT_DIR, file.replace(/\.png$/i, '.jpg'));
    // JPG erzwingen: das PDF bettet nur JPG ein (kleiner als PNG).
    await sharp(src)
      .resize({ width: WIDTH, withoutEnlargement: true })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: QUALITY, mozjpeg: true })
      .toFile(out);

    const [before, after] = await Promise.all([fs.stat(src), fs.stat(out)]);
    console.log(
      `${file}: ${Math.round(before.size / 1024)} kB -> ${Math.round(after.size / 1024)} kB`,
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
