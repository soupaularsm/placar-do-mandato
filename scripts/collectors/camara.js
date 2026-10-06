// Coletor da Câmara dos Deputados.
// Fontes: API v2 + arquivos em lote de dadosabertos.camara.leg.br, CEAP em
// camara.leg.br/cotas e páginas públicas de pessoal/verba de gabinete.
import AdmZip from 'adm-zip';
import { parse } from 'csv-parse/sync';
import * as cheerio from 'cheerio';
import { get, pool } from '../lib/http.js';
import { categoriaPorSigla, statusPorTexto } from '../lib/classify.js';
import { resumirProposicoes, mesesEntre } from '../lib/aggregate.js';

const API = 'https://dadosabertos.camara.leg.br/api/v2';
const ARQ = 'https://dadosabertos.camara.leg.br/arquivos';

const anosDesde = (inicio, hoje) => {
  const a0 = new Date(inicio).getFullYear(), a1 = new Date(hoje).getFullYear();
  return Array.from({ length: a1 - a0 + 1 }, (_, i) => a0 + i);
};
const idDeUri = (uri) => (uri ? Number(String(uri).split('/').pop()) : null);
const num = (v) => {
  if (v == null || v === '') return 0;
  const s = String(v).trim();
  return Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s) || 0;
};

async function paginar(url) {
  const out = [];
  let next = url;
  while (next) {
    const r = await get(next, { ttlHoras: 20 });
    out.push(...(r.dados || []));
    next = (r.links || []).find((l) => l.rel === 'next')?.href || null;
  }
  return out;
}

async function arquivoJson(nome, ano) {
  const url = `${ARQ}/${nome}/json/${nome}-${ano}.json`;
  const r = await get(url, { ttlHoras: 20, opcional: true });
  return r?.dados || [];
}

// Intervalos em exercício na legislatura, a partir do histórico de status.
function intervalosExercicio(historico, idLeg, inicio, hoje) {
  const evs = historico
    .filter((h) => !idLeg || h.idLegislatura === idLeg)
    .map((h) => ({ t: new Date(h.dataHora), exercicio: /exerc[ií]cio/i.test(h.situacao || '') }))
    .sort((a, b) => a.t - b.t);
  const ints = [];
  let aberto = null;
  for (const e of evs) {
    if (e.exercicio && !aberto) aberto = e.t < new Date(inicio) ? new Date(inicio) : e.t;
    else if (!e.exercicio && aberto) { ints.push([aberto, e.t]); aberto = null; }
  }
  if (aberto) ints.push([aberto, new Date(hoje)]);
  // sem histórico utilizável: assume legislatura inteira
  if (!ints.length && !evs.length) ints.push([new Date(inicio), new Date(hoje)]);
  return ints;
}
const dentro = (t, ints) => ints.some(([a, b]) => t >= a && t <= b);
const diasEm = (ints) => Math.round(ints.reduce((s, [a, b]) => s + (b - a), 0) / 864e5);

