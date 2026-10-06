// Cálculo do Score de Valor ao Cidadão.
//
// Ideia central: cada critério vira um percentil (0–100) *dentro da mesma casa*,
// comparando o parlamentar com seus pares (Câmara e Senado: todos do país;
// ALESP: todos os 94). O score é a média ponderada dos percentis disponíveis.
// Comparar percentis evita somar coisas em escalas diferentes (reais, %, contagens)
// e torna o resultado legível: "75" = melhor que 75% dos pares naquele critério.

/** Extrai o valor bruto de cada componente a partir do registro normalizado. */
export function extratores(params) {
  const k = params.suavizacao_efetividade_k ?? 5;
  return {
    assiduidade: (m) => m.presenca?.taxa ?? null,
    producao: (m) => (m.proposicoes ? Math.log1p(m.proposicoes.substantivas) : null),
    efetividade: (m, ctx) => {
      const p = m.proposicoes;
      if (!p) return null;
      const n = p.substantivas;
      const aprov = p.substantivas_aprovadas;
      return (aprov + k * ctx.taxaMediaAprovacao) / (n + k);
    },
    fiscalizacao: (m) => (m.proposicoes ? Math.log1p(m.proposicoes.fiscalizacao) : null),
    custo_cota: (m) => m.custos?.cota_mensal_media ?? null,
    custo_pessoal: (m) => m.custos?.assessores ?? null,
  };
}

/** Percentil com empates repartidos (mid-rank). Retorna 0–100. */
function percentis(valores, menorMelhor) {
  const validos = valores.filter((v) => v != null && Number.isFinite(v));
  const n = validos.length;
  return valores.map((v) => {
    if (v == null || !Number.isFinite(v) || n < 2) return null;
    let abaixo = 0, iguais = 0;
    for (const w of validos) {
      if (w === v) iguais++;
      else if (menorMelhor ? w > v : w < v) abaixo++;
    }
    return Math.round(((abaixo + 0.5 * (iguais - 1)) / (n - 1)) * 1000) / 10;
  });
}

/**
 * @param {object[]} membros registros normalizados de UMA casa (benchmark completo)
 * @param {object} config score.config.json
 * @returns membros com campo `score`
 */
export function calcularScores(membros, config) {
  const { componentes, parametros } = config;
  const ext = extratores(parametros);

  // contexto da casa
  let somaAprov = 0, somaSubs = 0;
  for (const m of membros) {
    if (m.proposicoes) {
      somaAprov += m.proposicoes.substantivas_aprovadas;
      somaSubs += m.proposicoes.substantivas;
    }
  }
  const ctx = { taxaMediaAprovacao: somaSubs ? somaAprov / somaSubs : 0 };

  const elegivel = (m) => (m.dias_em_exercicio ?? Infinity) >= (parametros.dias_minimos_em_exercicio ?? 0);

  const brutos = {};
  const pct = {};
  for (const [nome, comp] of Object.entries(componentes)) {
    if (!ext[nome]) {
      console.warn(`  ! componente "${nome}" sem extrator em score.js — ignorado`);
      continue;
    }
    brutos[nome] = membros.map((m) => (elegivel(m) ? ext[nome](m, ctx) : null));
    // gabinete: compara só entre SP (é onde coletamos o dado)
    const universo = nome === 'custo_pessoal'
      ? brutos[nome].map((v, i) => (membros[i].uf === 'SP' ? v : null))
      : brutos[nome];
    pct[nome] = percentis(universo, comp.direcao === 'menor_melhor');
  }

  const pesoTotal = Object.entries(componentes)
    .filter(([n]) => pct[n])
    .reduce((s, [, c]) => s + c.peso, 0);

  return membros.map((m, i) => {
    const comps = {};
    let soma = 0, pesos = 0;
    for (const [nome, comp] of Object.entries(componentes)) {
      if (!pct[nome]) continue;
      const p = pct[nome][i];
      comps[nome] = { bruto: brutos[nome][i], percentil: p };
      if (p != null) {
        soma += p * comp.peso;
        pesos += comp.peso;
      }
    }
    const cobertura = pesoTotal ? pesos / pesoTotal : 0;
    const suficiente = elegivel(m) && cobertura >= (parametros.cobertura_minima_para_ranking ?? 0.6);
    return {
      ...m,
      score: {
        total: suficiente && pesos ? Math.round((soma / pesos) * 10) / 10 : null,
        cobertura: Math.round(cobertura * 100) / 100,
        motivo_sem_score: !elegivel(m)
          ? 'Menos de ' + parametros.dias_minimos_em_exercicio + ' dias em exercício'
          : !suficiente ? 'Dados insuficientes para calcular' : null,
        componentes: comps,
      },
    };
  });
}

/** Posição no ranking entre os parlamentares de SP da casa. */
export function ranquear(membrosSP) {
  const ordenados = [...membrosSP]
    .filter((m) => m.score.total != null)
    .sort((a, b) => b.score.total - a.score.total);
  const pos = new Map(ordenados.map((m, i) => [m.id, i + 1]));
  return membrosSP.map((m) => ({
    ...m,
    score: { ...m.score, posicao: pos.get(m.id) ?? null, de: ordenados.length },
  }));
}
