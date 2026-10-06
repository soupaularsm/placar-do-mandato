// Coletor da Assembleia Legislativa de SP (ALESP).
// Fontes: repositorioDados da ALESP (XML, atualizados diariamente).
import { get, pool } from '../lib/http.js';
import { forEachRecord, xmlDeZip } from '../lib/xmlstream.js';
import { categoriaPorNatureza, siglaPorNatureza, statusPorTexto, norm } from '../lib/classify.js';
import { resumirProposicoes, dias, mesesEntre } from '../lib/aggregate.js';

const REPO = 'https://www.al.sp.gov.br/repositorioDados';

async function baixarXml(url, ttlHoras = 20) {
  const buf = await get(url, { as: 'buffer', ttlHoras, opcional: true });
  return buf ? xmlDeZip(buf) : null;
}

const campo = (reg, ...nomes) => {
  for (const n of nomes) if (reg[n] != null && reg[n] !== '') return reg[n];
  return null;
};

export async function coletarAlesp(cfg, hoje = new Date()) {
  const inicio = cfg.inicio_legislatura;

  console.log('ALESP: deputados');
  const deputados = [];
  const bufDep = await baixarXml(`${REPO}/deputados/deputados.xml`);
  forEachRecord(bufDep, 'Deputado', (d) => {
    const situacao = campo(d, 'Situacao') || '';
    if (situacao && !/exe|exerc/i.test(situacao)) return;
    deputados.push({
      idDep: campo(d, 'IdDeputado'),
      idSpl: campo(d, 'IdSPL'),
      matricula: campo(d, 'Matricula', 'Matrícula'),
      nome: campo(d, 'NomeParlamentar'),
      partido: campo(d, 'Partido'),
    });
  });
  console.log(`  ${deputados.length} deputados estaduais`);
  const porSpl = new Map(deputados.map((d) => [String(d.idSpl), d]));
  const porNome = new Map(deputados.map((d) => [norm(d.nome), d]));

  // ---------- Naturezas (tipos de proposição) ----------
  const naturezas = new Map();
  const bufNat = await baixarXml(`${REPO}/processo_legislativo/naturezasSpl.xml`, 150);
  if (bufNat) {
    forEachRecord(bufNat, 'natureza', (n) => {
      const id = campo(n, 'idNatureza', 'IdNatureza');
      const nome = campo(n, 'nmNatureza', 'NmNatureza', 'NomeNatureza', 'descricao');
      if (id) naturezas.set(String(id), nome || '');
    });
  }

  // ---------- Proposituras desde o início da legislatura ----------
  console.log('ALESP: proposituras');
  const props = new Map();
  forEachRecord(await baixarXml(`${REPO}/processo_legislativo/proposituras.zip`), 'propositura', (p) => {
    const data = (campo(p, 'DtEntradaSistema', 'DtPublicacao') || '').slice(0, 10);
    if (!data || data < inicio) return;
    const natureza = naturezas.get(String(p.IdNatureza)) || '';
    props.set(String(p.IdDocumento), {
      sigla: siglaPorNatureza(natureza),
      numero: p.NroLegislativo,
      ano: p.AnoLegislativo,
      ementa: p.Ementa,
      categoria: categoriaPorNatureza(natureza),
      data,
      url: `https://www.al.sp.gov.br/propositura/?id=${p.IdDocumento}`,
      andamentos: [],
    });
  });
  console.log(`  ${props.size} proposituras na legislatura`);

  // Autor principal = primeiro autor listado para o documento
  const autor = new Map();
  forEachRecord(await baixarXml(`${REPO}/processo_legislativo/documento_autor.zip`), 'DocumentoAutor', (a) => {
    const id = String(a.IdDocumento);
    if (!props.has(id) || autor.has(id)) return;
    const dep = porSpl.get(String(a.IdAutor)) || porNome.get(norm(a.NomeAutor));
    autor.set(id, dep ? dep.idDep : null);
  });

  console.log('ALESP: andamentos (histórico completo)');
  forEachRecord(await baixarXml(`${REPO}/processo_legislativo/documento_andamento.zip`), 'DocumentoAndamento', (a) => {
    const p = props.get(String(a.IdDocumento));
    if (p && autor.get(String(a.IdDocumento))) p.andamentos.push(`${a.Descricao || ''} ${a.TpAndamento || ''}`);
  });

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
  const porMatricula = new Map(deputados.map((d) => [String(d.matricula), d]));
  const despesas = new Map();
  for (let ano = new Date(inicio).getFullYear(); ano <= hoje.getFullYear(); ano++) {
    const buf = await baixarXml(`${REPO}/deputados/despesas_gabinetes_${ano}.xml`);
    if (!buf) continue;
    forEachRecord(buf, 'despesa', (d) => {
      const dep = porMatricula.get(String(campo(d, 'Matricula', 'Matrícula'))) || porNome.get(norm(d.Deputado));
      if (!dep) return;
      const t = new Date(Number(d.Ano), Number(d.Mes) - 1, 15);
      if (t < new Date(inicio)) return;
      const v = Number(String(d.Valor || 0).replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.')) || 0;
      const c = despesas.get(dep.idDep) || { total: 0, categorias: {} };
      c.total += v;
      const cat = d.Tipo || 'Outros';
      c.categorias[cat] = (c.categorias[cat] || 0) + v;
      despesas.set(dep.idDep, c);
    });
  }

  // ---------- Assessores lotados no gabinete ----------
  console.log('ALESP: lotações');
  const contagemUA = new Map();
  const bufLot = await baixarXml(`${REPO}/administracao/lotacoes.xml`);
  if (bufLot)
    forEachRecord(bufLot, 'Lotacao', (l) => {
      const ua = norm(l.NomeUA);
      if (/gab/.test(ua)) contagemUA.set(ua, (contagemUA.get(ua) || 0) + 1);
    });
  const assessoresDe = (nome) => {
    const n = norm(nome);
    let melhor = null;
    for (const [ua, qtd] of contagemUA) if (ua.includes(n)) melhor = (melhor || 0) + qtd;
    return melhor;
  };

  // ---------- Presença em plenário (endpoint configurável) ----------
  const presenca = new Map();
  if (cfg.presenca_url_template) {
    console.log('ALESP: presença em plenário');
    await pool(deputados, 3, async (d) => {
      const url = cfg.presenca_url_template
        .replace('{matricula}', d.matricula).replace('{idDeputado}', d.idDep).replace('{idSPL}', d.idSpl)
        .replace('{inicio}', inicio).replace('{fim}', hoje.toISOString().slice(0, 10));
      const r = await get(url, { ttlHoras: 20, opcional: true });
      const regs = Array.isArray(r) ? r : r?.dados || r?.presencas || [];
      let pres = 0, aus = 0;
      for (const x of regs) {
        const s = norm(x.situacao || x.Situacao || x.presenca || '');
        if (/presen/.test(s)) pres++;
        else if (/justific|licen|missao|oficial/.test(s)) continue;
        else if (s) aus++;
      }
      if (pres + aus) presenca.set(d.idDep, { sessoes: pres + aus, presentes: pres, taxa: pres / (pres + aus), base: 'Sessões plenárias (ausências justificadas fora da conta)' });
    });
  }

  const diasEx = dias(inicio, hoje);
  const meses = mesesEntre(inicio, hoje);
  return deputados.map((d) => {
    const c = despesas.get(d.idDep);
    const cotaMensal = c ? c.total / meses : null;
    return {
      id: `alesp-${d.idDep}`,
      id_oficial: d.idDep,
      casa: 'alesp',
      nome: d.nome,
      partido: d.partido,
      uf: 'SP',
      foto: `${REPO}/deputados/fotos/${d.idDep}.jpg`,
      url_oficial: `https://www.al.sp.gov.br/deputado/?matricula=${d.matricula}`,
      dias_em_exercicio: diasEx,
      presenca: presenca.get(d.idDep) || null,
      proposicoes: resumirProposicoes(propsPor.get(d.idDep) || [], true),
      custos: {
        cota_total: c ? Math.round(c.total) : null,
        cota_mensal_media: cotaMensal != null ? Math.round(cotaMensal) : null,
        cota_categorias: c ? Object.fromEntries(Object.entries(c.categorias).map(([k, x]) => [k, Math.round(x)]).sort((a, b) => b[1] - a[1])) : undefined,
        assessores: assessoresDe(d.nome),
        custo_estimado_mensal: Math.round(cfg.salario_mensal + (cotaMensal || 0)),
      },
    };
  });
}
