// Coletor do Senado Federal.
// Fontes: legis.senado.leg.br/dadosabertos (legislativo) e
// adm.senado.gov.br/adm-dadosabertos (administrativo: CEAPS e pessoal).
import { XMLParser } from 'fast-xml-parser';
import * as cheerio from 'cheerio';
import { get, pool } from '../lib/http.js';
import { categoriaPorSigla, statusPorTexto, norm } from '../lib/classify.js';
import { resumirProposicoes, dias, mesesEntre } from '../lib/aggregate.js';

const LEGIS = 'https://legis.senado.leg.br/dadosabertos';
const ADM = 'https://adm.senado.gov.br/adm-dadosabertos/api/v1';
const xml = new XMLParser({ ignoreAttributes: true, parseTagValue: false });
const arr = (x) => (x == null ? [] : Array.isArray(x) ? x : [x]);

// Os endpoints do Senado às vezes devolvem XML mesmo pedindo JSON.
async function getSenado(url, opts = {}) {
  const txt = await get(url, { as: 'text', ...opts });
  if (txt == null) return null;
  const t = txt.trim();
  if (t.startsWith('{') || t.startsWith('[')) return JSON.parse(t);
  return xml.parse(t);
}

const PRESENTE = new Set(['sim', 'nao', 'abstencao', 'p-nrv', 'obstrucao', 'presidente (art. 51 risf)', 'presidente', 'votou']);
const SEM_JUSTIFICATIVA = new Set(['ncom', 'aus', 'ausente']);
// Fora da conta: licenças formais e missão/representação oficial
const fora = (sigla, desc) => /^(ls|lp|lg|la|lap|lc|lsa|mis|rep)$/.test(sigla) || /licen|miss[aã]o|representa/.test(desc);
const codigos = new Map();

function meses(inicio, hoje) {
  const out = [];
  const d = new Date(inicio);
  d.setDate(1);
  while (d <= hoje) {
    const ini = new Date(d);
    const fim = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    out.push([ini.toISOString().slice(0, 10), (fim > hoje ? hoje : fim).toISOString().slice(0, 10)]);
    d.setMonth(d.getMonth() + 1);
  }
  return out;
}

