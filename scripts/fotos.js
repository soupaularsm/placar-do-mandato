// Baixa as fotos oficiais dos parlamentares de SP para public/data/fotos/,
// para o site não depender de imagens de outros domínios.
// Roda depois de build-data.js. Fotos já baixadas há menos de 30 dias são mantidas.
import fs from 'node:fs';
import path from 'node:path';
import { get, pool } from './lib/http.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const DATA = path.join(ROOT, 'public', 'data');
const PASTA = path.join(DATA, 'fotos');
fs.mkdirSync(PASTA, { recursive: true });

const latest = JSON.parse(fs.readFileSync(path.join(DATA, 'latest.json'), 'utf8'));
const ehImagem = (b) => b && b.length > 1500 && ((b[0] === 0xff && b[1] === 0xd8) || (b[0] === 0x89 && b[1] === 0x50) || b.subarray(0, 4).toString() === 'RIFF');

async function candidatas(p) {
  const det = JSON.parse(fs.readFileSync(path.join(DATA, 'p', `${p.id}.json`), 'utf8'));
  const urls = [];
  if (p.casa === 'alesp' && det.url_oficial) {
    // a página do deputado traz a foto oficial
    const html = await get(det.url_oficial, { as: 'text', ttlHoras: 24 * 30, opcional: true });
    for (const m of (html || '').matchAll(/<img[^>]+src=["']([^"']+)["']/gi)) {
      if (/foto|deputad/i.test(m[1]) && !/logo|icone|icon|brasao|banner/i.test(m[1])) {
        urls.push(new URL(m[1], 'https://www.al.sp.gov.br/').href);
      }
    }
  }
  if (det.foto) urls.push(det.foto.replace(/^http:/, 'https:'));
  return [...new Set(urls)];
}

let ok = 0, falhas = [];
await pool(latest.parlamentares, 4, async (p) => {
  const destino = path.join(PASTA, `${p.id}.jpg`);
  if (fs.existsSync(destino) && (Date.now() - fs.statSync(destino).mtimeMs) / 864e5 < 30) {
    p.foto = `data/fotos/${p.id}.jpg`;
    ok++;
    return;
  }
  for (const url of await candidatas(p)) {
    const buf = await get(url, { as: 'buffer', ttlHoras: 24 * 30, opcional: true, tentativas: 2 });
    if (ehImagem(buf)) {
      fs.writeFileSync(destino, buf);
      p.foto = `data/fotos/${p.id}.jpg`;
      ok++;
      return;
    }
  }
  p.foto = null;
  falhas.push(p.nome);
});

fs.writeFileSync(path.join(DATA, 'latest.json'), JSON.stringify(latest));
console.log(`Fotos: ${ok} ok, ${falhas.length} sem foto${falhas.length ? ` (${falhas.slice(0, 10).join(', ')}${falhas.length > 10 ? '…' : ''})` : ''}`);
