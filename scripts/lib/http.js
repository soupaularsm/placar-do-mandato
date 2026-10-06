// Cliente HTTP com retry, limite de concorrência e cache em disco.
// O cache "imutável" guarda respostas que não mudam (ex.: detalhe de processo
// já encerrado) e fica persistido entre execuções pelo GitHub Actions.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const CACHE_DIR = process.env.CACHE_DIR || path.resolve('.cache');
const UA = 'PlacarDoMandato/0.1 (+transparencia civica; contato no README)';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function cachePath(url, ext) {
  const h = crypto.createHash('sha1').update(url).digest('hex');
  return path.join(CACHE_DIR, h.slice(0, 2), h + ext);
}

/**
 * Busca uma URL.
 * @param {string} url
 * @param {object} opts
 *   as: 'json' | 'text' | 'buffer'
 *   headers: cabeçalhos extras
 *   ttlHoras: reaproveita cache por N horas (0 = sem cache; Infinity = imutável)
 *   tentativas: nº de tentativas (padrão 4)
 *   opcional: se true, retorna null em 404 em vez de lançar erro
 */
export async function get(url, opts = {}) {
  const { as = 'json', headers = {}, ttlHoras = 20, tentativas = 4, opcional = false } = opts;
  const ext = as === 'buffer' ? '.bin' : as === 'json' ? '.json' : '.txt';
  const cp = cachePath(url, ext);

  if (ttlHoras > 0 && fs.existsSync(cp)) {
    const idadeH = (Date.now() - fs.statSync(cp).mtimeMs) / 36e5;
    if (idadeH < ttlHoras) {
      const raw = fs.readFileSync(cp);
      return as === 'buffer' ? raw : as === 'json' ? JSON.parse(raw.toString('utf8')) : raw.toString('utf8');
    }
  }

  let ultimoErro;
  for (let i = 0; i < tentativas; i++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': UA, Accept: as === 'json' ? 'application/json' : '*/*', ...headers },
        signal: AbortSignal.timeout(120_000),
      });
      if (res.status === 404 && opcional) return null;
      if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
      if (!res.ok) {
        const e = new Error(`HTTP ${res.status} em ${url}`);
        e.fatal = true;
        throw e;
      }
      const buf = Buffer.from(await res.arrayBuffer());
      if (ttlHoras > 0) {
        fs.mkdirSync(path.dirname(cp), { recursive: true });
        fs.writeFileSync(cp, buf);
      }
      return as === 'buffer' ? buf : as === 'json' ? JSON.parse(buf.toString('utf8')) : buf.toString('utf8');
    } catch (e) {
      ultimoErro = e;
      if (e.fatal) break;
      await sleep(1500 * 2 ** i);
    }
  }
  if (opcional) {
    console.warn(`  ! falhou (opcional): ${url} — ${ultimoErro?.message}`);
    return null;
  }
  throw ultimoErro;
}

/** Executa fn sobre itens com no máximo `limite` chamadas simultâneas. */
export async function pool(itens, limite, fn) {
  const out = new Array(itens.length);
  let idx = 0;
  const workers = Array.from({ length: Math.min(limite, itens.length) }, async () => {
    while (idx < itens.length) {
      const i = idx++;
      out[i] = await fn(itens[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

export { sleep };