export async function coletarCamara(cfg, hoje = new Date()) {
  const { inicio_legislatura: inicio, id_legislatura: idLeg } = cfg;
  const anos = anosDesde(inicio, hoje);
  console.log('Câmara: lista de deputados em exercício');
  const deputados = await paginar(`${API}/deputados?itens=100&ordem=ASC&ordenarPor=nome`);
  console.log(`  ${deputados.length} deputados`);

  console.log('Câmara: histórico de exercício');
  const historicos = await pool(deputados, 6, (d) =>
    get(`${API}/deputados/${d.id}/historico`, { ttlHoras: 150, opcional: true }).then((r) => r?.dados || []),
  );
  const intervalos = new Map(deputados.map((d, i) => [d.id, intervalosExercicio(historicos[i], idLeg, inicio, hoje)]));

  // ---------- Presença em sessões deliberativas do Plenário ----------
  console.log('Câmara: sessões e presenças');
  const sessoes = new Map(); // idEvento -> Date
  const presencas = new Map(); // idDeputado -> Set(idEvento)
  for (const ano of anos) {
    for (const e of await arquivoJson('eventos', ano)) {
      const tipo = e.descricaoTipo || e.tipo || '';
      const situacao = e.situacao || '';
      const plen = !Array.isArray(e.orgaos) || e.orgaos.some((o) => /PLEN/i.test(o.sigla || o.siglaOrgao || ''));
      const t = new Date(e.dataHoraInicio);
      if (/sess[aã]o deliberativa/i.test(tipo) && /encerrad/i.test(situacao) && plen && t >= new Date(inicio) && t <= hoje)
        sessoes.set(Number(e.id ?? idDeUri(e.uri)), t);
    }
    for (const p of await arquivoJson('eventosPresencaDeputados', ano)) {
      const ev = Number(p.idEvento ?? idDeUri(p.uriEvento));
      const dep = Number(p.idDeputado ?? idDeUri(p.uriDeputado));
      if (!sessoes.has(ev)) continue;
      if (!presencas.has(dep)) presencas.set(dep, new Set());
      presencas.get(dep).add(ev);
    }
  }
  console.log(`  ${sessoes.size} sessões deliberativas`);

  // ---------- Proposições (como primeiro autor) ----------
  console.log('Câmara: proposições');
  const ids = new Set(deputados.map((d) => d.id));
  const autoria = new Map(); // idProp -> idDeputado
  const props = new Map();
  for (const ano of anos) {
    for (const a of await arquivoJson('proposicoesAutores', ano)) {
      const dep = Number(a.idDeputadoAutor ?? idDeUri(a.uriAutor));
      const primeiro = Number(a.ordemAssinatura) === 1 || a.ordemAssinatura == null;
      if (ids.has(dep) && primeiro) autoria.set(Number(a.idProposicao ?? idDeUri(a.uriProposicao)), dep);
    }
    for (const p of await arquivoJson('proposicoes', ano)) {
      const id = Number(p.id);
      if (!autoria.has(id)) continue;
      const situacao = p.ultimoStatus?.descricaoSituacao ?? p.ultimoStatus_descricaoSituacao ?? '';
      const tram = p.ultimoStatus?.descricaoTramitacao ?? p.ultimoStatus_descricaoTramitacao ?? '';
      props.set(id, {
        sigla: p.siglaTipo, numero: p.numero, ano: p.ano, ementa: p.ementa,
        categoria: categoriaPorSigla(p.siglaTipo, p.ementa),
        status: statusPorTexto(situacao),
        situacao_oficial: situacao || tram,
        data: (p.dataApresentacao || '').slice(0, 10),
        url: `https://www.camara.leg.br/propostas-legislativas/${id}`,
      });
    }
  }
  const propsPorDep = new Map();
  for (const [idProp, dep] of autoria) {
    const p = props.get(idProp);
    if (!p) continue;
    if (!propsPorDep.has(dep)) propsPorDep.set(dep, []);
    propsPorDep.get(dep).push(p);
  }

  // ---------- CEAP ----------
  console.log('Câmara: cota parlamentar (CEAP)');
  const ceap = new Map(); // id -> {total, categorias}
  for (const ano of anos) {
    const buf = await get(`https://www.camara.leg.br/cotas/Ano-${ano}.csv.zip`, { as: 'buffer', ttlHoras: 20, opcional: true });
    if (!buf) continue;
    const zip = new AdmZip(buf);
    const entry = zip.getEntries().find((e) => e.entryName.endsWith('.csv'));
    const linhas = parse(entry.getData().toString('utf8').replace(/^﻿/, ''), {
      columns: true, delimiter: ';', relax_quotes: true, relax_column_count: true, skip_empty_lines: true,
    });
    for (const l of linhas) {
      const id = Number(l.ideCadastro);
      if (!ids.has(id)) continue;
      const t = new Date(Number(l.numAno), Number(l.numMes) - 1, 15);
      if (t < new Date(inicio)) continue;
      const v = num(l.vlrLiquido);
      const c = ceap.get(id) || { total: 0, categorias: {} };
      c.total += v;
      const cat = l.txtDescricao || 'Outros';
      c.categorias[cat] = (c.categorias[cat] || 0) + v;
      ceap.set(id, c);
    }
  }

  // ---------- Gabinete (só SP: páginas públicas) ----------
  console.log('Câmara: pessoal e verba de gabinete (SP)');
  const sp = deputados.filter((d) => d.siglaUf === 'SP');
  const anoAtual = hoje.getFullYear();
  const gabinete = new Map();
  await pool(sp, 3, async (d) => {
    const htmlPessoal = await get(`https://www.camara.leg.br/deputados/${d.id}/pessoal-gabinete?ano=${anoAtual}`, { as: 'text', ttlHoras: 100, opcional: true });
    const htmlVerba = await get(`https://www.camara.leg.br/deputados/${d.id}/verba-gabinete?ano=${anoAtual}`, { as: 'text', ttlHoras: 100, opcional: true });
    let assessores = null, verbaUsadaMedia = null;
    if (htmlPessoal) {
      const $ = cheerio.load(htmlPessoal);
      const tabela = $('table').first();
      const n = tabela.find('tbody tr').filter((_, tr) => $(tr).find('td').length >= 3).length;
      assessores = n || null;
    }
    if (htmlVerba) {
      const $ = cheerio.load(htmlVerba);
      const gastos = [];
      $('table tbody tr').each((_, tr) => {
        const tds = $(tr).find('td').map((__, td) => $(td).text().trim()).get();
        if (tds.length >= 3 && /^\d{1,2}$/.test(tds[0])) gastos.push(num(tds[2]));
      });
      const usados = gastos.filter((g) => g > 0);
      if (usados.length) verbaUsadaMedia = usados.reduce((a, b) => a + b, 0) / usados.length;
    }
    gabinete.set(d.id, { assessores, verbaUsadaMedia });
  });

  // ---------- Normalização ----------
  return deputados.map((d) => {
    const ints = intervalos.get(d.id);
    const diasEx = diasEm(ints);
    const sessoesEx = [...sessoes].filter(([, t]) => dentro(t, ints)).map(([id]) => id);
    const pres = presencas.get(d.id) || new Set();
    const presentes = sessoesEx.filter((id) => pres.has(id)).length;
    const c = ceap.get(d.id);
    const meses = mesesEntre(0, diasEx * 864e5);
    const g = gabinete.get(d.id) || {};
    const cotaMensal = c ? c.total / meses : null;
    const verbaMensal = g.verbaUsadaMedia ?? cfg.verba_gabinete_mensal;
    const ehSP = d.siglaUf === 'SP';
    return {
      id: `camara-${d.id}`,
      id_oficial: d.id,
      casa: 'camara',
      nome: d.nome,
      partido: d.siglaPartido,
      uf: d.siglaUf,
      foto: d.urlFoto,
      url_oficial: `https://www.camara.leg.br/deputados/${d.id}`,
      dias_em_exercicio: diasEx,
      presenca: sessoesEx.length
        ? { sessoes: sessoesEx.length, presentes, taxa: presentes / sessoesEx.length, base: 'Sessões deliberativas do Plenário' }
        : null,
      proposicoes: resumirProposicoes(propsPorDep.get(d.id) || [], ehSP),
      custos: {
        cota_total: c ? Math.round(c.total) : null,
        cota_mensal_media: cotaMensal != null ? Math.round(cotaMensal) : null,
        cota_categorias: ehSP && c ? Object.fromEntries(Object.entries(c.categorias).map(([k, v]) => [k, Math.round(v)]).sort((a, b) => b[1] - a[1])) : undefined,
        verba_gabinete_mensal: ehSP ? Math.round(verbaMensal) : undefined,
        assessores: ehSP ? g.assessores ?? null : null,
        custo_estimado_mensal: ehSP ? Math.round(cfg.salario_mensal + (cotaMensal || 0) + verbaMensal) : undefined,
      },
    };
  });
}
