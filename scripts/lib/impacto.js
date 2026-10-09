// Classificação do IMPACTO de uma proposição sobre direitos e qualidade de vida.
//
// Independe do tema: o tema diz SOBRE O QUE é a proposta; o impacto diz em que
// DIREÇÃO ela vai. Cada proposição normativa não simbólica recebe no máximo uma
// regra, a primeira da lista que casar com a ementa:
//   1. regras que RESTRINGEM (tiram pontos), depois
//   2. regras que AMPLIAM (somam pontos).
// Se nenhuma casar, a proposta é neutra para este critério.
//
// As regras são deliberadamente estreitas: preferimos deixar passar um caso a
// marcar errado. Cada proposta marcada aparece no site com o nome da regra, para
// que qualquer pessoa possa conferir e contestar. Regras marcadas como
// `contestada` só valem quando ligadas em config/score.config.json → impacto.regras.
import { norm } from './classify.js';

export const REGRAS = [
  // ---------- RESTRINGEM ----------
  {
    id: 'minorias', sinal: -1, rotulo: 'Restringe direitos de minorias',
    descricao: 'Proíbe cotas ou ações afirmativas, impõe critério biológico para banheiros e identidade, proíbe nome social, combate a chamada "ideologia de gênero" ou a linguagem neutra.',
    re: [
      /(proib|veda)\w*\b.{0,80}\b(cotas?|reserva de vagas|acoes? afirmativas?)/,
      /cotas transexuais/,
      /criterio biologico/,
      /criterios de identificacao de mulheres/,
      /(proib|veda)\w*\b.{0,60}\b(banheiros?|vestiarios?)\b.{0,30}\bunissex/,
      /banheiros? para cada um dos sexos|vedando a instalacao e o uso comum de banheiros/,
      /ideologia de genero/,
      /linguagem neutra/,
      /(proib|veda)\w*\b.{0,60}\bnome social/,
      /susta\w*\b.{0,300}\b(reserva de vagas|cotas|acoes? afirmativas?|lgbt|lesbicas|travestis|igualdade racial|quilombol)/,
    ],
  },
  {
    id: 'aborto', sinal: -1, rotulo: 'Restringe o aborto legal', contestada: true,
    descricao: 'Dificulta ou proíbe o aborto nos casos já permitidos em lei (estupro, risco de vida e anencefalia), ou cria proteção jurídica ao feto desde a concepção.',
    re: [
      /(proib|veda)\w*\b.{0,60}\baborto/,
      /direito\b.{0,30}\bobjecao de consciencia\b.{0,40}\baborto/,
      /proibicao legal de aborto|valorizar a vida do feto|vida desde a concepcao/,
      /estatuto do nascituro|protecao ao nascituro/,
    ],
  },
  {
    id: 'ambiente', sinal: -1, rotulo: 'Enfraquece a proteção ambiental',
    descricao: 'Libera a caça, dispensa ou simplifica o licenciamento ambiental, reduz áreas protegidas, anistia desmatamento, libera garimpo ou agrotóxicos.',
    re: [
      /revoga\w*\b.{0,80}\bproib\w* a caca|(libera|autoriza|permite)\w* a caca/,
      /(dispens|simplific|flexibiliz|isent)\w*\b.{0,60}\blicenciamento ambiental|licenciamento ambiental (simplificado|por adesao|autodeclaratorio)|licenca (ambiental )?por adesao/,
      /(estabelece|institui|regulamenta)\w* o marco temporal/,
      /(reduz|desafeta|extingue)\w*\b.{0,60}\b(unidades? de conservacao|parque (estadual|nacional)|areas? de protecao ambiental|reserva (biologica|extrativista|legal)|areas? de preservacao permanente)/,
      /(autoriza|permite|libera)\w*\b.{0,40}\b(pulverizacao aerea|agrotox)/,
      /anistia\w*\b.{0,60}\b(desmat|infrac\w* ambienta|multas? ambienta)/,
      /(autoriza|permite|regulamenta)\w*\b.{0,40}\b(garimpo|mineracao) em terras? indigena/,
    ],
  },
  {
    id: 'retrocesso', sinal: -1, rotulo: 'Retira direitos ou benefícios',
    descricao: 'Revoga, extingue ou reduz gratuidades, meia-entrada, passe livre, cotas e direitos trabalhistas ou sociais já garantidos.',
    re: [
      /(revoga|extingue|suprime|suspende)\w*\b.{0,80}\b(gratuidade|meia-entrada|meia entrada|passe livre|isencao tarifaria|cotas|reserva de vagas|acao afirmativa|licenca-maternidade|licenca maternidade|piso salarial|adicional de insalubridade)/,
      /(flexibiliz|precariz)\w*\b.{0,40}\b(direitos trabalhistas|jornada de trabalho|clt\b)/,
    ],
  },
  {
    // Vale também para projetos simbólicos (datas, títulos): oficializar uma fé é o problema em si.
    id: 'laicidade', sinal: -1, rotulo: 'Fere a laicidade do Estado', simbolicas: true,
    descricao: 'Usa a estrutura do Estado para adotar ou privilegiar uma religião: Bíblia ou oração em escolas e órgãos públicos, cristianismo ou "princípios cristãos" como política oficial, crucifixos em repartições, datas e bancadas confessionais, proteção penal só para uma fé, ou restrições a religiões de matriz africana. Festas populares tradicionais e o combate à intolerância religiosa não contam.',
    exceto: [/intolerancia religiosa|racismo religioso|combate a discriminacao|liberdade religiosa de (todas|qualquer)/],
    re: [
      /biblia\b.{0,120}\b(escolas?|ensino|paradidatic|sala de aula|orgaos? publicos?|repartico\w* publica)|(leitura|uso|utilizacao|distribuicao)\b.{0,25}\bbiblia/,
      /(reconhece|declara|institui)\w*\b.{0,30}\bcristianismo|cristianismo como/,
      /(cruz|crucifixo)\b.{0,200}\b(fixacao|afixa\w*|orgaos|reparticoes|predios publicos)/,
      /principios cristaos|valores cristaos|familia crista|dia com deus|deus seja louvado/,
      /(vilipendio|ultraje|satira|ridiculariz|menosprez)\w*\b.{0,80}\b(religiao crista|crencas? crista|dogmas?\b.{0,40}\bcrist|fe crista)/,
      /bancada (crista|evangelica|catolica)|frente parlamentar (crista|evangelica|catolica)/,
      /\b(oracao|pai nosso|leitura biblica)\b.{0,60}\b(obrigatori|nas escolas|inicio das aulas|sessoes)|ensino religioso (confessional|obrigatorio)/,
      /(proib|veda|restring|criminaliz)\w*\b.{0,80}\b(sacrificio|abate)\b.{0,30}\b(religios|ritual|rituais|cultos?)/,
      /(proib|veda|restring)\w*\b.{0,60}\b(religio\w* de matriz(es)? africana|candomble|umbanda|terreiros?)/,
    ],
  },
  // contestadas: desligadas por padrão
  {
    id: 'escola', sinal: -1, rotulo: 'Restringe a liberdade de ensinar', contestada: true,
    descricao: 'Escola sem Partido e punição a professores por "doutrinação". O STF já derrubou leis desse tipo por ferirem a liberdade de ensinar.',
    re: [/escola sem partido|doutrinacao (politica|ideologica)|afastamento de professores/],
  },
  {
    id: 'armas', sinal: -1, rotulo: 'Facilita o acesso a armas', contestada: true,
    descricao: 'Amplia posse, porte ou compra de armas por civis, ou derruba decretos de controle de armas.',
    re: [/(amplia|flexibiliz|facilita)\w*\b.{0,40}\b(porte|posse|aquisicao) de armas?|clubes de tiro sem|susta\b.{0,60}\bdecreto n.{0,4}11\.?(366|615)/],
  },

  // ---------- AMPLIAM ----------
  {
    id: 'desigualdade', sinal: 1, rotulo: 'Reduz desigualdade e amplia direitos',
    descricao: 'Cotas e ações afirmativas, combate ao racismo e à discriminação, renda e combate à fome, moradia popular, população de rua, proteção às mulheres, inclusão de pessoas com deficiência, direitos de pessoas LGBT+.',
    exceto: [/sanitarios especificos para pessoas trans|proibe a instalacao de mictorios/],
    re: [
      /(reserva de vagas|cotas?|acoes? afirmativas?)\b.{0,80}\b(negr|pret|pard|indigen|quilombol|deficien|transe?x|transgener|travesti)/,
      /igualdade racial|antirracis|combate ao racismo|enfrentamento ao racismo|racismo (religioso|ambiental)|combate a discriminacao|(lgbt\w*|homo|trans)fobia/,
      /renda (basica|minima|cidada)|transferencia de renda|combate a fome|seguranca alimentar|restaurantes? populares?|cozinhas? solidarias?/,
      /situacao de rua/,
      /habitac\w* de interesse social|moradia popular|aluguel social|regularizacao fundiaria/,
      /tarifa social|familias? de baixa renda|vulnerabilidade social/,
      /nome social|retificacao\b.{0,40}\b(prenome|genero)|pessoas? (trans|transexua|travesti)/,
      /violencia (contra a mulher|domestica|obstetrica|sexual)|maria da penha|feminicid|igualdade (de genero|salarial)|dignidade menstrual|absorventes/,
      /pessoas? com deficiencia|acessibilidade|autis|\btea\b|\bsurd|\bcegos?\b|\blibras\b/,
    ],
  },
  {
    id: 'aborto_legal', sinal: 1, rotulo: 'Garante o acesso ao aborto legal', contestada: true, par: 'aborto',
    descricao: 'Garante atendimento e informação sobre o aborto nos casos já permitidos em lei.',
    re: [/aborto legal|atencao humanizada ao aborto|possibilidade de realizacao de aborto/],
  },
  {
    id: 'qualidade', sinal: 1, rotulo: 'Cria política pública de qualidade de vida',
    descricao: 'Institui política, programa, plano ou rede pública permanente em saúde, educação, cidades, meio ambiente, assistência, trabalho, crianças ou segurança. Campanhas, semanas e datas não contam.',
    temas: ['saude', 'educacao', 'cidades', 'ambiente', 'social', 'trabalho', 'criancas', 'seguranca', 'consumidor'],
    re: [/^(institui|cria|estabelece|dispoe sobre)\w*\b.{0,12}\b(a |o )?(politica|programa|plano|rede|sistema|servico|fundo) (estadual|nacional|publica|publico|integrad)/],
  },
];

