// Orquestrador: coleta as três casas, calcula o score e grava os JSON do site.
//
//   node scripts/build-data.js                 coleta tudo
//   node scripts/build-data.js --casas=alesp   só uma casa (as outras mantêm o último dado)
//   node scripts/build-data.js --amostra       dados FICTÍCIOS para testar o site
import fs from 'node:fs';
import path from 'node:path';
import { calcularScores, ranquear, pesosDosTemas } from './lib/score.js';
import { ROTULO_TEMA, TIPOS } from './lib/temas.js';
import { siglasSemTipo } from './lib/aggregate.js';
import { gerarAmostra } from './sample-data.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = path.join(ROOT, 'public', 'data');
const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'score.config.json'), 'utf8'));

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const [k, v] = a.replace(/^--/, '').split('=');
  return [k, v ?? true];
}));
const amostra = Boolean(args.amostra);
const casasPedidas = (args.casas || 'camara,senado,alesp').split(',');
const hoje = args.data ? new Date(args.data) : new Date();
const hojeISO = hoje.toISOString().slice(0, 10);

const lerJson = (f, padrao) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : padrao);
const gravar = (f, obj) => {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify(obj));
};
const mediana = (xs) => {
  const v = xs.filter((x) => x != null && Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};

async function coletar(casa) {
  if (amostra) return gerarAmostra(casa, config.casas[casa], hoje);
  const mod = await import(`./collectors/${casa}.js`);
  const fn = { camara: mod.coletarCamara, senado: mod.coletarSenado, alesp: mod.coletarAlesp }[casa];
  return fn(config.casas[casa], hoje);
}

function referencia(membros) {
  return {
    n: membros.length,
    presenca_taxa: mediana(membros.map((m) => m.presenca?.taxa)),
    cota_mensal_media: mediana(membros.map((m) => m.custos?.cota_mensal_media)),
    substantivas: mediana(membros.map((m) => m.proposicoes?.substantivas)),
    fiscalizacao: mediana(membros.map((m) => m.proposicoes?.fiscalizacao)),
    taxa_aprovacao: mediana(membros.filter((m) => m.proposicoes?.substantivas >= 3).map((m) => m.proposicoes.substantivas_aprovadas / m.proposicoes.substantivas)),
    assessores_sp: mediana(membros.filter((m) => m.uf === 'SP').map((m) => m.custos?.assessores)),
  };
}

// Soma temas e tipos de toda a bancada de SP da casa (panorama do esforço)
function somarBancada(sp) {
  const soma = (campo) => {
    const out = {};
    for (const m of sp) for (const [k, v] of Object.entries(m.proposicoes?.[campo] || {})) out[k] = (out[k] || 0) + v;
    return out;
  };
  return { parlamentares: sp.length, por_tema: soma('por_tema'), por_tipo: soma('por_tipo'), por_tema_aprovadas: soma('por_tema_aprovadas') };
}

async function main() {
  const anterior = lerJson(path.join(OUT, 'latest.json'), null);
  const resultado = {
    gerado_em: new Date().toISOString(),
    data_referencia: hojeISO,
    amostra,
    versao_metodologia: config.versao_metodologia,
    componentes: config.componentes,
    temas: Object.fromEntries(Object.entries(ROTULO_TEMA).map(([id, rotulo]) => [id, { rotulo, peso: pesosDosTemas(config.temas)[id] ?? 0 }])),
    tipos: TIPOS,
    casas: {},
    parlamentares: [],
  };

  for (const casa of ['camara', 'senado', 'alesp']) {
    const cfgCasa = config.casas[casa];
    if (!casasPedidas.includes(casa)) {
      // mantém o que já existia
      if (anterior?.casas?.[casa] && anterior.amostra === amostra) {
        resultado.casas[casa] = anterior.casas[casa];
        resultado.parlamentares.push(...anterior.parlamentares.filter((p) => p.casa === casa));
      }
      continue;
    }
    console.log(`\n=== ${cfgCasa.nome} ===`);
    try {
      const membros = await coletar(casa);
      const comScore = calcularScores(membros, config);
      const sp = ranquear(comScore.filter((m) => m.uf === 'SP'));
      for (const m of sp) {
        // detalhe completo em arquivo próprio; o índice leva só o resumo
        gravar(path.join(OUT, 'p', `${m.id}.json`), { ...m, casa_nome: cfgCasa.nome });
        const { lista, ...resumoProps } = m.proposicoes || {};
        resultado.parlamentares.push({
          id: m.id, casa, nome: m.nome, partido: m.partido, foto: m.foto,
          presenca: m.presenca ? { taxa: m.presenca.taxa, sessoes: m.presenca.sessoes } : null,
          proposicoes: m.proposicoes ? resumoProps : null,
          custos: { cota_mensal_media: m.custos?.cota_mensal_media ?? null, assessores: m.custos?.assessores ?? null, custo_estimado_mensal: m.custos?.custo_estimado_mensal ?? null },
          score: { total: m.score.total, posicao: m.score.posicao, de: m.score.de, cobertura: m.score.cobertura, motivo_sem_score: m.score.motivo_sem_score,
            componentes: Object.fromEntries(Object.entries(m.score.componentes).map(([k, v]) => [k, v.percentil])) },
        });
      }
      resultado.casas[casa] = {
        nome: cfgCasa.nome,
        atualizado_em: new Date().toISOString(),
        status: 'ok',
        benchmark: cfgCasa.benchmark,
        inicio_legislatura: cfgCasa.inicio_legislatura,
        referencia: referencia(comScore),
        bancada_sp: somarBancada(sp),
        disponivel: {
          assiduidade: comScore.some((m) => m.presenca),
          custo_pessoal: sp.some((m) => m.custos?.assessores != null),
        },
      };
      console.log(`  ok: ${sp.length} de SP, ${membros.length} no comparativo`);
    } catch (e) {
      console.error(`  ERRO em ${casa}:`, e.message);
      if (anterior?.casas?.[casa]) {
        resultado.casas[casa] = { ...anterior.casas[casa], status: 'desatualizado', erro: e.message };
        resultado.parlamentares.push(...anterior.parlamentares.filter((p) => p.casa === casa));
      } else {
        resultado.casas[casa] = { nome: cfgCasa.nome, status: 'indisponivel', erro: e.message };
      }
    }
  }

  // ---------- Histórico semanal ----------
  const pastaHist = path.join(OUT, 'historico');
  const indiceHist = lerJson(path.join(pastaHist, 'index.json'), []).filter((d) => d !== hojeISO);
  if (!amostra || !indiceHist.length) {
    gravar(path.join(pastaHist, `${hojeISO}.json`), Object.fromEntries(resultado.parlamentares.map((p) => [p.id, p.score.total])));
    indiceHist.push(hojeISO);
    indiceHist.sort();
    gravar(path.join(pastaHist, 'index.json'), indiceHist);
  }
  const ultimas = indiceHist.slice(-12);
  const series = ultimas.map((d) => lerJson(path.join(pastaHist, `${d}.json`), {}));
  for (const p of resultado.parlamentares) {
    p.tendencia = ultimas.map((d, i) => [d, series[i][p.id] ?? null]);
  }

  gravar(path.join(OUT, 'latest.json'), resultado);
  console.log('Tipos não mapeados (top 25):', JSON.stringify([...siglasSemTipo].sort((a, b) => b[1] - a[1]).slice(0, 25)));
  const semScore = resultado.parlamentares.filter((p) => p.score.total == null).length;
  console.log(`\nPronto: ${resultado.parlamentares.length} parlamentares de SP (${semScore} sem score). Saída em public/data/`);
  const falhas = Object.entries(resultado.casas).filter(([, c]) => c.status !== 'ok');
  if (falhas.length === 3) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
