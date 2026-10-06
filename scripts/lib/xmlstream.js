// Leitura de XML "achatado" (um registro por elemento, campos simples) em
// fluxo. Os arquivos da ALESP chegam a 2,6 GB descompactados; aqui só
// aplicamos regex por registro, sem montar a árvore inteira na memória.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';

const ENT = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" };
const desescapar = (s) =>
  s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&(amp|lt|gt|quot|apos);/g, (e) => ENT[e]).trim();

function encodingDe(cabecalho) {
  const m = /encoding=["']([^"']+)["']/i.exec(cabecalho);
  const enc = (m?.[1] || 'utf-8').toLowerCase();
  return /8859|latin|1252/.test(enc) ? 'latin1' : 'utf-8';
}

/** Cria um extrator incremental: alimente com texto via push(), feche com end(). */
function extrator(tag, cb) {
  const fecha = `</${tag}>`;
  const reAbre = new RegExp(`<${tag}(\\s[^>]*)?>`, 'g');
  const reCampo = /<([A-Za-zÀ-ÿ_][\wÀ-ÿ.-]*)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/g;
  let resto = '';
  let n = 0;
  return {
    push(txt) {
      txt = resto + txt;
      let cursor = 0;
      let fim;
      while ((fim = txt.indexOf(fecha, cursor)) !== -1) {
        const trecho = txt.slice(cursor, fim);
        // última abertura antes do fechamento (ignora a raiz quando tem o mesmo nome)
        let m, ultimo = null;
        reAbre.lastIndex = 0;
        while ((m = reAbre.exec(trecho))) ultimo = m;
        if (ultimo) {
          const corpo = trecho.slice(ultimo.index + ultimo[0].length);
          const reg = {};
          let c;
          reCampo.lastIndex = 0;
          while ((c = reCampo.exec(corpo))) reg[c[1]] = desescapar(c[2]);
          cb(reg);
          n++;
        }
        cursor = fim + fecha.length;
      }
      resto = txt.slice(cursor);
      if (resto.length > 8_000_000) resto = resto.slice(-8_000_000); // proteção
    },
    end() { return n; },
  };
}

/** Percorre os registros <tag> de um Buffer XML. */
export function forEachRecord(buf, tag, cb) {
  if (!buf?.length) return 0;
  const dec = new TextDecoder(encodingDe(buf.subarray(0, 200).toString('latin1')));
  const ex = extrator(tag, cb);
  const BLOCO = 32 * 1024 * 1024;
  for (let i = 0; i < buf.length; i += BLOCO) {
    ex.push(dec.decode(buf.subarray(i, i + BLOCO), { stream: i + BLOCO < buf.length }));
  }
  return ex.end();
}

/** Percorre os registros <tag> do XML dentro de um zip, descompactando em fluxo. */
export function forEachRecordInZip(zipBuf, tag, cb) {
  if (!zipBuf?.length) return Promise.resolve(0);
  const tmp = path.join(os.tmpdir(), `placar-${crypto.randomBytes(6).toString('hex')}.zip`);
  fs.writeFileSync(tmp, zipBuf);
  return new Promise((resolve, reject) => {
    const proc = spawn('unzip', ['-p', tmp], { stdio: ['ignore', 'pipe', 'pipe'] });
    let dec = null;
    const ex = extrator(tag, cb);
    proc.stdout.on('data', (chunk) => {
      if (!dec) dec = new TextDecoder(encodingDe(chunk.subarray(0, 200).toString('latin1')));
      ex.push(dec.decode(chunk, { stream: true }));
    });
    let erro = '';
    proc.stderr.on('data', (d) => (erro += d));
    proc.on('close', (code) => {
      fs.rmSync(tmp, { force: true });
      if (code !== 0) return reject(new Error(`unzip saiu com ${code}: ${erro.slice(0, 200)}`));
      if (dec) ex.push(dec.decode());
      resolve(ex.end());
    });
  });
}

/** Devolve o XML de um buffer que pode ou não ser zip (para arquivos pequenos). */
export async function forEachRecordAuto(buf, tag, cb) {
  if (!buf?.length) return 0;
  if (buf[0] === 0x50 && buf[1] === 0x4b) return forEachRecordInZip(buf, tag, cb);
  return forEachRecord(buf, tag, cb);
}
