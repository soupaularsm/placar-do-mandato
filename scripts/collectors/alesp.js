// Coletor da Assembleia Legislativa de SP (ALESP).
// Fontes: repositorioDados da ALESP (XML, atualizados diariamente) e a API
// que alimenta a página pública de presença em plenário.
import { get, pool } from '../lib/http.js';
import { forEachRecord, forEachRecordAuto } from '../lib/xmlstream.js';
import { categoriaPorNatureza, siglaPorNatureza, statusPorTexto, norm } from '../lib/classify.js';
import { resumirProposicoes, dias, mesesEntre } from '../lib/aggregate.js';

const REPO = 'https://www.al.sp.gov.br/repositorioDados';
const PRESENCA = 'https://legis-api-portal-prd.al.sp.gov.br/lista-presenca-parlamentar';

const baixar = (url, ttlHoras = 20) => get(url, { as: 'buffer', ttlHoras, opcional: true });

const campo = (reg, ...nomes) => {
  for (const n of nomes) if (reg[n] != null && reg[n] !== '') return reg[n];
  return null;
};

function mesesDesde(inicio, hoje) {
  const out = [];
  const d = new Date(inicio);
  d.setDate(1);
  while (d <= hoje) {
    out.push([d.getMonth() + 1, d.getFullYear()]);
    d.setMonth(d.getMonth() + 1);
  }
  return out;
}

