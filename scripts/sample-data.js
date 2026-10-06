// Gera dados FICTÍCIOS (nomes, partidos e números inventados) para testar o
// site sem acesso às APIs. Nunca publique este modo como se fosse real:
// o site exibe uma faixa de aviso quando latest.json tem "amostra": true.
import { resumirProposicoes } from './lib/aggregate.js';

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}
const NOMES = ['Ana', 'Bruno', 'Carla', 'Diego', 'Elisa', 'Fábio', 'Gabriela', 'Heitor', 'Iara', 'Jonas', 'Lívia', 'Marcos', 'Nádia', 'Otávio', 'Paula', 'Rafael', 'Sílvia', 'Tiago', 'Úrsula', 'Vítor', 'Yara', 'Zeca', 'Beatriz', 'Caio', 'Denise', 'Edu', 'Flávia', 'Gustavo', 'Helena', 'Igor'];
const SOBRENOMES = ['Albuquerque', 'Barros', 'Cardoso', 'Duarte', 'Esteves', 'Figueira', 'Guimarães', 'Holanda', 'Inácio', 'Junqueira', 'Lacerda', 'Macedo', 'Nogueira', 'Oliveira', 'Pacheco', 'Quintana', 'Rezende', 'Sampaio', 'Teixeira', 'Valadares', 'Xavier', 'Zanetti'];
const PARTIDOS = ['Partido A', 'Partido B', 'Partido C', 'Partido D', 'Partido E', 'Partido F', 'Partido G', 'Partido H'];
const TEMAS = ['saúde mental nas escolas', 'transparência em contratos públicos', 'transporte intermunicipal', 'proteção de nascentes', 'primeiro emprego', 'acessibilidade em calçadas', 'segurança em ciclovias', 'merenda escolar orgânica', 'telemedicina no SUS', 'combate à violência doméstica', 'crédito para microempreendedores', 'reuso de água na indústria'];
const HONOR = ['Denomina "Rodovia Exemplo" o trecho da SP-000', 'Institui o Dia Estadual do Exemplo', 'Confere o Título de Cidadão Paulista a pessoa fictícia', 'Declara de utilidade pública a Associação Exemplo'];
const STATUS_PESO = [['andamento', 0.62], ['aprovada', 0.12], ['arquivada', 0.2], ['rejeitada', 0.06]];

export function gerarAmostra(casa, cfg, hoje) {
  const seed = { camara: 11, senado: 22, alesp: 33 }[casa];
  const r = rng(seed);
  const total = { camara: 513, senado: 81, alesp: 94 }[casa];
  const nSP = { camara: 70, senado: 3, alesp: 94 }[casa];
  const pick = (a) => a[Math.floor(r() * a.length)];
  const status = () => {
    let x = r();
    for (const [s, p] of STATUS_PESO) if ((x -= p) <= 0) return s;
    return 'andamento';
  };
  const out = [];
  for (let i = 0; i < total; i++) {
    const ehSP = i < nSP;
    const perfil = r(); // parlamentares "ativos" x "discretos"
    const nNorm = Math.round(perfil * (casa === 'alesp' ? 70 : 45) + r() * 8);
    const lista = [];
    for (let k = 0; k < nNorm; k++) {
      const honor = r() < (casa === 'alesp' ? 0.35 : 0.15);
      const ano = 2023 + Math.floor(r() * 4);
      lista.push({
        sigla: casa === 'senado' ? 'PL' : pick(['PL', 'PL', 'PL', 'PLP', 'PEC', 'PDL']),
        numero: 100 + Math.floor(r() * 4000), ano,
        ementa: honor ? pick(HONOR) : `Dispõe sobre ${pick(TEMAS)} e dá outras providências.`,
        categoria: 'normativa',
        status: r() < perfil * 0.4 ? 'aprovada' : status(),
        data: `${ano}-${String(1 + Math.floor(r() * 12)).padStart(2, '0')}-${String(1 + Math.floor(r() * 27)).padStart(2, '0')}`,
        url: null,
      });
    }
    const nFisc = Math.round(r() * r() * 60);
    for (let k = 0; k < nFisc; k++) lista.push({ sigla: casa === 'alesp' ? 'RI' : 'RIC', numero: k + 1, ano: 2025, ementa: `Solicita informações sobre ${pick(TEMAS)}.`, categoria: 'fiscalizacao', data: '2025-06-01' });
    const sessoes = casa === 'senado' ? 640 : 520;
    const taxa = Math.min(1, 0.68 + r() * 0.3 + perfil * 0.04);
    const cota = { camara: 28000 + r() * 22000, senado: 22000 + r() * 30000, alesp: 9000 + r() * 21000 }[casa];
    const assessores = casa === 'camara' ? 9 + Math.floor(r() * 17) : casa === 'senado' ? 12 + Math.floor(r() * 50) : 10 + Math.floor(r() * 20);
    const nome = `${pick(NOMES)} ${pick(SOBRENOMES)}`;
    const dias = r() < 0.04 ? 60 : 1300;
    out.push({
      id: `${casa}-${9000 + i}`,
      id_oficial: 9000 + i,
      casa,
      nome,
      partido: pick(PARTIDOS),
      uf: ehSP ? 'SP' : 'XX',
      foto: null,
      url_oficial: null,
      dias_em_exercicio: dias,
      presenca: casa === 'alesp' && r() < 0.0 ? null : { sessoes, presentes: Math.round(sessoes * taxa), taxa: Math.round(sessoes * taxa) / sessoes, base: 'Dados fictícios' },
      proposicoes: resumirProposicoes(lista, ehSP),
      custos: {
        cota_total: Math.round(cota * 43),
        cota_mensal_media: Math.round(cota),
        cota_categorias: ehSP ? { 'Divulgação da atividade parlamentar': Math.round(cota * 14), 'Passagens aéreas': Math.round(cota * 10), 'Locação de veículos': Math.round(cota * 8), 'Combustíveis': Math.round(cota * 6), 'Escritório de apoio': Math.round(cota * 5) } : undefined,
        verba_gabinete_mensal: casa === 'camara' && ehSP ? Math.round(cfg.verba_gabinete_mensal * (0.85 + r() * 0.15)) : undefined,
        assessores: ehSP ? assessores : null,
        custo_estimado_mensal: ehSP ? Math.round(cfg.salario_mensal + cota + (casa === 'camara' ? cfg.verba_gabinete_mensal : 0)) : undefined,
      },
    });
  }
  return out;
}
