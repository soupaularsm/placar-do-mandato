// Leitura de XML "achatado" (um registro por elemento, campos simples) direto
// de um Buffer, em blocos. Os arquivos da ALESP passam de centenas de MB e não
// cabem com folga num parser DOM; aqui só aplicamos regex por registro.
import AdmZip from 'adm-zip';

function decoderPara(buf) {
  const cab = buf.subarray(0, 200).toString('latin1');
  const m = /encoding=["']([^"']+)["']/i.exec(cab);
  const enc = (m?.[1] || 'utf-8').toLowerCase();
  return new TextDecoder(/8859|latin|1252/.test(enc) ? 'latin1' : 'utf-8');
}

const ENT = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" };
const desescapar = (s) =>
  s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&(amp|lt|gt|quot|apos);/g, (e) => ENT[e]).trim();

/**
 * Chama cb(registro) para cada <tag>...</tag> do buffer.
 * registro = { Campo: 'valor', ... } (só elementos filhos simples).
 */
export function forEachRecord(buf, tag, cb) {
  const dec = decoderPara(buf);
  const BLOCO = 32 * 1024 * 1024;
  const fecha = `</${tag}>`;
  const reAbre = new RegExp(`<${tag}(\\s[^>]*)?>`);
  const reCampo = /<([A-Za-zÀ-ÿ_][\wÀ-ÿ.-]*)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/g;
  let resto = '';
  let n = 0;
  for (let i = 0; i < buf.length; i += BLOCO) {
    let txt = resto + dec.decode(buf.subarray(i, i + BLOCO), { stream: i + BLOCO < buf.length });
    let fim;
    let cursor = 0;
    while ((fim = txt.indexOf(fecha, cursor)) !== -1) {
      const trecho = txt.slice(cursor, fim);
      const m = reAbre.exec(trecho);
      if (m) {
        const corpo = trecho.slice(m.index + m[0].length);
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
  }
  return n;
}

/** Devolve o Buffer do primeiro .xml dentro de um zip (ou o próprio buffer se já for XML). */
export function xmlDeZip(buf) {
  if (buf[0] === 0x50 && buf[1] === 0x4b) {
    const e = new AdmZip(buf).getEntries().find((x) => /\.xml$/i.test(x.entryName));
    return e ? e.getData() : Buffer.alloc(0);
  }
  return buf;
}
