import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const distIndex = resolve(root, 'dist/index.html');
const sourceIcon = resolve(root, 'assets/2849824-basket-buy-market-multimedia-shop-shopping-store_107977.png');
const publicIcon = resolve(root, 'dist/favicon-basket.png');

if (!existsSync(distIndex) || !existsSync(sourceIcon)) {
  throw new Error('No se encontró la exportación web o el icono basket.');
}

copyFileSync(sourceIcon, publicIcon);
const html = readFileSync(distIndex, 'utf8');
const patched = html.replace(/(?:href|src)=["'](?:\/?favicon\.ico|favicon\.ico)["']/g, 'href="/favicon-basket.png?v=2"');

if (patched === html) {
  throw new Error('No se encontró la referencia al favicon en dist/index.html.');
}

writeFileSync(distIndex, patched);
