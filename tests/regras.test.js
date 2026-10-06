import test from 'node:test';
import assert from 'node:assert/strict';
import { statusPorTexto, ehHonorifica, categoriaPorSigla, categoriaPorNatureza } from '../scripts/lib/classify.js';
import { calcularScores } from '../scripts/lib/score.js';
import { forEachRecord } from '../scripts/lib/xmlstream.js';

test('situação → status', () => {
  const casos = {
    'Transformado em Norma Jurídica': 'aprovada',
    'Aguardando Apreciação pelo Senado Federal': 'aprovada',
    'Remetida à Câmara dos Deputados': 'aprovada',
    'Vetado totalmente': 'aprovada',
    'Arquivada': 'arquivada',
    'Retirado pelo(a) Autor(a)': 'arquivada',
    'Rejeitado em Plenário': 'rejeitada',
    'Aguardando Designação de Relator(a)': 'andamento',
    'Aprovado requerimento de urgência': 'andamento',
    'Aprovado o parecer da comissão': 'andamento',
    'Promulgada Lei nº 17.900': 'aprovada',
    '': 'andamento',
  };
  for (const [t, esperado] of Object.entries(casos)) assert.equal(statusPorTexto(t), esperado, t);
});

test('honoríficas', () => {
  assert.ok(ehHonorifica('Denomina "Viaduto Fulano de Tal" o dispositivo...'));
  assert.ok(ehHonorifica('Institui o Dia Estadual do Ciclista'));
  assert.ok(ehHonorifica('Declara de utilidade pública a Associação X'));
  assert.ok(ehHonorifica('Confere o Título de Cidadão Paulista ao Sr. X'));
  assert.ok(!ehHonorifica('Dispõe sobre o atendimento em UBS'));
});

test('categorias', () => {
  assert.equal(categoriaPorSigla('PL'), 'normativa');
  assert.equal(categoriaPorSigla('RIC'), 'fiscalizacao');
  assert.equal(categoriaPorSigla('RQS', 'Requer informações ao Ministro'), 'fiscalizacao');
  assert.equal(categoriaPorSigla('REQ', 'Requer audiência pública'), 'outra');
  assert.equal(categoriaPorNatureza('Requerimento de Informação'), 'fiscalizacao');
  assert.equal(categoriaPorNatureza('Projeto de lei complementar'), 'normativa');
  assert.equal(categoriaPorNatureza('Indicação'), 'indicacao');
});

test('score: percentis, inversão de custo e cobertura', () => {
  const cfg = {
    parametros: { suavizacao_efetividade_k: 5, dias_minimos_em_exercicio: 120, cobertura_minima_para_ranking: 0.6 },
    componentes: {
      assiduidade: { peso: 50, direcao: 'maior_melhor' },
      custo_cota: { peso: 50, direcao: 'menor_melhor' },
    },
  };
  const base = (id, taxa, cota, dias = 500) => ({ id, uf: 'SP', dias_em_exercicio: dias, presenca: { taxa }, custos: { cota_mensal_media: cota } });
  const r = calcularScores([base('a', 1, 10), base('b', 0.5, 20), base('c', 0.8, 30), base('d', 0.9, 5, 30)], cfg);
  const s = Object.fromEntries(r.map((m) => [m.id, m.score]));
  assert.equal(s.a.total, 100); // melhor presença e menor cota entre elegíveis
  assert.equal(s.b.componentes.assiduidade.percentil, 0);
  assert.equal(s.d.total, null); // poucos dias em exercício
  assert.ok(s.d.motivo_sem_score);
});

test('xml em blocos', () => {
  const xml = '<?xml version="1.0" encoding="ISO-8859-1"?><Deputados><Deputado><IdDeputado>1</IdDeputado><NomeParlamentar>José &amp; Cia</NomeParlamentar></Deputado><Deputado><IdDeputado>2</IdDeputado><NomeParlamentar>Ana</NomeParlamentar></Deputado></Deputados>';
  const regs = [];
  forEachRecord(Buffer.from(xml, 'latin1'), 'Deputado', (r) => regs.push(r));
  assert.equal(regs.length, 2);
  assert.equal(regs[0].NomeParlamentar, 'José & Cia');
});

import { forEachRecordInZip } from '../scripts/lib/xmlstream.js';
import AdmZip from 'adm-zip';

test('xml em zip, raiz com mesmo nome do registro', async () => {
  const xml = '<?xml version="1.0" encoding="UTF-8"?><natureza><natureza><idNatureza>1</idNatureza><nmNatureza>Projeto de lei</nmNatureza></natureza><natureza><idNatureza>2</idNatureza><nmNatureza>Indicação</nmNatureza></natureza></natureza>';
  const z = new AdmZip();
  z.addFile('n.xml', Buffer.from(xml));
  const regs = [];
  await forEachRecordInZip(z.toBuffer(), 'natureza', (r) => regs.push(r));
  assert.equal(regs.length, 2);
  assert.equal(regs[1].nmNatureza, 'Indicação');
});

test('status do Senado', () => {
  assert.equal(statusPorTexto('APROVADA'), 'aprovada');
  assert.equal(statusPorTexto('PREJUDICADA'), 'rejeitada');
  assert.equal(statusPorTexto('REMETIDA À CÂMARA DOS DEPUTADOS'), 'aprovada');
  assert.equal(statusPorTexto('AUDIÊNCIA PÚBLICA REALIZADA'), 'andamento');
  assert.equal(statusPorTexto('ARQUIVADA AO FINAL DA LEGISLATURA'), 'arquivada');
});

