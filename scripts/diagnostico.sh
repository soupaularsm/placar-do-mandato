#!/usr/bin/env bash
# Baixa amostras brutas de cada fonte para conferir formatos e nomes de campos.
# Uso: bash scripts/diagnostico.sh [pasta_saida]
set +e
OUT="${1:-diagnostico}"
mkdir -p "$OUT"
UA="PlacarDoMandato/0.1 (diagnostico)"
c() { curl -sSL -m 180 -A "$UA" -H "Accept: ${3:-application/json}" -o "$OUT/$1" -w "$1 %{http_code} %{size_download}\n" "$2" >> "$OUT/_status.txt" 2>&1; }
head_bytes() { [ -f "$OUT/$1" ] && head -c "${2:-6000}" "$OUT/$1" > "$OUT/$1.head" && rm -f "$OUT/$1"; }
zip_head() { [ -f "$OUT/$1" ] && unzip -l "$OUT/$1" > "$OUT/$1.lista" && unzip -p "$OUT/$1" | head -c "${2:-6000}" > "$OUT/$1.head"; rm -f "$OUT/$1"; }
ANO=$(date +%Y)

# ---------------- Câmara ----------------
c camara_deputados_sp.json "https://dadosabertos.camara.leg.br/api/v2/deputados?siglaUf=SP&itens=100"
DEP=$(python3 -c "import json;print(json.load(open('$OUT/camara_deputados_sp.json'))['dados'][0]['id'])" 2>/dev/null)
echo "deputado amostra: $DEP" >> "$OUT/_status.txt"
c camara_historico.json "https://dadosabertos.camara.leg.br/api/v2/deputados/$DEP/historico"
c camara_eventos.json "https://dadosabertos.camara.leg.br/arquivos/eventos/json/eventos-$ANO.json"; head_bytes camara_eventos.json 5000
c camara_presenca.json "https://dadosabertos.camara.leg.br/arquivos/eventosPresencaDeputados/json/eventosPresencaDeputados-$ANO.json"; head_bytes camara_presenca.json 2000
c camara_proposicoes.json "https://dadosabertos.camara.leg.br/arquivos/proposicoes/json/proposicoes-$ANO.json"; head_bytes camara_proposicoes.json 6000
c camara_autores.json "https://dadosabertos.camara.leg.br/arquivos/proposicoesAutores/json/proposicoesAutores-$ANO.json"; head_bytes camara_autores.json 3000
c camara_ceap.zip "https://www.camara.leg.br/cotas/Ano-$ANO.csv.zip" "*/*"; zip_head camara_ceap.zip 4000
c camara_pessoal.html "https://www.camara.leg.br/deputados/$DEP/pessoal-gabinete?ano=$ANO" "text/html"
c camara_verba.html "https://www.camara.leg.br/deputados/$DEP/verba-gabinete?ano=$ANO" "text/html"

# ---------------- Senado ----------------
c senado_lista.json "https://legis.senado.leg.br/dadosabertos/senador/lista/atual.json"
SEN=$(python3 -c "
import json
d=json.load(open('$OUT/senado_lista.json'))
ps=d['ListaParlamentarEmExercicio']['Parlamentares']['Parlamentar']
print([p['IdentificacaoParlamentar']['CodigoParlamentar'] for p in ps if p['IdentificacaoParlamentar']['UfParlamentar']=='SP'][0])" 2>/dev/null)
echo "senador amostra: $SEN" >> "$OUT/_status.txt"
c senado_votacao.json "https://legis.senado.leg.br/dadosabertos/votacao?dataInicio=$ANO-09-01&dataFim=$ANO-09-30"; head_bytes senado_votacao.json 8000
c senado_processo.json "https://legis.senado.leg.br/dadosabertos/processo?codigoParlamentarAutor=$SEN&dataInicioApresentacao=$ANO-01-01"; head_bytes senado_processo.json 6000
PID=$(curl -sS -m 60 -A "$UA" -H "Accept: application/json" "https://legis.senado.leg.br/dadosabertos/processo?codigoParlamentarAutor=$SEN&dataInicioApresentacao=2023-02-01" | python3 -c "import json,sys;d=json.load(sys.stdin);print(d[0].get('id'))" 2>/dev/null)
echo "processo amostra: $PID" >> "$OUT/_status.txt"
c senado_processo_detalhe.json "https://legis.senado.leg.br/dadosabertos/processo/$PID"; head_bytes senado_processo_detalhe.json 12000
c senado_ceaps.json "https://adm.senado.gov.br/adm-dadosabertos/api/v1/senadores/despesas_ceaps/$ANO"; head_bytes senado_ceaps.json 3000
c senado_recursos.html "https://adm.senado.gov.br/adm-dadosabertos/api/v1/senadores/$SEN/recursos-utilizados?ano=$ANO&formato=html" "text/html"

# ---------------- ALESP ----------------
R=https://www.al.sp.gov.br/repositorioDados
c alesp_deputados.xml "$R/deputados/deputados.xml" "*/*"; head_bytes alesp_deputados.xml 4000
c alesp_naturezas.xml "$R/processo_legislativo/naturezasSpl.xml" "*/*"; head_bytes alesp_naturezas.xml 3000
c alesp_proposituras.zip "$R/processo_legislativo/proposituras.zip" "*/*"; zip_head alesp_proposituras.zip 4000
c alesp_autor.zip "$R/processo_legislativo/documento_autor.zip" "*/*"; zip_head alesp_autor.zip 3000
c alesp_andamento.zip "$R/processo_legislativo/documento_andamento.zip" "*/*"; zip_head alesp_andamento.zip 4000
c alesp_despesas.xml "$R/deputados/despesas_gabinetes_$ANO.xml" "*/*"; head_bytes alesp_despesas.xml 3000
c alesp_lotacoes.xml "$R/administracao/lotacoes.xml" "*/*"
[ -f "$OUT/alesp_lotacoes.xml" ] && grep -io '<NomeUA>[^<]*GAB[^<]*</NomeUA>' "$OUT/alesp_lotacoes.xml" | sort | uniq -c | sort -rn | head -40 > "$OUT/alesp_lotacoes_gabinetes.txt" && head_bytes alesp_lotacoes.xml 3000
c alesp_presenca.html "https://www.al.sp.gov.br/deputado/presenca-plenario" "text/html"
# scripts da página de presença (para achar a chamada interna)
grep -oE 'src="[^"]+\.js[^"]*"' "$OUT/alesp_presenca.html" | sed 's/src="//;s/"$//' | head -15 > "$OUT/alesp_presenca_scripts.txt"
i=0
while read -r s; do
  i=$((i+1)); case "$s" in http*) u="$s";; //*) u="https:$s";; /*) u="https://www.al.sp.gov.br$s";; *) u="https://www.al.sp.gov.br/deputado/$s";; esac
  c "alesp_presenca_js_$i.js" "$u" "*/*"
done < "$OUT/alesp_presenca_scripts.txt"
grep -hoE '["'"'"'][^"'"'"']*(presenca|Presenca|api/)[^"'"'"']*["'"'"']' "$OUT"/alesp_presenca* 2>/dev/null | sort -u | head -60 > "$OUT/alesp_presenca_endpoints.txt"

cat "$OUT/_status.txt"
