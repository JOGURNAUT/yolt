/**
 * One-off: draws the installable-app icons into public/icons/. The generated PNGs are committed;
 * run this again only if the mark changes: node apps/web/scripts/generate-icons.mjs
 *
 * The mark is the plain YOLT wordmark in cream on ink, with a lilac underline (the accent).
 * Letters are drawn as strokes, not text, so the result doesn't depend on installed fonts.
 * sharp comes from @yolt/api.
 */
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const sharp = createRequire(resolve(here, "../../../packages/api/package.json"))("sharp");
const out = resolve(here, "../public/icons");
mkdirSync(out, { recursive: true });

const INK = "#0d0d0c";
const CREAM = "#fafaf7";
const LILAC = "#c8b6ff";

// Four 70x100 cells, 12 apart, stroke 20. Total 316 wide; the lilac bar sits 22 below.
const LETTERS = [
  `<path d="M8 0 L35 54 M62 0 L35 54 M35 54 V100"/>`,
  `<rect x="10" y="10" width="50" height="80" rx="25"/>`,
  `<path d="M10 0 V90 H70"/>`,
  `<path d="M0 10 H70 M35 10 V100"/>`,
];

function svg(size, { rounded }) {
  const markW = 316;
  const markH = 100 + 22 + 12;
  const scale = (size * 0.66) / markW;
  const x = (size - markW * scale) / 2;
  const y = (size - markH * scale) / 2;
  const letters = LETTERS.map((l, i) => `<g transform="translate(${i * 82} 0)">${l}</g>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${rounded ? size * 0.22 : 0}" fill="${INK}"/>
  <g transform="translate(${x} ${y}) scale(${scale})">
    <g fill="none" stroke="${CREAM}" stroke-width="20" stroke-linejoin="miter">${letters}</g>
    <rect x="0" y="122" width="${markW}" height="12" rx="6" fill="${LILAC}"/>
  </g>
</svg>`;
}

const files = [
  ["icon-192.png", 192, true],
  ["icon-512.png", 512, true],
  // Maskable and Apple icons are full-bleed: the OS applies its own mask or corner radius.
  ["icon-maskable-512.png", 512, false],
  ["apple-touch-icon.png", 180, false],
];
for (const [name, size, rounded] of files) {
  const png = await sharp(Buffer.from(svg(size, { rounded }))).png().toBuffer();
  writeFileSync(resolve(out, name), png);
  console.log(name, size, png.length);
}