export const ROTULO_IMPACTO = Object.fromEntries(REGRAS.map((r) => [r.id, r.rotulo]));
export const SINAL_IMPACTO = Object.fromEntries(REGRAS.map((r) => [r.id, r.sinal]));

/** Regras ligadas segundo a config (contestadas só se ligadas; o par segue a sua regra-mãe). */
export function regrasAtivas(cfg = {}) {
  const lig = cfg.regras || {};
  return REGRAS.filter((r) => {
    const chave = r.par || r.id;
    if (chave in lig) return !!lig[chave];
    return !REGRAS.find((x) => x.id === chave)?.contestada;
  });
}

let ativasPadrao = null;
/** Liga as regras segundo a config, para todas as chamadas seguintes. */
export function configurarImpacto(cfg = {}) { ativasPadrao = regrasAtivas(cfg); }

const limpar = (t) => norm(t).replace(/["“”'‘’«»]/g, '');

/**
 * Regra de impacto que casa com a ementa, ou null.
 * Simbólicas só recebem impacto de regras marcadas `simbolicas` (hoje, laicidade);
 * as demais já perdem pontos pelo tema.
 * Uma ementa que casa com uma regra contestada desligada fica neutra:
 * não pode cair numa regra positiva genérica por acidente.
 */
export function impactoDe(ementa = '', tema = null, ativas = ativasPadrao || regrasAtivas()) {
  if (!ementa) return null;
  const simb = tema === 'simbolica';
  const e = limpar(ementa);
  for (const r of REGRAS) {
    if (simb && !r.simbolicas) continue;
    if (r.temas && !r.temas.includes(tema)) continue;
    if (!r.re.some((x) => x.test(e))) continue;
    if (r.exceto?.some((x) => x.test(e))) return null;
    return ativas.includes(r) ? r.id : null;
  }
  return null;
}
