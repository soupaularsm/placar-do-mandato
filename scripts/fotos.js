// Baixa as fotos oficiais dos parlamentares de SP para public/data/fotos/,
// para o site não depender de imagens de outros domínios.
// Roda depois de build-data.js. Fotos já baixadas há menos de 30 dias são mantidas.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { get, pool } from './lib/http.js';

// Retrato quadrado de 320 px, leve o bastante para listas no celular
const reduzir = (buf) => sharp(buf).rotate().resize(320, 320, { fit: 'cover', position: 'attention' }).jpeg({ quality: 78, mozjpeg: true }).toBuffer();

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const DATA = path.join(ROOT, 'public', 'data');
const PASTA = path.join(DATA, 'fotos');
fs.mkdirSync(PASTA, { recursive: true });

const latest = JSON.parse(fs.readFileSync(path.join(DATA, 'latest.json'), 'utf8'));
const ehImagem = (b) => b && b.length > 1500 && ((b[0] === 0xff && b[1] === 0xd8) || (b[0] === 0x89 && b[1] === 0x50) || b.subarray(0, 4).toString() === 'RIFF');

async function candidatas(p) {
  const det = JSON.parse(fs.readFileSync(path.join(DATA, 'p', `${p.id}.json`), 'utf8'));
  const urls = [];
  if (p.casa === 'alesp') {
    // a página pública da ALESP busca a foto nesta API, pela matrícula
    const mat = /matricula=(\d+)/.exec(det.url_oficial || '')?.[1];
    if (mat) {
      const r = await get(`https://legis-api-portal-prd.al.sp.gov.br/parlamentar-portal/detalhes/${mat}`, { ttlHoras: 24 * 30, opcional: true });
      const tx = r?.biografia?.txFotoGrande;
      if (tx) urls.push('https://www3.al.sp.gov.br/legis/' + tx.replace(/^\//, ''));
    }
  }
  if (det.foto) urls.push(det.foto.replace(/^http:/, 'https:'));
  return [...new Set(urls)];
}

let ok = 0, falhas = [];
await pool(latest.parlamentares, 4, async (p) => {
  const destino = path.join(PASTA, `${p.id}.jpg`);
  if (fs.existsSync(destino) && fs.statSync(destino).size > 250_000) {
    // foto antiga, salva no tamanho original: reduz e segue
    fs.writeFileSync(destino, await reduzir(fs.readFileSync(destino)));
  }
  if (fs.existsSync(destino) && (Date.now() - fs.statSync(destino).mtimeMs) / 864e5 < 30) {
    p.foto = `data/fotos/${p.id}.jpg`;
    ok++;
    return;
  }
  for (const url of await candidatas(p)) {
    const buf = await get(url, { as: 'buffer', ttlHoras: 24 * 30, opcional: true, tentativas: 2 });
    if (ehImagem(buf)) {
      fs.writeFileSync(destino, await reduzir(buf));
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
