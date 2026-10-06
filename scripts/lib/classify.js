// Regras de classificação de proposições, comuns às três casas.
// Mantidas num só lugar para serem auditáveis e fáceis de ajustar.

export const norm = (s = '') =>
  String(s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

// ---------- Tipo da proposição ----------
// categoria: 'normativa' | 'fiscalizacao' | 'indicacao' | 'outra'
const TIPOS_SIGLA = {
  // Câmara e Senado
  PL: 'normativa', PLP: 'normativa', PEC: 'normativa', PDL: 'normativa', PDC: 'normativa',
  PRC: 'normativa', PRS: 'normativa', PLS: 'normativa', PLC: 'normativa', PLN: 'normativa',
  RIC: 'fiscalizacao', PFC: 'fiscalizacao',
  INC: 'indicacao', INS: 'indicacao',
};

export function categoriaPorSigla(sigla, ementa = '') {
  const s = String(sigla || '').toUpperCase();
  if (TIPOS_SIGLA[s]) return TIPOS_SIGLA[s];
  // Senado: requerimento (RQS/REQ) pedindo informações a ministro é fiscalização
  if ((s === 'RQS' || s === 'REQ') && /informa[cç][oõ]es|informacoes/i.test(ementa)) return 'fiscalizacao';
  return 'outra';
}

// ALESP usa "natureza" por extenso
export function categoriaPorNatureza(natureza = '') {
  const n = norm(natureza);
  if (/requerimento de informac/.test(n)) return 'fiscalizacao';
  if (/^indicac/.test(n)) return 'indicacao';
  if (/projeto de lei|proposta de emenda|projeto de resolucao|projeto de decreto legislativo/.test(n)) return 'normativa';
  return 'outra';
}

export function siglaPorNatureza(natureza = '') {
  const n = norm(natureza);
  if (/projeto de lei complementar/.test(n)) return 'PLC';
  if (/projeto de lei/.test(n)) return 'PL';
  if (/proposta de emenda/.test(n)) return 'PEC';
  if (/projeto de resolucao/.test(n)) return 'PR';
  if (/projeto de decreto legislativo/.test(n)) return 'PDL';
  if (/requerimento de informac/.test(n)) return 'RI';
  if (/indicac/.test(n)) return 'IND';
  if (/mocao/.test(n)) return 'MOC';
  return (natureza || '').slice(0, 12);
}

// ---------- Honoríficas ----------
// Leis que dão nome a vias, criam datas comemorativas, títulos, utilidade pública.
// Contam como produção, mas não entram no componente "produção legislativa".
const HONORIFICA = [
  /\bdenomina\b|\bdenominacao\b|\bda denominacao\b|\bconfere a denominacao\b/,
  /institui o (dia|mes|semana|ano)\b|\bdia (estadual|nacional|municipal) d[aoe]s?\b|\bsemana (estadual|nacional) d/,
  /inclui no calendario|calendario oficial/,
  /titulo de cidadao|cidadania paulista|cidadao paulistano|cidadao honorario/,
  /utilidade publica/,
  /livro dos herois|panteao da patria|inscreve o nome/,
  /capital (estadual|nacional) d[oa]/,
  /declara patrimonio (cultural|historico|imaterial)|patrimonio cultural imaterial/,
  // declaratórias de município (em geral apresentadas em série)
  /classifica como (de )?(municipio de )?interesse turistico|classifica como estancia|eleva a categoria de estancia/,
  /^(altera a lei .*?para )?dar? (o )?nome/,
];

export function ehHonorifica(ementa = '') {
  const e = norm(ementa);
  return HONORIFICA.some((r) => r.test(e));
}

// ---------- Situação ----------
// status: 'aprovada' | 'rejeitada' | 'arquivada' | 'andamento'
// "aprovada" = aprovada pela casa (inclui enviada à outra casa, à sanção,
// vetada depois e transformada em norma).
export function statusPorTexto(...textos) {
  const t = norm(textos.filter(Boolean).join(' | '));
  if (!t) return 'andamento';
  if (/transformad[ao] em (norma|lei)|norma juridica|promulgad|sancionad|lei n[o°º]?\s?\d|aguardando sancao|remetid[ao] a sancao|enviad[ao] a sancao|vetad[ao]|veto (total|parcial)|aguardando apreciacao pelo senado|remetid[ao] ao senado|remetid[ao] a camara|aprovad[ao] (pelo plenario|em plenario|em sessao|em (discussao e )?votacao|em (segundo|unico) turno|a redacao final)|(^|\| )aprovad[ao]( |$)(?!.*(requerimento|parecer|urgencia))/.test(t))
    return 'aprovada';
  if (/rejeitad|prejudicad|declarad[ao] prejudicad/.test(t)) return 'rejeitada';
  if (/arquivad|retirad[ao] pel|devolvid[ao] ao autor|retirada de tramitacao/.test(t)) return 'arquivada';
  return 'andamento';
}

export const STATUS_ROTULO = {
  aprovada: 'Aprovada',
  rejeitada: 'Rejeitada',
  arquivada: 'Arquivada / retirada',
  andamento: 'Em andamento',
};