export async function coletarSenado(cfg, hoje = new Date()) {
  const inicio = cfg.inicio_legislatura;

  console.log('Senado: senadores em exercício');
  const lista = await getSenado(`${LEGIS}/senador/lista/atual.json`, { ttlHoras: 20 });
  const parlamentares = arr(lista?.ListaParlamentarEmExercicio?.Parlamentares?.Parlamentar).map((p) => {
    const i = p.IdentificacaoParlamentar || p;
    return {
      cod: String(i.CodigoParlamentar),
      nome: i.NomeParlamentar,
      partido: i.SiglaPartidoParlamentar,
      uf: i.UfParlamentar,
      foto: i.UrlFotoParlamentar,
      url: i.UrlPaginaParlamentar || `https://www25.senado.leg.br/web/senadores/senador/-/perfil/${i.CodigoParlamentar}`,
    };
  });
  console.log(`  ${parlamentares.length} senadores`);
  const cods = new Set(parlamentares.map((p) => p.cod));

  // ---------- Participação em votações nominais ----------
  console.log('Senado: votações nominais');
  const votos = new Map(); // cod -> {presente, ausente, justificada, primeira}
  for (const [ini, fim] of meses(inicio, hoje)) {
    const r = await getSenado(`${LEGIS}/votacao?dataInicio=${ini}&dataFim=${fim}`, {
      ttlHoras: fim < new Date(Date.now() - 40 * 864e5).toISOString().slice(0, 10) ? Infinity : 20,
      opcional: true,
    });
    const votacoes = Array.isArray(r) ? r : arr(r?.votacoes || r?.ListaVotacoes?.Votacoes?.Votacao);
    for (const v of votacoes) {
      const data = v.dataSessao || v.DataSessao || ini;
      for (const vt of arr(v.votos || v.Votos?.VotoParlamentar)) {
        const cod = String(vt.codigoParlamentar ?? vt.CodigoParlamentar);
        if (!cods.has(cod)) continue;
        const sigla = norm(vt.siglaVotoParlamentar ?? vt.SiglaVoto ?? '');
        const desc = norm(vt.descricaoVotoParlamentar ?? '');
        codigos.set(`${sigla} (${desc})`, (codigos.get(`${sigla} (${desc})`) || 0) + 1);
        const reg = votos.get(cod) || { presente: 0, ausente: 0, justificada: 0, primeira: data };
        if (PRESENTE.has(sigla)) reg.presente++;
        else if (fora(sigla, desc)) { /* licença ou missão: não conta */ }
        else { reg.ausente++; if (!SEM_JUSTIFICATIVA.has(sigla)) reg.justificada++; }
        if (data < reg.primeira) reg.primeira = data;
        votos.set(cod, reg);
      }
    }
  }

  console.log('  códigos de voto:', JSON.stringify(Object.fromEntries(codigos)));

  // ---------- Autorias ----------
  console.log('Senado: proposições de autoria');
  const propsPor = new Map();
  await pool(parlamentares, 4, async (s) => {
    const r = await getSenado(
      `${LEGIS}/processo?codigoParlamentarAutor=${s.cod}&dataInicioApresentacao=${inicio}`,
      { ttlHoras: 20, opcional: true },
    );
    const itens = Array.isArray(r) ? r : arr(r?.processos);
    const lista = [];
    for (const p of itens) {
      const ident = p.identificacao || `${p.sigla || ''} ${p.numero || ''}/${p.ano || ''}`;
      const m = /^([A-Z]+)\s+(\d+)\/(\d{4})/.exec(ident) || [];
      const sigla = p.sigla || m[1];
      const ementa = p.ementa || '';
      // conta só quando é o primeiro autor (o campo "autoria" lista os autores em ordem)
      if (p.autoria && !norm(p.autoria).replace(/^senador[a]? /, '').startsWith(norm(s.nome))) continue;
      if (p.dataApresentacao && p.dataApresentacao.slice(0, 10) < inicio) continue;
      const categoria = categoriaPorSigla(sigla, ementa);
      const situacao = p.situacaoAtual || p.situacao || '';
      const tramitando = /^s/i.test(p.tramitando || '');
      lista.push({
        sigla, numero: p.numero || m[2], ano: p.ano || m[3], ementa, categoria,
        status: situacao ? statusPorTexto(situacao) : tramitando ? 'andamento' : 'arquivada',
        data: (p.dataApresentacao || '').slice(0, 10),
        url: p.codigoMateria ? `https://www25.senado.leg.br/web/atividade/materias/-/materia/${p.codigoMateria}` : null,
      });
    }
    propsPor.set(s.cod, lista);
  });

  // ---------- CEAPS ----------
  console.log('Senado: cota parlamentar (CEAPS)');
  const ceaps = new Map();
  const porNome = new Map(parlamentares.map((p) => [norm(p.nome), p.cod]));
  for (let ano = new Date(inicio).getFullYear(); ano <= hoje.getFullYear(); ano++) {
    const r = await get(`${ADM}/senadores/despesas_ceaps/${ano}`, { ttlHoras: 20, opcional: true });
    for (const d of arr(r)) {
      const cod = d.codSenador != null ? String(d.codSenador) : porNome.get(norm(d.nomeSenador || d.senador));
      if (!cod || !cods.has(cod)) continue;
      const t = new Date(Number(d.ano), Number(d.mes) - 1, 15);
      if (t < new Date(inicio)) continue;
      const v = Number(String(d.valorReembolsado ?? d.valor ?? 0).replace(',', '.')) || 0;
      const c = ceaps.get(cod) || { total: 0, categorias: {} };
      c.total += v;
      const cat = d.tipoDespesa || 'Outros';
      c.categorias[cat] = (c.categorias[cat] || 0) + v;
      ceaps.set(cod, c);
    }
  }

  // ---------- Pessoal de gabinete (SP) ----------
  console.log('Senado: pessoal de gabinete (SP)');
  const pessoal = new Map();
  await pool(parlamentares.filter((p) => p.uf === 'SP'), 2, async (s) => {
    const html = await get(`${ADM}/senadores/${s.cod}/recursos-utilizados?ano=${hoje.getFullYear()}&formato=html`, {
      as: 'text', ttlHoras: 100, opcional: true,
    });
    if (!html) return;
    const texto = cheerio.load(html)('body').text().replace(/\s+/g, ' ');
    const trecho = texto.split(/PESSOAL DO GABINETE/i)[1] || '';
    const gab = /Gabinete\s+(\d+)\s+pessoa/i.exec(trecho);
    const apoio = /Apoio\s+(\d+)\s+pessoa/i.exec(trecho);
    pessoal.set(s.cod, gab ? Number(gab[1]) + (apoio ? Number(apoio[1]) : 0) : null);
  });

  return parlamentares.map((s) => {
    const v = votos.get(s.cod);
    const desde = v?.primeira && v.primeira > inicio ? v.primeira : inicio;
    const diasEx = dias(desde, hoje);
    const base = v ? v.presente + v.ausente : 0;
    const c = ceaps.get(s.cod);
    const cotaMensal = c ? c.total / mesesEntre(desde, hoje) : null;
    const ehSP = s.uf === 'SP';
    return {
      id: `senado-${s.cod}`,
      id_oficial: s.cod,
      casa: 'senado',
      nome: s.nome,
      partido: s.partido,
      uf: s.uf,
      foto: s.foto,
      url_oficial: s.url,
      dias_em_exercicio: diasEx,
      presenca: base
        ? { sessoes: base, presentes: v.presente, taxa: v.presente / base, justificadas: v.justificada, base: 'Participação em votações nominais' }
        : null,
      proposicoes: resumirProposicoes(propsPor.get(s.cod) || [], ehSP),
      custos: {
        cota_total: c ? Math.round(c.total) : null,
        cota_mensal_media: cotaMensal != null ? Math.round(cotaMensal) : null,
        cota_categorias: ehSP && c ? Object.fromEntries(Object.entries(c.categorias).map(([k, x]) => [k, Math.round(x)]).sort((a, b) => b[1] - a[1])) : undefined,
        assessores: ehSP ? pessoal.get(s.cod) ?? null : null,
        custo_estimado_mensal: ehSP ? Math.round(cfg.salario_mensal + (cotaMensal || 0)) : undefined,
      },
    };
  });
}