export async function coletarAlesp(cfg, hoje = new Date()) {
  const inicio = cfg.inicio_legislatura;

  console.log('ALESP: deputados');
  const deputados = [];
  forEachRecord(await baixar(`${REPO}/deputados/deputados.xml`), 'Deputado', (d) => {
    const situacao = campo(d, 'Situacao') || '';
    if (situacao && !/exe|exerc/i.test(situacao)) return;
    deputados.push({
      idDep: campo(d, 'IdDeputado'),
      idUA: campo(d, 'IdUA'),
      matricula: campo(d, 'Matricula', 'Matrícula'),
      nome: campo(d, 'NomeParlamentar'),
      partido: campo(d, 'Partido'),
    });
  });
  console.log(`  ${deputados.length} deputados estaduais em exercício`);
  if (!deputados.length) throw new Error('deputados.xml sem registros');
  const porNome = new Map(deputados.map((d) => [norm(d.nome), d]));
  const porMatricula = new Map(deputados.filter((d) => d.matricula).map((d) => [String(d.matricula), d]));

  // ---------- Naturezas (tipos de proposição) ----------
  const naturezas = new Map();
  forEachRecord(await baixar(`${REPO}/processo_legislativo/naturezasSpl.xml`, 150), 'natureza', (n) => {
    const id = campo(n, 'idNatureza', 'IdNatureza');
    if (id) naturezas.set(String(id), campo(n, 'nmNatureza', 'NmNatureza') || '');
  });

  // ---------- Proposituras desde o início da legislatura ----------
  console.log('ALESP: proposituras');
  const props = new Map();
  await forEachRecordAuto(await baixar(`${REPO}/processo_legislativo/proposituras.zip`), 'propositura', (p) => {
    const data = (campo(p, 'DtEntradaSistema') || '').slice(0, 10);
    const pub = (campo(p, 'DtPublicacao') || '').slice(0, 10);
    // registros migrados têm DtEntradaSistema de 2004; a publicação é a referência
    const ref = pub && pub < data ? pub : data;
    if (!ref || ref < inicio) return;
    const natureza = naturezas.get(String(p.IdNatureza)) || '';
    const categoria = categoriaPorNatureza(natureza);
    // tipos administrativos (ofícios, pareceres, anexos) não são propostas do parlamentar
    if (categoria === 'outra' && !/mocao|emenda|substitutivo|requerimento/.test(norm(natureza))) return;
    props.set(String(p.IdDocumento), {
      sigla: siglaPorNatureza(natureza),
      natureza,
      numero: p.NroLegislativo,
      ano: p.AnoLegislativo,
      ementa: p.Ementa,
      categoria,
      data: ref,
      url: `https://www.al.sp.gov.br/propositura/?id=${p.IdDocumento}`,
      andamentos: [],
    });
  });
  console.log(`  ${props.size} proposituras relevantes na legislatura`);

  // Autor principal = primeiro autor listado para o documento
  const autor = new Map();
  let semCasamento = 0;
  await forEachRecordAuto(await baixar(`${REPO}/processo_legislativo/documento_autor.zip`), 'DocumentoAutor', (a) => {
    const id = String(a.IdDocumento);
    if (!props.has(id) || autor.has(id)) return;
    const dep = porNome.get(norm(a.NomeAutor));
    if (!dep) semCasamento++;
    autor.set(id, dep ? dep.idDep : null);
  });
  console.log(`  ${[...autor.values()].filter(Boolean).length} com autor em exercício (${semCasamento} de outros autores)`);

  console.log('ALESP: andamentos (histórico completo, em fluxo)');
  const n = await forEachRecordAuto(await baixar(`${REPO}/processo_legislativo/documento_andamento.zip`), 'DocumentoAndamento', (a) => {
    const id = String(a.IdDocumento);
    if (!autor.get(id)) return;
    const p = props.get(id);
    if (p) p.andamentos.push(`${a.Descricao || ''} ${a.NmEtapa || ''}`);
  });
  console.log(`  ${n} andamentos lidos`);

  const propsPor = new Map();
  for (const [id, p] of props) {
    const idDep = autor.get(id);
    if (!idDep) continue;
    p.status = statusPorTexto(...p.andamentos);
    delete p.andamentos;
    if (!propsPor.has(idDep)) propsPor.set(idDep, []);
    propsPor.get(idDep).push(p);
  }

  // ---------- Despesas de gabinete ----------
  console.log('ALESP: despesas de gabinete');
  const despesas = new Map();
  for (let ano = new Date(inicio).getFullYear(); ano <= hoje.getFullYear(); ano++) {
    forEachRecord(await baixar(`${REPO}/deputados/despesas_gabinetes_${ano}.xml`), 'despesa', (d) => {
      const dep = porMatricula.get(String(campo(d, 'Matricula', 'Matrícula'))) || porNome.get(norm(d.Deputado));
      if (!dep) return;
      const t = new Date(Number(d.Ano), Number(d.Mes) - 1, 15);
      if (t < new Date(inicio)) return;
      const bruto = String(d.Valor || 0);
      const v = Number(bruto.includes(',') ? bruto.replace(/\./g, '').replace(',', '.') : bruto) || 0;
      const c = despesas.get(dep.idDep) || { total: 0, categorias: {} };
      c.total += v;
      const cat = (d.Tipo || 'Outros').replace(/^[A-Z]\s*-\s*/, '');
      c.categorias[cat] = (c.categorias[cat] || 0) + v;
      despesas.set(dep.idDep, c);
    });
  }

  // ---------- Assessores lotados no gabinete (pela unidade do deputado) ----------
  console.log('ALESP: lotações');
  const porUA = new Map();
  forEachRecord(await baixar(`${REPO}/administracao/lotacoes.xml`), 'Lotacao', (l) => {
    porUA.set(String(l.IdUA), (porUA.get(String(l.IdUA)) || 0) + 1);
  });

  // ---------- Presença em plenário ----------
  console.log('ALESP: presença em plenário');
  const lista = await get(`${PRESENCA}/parlamentares/`, { ttlHoras: 20, opcional: true });
  const matriculaPorNome = new Map((Array.isArray(lista) ? lista : []).map((p) => [norm(p.txNomeParlamentar), String(p.nuMatricula)]));
  const meses = mesesDesde(inicio, hoje);
  const limiteImutavel = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
  const situacoes = new Map();
  const presenca = new Map();
  await pool(deputados, 4, async (d) => {
    const mat = d.matricula || matriculaPorNome.get(norm(d.nome));
    if (!mat) return;
    let pres = 0, aus = 0, just = 0;
    for (const [mes, ano] of meses) {
      const r = await get(`${PRESENCA}/${encodeURIComponent(mat)}/${mes}/${ano}`, {
        ttlHoras: new Date(ano, mes - 1, 1) < limiteImutavel ? Infinity : 20,
        opcional: true,
      });
      for (const x of Array.isArray(r) ? r : []) {
        const s = norm(x.situacao || '');
        situacoes.set(s, (situacoes.get(s) || 0) + 1);
        if (!s || /nao deliberativa|indefinida/.test(s)) continue; // sessão sem votação
        if (/^presente/.test(s)) pres++;
        else if (/licen|afast|missao|representacao|a servico|comissao parlamentar de inquerito|audiencia publica/.test(s)) continue; // fora da conta
        else { aus++; if (/^justificada/.test(s)) just++; }
      }
    }
    if (pres + aus) presenca.set(d.idDep, { sessoes: pres + aus, presentes: pres, taxa: pres / (pres + aus), justificadas: just, base: 'Sessões plenárias deliberativas' });
  });
  console.log('  situações encontradas:', JSON.stringify(Object.fromEntries(situacoes)));

  const diasEx = dias(inicio, hoje);
  const mesesMandato = mesesEntre(inicio, hoje);
  return deputados.map((d) => {
    const c = despesas.get(d.idDep);
    const cotaMensal = c ? c.total / mesesMandato : null;
    return {
      id: `alesp-${d.idDep}`,
      id_oficial: d.idDep,
      casa: 'alesp',
      nome: d.nome,
      partido: d.partido,
      uf: 'SP',
      foto: `https://www.al.sp.gov.br/repositorio/deputadoPortal/fotos/${d.idDep}.jpg`,
      url_oficial: d.matricula ? `https://www.al.sp.gov.br/deputado/?matricula=${d.matricula}` : 'https://www.al.sp.gov.br/deputado/lista/',
      dias_em_exercicio: diasEx,
      presenca: presenca.get(d.idDep) || null,
      proposicoes: resumirProposicoes(propsPor.get(d.idDep) || [], true),
      custos: {
        cota_total: c ? Math.round(c.total) : null,
        cota_mensal_media: cotaMensal != null ? Math.round(cotaMensal) : null,
        cota_categorias: c ? Object.fromEntries(Object.entries(c.categorias).map(([k, x]) => [k, Math.round(x)]).sort((a, b) => b[1] - a[1])) : undefined,
        assessores: d.idUA ? porUA.get(String(d.idUA)) ?? null : null,
        custo_estimado_mensal: Math.round(cfg.salario_mensal + (cotaMensal || 0)),
      },
    };
  });
}