test('declaratórias de município contam como honoríficas', () => {
  assert.ok(ehHonorifica('Classifica como de Interesse Turístico o Município de Lucélia.'));
  assert.ok(!ehHonorifica('Institui o Programa Estadual de Incentivo ao Transporte Público'));
});

import { temaDe, tipoDe } from '../scripts/lib/temas.js';
import { extratores } from '../scripts/lib/score.js';

test('temas', () => {
  assert.equal(temaDe('Institui o "Dia Estadual do Ciclista"'), 'simbolica');
  assert.equal(temaDe('Declara feriado o dia 20 de novembro'), 'simbolica');
  assert.equal(temaDe('Denomina "Fulano" a rotatória da SP 305'), 'simbolica');
  assert.equal(temaDe('Altera o Código Penal para aumentar a pena do crime de estelionato'), 'seguranca');
  assert.equal(temaDe('Dispõe sobre o atendimento em UBS e hospitais do SUS'), 'saude');
  assert.equal(temaDe('Institui a Política Estadual de Proteção da Primeira Infância'), 'criancas');
  assert.equal(temaDe('Reduz a alíquota do ICMS sobre medicamentos'), 'saude');
  assert.equal(temaDe('Isenta do IPVA veículos de motoristas de aplicativo'), 'contas');
  assert.equal(temaDe('Susta a Resolução nº 34, que define diretrizes e recomendações'), 'institucional');
});

test('tipos', () => {
  assert.equal(tipoDe('PL'), 'lei');
  assert.equal(tipoDe('PEC'), 'pec');
  assert.equal(tipoDe('EMC'), 'emenda');
  assert.equal(tipoDe('RIC', '', 'fiscalizacao'), 'fiscalizacao');
  assert.equal(tipoDe('', 'Moção'), 'mocao');
  assert.equal(tipoDe('', 'Indicação'), 'indicacao');
});

test('agenda: simbólicas tiram pontos', () => {
  const temas = { a: { peso: 1, temas: ['saude'] }, s: { peso: -1, temas: ['simbolica'] } };
  const ag = extratores({}, temas).agenda;
  assert.ok(ag({ proposicoes: { por_tema: { saude: 10 } } }) > 0);
  assert.ok(ag({ proposicoes: { por_tema: { saude: 2, simbolica: 10 } } }) < 0);
});

test('impacto: direção das propostas', async () => {
  const { impactoDe, regrasAtivas } = await import('../scripts/lib/impacto.js');
  const padrao = regrasAtivas({ regras: { aborto: true } });
  const i = (e, t = 'outros') => impactoDe(e, t, padrao);
  assert.equal(i('Veda a reserva de vagas para candidatos transexuais em concursos públicos'), 'minorias');
  assert.equal(i('Proíbe a instalação de banheiros unissex nos estabelecimentos comerciais do Estado.'), 'minorias');
  assert.equal(i('Revoga a Lei nº 16.784, que proíbe a caça no Estado de São Paulo'), 'ambiente');
  assert.equal(i('Proíbe o emprego da telemedicina em procedimentos de aborto.'), 'aborto');
  assert.equal(i('Institui o Programa de Atenção Humanizada ao Aborto Legal.'), 'aborto_legal');
  assert.equal(i('Determina a reserva de 3% das vagas em concursos públicos para pessoas transgênero'), 'desigualdade');
  assert.equal(i('Institui a Política Estadual de Combate à Fome', 'social'), 'desigualdade');
  assert.equal(i('Institui o Programa Estadual de Saúde Bucal', 'saude'), 'qualidade');
  // simbólicas e casos ambíguos ficam neutros
  assert.equal(i('Institui o Dia Estadual de Combate ao Racismo', 'simbolica'), null);
  assert.equal(i('Torna obrigatória a instalação de sanitários específicos para pessoas transgênero e não binárias'), null);
  assert.equal(i('Dispõe sobre o absurdo de taxas bancárias'), null);
  assert.equal(i('Institui a Política Estadual do Carnaval de Rua', 'cultura'), null);
  // contestadas desligadas: neutras, e não caem numa regra positiva genérica
  assert.equal(i('Institui o Programa Escola sem Partido no sistema estadual de ensino', 'educacao'), null);
  assert.equal(impactoDe('Proíbe o emprego da telemedicina em procedimentos de aborto.', 'saude', regrasAtivas({ regras: { aborto: false } })), null);
});

test('score: critério de direitos penaliza restrição', async () => {
  const cfg = {
    componentes: { direitos: { peso: 1, direcao: 'maior_melhor' } },
    parametros: { cobertura_minima_para_ranking: 0 },
    impacto: { peso_amplia: 1, peso_restringe: -2 },
  };
  const m = (id, amplia, restringe, substantivas) => ({ id, uf: 'SP', proposicoes: { impacto: { amplia, restringe }, substantivas } });
  // d: muitos projetos e poucos bons; e: poucos projetos, quase todos bons
  const [a, b, c, d, e] = calcularScores([m('a', 5, 0, 10), m('b', 5, 3, 10), m('c', 0, 0, 2), m('d', 6, 0, 200), m('e', 4, 0, 5)], cfg);
  assert.ok(a.score.total > c.score.total);
  assert.ok(c.score.total > b.score.total);
  assert.ok(e.score.total > d.score.total, 'proporção vale mais que volume');
});
