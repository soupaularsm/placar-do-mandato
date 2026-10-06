// Classificação de proposições por TIPO e por TEMA.
//
// Tema: regras de palavras-chave sobre a ementa (e, na Câmara, as palavras-chave
// oficiais da proposição). Cada proposição recebe UM tema principal: o primeiro
// da lista abaixo cujas regras casarem. A ordem importa: "simbólica" vem antes
// de tudo, para que "Institui o Dia Estadual da Saúde" conte como simbólica e
// não como saúde. Os pesos de cada tema no score ficam em config/score.config.json.
import { norm, ehHonorifica } from './classify.js';

export const TEMAS = [
  {
    id: 'simbolica',
    rotulo: 'Simbólicas e homenagens',
    re: [
      /\bferiado\b/,
      /institui (o|a) (dia|mes|semana|ano|data|jornada|campanha|premio|selo|trofeu|galeria)\b|^(cria|institui) (o|a) (premio|selo|trofeu|medalha)|semana de (conscientizacao|valorizacao|prevencao|combate)|mes (de conscientizacao|do |da )|\bdia (estadual|nacional|municipal|mundial) d|\bsemana (estadual|nacional) d|\bmes (estadual|nacional) d/,
      /inclui no calendario|calendario (oficial|turistico)|data comemorativa/,
      /\bdenomina\b|\bdenominacao\b|\bconfere (o )?nome\b|\bda (o )?nome\b/,
      /titulo de cidad|cidadania (paulista|paulistana)|cidadao (paulista|paulistano|honorario|emerito)|\bmedalha|\bcomenda\b|diploma .*merito|ordem do merito|homenage|honra ao merito|votos? de (congratula|aplauso|louvor|pesar)|mocao de (aplauso|congratula|apoio|repudio|pesar)/,
      /utilidade publica/,
      /livro dos herois|panteao da patria|inscreve o nome/,
      /capital (estadual|nacional|simbolica) d[oa]|capital simbolica|declara o municipio .*capital|capital (do interior|paulista|regional) d|\bpatrono|padroeir/,
      /declara (patrimonio|integrante do patrimonio)|patrimonio (cultural|historico|imaterial)/,
      /interesse turistico|estancia (turistica|climatica|hidromineral)|categoria de estancia/,
    ],
  },
  {
    id: 'seguranca',
    rotulo: 'Segurança pública',
    re: [/seguranca publica|vigilancia comunitaria|policia|policial|crime|criminal|penal|pena de|penitenciar|prisional|presidi|carcer|homicid|furto|roubo|trafico|arma de fogo|armament|faccao|organizacao criminosa|guarda (civil|municipal)|bombeiro|delegad|desaparecid|violencia urbana|codigo de processo penal|execucao penal|estupr|feminicid|latrocin|milicia|videomonitor|cameras? corporais|incendio/],
  },
  {
    id: 'criancas',
    rotulo: 'Crianças e adolescentes',
    re: [/crianc|adolescen|infan|menor(es)? de (idade|dezoito)|estatuto da crianca|eca\b|primeira infancia|creche|abuso sexual infantil|pedofil|trabalho infantil|bullying|maternidade|gestante|amamenta|neonat|puerper|orfa/],
  },
  {
    id: 'saude',
    rotulo: 'Saúde',
    re: [/\bsaude\b|\bsus\b|hospital|medic|enferm|doenca|cancer|oncolog|diabet|vacina|imuniza|farmac|remedio|terapi|paciente|epidem|pandem|dengue|saude mental|psiq|autis|\btea\b|deficien(cia|te)|reabilita|plano de saude|odontol|ambulat|ubs\b|upa\b|samu|doacao de (sangue|orgaos)|transplant|dependencia quimica|drogas|genetic|nascituro|natimort|obito|sepultamento/],
  },
  {
    id: 'educacao',
    rotulo: 'Educação',
    re: [/educa|ensino|escola|escolar|aluno|estudant|professor|docente|universid|faculdade|fundeb|alfabetiza|matricula|curricul|bolsa de estudo|vestibular|enem|pedagog|merenda/],
  },
  {
    id: 'contas',
    rotulo: 'Contas públicas e economia',
    re: [/tribut|imposto|icms|ipva|ipi\b|iss\b|irpf|imposto de renda|isencao|aliquota|taxa\b|fiscal|orcament|despesa publica|gasto publico|divida|teto de gastos|arcabouco|responsabilidade fiscal|licitac|contrato administrativo|privatiz|concess|parceria publico|ppp\b|empresa estatal|\beconomia\b|desenvolvimento economico|politica economica|empreend|microempre|credito|financiamento|juros|banco central|inflacao|precatori|previdenc|reforma administrativa|servidor(es)? publico|funcionarios publicos|servidores|policiais militares inativos|remuneracao|subsidio|salario do servidor|cargo publico|desestatiza/],
  },
  {
    id: 'cidades',
    rotulo: 'Cidades e infraestrutura',
    re: [/urban|mobilidade|transporte|onibus|metro|trem|ferrov|rodovi|estrada|pedagio|transito|ciclov|calcada|acessibilidade|saneamento|esgoto|agua potavel|abastecimento de agua|residuos|lixo|coleta seletiva|habitac|moradia|aluguel|regularizacao fundiaria|iluminacao|pavimenta|obra(s)? publica|infraestrutura|energia eletrica|enchente|drenagem|defesa civil|capacete|bicicleta|veicul|motorista|condutor|carteira nacional de habilitacao|cnh\b|desastre|zoneamento|uso do solo|condominio/],
  },
  {
    id: 'ambiente',
    rotulo: 'Meio ambiente e clima',
    re: [/ambient|clima|carbono|ecossistem|aquatic|\brios?\b|hidreletric|baterias?|descarte|emissoes|desmat|floresta|bioma|amazonia|mata atlantica|cerrado|poluic|reciclag|sustentab|recursos hidricos|nascente|mananci|fauna|flora|animais|maus-tratos|protecao animal|caes|gatos|bem-estar animal|agrotox|pesticid|energia (renovavel|solar|eolica)/],
  },
  {
    id: 'social',
    rotulo: 'Direitos e assistência social',
    re: [/mulher|violencia domestica|maria da penha|idos|pessoa com deficiencia|pcd\b|igualdade|discrimina|intolerancia|cristofobia|racis|lgbt|indigen|quilomb|direitos humanos|assistencia social|cras\b|creas\b|vulnerab|pobreza|fome|seguranca alimentar|bolsa familia|cadunico|cadastro unico|programas sociais|apae|excepcion|renda (basica|minima)|beneficio assistencial|populacao em situacao de rua|refugiad|identidade de genero|nome social/],
  },
  {
    id: 'trabalho',
    rotulo: 'Trabalho e emprego',
    re: [/trabalh|emprego|desemprego|clt\b|consolidacao das leis do trabalho|sindic|piso salarial|salario minimo|jornada|ferias|aposentadoria|fgts|qualificacao profissional|exercicio (da|de) (atividade|profissao)|exercicio profissional|regulament\w* (o exercicio|a profissao)|\bprofissao|profissionais d|estagio|aprendiz|motorista de aplicativo|plataformas digitais/],
  },
  {
    id: 'transparencia',
    rotulo: 'Transparência e integridade',
    re: [/transparen|corrupc|improbidade|acesso a informacao|controle (externo|interno|social)|tribunal de contas|prestacao de contas|nepotismo|lobby|compliance|ouvidoria|dados abertos|lei de acesso|ficha limpa|eleitora|eleicao|partido politico|propaganda eleitoral/],
  },
  {
    id: 'agro',
    rotulo: 'Agro e abastecimento',
    re: [/agro|agricult|rural|produtor|pecuar|safra|irrigac|cooperativa|alimento|abastecimento|pesca|aquicult|fundiari|reforma agraria|terra|defensivo/],
  },
  {
    id: 'tecnologia',
    rotulo: 'Tecnologia e inovação',
    re: [/tecnolog|inovac|digital|internet|dados pessoais|lgpd|inteligencia artificial|ciberne|software|startup|telecomunic|5g\b|ciencia|pesquisa cientifica|apostas|bets?\b|jogos de azar|redes sociais/],
  },
  {
    id: 'cultura',
    rotulo: 'Cultura, esporte e turismo',
    re: [/cultura|cultural|artist|museu|teatro|cinema|musica|patrimonio|igreja|templo|religi|esporte|esportiv|exercicios? fisic|atividade fisica|atleta|futebol|olimp|lazer|turismo|turistic/],
  },
  {
    id: 'consumidor',
    rotulo: 'Defesa do consumidor',
    re: [/consumidor|fornecedor|estabelecimentos? comerci|bares|restaurantes|supermercad|cobranca|telemarketing|planos? de telefon|operadora|tarifa|cardapio|preco|ingresso|meia-entrada|rotulagem|garantia de produto|servicos? bancario/],
  },
  {
    id: 'justica',
    rotulo: 'Justiça e cidadania',
    re: [/cartori|registro civil|tabelia|mediacao|arbitragem|processo civil|codigo civil|judici|tribunal de justica|defensoria|ministerio publico|heranca|divorcio|guarda compartilhada|alienacao parental|pensao alimenticia|adocao/],
  },
  {
    id: 'institucional',
    rotulo: 'Funcionamento do Estado e do Legislativo',
    re: [/regimento interno|mesa diretora|assembleia legislativa|camara dos deputados|senado federal|congresso nacional|organizacao administrativa|estrutura administrativa|secretaria de estado|autarquia|fundacao publica|competencia|susta (os efeitos|o ato)|ato normativo|decreto n|portaria|resolucao n/],
  },
];

