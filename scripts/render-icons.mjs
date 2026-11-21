import { readFileSync, writeFileSync } from 'node:fs';
import { Resvg } from '@resvg/resvg-js';

const svg = readFileSync(new URL('../public/icons/icon.svg', import.meta.url));
const inner = svg
  .toString()
  .replace(/<svg[^>]*>/, '')
  .replace(/<\/svg>\s*$/, '')
  .replace(/<rect width="512" height="512"[^>]*\/>/, '');
const maskSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="#FFE7C2"/><g transform="translate(77 77) scale(0.7)">${inner}</g></svg>`;

function png(source, size) {
  const resvg = new Resvg(source, { fitTo: { mode: 'width', value: size } });
  return resvg.render().asPng();
}

const full = svg;
writeFileSync(new URL('../public/icons/icon-512.png', import.meta.url), png(full, 512));
writeFileSync(new URL('../public/icons/icon-192.png', import.meta.url), png(full, 192));
writeFileSync(new URL('../public/icons/apple-touch-icon.png', import.meta.url), png(full, 180));
writeFileSync(new URL('../public/icons/icon-maskable-512.png', import.meta.url), png(maskSvg, 512));
writeFileSync(new URL('../public/favicon.svg', import.meta.url), svg);
