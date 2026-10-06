# Placar do Mandato SP

Site estático que acompanha, com atualização semanal, os 70 deputados federais, os 3 senadores e os 94 deputados estaduais de São Paulo: presença, proposições (aprovadas, rejeitadas, arquivadas, em andamento), gastos de cota, tamanho do gabinete, custo estimado e um **score de valor ao cidadão** com metodologia aberta e pesos ajustáveis pelo visitante.

Não há servidor nem banco de dados. Um job semanal do GitHub Actions coleta os dados oficiais, calcula o score e grava JSON em `public/data/`. A Vercel (ou GitHub Pages) publica a pasta `public/` a cada commit.

```
config/score.config.json     pesos, critérios e parâmetros do score
scripts/build-data.js        orquestra coleta → score → JSON
scripts/collectors/          camara.js · senado.js · alesp.js
scripts/lib/classify.js      regras de status, honoríficas e tipos (auditáveis)
scripts/lib/score.js         cálculo do score (percentis ponderados)
scripts/sample-data.js       dados FICTÍCIOS para testar o site
public/                      site (HTML, CSS, JS puro) + data/
.github/workflows/           atualização semanal
tests/                       testes das regras
```

## Rodar localmente

```bash
npm install
npm test
npm run amostra        # gera dados fictícios em public/data (aparece faixa de aviso no site)
npm run dev            # http://localhost:3000
npm run update         # coleta real (demora: baixa arquivos grandes da Câmara e da ALESP)
npm run update -- --casas=senado   # só uma casa; as demais mantêm o último dado
```

Antes do primeiro deploy, rode `npm run update` (ou dispare o workflow manualmente) para substituir os dados fictícios por dados reais.

## Publicar

1. Crie um repositório no GitHub e suba este projeto.
2. Em **Settings → Actions → General → Workflow permissions**, marque *Read and write permissions* (o job faz commit dos dados).
3. Em **Actions → Atualizar dados (semanal) → Run workflow**, rode a primeira coleta. A primeira demora mais (60 a 120 min); as seguintes usam cache.
4. Na Vercel: *Add New → Project*, importe o repositório. O `vercel.json` já aponta a saída para `public/`. Cada commit do bot gera um deploy novo.

O agendamento roda toda segunda às 06:17 (horário de Brasília). Para mudar, edite o `cron` em `.github/workflows/atualizar-dados.yml`.

## Fontes de dados

| Dado | Câmara | Senado | ALESP |
|---|---|---|---|
| Parlamentares | API v2 `/deputados` | `/senador/lista/atual` | `deputados.xml` |
| Presença | `eventos` + `eventosPresencaDeputados` (sessões deliberativas do Plenário), recortado pelo `/historico` de exercício | `/votacao` (votações nominais) | **pendente**, ver abaixo |
| Proposições e situação | `proposicoes` + `proposicoesAutores` (arquivos anuais) | `/processo?codigoParlamentarAutor=` | `proposituras.zip`, `documento_autor.zip`, `documento_andamento.zip` |
| Cota | CEAP `camara.leg.br/cotas/Ano-AAAA.csv.zip` | CEAPS `adm.senado.gov.br/.../despesas_ceaps/AAAA` | `despesas_gabinetes_AAAA.xml` |
| Gabinete | páginas `/deputados/{id}/pessoal-gabinete` e `/verba-gabinete` (só SP) | relatório `recursos-utilizados` (só SP) | `lotacoes.xml` (gabinetes casados pelo nome) |

### Pendências conhecidas

- **Presença na ALESP.** A página `al.sp.gov.br/deputado/presenca-plenario` carrega os dados por uma chamada interna que não está documentada no portal de dados abertos. Abra a página no navegador, DevTools → Network, escolha um deputado e copie a URL da requisição. Coloque o modelo em `config/score.config.json → casas.alesp.presenca_url_template`, usando `{matricula}`, `{idDeputado}`, `{idSPL}`, `{inicio}` e `{fim}`. Enquanto vazio, assiduidade fica fora do score da ALESP (o site avisa).
- **Validação contra dados reais.** Os coletores foram escritos a partir da documentação oficial e testados com dados de exemplo. Na primeira execução real, confira o log do Actions e 3 ou 4 perfis contra as páginas oficiais. Os pontos mais prováveis de ajuste são nomes de campos do Senado (`/processo`, `/votacao`) e o casamento de gabinetes da ALESP pelo nome.
- **Raspagem de páginas.** Pessoal e verba de gabinete da Câmara e o relatório do Senado vêm de páginas HTML públicas. Se o layout mudar, o número de assessores volta `null` e o critério sai do score até o ajuste.

## Score

Cada critério vira percentil (0–100) dentro da mesma casa; o score é a média ponderada. Pesos padrão:

| Critério | Peso |
|---|---|
| Assiduidade | 25 |
| Efetividade (aprovadas ÷ propostas, suavizada) | 20 |
| Produção legislativa (substantivas, escala log) | 15 |
| Fiscalização (requerimentos de informação, PFC) | 15 |
| Economia na cota | 15 |
| Enxugamento do gabinete | 10 |

### Adicionar um critério

1. Inclua o critério em `config/score.config.json → componentes` (peso, rótulo, descrição, `maior_melhor` ou `menor_melhor`).
2. Escreva o extrator em `scripts/lib/score.js → extratores`, lendo um campo do registro normalizado.
3. Se o dado ainda não existe, colete-o nos três coletores com o mesmo nome de campo.

O site lê os critérios do JSON, então aparecem sozinhos no ranking, na página de metodologia e nos controles de peso.

### Troca de legislatura

As novas bancadas tomam posse em 1º/02/2027 (Congresso) e 15/03/2027 (ALESP). Nessas datas, atualize `inicio_legislatura` (e `id_legislatura` = 58 na Câmara) em `config/score.config.json`. O histórico semanal antigo continua em `public/data/historico/`.

## Cuidados

- Publique a metodologia junto com o ranking e mantenha os pesos visíveis. O site já faz isso; não esconda.
- Quantidade de propostas não mede qualidade. Por isso honoríficas saem da produção e a efetividade conta mais que o volume.
- Use User-Agent identificável e mantenha a frequência semanal. As fontes são públicas, mas as páginas HTML não são API.