const OUTROS = { id: 'outros', rotulo: 'Outros temas' };
export const ROTULO_TEMA = Object.fromEntries([...TEMAS, OUTROS].map((t) => [t.id, t.rotulo]));

/** Tema principal de uma proposição. */
const limpar = (t) => norm(t).replace(/["“”'‘’«»]/g, '');

export function temaDe(ementa = '', palavrasChave = '') {
  if (ehHonorifica(ementa)) return 'simbolica';
  const e = limpar(ementa);
  for (const t of TEMAS) if (t.re.some((r) => r.test(e))) return t.id;
  // ementa não decidiu: tenta as palavras-chave oficiais (Câmara)
  const k = limpar(palavrasChave);
  if (k) for (const t of TEMAS) if (t.id !== 'simbolica' && t.re.some((r) => r.test(k))) return t.id;
  return 'outros';
}

// ---------- Tipo da proposição (rótulo para o público) ----------
export const TIPOS = {
  lei: 'Projeto de lei',
  pec: 'Emenda à Constituição',
  decreto: 'Decreto legislativo ou resolução',
  emenda: 'Emenda ou substitutivo',
  parecer: 'Parecer como relator',
  destaque: 'Destaque ou recurso',
  procedimento: 'Pedido de adiamento ou retirada de pauta',
  orcamento: 'Sugestão de emenda ao orçamento',
  fiscalizacao: 'Pedido de informação e fiscalização',
  requerimento: 'Requerimento',
  indicacao: 'Indicação ao Executivo',
  mocao: 'Moção',
  outro: 'Outros',
};

export function tipoDe(sigla = '', natureza = '', categoria = '') {
  const s = String(sigla || '').toUpperCase();
  const n = norm(natureza);
  if (categoria === 'fiscalizacao' || /^(SIT)$/.test(s)) return 'fiscalizacao';
  if (/^(SLD|SOR|SPP|EMO|EMRP)$/.test(s) || /emenda (a|ao) (lei orcamentaria|orcamento|ldo|ppa)/.test(n)) return 'orcamento';
  if (/^(RPD|RPDR)$/.test(s) || /adiamento|retirada de materia|inversao da pauta/.test(n)) return 'procedimento';
  if (categoria === 'indicacao' || /^(INC|INS|IND)$/.test(s) || /^indicac/.test(n)) return 'indicacao';
  if (/^(PEC)$/.test(s) || /emenda a constituicao|proposta de emenda/.test(n)) return 'pec';
  if (/^(PL|PLP|PLS|PLC|PLN|PLV)$/.test(s) || /^projeto de lei/.test(n)) return 'lei';
  if (/^(PDL|PDC|PDS|PRC|PRS|PR)$/.test(s) || /decreto legislativo|projeto de resolucao/.test(n)) return 'decreto';
  if (/^(EM|EMC|EMP|EMA|EMR|EMS|ESB|EMD|EAG|ERD|SBT|SBE|SSP|SBR|EMENDA)/.test(s) || /^emenda|substitutivo/.test(n)) return 'emenda';
  if (/^(PRL|PRLP|PRLE|PAR|PPP|PRV|REL|RLP|PEP|PRO|PRR|VTS|RDF|CVO)$/.test(s) || /^parecer|relatorio|voto em separado/.test(n)) return 'parecer';
  if (/^(DTQ|DVT|REC|RCM|REM|DEN)$/.test(s) || /^destaque|^recurso/.test(n)) return 'destaque';
  if (/^(MOC|MOÇ)/.test(s) || /^mocao/.test(n)) return 'mocao';
  if (/^(REQ|RQS|RQN|RQC|RI|RIC|RCP|RQA|RQP)$/.test(s) || /^requerimento/.test(n)) return 'requerimento';
  return 'outro';
}
