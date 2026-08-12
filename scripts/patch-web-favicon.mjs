import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const distIndex = resolve(root, 'dist/index.html');
const sourceIcon = resolve(root, 'assets/2849824-basket-buy-market-multimedia-shop-shopping-store_107977.png');
const publicIcon = resolve(root, 'dist/favicon-basket.svg');

if (!existsSync(distIndex) || !existsSync(sourceIcon)) {
  throw new Error('No se encontró la exportación web o el icono basket.');
}

const iconBase64 = readFileSync(sourceIcon).toString('base64');
const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><circle cx="256" cy="256" r="248" fill="#fff"/><image href="data:image/png;base64,${iconBase64}" x="24" y="24" width="464" height="464" preserveAspectRatio="xMidYMid meet"/></svg>`;
writeFileSync(publicIcon, faviconSvg);

const html = readFileSync(distIndex, 'utf8');
const patched = html.replace(/(?:href|src)=["'](?:\/?favicon\.ico|favicon\.ico)["']/g, 'href="/favicon-basket.svg?v=3"');

if (patched === html) {
  throw new Error('No se encontró la referencia al favicon en dist/index.html.');
}

writeFileSync(distIndex, patched);
