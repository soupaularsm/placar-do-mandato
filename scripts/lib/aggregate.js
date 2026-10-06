// Agrega a lista de proposições de um parlamentar no formato comum.
import { ehHonorifica } from './classify.js';

/**
 * @param {Array<{sigla,numero,ano,ementa,categoria,status,data,url}>} lista
 * @param {boolean} manterLista guarda a lista detalhada (só para quem é de SP)
 */
export function resumirProposicoes(lista, manterLista = false) {
  const r = {
    total: lista.length,
    normativas: 0,
    substantivas: 0,
    honorificas: 0,
    substantivas_aprovadas: 0,
    fiscalizacao: 0,
    indicacoes: 0,
    outras: 0,
    por_status: { aprovada: 0, rejeitada: 0, arquivada: 0, andamento: 0 },
  };
  const detalhada = [];
  for (const p of lista) {
    const honor = p.categoria === 'normativa' && ehHonorifica(p.ementa);
    if (p.categoria === 'normativa') {
      r.normativas++;
      r.por_status[p.status] = (r.por_status[p.status] || 0) + 1;
      if (honor) r.honorificas++;
      else {
        r.substantivas++;
        if (p.status === 'aprovada') r.substantivas_aprovadas++;
      }
    } else if (p.categoria === 'fiscalizacao') r.fiscalizacao++;
    else if (p.categoria === 'indicacao') r.indicacoes++;
    else r.outras++;

    if (manterLista && p.categoria !== 'outra') {
      detalhada.push({
        sigla: p.sigla, numero: p.numero, ano: p.ano,
        ementa: (p.ementa || '').slice(0, 400),
        categoria: honor ? 'honorifica' : p.categoria,
        status: p.categoria === 'normativa' ? p.status : null,
        data: p.data || null,
        url: p.url || null,
      });
    }
  }
  if (manterLista) {
    detalhada.sort((a, b) => String(b.data || b.ano).localeCompare(String(a.data || a.ano)));
    r.lista = detalhada;
  }
  return r;
}

/** Dias entre duas datas ISO (ou Date). */
export function dias(a, b) {
  return Math.max(0, Math.round((new Date(b) - new Date(a)) / 864e5));
}

export function mesesEntre(a, b) {
  return Math.max(1, dias(a, b) / 30.44);
}
