(() => {
  'use strict';

  // ================= Utilidades =================
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (n) => (n ?? 0).toLocaleString('pt-BR');
  const pct = (v, d = 0) => (v == null ? '–' : (v * 100).toLocaleString('pt-BR', { maximumFractionDigits: d, minimumFractionDigits: d }) + '%');
  const n1 = (v) => (v == null ? '–' : v.toLocaleString('pt-BR', { maximumFractionDigits: 1, minimumFractionDigits: 1 }));
  const brl = (v) => (v == null ? '–' : 'R$ ' + Math.round(v).toLocaleString('pt-BR'));
  const brlMil = (v) => (v == null ? '–' : v >= 1e6 ? `R$ ${(v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi` : `R$ ${Math.round(v / 1000).toLocaleString('pt-BR')} mil`);
  const iniciais = (nome) => nome.split(/\s+/).filter((p) => p.length > 2).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
  const cor = (v) => (v == null ? 'var(--track)' : v >= 60 ? 'var(--good)' : v >= 40 ? 'var(--mid)' : 'var(--bad)');
  const soma = (o) => Object.values(o || {}).reduce((a, b) => a + (typeof b === 'number' ? b : 0), 0);
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sem armazenamento */ } },
  };

  const CASAS = [['camara', 'Câmara'], ['senado', 'Senado'], ['alesp', 'ALESP']];
  const NA_CASA = { camara: 'na Câmara', senado: 'no Senado', alesp: 'na ALESP' };
  const DA_CASA = { camara: 'da Câmara', senado: 'do Senado', alesp: 'da ALESP' };
  const NORMATIVOS = new Set(['lei', 'pec', 'decreto']);
  const STATUS = {
    aprovada: ['Aprovada', 'var(--good)'],
    andamento: ['Em andamento', 'var(--accent)'],
    arquivada: ['Arquivada', 'var(--faint)'],
    rejeitada: ['Rejeitada', 'var(--bad)'],
  };
  const TITULO_TIPO = {
    lei: 'Projetos de lei', pec: 'Propostas de emenda à Constituição', decreto: 'Decretos legislativos e resoluções',
    emenda: 'Emendas e substitutivos', parecer: 'Pareceres como relator', destaque: 'Destaques e recursos',
    procedimento: 'Pedidos de adiamento ou retirada de pauta', orcamento: 'Sugestões de emenda ao orçamento',
    fiscalizacao: 'Pedidos de informação e fiscalização', requerimento: 'Requerimentos', indicacao: 'Indicações ao Executivo',
    mocao: 'Moções', outro: 'Outros documentos',
  };
  const EXPLICA_TIPO = {
    lei: 'Propõe criar ou mudar uma lei. Precisa ser aprovado na casa e sancionado pelo Executivo para valer.',
    pec: 'Muda a Constituição. Exige três quintos dos votos, em dois turnos de votação.',
    decreto: 'Trata de assuntos que não dependem de sanção, como sustar um ato do Executivo ou definir regras internas da casa.',
    emenda: 'Propõe mudar o texto de um projeto que já está em tramitação.',
    parecer: 'Voto do relator sobre um projeto, em comissão ou no plenário. É trabalho de análise, não de autoria.',
    destaque: 'Pede para votar uma parte do texto em separado ou recorre de uma decisão.',
    procedimento: 'Pede para adiar ou tirar um assunto da pauta. É a principal ferramenta de obstrução de votações.',
    orcamento: 'Sugestão de mudança no orçamento apresentada por meio de uma comissão.',
    fiscalizacao: 'Pede informações oficiais ao governo ou propõe fiscalizar um órgão público. É o principal instrumento de controle do Executivo.',
    requerimento: 'Pedido formal sobre o andamento dos trabalhos: audiência pública, urgência, voto de pesar e outros.',
    indicacao: 'Sugestão ao Executivo, sem força de lei. O governo não é obrigado a atender nem a responder.',
    mocao: 'Manifestação da casa sobre um tema: aplauso, apoio, repúdio ou pesar.',
    outro: 'Ofícios, documentos administrativos e tipos pouco frequentes.',
  };

  let dados = null;
  let pesosOficiais = {};
  let pesos = {};
  const tiposCache = {};
  const estado = {
    casa: 'camara', busca: '', partido: '', ordem: 'score', tema: '',
    podio: 'todas', pesosAbertos: false, todosTemas: false, rankLimite: 20,
    ptCasa: 'todas', ptFoco: '', ptOrdem: ['score', 'desc'], ptMembros: false, ptMetrica: 'score', ptLimite: 25, ptAutor: '',
    perfil: { filtro: 'todas', tema: '', limite: 15, lista: [] },
  };

  // ================= Score e temas =================
  function scoreCom(p) {
    if (p.score.total == null) return null;
    let s = 0, w = 0;
    for (const [k, peso] of Object.entries(pesos)) {
      const v = p.score.componentes[k];
      if (v == null || !peso) continue;
      s += v * peso; w += peso;
    }
    return w ? Math.round((s / w) * 10) / 10 : null;
  }
  const pesosAlterados = () => Object.keys(pesos).some((k) => pesos[k] !== pesosOficiais[k]);
  const rotTema = (t) => dados.temas?.[t]?.rotulo || 'Sem tema';
  const pesoTema = (t) => dados.temas?.[t]?.peso ?? 0;
  const grupoTema = (t) => { const w = pesoTema(t); return w < 0 ? 'neg' : w >= 1 ? 'prio' : w >= 0.5 ? 'rel' : 'comp'; };
  const ROT_GRUPO = { prio: 'prioritário', rel: 'relevante', comp: 'complementar', neg: 'tira pontos' };
  const fracSimb = (pr) => (pr?.normativas ? (pr.por_tema?.simbolica || 0) / pr.normativas : 0);
  const rotTipo = (t) => dados.tipos?.[t] || t;
  const rotImpacto = (i) => dados.impacto?.[i]?.rotulo || i;
  const sinalImpacto = (i) => dados.impacto?.[i]?.sinal || 0;
  const impactoDe = (pr) => pr?.impacto || { amplia: 0, restringe: 0 };
  const temImpacto = () => !!dados.impacto && dados.parlamentares.some((p) => p.proposicoes?.impacto);
  const daCasa = (c) => dados.parlamentares.filter((p) => p.casa === c);
  const rotCasa = (c) => CASAS.find(([x]) => x === c)?.[1] || c;

  // ================= Peças visuais =================
  function foto(p, cls = '') {
    const ini = esc(iniciais(p.nome));
    const img = p.foto ? `<img src="${esc(p.foto)}" alt="" loading="lazy" onerror="this.parentNode.textContent='${ini}'">` : ini;
    return `<span class="foto ${cls}" aria-hidden="true">${img}</span>`;
  }

  function segmentos(opcoes, atual, attr) {
    return `<div class="segmentos" role="group">${opcoes.map(([v, r, extra]) =>
      `<button type="button" ${attr}="${v}" aria-pressed="${v === atual}">${esc(r)}${extra != null ? `<span>${extra}</span>` : ''}</button>`).join('')}</div>`;
  }

  /** Barras de temas. linhas = [[tema, total, aprovadas]]. */
  function listaTemas(linhas, { href, atual } = {}) {
    if (!linhas.length) return '<p class="vazio">Nada apresentado no período.</p>';
    const max = Math.max(...linhas.map((l) => l[1]));
    const total = linhas.reduce((a, l) => a + l[1], 0);
    return `<ul class="temas">${linhas.map(([t, n, a]) => {
      const g = grupoTema(t);
      const corpo = `<span class="tema-rot">${esc(rotTema(t))}<span class="peso peso-${g}">${ROT_GRUPO[g]}</span></span>
        <span class="tema-num">${fmt(n)}<small>${Math.round((n / total) * 100)}%</small></span>
        <span class="barra" aria-hidden="true"><i class="${g === 'neg' ? 'b-neg' : 'b-pos'}" style="width:${(n / max) * 100}%"></i>${a ? `<i class="b-aprov" style="width:${(a / max) * 100}%"></i>` : ''}</span>`;
      const dica = `${rotTema(t)}: ${fmt(n)} apresentados, ${fmt(a || 0)} aprovados`;
      return `<li title="${esc(dica)}">${href ? `<a href="${href(t)}"${t === atual ? ' aria-pressed="true"' : ''}>${corpo}</a>` : `<div>${corpo}</div>`}</li>`;
    }).join('')}</ul>
    <div class="legenda"><span style="--c:var(--accent)">Apresentados</span><span style="--c:var(--aprov)">Aprovados</span><span style="--c:var(--coral)">Simbólicos</span></div>`;
  }

  function nuvemTipos(porTipo, casa, { links = true } = {}) {
    const ent = Object.entries(porTipo || {}).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
    if (!ent.length) return '<p class="vazio">Sem proposições no período.</p>';
    const max = Math.log(ent[0][1] + 1);
    return `<div class="nuvem">${ent.map(([t, n]) => {
      const tam = 13 + 8 * (Math.log(n + 1) / max);
      const conteudo = `${esc(rotTipo(t))} <b>${fmt(n)}</b>`;
      return links
        ? `<a href="#tipo-${casa}-${t}" style="--fs:${tam.toFixed(1)}px">${conteudo}</a>`
        : `<span class="tag" style="font-size:${Math.min(tam, 16).toFixed(1)}px;padding:.4em .9em">${conteudo}</span>`;
    }).join('')}</div>`;
  }

  // Soma por tema e situação de um tipo, entre os parlamentares de uma casa
  function agregadoTipoTema(casa, tipo) {
    const temas = {};
    for (const p of daCasa(casa)) {
      const tt = p.proposicoes?.por_tipo_tema_status?.[tipo] || {};
      for (const [t, st] of Object.entries(tt)) {
        const r = (temas[t] ??= { total: 0 });
        for (const [s, n] of Object.entries(st)) { r[s] = (r[s] || 0) + n; r.total += n; }
      }
    }
    return temas;
  }

  // ================= Pódios =================
  function fato(k, p, bom) {
    const pr = p.proposicoes || {};
    const ref = dados.casas[p.casa]?.referencia || {};
    const prio = Object.entries(pr.por_tema || {}).filter(([t]) => grupoTema(t) === 'prio').reduce((a, [, n]) => a + n, 0);
    switch (k) {
      case 'assiduidade': return p.presenca ? `Presença de ${pct(p.presenca.taxa)}` : null;
      case 'agenda':
        if (!bom && fracSimb(pr) >= 0.2) return `${pct(fracSimb(pr))} dos projetos são simbólicos`;
        return `${fmt(prio)} projetos em temas prioritários`;
      case 'direitos': {
        const im = impactoDe(pr);
        if (!bom && im.restringe) return `${fmt(im.restringe)} proposta${im.restringe > 1 ? 's' : ''} que restringe${im.restringe > 1 ? 'm' : ''} direitos`;
        return im.amplia ? `${fmt(im.amplia)} propostas que ampliam direitos` : bom ? null : 'Nenhuma proposta que amplia direitos';
      }
      case 'producao': return `${fmt(pr.substantivas)} projetos substantivos`;
      case 'efetividade': return pr.substantivas_aprovadas ? `${fmt(pr.substantivas_aprovadas)} de ${fmt(pr.substantivas)} projetos aprovados` : 'Nenhum projeto substantivo aprovado';
      case 'fiscalizacao': return `${fmt(pr.fiscalizacao)} pedidos de informação`;
      case 'custo_cota': return p.custos?.cota_mensal_media != null ? `Cota de ${brlMil(p.custos.cota_mensal_media)}/mês (mediana ${brlMil(ref.cota_mensal_media)})` : null;
      case 'custo_pessoal': return p.custos?.assessores != null ? `${p.custos.assessores} pessoas no gabinete` : null;
      default: return null;
    }
  }
  function motivos(p, bom) {
    const comps = Object.entries(p.score.componentes).filter(([, v]) => v != null).sort((a, b) => (bom ? b[1] - a[1] : a[1] - b[1]));
    const out = [];
    for (const [k] of comps) { const f = fato(k, p, bom); if (f) out.push(f); if (out.length === 2) break; }
    return out;
  }

  function degrau(p, i, bom) {
    return `<a class="degrau p${i + 1}" href="#p-${esc(p.id)}" style="order:${i === 0 ? 2 : i === 1 ? 1 : 3}">
      <span class="medalha">${i + 1}</span>
      ${foto(p, 'g')}
      <span class="nome">${esc(p.nome)}</span>
      <span class="onde">${esc(p.partido)}, ${rotCasa(p.casa)}</span>
      <span class="nota" style="color:${bom ? 'var(--gold)' : 'var(--coral)'}">${n1(scoreCom(p))}</span>
      <ul class="motivos">${motivos(p, bom).map((m) => `<li>${esc(m)}</li>`).join('')}</ul>
    </a>`;
  }

  function podios() {
    const lista = (estado.podio === 'todas' ? dados.parlamentares : daCasa(estado.podio))
      .map((p) => ({ ...p, _s: scoreCom(p) })).filter((p) => p._s != null).sort((a, b) => b._s - a._s);
    const topo = lista.slice(0, 3);
    const base = lista.length >= 6 ? lista.slice(-3).reverse() : [];
    return `
      <div class="secao-cab">
        <div><h2>Quem manda bem e quem nem tanto</h2>
        <p>Os três maiores e os três menores scores. Cada parlamentar é comparado com os colegas da mesma casa, e os motivos são os critérios em que mais se destacou.</p></div>
        ${segmentos([['todas', 'Todas'], ...CASAS], estado.podio, 'data-podio')}
      </div>
      <div class="podios">
        <section class="podio bem" aria-label="Manda Bem">
          <div class="podio-titulo"><h3>Manda Bem</h3><p>Maiores scores</p></div>
          <div class="degraus">${topo.map((p, i) => degrau(p, i, true)).join('')}</div>
        </section>
        <section class="podio serio" aria-label="Sério mesmo">
          <div class="podio-titulo"><h3>Sério mesmo???</h3><p>Menores scores</p></div>
          ${base.length ? `<div class="degraus">${base.map((p, i) => degrau(p, i, false)).join('')}</div>` : '<p class="muted">Com só 3 senadores, esta casa não tem um segundo pódio.</p>'}
        </section>
      </div>`;
  }

  // ================= Início =================
  function viewInicio() {
    const todos = dados.parlamentares;
    const normativas = todos.reduce((a, p) => a + (p.proposicoes?.normativas || 0), 0);
    const simb = todos.reduce((a, p) => a + (p.proposicoes?.por_tema?.simbolica || 0), 0);
    const n = (c) => daCasa(c).length;
    return `
      <div class="wrap heroi">
        <h1>Quem representa São Paulo, medido toda semana.</h1>
        <p class="lead">Presença, propostas e gastos dos ${n('camara')} deputados federais, ${n('senado')} senadores e ${n('alesp')} deputados estaduais de São Paulo, com dados oficiais das três casas.</p>
        <div class="heroi-numeros">
          <div><b>${fmt(todos.length)}</b><span>parlamentares acompanhados</span></div>
          <div><b>${fmt(normativas)}</b><span>projetos apresentados no mandato</span></div>
          <div class="alerta"><b>${pct(normativas ? simb / normativas : 0)}</b><span>deles são simbólicos</span></div>
        </div>
      </div>
      <div class="faixa"><div class="wrap secao" id="sec-podios">${podios()}</div></div>
      <div class="wrap secao" id="sec-esforco">${secaoEsforco()}</div>
      <div class="wrap secao secao-div" id="sec-ranking">${secaoRanking()}</div>`;
  }

  function secaoEsforco() {
    const c = dados.casas[estado.casa];
    const porTipo = c?.bancada_sp?.por_tipo || {};
    const temasLei = agregadoTipoTema(estado.casa, 'lei');
    let linhas = Object.entries(temasLei).map(([t, r]) => [t, r.total, r.aprovada || 0]).sort((a, z) => z[1] - a[1]);
    const totalLinhas = linhas.length;
    if (!estado.todosTemas) linhas = linhas.slice(0, 8);
    const ord = Object.entries(porTipo).sort((a, z) => z[1] - a[1]);
    const lei = porTipo.lei || 0;
    const [maiorT, maiorN] = ord[0] || [];
    const simbLei = temasLei.simbolica?.total || 0;
    const totLei = Object.values(temasLei).reduce((a, r) => a + r.total, 0);
    const destaques = [];
    if (maiorT && maiorT !== 'lei' && lei) destaques.push(`O tipo mais apresentado é <b>${esc(rotTipo(maiorT).toLowerCase())}</b>: ${fmt(maiorN)}, contra ${fmt(lei)} projetos de lei.`);
    if (totLei) destaques.push(`<b>${pct(simbLei / totLei)}</b> dos projetos de lei são simbólicos.`);
    return `
      <div class="secao-cab">
        <div><h2>Onde a bancada de SP concentra esforço</h2>
        <p>Tudo o que os parlamentares de SP apresentaram ${NA_CASA[estado.casa]} desde ${new Date((c?.inicio_legislatura || '2023-01-01') + 'T12:00').getFullYear()}. Toque num tipo para ver o detalhamento.</p></div>
        ${segmentos(CASAS.map(([id, r]) => [id, r, daCasa(id).length]), estado.casa, 'data-casa')}
      </div>
      <div class="esforco">
        <section class="cartao">
          <h3>Tipos de proposição</h3>
          <p class="muted">O tamanho de cada tipo acompanha a quantidade apresentada.</p>
          ${nuvemTipos(porTipo, estado.casa)}
          ${destaques.length ? `<div class="destaques muted">${destaques.map((d) => `<p>${d}</p>`).join('')}</div>` : ''}
        </section>
        <section class="cartao">
          <h3>Temas dos projetos de lei</h3>
          <p class="muted">Toque num tema para ver os projetos.</p>
          ${listaTemas(linhas, { href: (t) => `#tipo-${estado.casa}-lei-${t}` })}
          ${totalLinhas > 8 ? `<button class="ver-todos" data-todos-temas>${estado.todosTemas ? 'Mostrar menos' : `Ver os ${totalLinhas} temas`}</button>` : ''}
        </section>
      </div>`;
  }

  // ================= Ranking =================
  function secaoRanking() {
    const ps = [...new Set(daCasa(estado.casa).map((p) => p.partido))].sort();
    if (!ps.includes(estado.partido)) estado.partido = '';
    const temas = Object.keys(dados.temas || {});
    return `
      <div class="secao-cab"><div><h2>Ranking ${DA_CASA[estado.casa]}</h2>
        <p>Score de 0 a 100 dos parlamentares de SP ${NA_CASA[estado.casa]}. Toque numa linha para ver o perfil completo.</p></div>
        <a class="btn btn-link" href="#partidos">Comparar partidos →</a></div>
      <div class="filtros">
        <div class="campo busca"><label class="visualmente-oculto" for="busca">Buscar parlamentar</label><input id="busca" type="search" placeholder="Buscar por nome" value="${esc(estado.busca)}" autocomplete="off"></div>
        <div class="campo"><label class="visualmente-oculto" for="partido">Partido</label><select id="partido"><option value="">Todos os partidos</option>${ps.map((p) => `<option${p === estado.partido ? ' selected' : ''}>${esc(p)}</option>`).join('')}</select></div>
        <div class="campo"><label class="visualmente-oculto" for="tema">Tema</label><select id="tema"><option value="">Todos os temas</option>${temas.map((t) => `<option value="${t}"${t === estado.tema ? ' selected' : ''}>${esc(rotTema(t))}</option>`).join('')}</select></div>
        <div class="campo"><label class="visualmente-oculto" for="ordem">Ordenar</label><select id="ordem">
          ${[['score', 'Maior score'], ['assiduidade', 'Maior presença'], ['aprovadas', 'Mais projetos aprovados'], ['cota', 'Menor gasto na cota'], ['cota_desc', 'Maior gasto na cota'], ['custo_desc', 'Maior custo estimado'], ['simbolicas', 'Menos projetos simbólicos'], ['amplia', 'Mais propostas que ampliam direitos'], ['restringe', 'Mais propostas que restringem direitos'], ['tema', 'Mais projetos no tema'], ['nome', 'Nome']]
            .map(([v, r]) => `<option value="${v}"${v === estado.ordem ? ' selected' : ''}>${r}</option>`).join('')}
        </select></div>
        <button class="btn" id="btn-pesos" aria-pressed="${estado.pesosAbertos}" aria-controls="pesos">Ajustar pesos</button>
      </div>
      <section class="pesos" id="pesos" ${estado.pesosAbertos ? '' : 'hidden'} aria-label="Pesos do score">
        <header><h3>Monte o seu score</h3><button class="btn" id="restaurar">Voltar aos pesos oficiais</button></header>
        <div class="pesos-grade">${Object.entries(dados.componentes).map(([k, c]) => `
          <div class="peso-ctrl"><label for="peso-${k}">${esc(c.rotulo)}</label><span id="peso-val-${k}">${pesos[k]}</span>
          <input type="range" id="peso-${k}" data-k="${k}" min="0" max="40" step="1" value="${pesos[k]}"></div>`).join('')}</div>
      </section>
      <p class="nota-casa" id="nota-casa">${notaCasa()}</p>
      <div class="cab-ranking" aria-hidden="true"><span></span><span></span><span>Parlamentar</span><span>Score</span><span>Critérios</span><span>Presença</span></div>
      <ol class="ranking" id="ranking">${linhasRanking()}</ol>`;
  }

  function notaCasa() {
    const c = dados.casas[estado.casa];
    if (!c) return '';
    if (c.status !== 'ok') return c.status === 'desatualizado' ? `A coleta desta semana falhou. Mostrando os dados de ${new Date(c.atualizado_em).toLocaleDateString('pt-BR')}.` : 'Dados desta casa ainda não disponíveis.';
    const comp = c.benchmark === 'nacional' ? `comparados com os ${c.referencia.n} parlamentares do país na mesma casa` : `comparados entre os ${c.referencia.n} da casa`;
    return `${c.nome}: ${comp}.${pesosAlterados() ? ' Ranking com os seus pesos.' : ''}`;
  }

  function linhasRanking() {
    const todos = daCasa(estado.casa).map((p) => ({ ...p, meu: scoreCom(p) }));
    const posicao = new Map(todos.filter((p) => p.meu != null).sort((a, b) => b.meu - a.meu).map((p, i) => [p.id, i + 1]));
    let lista = todos;
    if (estado.busca) {
      const q = estado.busca.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
      lista = lista.filter((p) => p.nome.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().includes(q));
    }
    if (estado.partido) lista = lista.filter((p) => p.partido === estado.partido);
    if (estado.tema) lista = lista.filter((p) => (p.proposicoes?.por_tema?.[estado.tema] || 0) > 0);
    const ult = (v) => (v == null ? -Infinity : v);
    const ordem = estado.ordem === 'tema' && !estado.tema ? 'score' : estado.ordem;
    lista.sort({
      score: (a, b) => ult(b.meu) - ult(a.meu),
      assiduidade: (a, b) => ult(b.presenca?.taxa) - ult(a.presenca?.taxa),
      aprovadas: (a, b) => ult(b.proposicoes?.substantivas_aprovadas) - ult(a.proposicoes?.substantivas_aprovadas),
      cota: (a, b) => (a.custos.cota_mensal_media ?? Infinity) - (b.custos.cota_mensal_media ?? Infinity),
      cota_desc: (a, b) => (b.custos.cota_mensal_media ?? -Infinity) - (a.custos.cota_mensal_media ?? -Infinity),
      custo_desc: (a, b) => (b.custos.custo_estimado_mensal ?? -Infinity) - (a.custos.custo_estimado_mensal ?? -Infinity),
      simbolicas: (a, b) => fracSimb(a.proposicoes) - fracSimb(b.proposicoes),
      amplia: (a, b) => impactoDe(b.proposicoes).amplia - impactoDe(a.proposicoes).amplia,
      restringe: (a, b) => impactoDe(b.proposicoes).restringe - impactoDe(a.proposicoes).restringe || ult(a.meu) - ult(b.meu),
      tema: (a, b) => (b.proposicoes?.por_tema?.[estado.tema] || 0) - (a.proposicoes?.por_tema?.[estado.tema] || 0),
      nome: (a, b) => a.nome.localeCompare(b.nome, 'pt-BR'),
    }[ordem]);
    if (!lista.length) return '<li class="vazio">Ninguém encontrado com esses filtros.</li>';
    const chaves = Object.keys(dados.componentes);
    const total = lista.length;
    const corte = estado.busca ? total : Math.min(total, estado.rankLimite);
    return lista.slice(0, corte).map((p) => {
      const barras = chaves.map((k) => {
        const v = p.score.componentes[k];
        const rot = dados.componentes[k].rotulo;
        return v == null ? `<i class="na" title="${esc(rot)}: sem dado"></i>` : `<i style="height:${Math.max(6, v)}%;background:${cor(v)}" title="${esc(rot)}: ${Math.round(v)}"></i>`;
      }).join('');
      const pr = p.proposicoes || {};
      const pt = pr.por_tema || {};
      let top = Object.entries(pt).filter(([t]) => t !== 'simbolica' && t !== 'outros').sort((a, b) => b[1] - a[1]).slice(0, 2).map(([t]) => t);
      if (estado.tema && estado.tema !== 'simbolica') top = [estado.tema, ...top.filter((t) => t !== estado.tema)].slice(0, 2);
      const tags = top.map((t) => `<em class="tag${t === estado.tema ? ' ativo' : ''}">${esc(rotTema(t))}${t === estado.tema ? ` ${fmt(pt[t])}` : ''}</em>`);
      if (fracSimb(pr) >= 0.25 || estado.tema === 'simbolica') tags.push(`<em class="tag tag-neg">${pct(fracSimb(pr))} simbólicos</em>`);
      if (impactoDe(pr).restringe) tags.push(`<em class="tag tag-neg">↓ ${fmt(impactoDe(pr).restringe)} restringe${impactoDe(pr).restringe > 1 ? 'm' : ''} direitos</em>`);
      return `<li><button class="linha" data-id="${esc(p.id)}" aria-label="Abrir perfil de ${esc(p.nome)}">
        <span class="pos">${posicao.get(p.id) ?? '–'}</span>
        ${foto(p)}
        <span class="quem"><strong>${esc(p.nome)}</strong><span>${esc(p.partido)}</span>${tags.length ? `<span class="tags">${tags.join('')}</span>` : ''}</span>
        <span class="score">${p.meu == null ? `<span class="sem-score">${esc(p.score.motivo_sem_score || 'Sem score')}</span>` : `<span class="valor">${n1(p.meu)}<small> /100</small></span><span class="trilho"><i style="width:${p.meu}%;background:${cor(p.meu)}"></i></span>`}</span>
        <span class="criterios" style="grid-template-columns:repeat(${chaves.length},1fr)" aria-label="Notas por critério">${barras}</span>
        <span class="dado"><b>${pct(p.presenca?.taxa)}</b><span>presença</span></span>
      </button></li>`;
    }).join('') + (corte < total ? `<li class="ranking-mais"><button class="btn" data-rank-mais>Mostrar todos os ${total}</button></li>` : '');
  }

  // ================= Proposições por tipo =================
  async function carregarTipos(casa) {
    if (tiposCache[casa]) return tiposCache[casa];
    try {
      const r = await fetch(`data/tipos-${casa}.json`);
      tiposCache[casa] = r.ok ? await r.json() : {};
    } catch { tiposCache[casa] = {}; }
    return tiposCache[casa];
  }

  async function viewTipo(casa, tipo, tema) {
    const recentes = await carregarTipos(casa);
    const porTipo = dados.casas[casa]?.bancada_sp?.por_tipo || {};
    const normativo = NORMATIVOS.has(tipo);
    const temas = normativo ? agregadoTipoTema(casa, tipo) : {};

    const autores = daCasa(casa).map((p) => {
      let n = p.proposicoes?.por_tipo?.[tipo] || 0;
      let ap = null;
      if (normativo) {
        const tt = p.proposicoes?.por_tipo_tema_status?.[tipo] || {};
        const alvo = tema ? { [tema]: tt[tema] || {} } : tt;
        n = Object.values(alvo).reduce((a, st) => a + soma(st), 0);
        ap = Object.values(alvo).reduce((a, st) => a + (st.aprovada || 0), 0);
      }
      return { p, n, ap };
    }).filter((a) => a.n > 0).sort((a, b) => b.n - a.n);
    const total = autores.reduce((a, x) => a + x.n, 0);

    const st = { total: 0 };
    if (normativo) for (const [t, r] of Object.entries(temas)) if (!tema || t === tema) for (const [k, v] of Object.entries(r)) st[k] = (st[k] || 0) + v;

    const nomeDe = new Map(daCasa(casa).map((p) => [p.id, p]));
    const itens = (recentes[tipo] || []).filter((x) => !tema || x.tema === tema).slice(0, 40);
    const tiposOrdenados = Object.entries(porTipo).sort((a, b) => b[1] - a[1]);
    const sobre = tema ? ` sobre ${rotTema(tema).toLowerCase()}` : '';

    return `
      <div class="wrap">
        <nav class="migalhas" aria-label="Você está em">
          <a href="#inicio">Proposições</a><span class="sep">/</span>
          ${tema ? `<a href="#tipo-${casa}-${tipo}">${esc(rotTipo(tipo))}</a>` : `<span${tema ? '' : ' aria-current="page"'}>${esc(rotTipo(tipo))}</span>`}<span class="sep">/</span>
          <span${tema ? ' aria-current="page"' : ''}>${esc(tema ? rotTema(tema) : 'Todos os temas')}</span>
        </nav>
        <div class="pag-cab">
          <h1>${esc(TITULO_TIPO[tipo] || rotTipo(tipo))}${esc(sobre)} ${esc(NA_CASA[casa])}</h1>
          <p class="lead">${esc(EXPLICA_TIPO[tipo] || '')}</p>
          <div class="controles">${segmentos(CASAS, casa, 'data-tipo-casa')}</div>
          <div class="chips" aria-label="Outros tipos de proposição">${tiposOrdenados.map(([t, n]) => `<a href="#tipo-${casa}-${t}"${t === tipo ? ' aria-current="page"' : ''}>${esc(rotTipo(t))} ${fmt(n)}</a>`).join('')}</div>
        </div>

        <div class="pilha">
        <section class="cartao">
          <h3>${normativo ? 'Do protocolo à aprovação' : 'Quanto foi apresentado'}</h3>
          <p class="muted">${normativo ? `Situação atual de tudo o que a bancada de SP apresentou ${NA_CASA[casa]}${esc(sobre)}.` : `Total apresentado pelos ${daCasa(casa).length} parlamentares de SP. Este tipo não passa por votação de aprovação.`}</p>
          ${normativo ? funil(st) : `<div class="kpis"><div class="kpi"><b>${fmt(total)}</b><span>apresentados</span></div><div class="kpi"><b>${fmt(autores.length)}</b><span>parlamentares apresentaram</span></div><div class="kpi"><b>${autores.length ? fmt(Math.round(total / autores.length)) : 0}</b><span>em média por parlamentar</span></div></div>`}
        </section>

        <div class="duas">
          ${normativo ? `<section class="cartao">
            <h3>Por tema</h3><p class="muted">Toque num tema para filtrar a página.</p>
            ${listaTemas(Object.entries(temas).map(([t, r]) => [t, r.total, r.aprovada || 0]).sort((a, b) => b[1] - a[1]), { href: (t) => (t === tema ? `#tipo-${casa}-${tipo}` : `#tipo-${casa}-${tipo}-${t}`), atual: tema })}
          </section>` : ''}
          <section class="cartao${normativo ? '' : ' cheia'}">
            <h3>Quem mais apresenta</h3><p class="muted">${autores.length} de ${daCasa(casa).length} parlamentares de SP ${NA_CASA[casa]}.</p>
            <ul class="autores">${autores.slice(0, 10).map(({ p, n, ap }) => `<li><a href="#p-${esc(p.id)}">${foto(p)}<span><b>${esc(p.nome)}</b> <span class="sub">${esc(p.partido)}</span></span><span class="n">${fmt(n)}</span><span class="barra" aria-hidden="true"><i class="b-pos" style="width:${(n / autores[0].n) * 100}%"></i>${ap ? `<i class="b-aprov" style="width:${(ap / autores[0].n) * 100}%"></i>` : ''}</span></a></li>`).join('') || '<li class="vazio">Ninguém apresentou.</li>'}</ul>
          </section>
        </div>

        <section class="cartao">
          <h3>Mais recentes</h3>
          <p class="muted">${itens.length ? `Os ${itens.length} mais recentes da bancada de SP.` : 'Sem itens recentes para mostrar.'}</p>
          <ul class="props">${itens.map((x) => itemProposta(x, nomeDe.get(x.autor))).join('')}</ul>
        </section>
        </div>
      </div>`;
  }

  function funil(st) {
    const total = st.total || 0;
    if (!total) return '<p class="vazio">Nada apresentado.</p>';
    const etapas = [
      ['Apresentados', 'tudo o que foi protocolado', total, 'var(--accent)', 1],
      ['Em tramitação', 'aguardam análise ou votação', st.andamento || 0, 'var(--accent)', 0.5],
      ['Aprovados na casa', 'inclui os enviados à outra casa ou à sanção', st.aprovada || 0, 'var(--good)', 1],
      ['Arquivados ou retirados', 'saíram de tramitação sem votação', st.arquivada || 0, 'var(--faint)', 1],
      ['Rejeitados', 'derrotados ou prejudicados', st.rejeitada || 0, 'var(--bad)', 1],
    ];
    return `<div class="funil">${etapas.map(([r, s, n, c, op]) => `
      <div class="etapa"><span class="rot">${r}<small>${s}</small></span>
      <span class="pista" aria-hidden="true"><i style="width:${n ? Math.max(1.5, (n / total) * 100) : 0}%;background:${c};opacity:${op}"></i></span>
      <span class="num">${fmt(n)}</span></div>`).join('')}</div>`;
  }

  function itemProposta(x, autor) {
    const id = `${esc(x.sigla)} ${esc(x.numero)}/${esc(x.ano)}`;
    let selo = '';
    if (x.status) { const [r, c] = STATUS[x.status] || STATUS.andamento; selo = `<span class="selo" style="--c:${c}">${r}</span>`; }
    const tema = x.tema ? `<em class="tag${grupoTema(x.tema) === 'neg' ? ' tag-neg' : ''}">${esc(rotTema(x.tema))}</em>` : '';
    const imp = x.impacto ? `<em class="tag-imp ${sinalImpacto(x.impacto) > 0 ? 'amplia' : 'restringe'}" title="Regra: ${esc(rotImpacto(x.impacto))}">${sinalImpacto(x.impacto) > 0 ? '↑' : '↓'} ${esc(rotImpacto(x.impacto))}</em>` : '';
    const data = x.data ? new Date(x.data + 'T12:00').toLocaleDateString('pt-BR') : '';
    return `<li class="prop">
      <span class="ident">${x.url ? `<a href="${esc(x.url)}" target="_blank" rel="noopener">${id}</a>` : `<b>${id}</b>`}
        ${autor ? `<a href="#p-${esc(autor.id)}" class="autor">${esc(autor.nome)}</a>` : ''}
        ${data ? `<span>${data}</span>` : ''}${tema}${imp}</span>
      ${selo}
      <span class="em">${esc(x.ementa)}</span></li>`;
  }

  // ================= Perfil =================
  function detalheComponente(k, p) {
    const pr = p.proposicoes || {};
    const c = p.custos || {};
    const ref = dados.casas[p.casa]?.referencia || {};
    switch (k) {
      case 'assiduidade': return p.presenca ? `${fmt(p.presenca.presentes)} de ${fmt(p.presenca.sessoes)} (${pct(p.presenca.taxa, 1)}). Mediana da casa: ${pct(ref.presenca_taxa, 1)}.` : 'Sem dado de presença para esta casa.';
      case 'agenda': {
        const pt = pr.por_tema || {};
        const g = (x) => Object.entries(pt).filter(([t]) => grupoTema(t) === x).reduce((a, [, n]) => a + n, 0);
        return `${g('prio')} em temas prioritários, ${g('rel')} em relevantes, ${g('comp')} complementares e ${pt.simbolica || 0} simbólicos, que tiram pontos.`;
      }
      case 'direitos': {
        const im = impactoDe(pr);
        return `${fmt(im.amplia)} propostas ampliam direitos ou qualidade de vida e ${fmt(im.restringe)} restringem direitos, em ${fmt(pr.substantivas)} projetos substantivos.`;
      }
      case 'producao': return `${fmt(pr.substantivas)} projetos substantivos como primeiro autor. Mediana da casa: ${ref.substantivas ?? '–'}.`;
      case 'efetividade': return `${fmt(pr.substantivas_aprovadas)} aprovados de ${fmt(pr.substantivas)}. Taxa mediana da casa: ${pct(ref.taxa_aprovacao, 1)}.`;
      case 'fiscalizacao': return `${fmt(pr.fiscalizacao)} pedidos de informação ou fiscalização. Mediana: ${ref.fiscalizacao ?? '–'}.`;
      case 'custo_cota': return c.cota_mensal_media != null ? `${brl(c.cota_mensal_media)} por mês. Mediana da casa: ${brl(ref.cota_mensal_media)}.` : 'Sem dado de cota.';
      case 'custo_pessoal': return c.assessores != null ? `${c.assessores} pessoas no gabinete. Mediana entre os de SP: ${ref.assessores_sp ?? '–'}.` : 'Sem dado de pessoal de gabinete.';
      default: return '';
    }
  }

  function sparkline(serie) {
    const pts = serie.filter(([, v]) => v != null);
    if (pts.length < 2) return '<p class="muted spark-vazio">A tendência aparece a partir da segunda semana de coleta.</p>';
    const W = 300, H = 64, pad = 6;
    const vs = pts.map(([, v]) => v);
    const min = Math.min(...vs) - 2, max = Math.max(...vs) + 2;
    const x = (i) => pad + (i / (pts.length - 1)) * (W - pad * 2);
    const y = (v) => H - pad - ((v - min) / (max - min || 1)) * (H - pad * 2);
    const d = pts.map(([, v], i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
    const u = pts[pts.length - 1];
    return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Score nas últimas ${pts.length} semanas">
      <path d="${d}L${x(pts.length - 1)},${H}L${x(0)},${H}Z" fill="var(--accent-soft)"/>
      <path d="${d}" fill="none" stroke="var(--accent)" stroke-width="2" vector-effect="non-scaling-stroke"/>
      <circle cx="${x(pts.length - 1)}" cy="${y(u[1])}" r="4" fill="var(--accent)"/></svg>`;
  }

  // Faixas horizontais com números grandes (perfil)
  function faixa(titulo, sub, itens, extra = '') {
    return `<section class="faixa-num">
      <header><h3>${titulo}</h3>${sub ? `<p>${sub}</p>` : ''}</header>
      <dl class="numeros">${itens.filter(Boolean).map(([v, r, nota, corV]) => `<div><dd${corV ? ` style="color:${corV}"` : ''}>${v}</dd><dt>${r}</dt>${nota ? `<span>${nota}</span>` : ''}</div>`).join('')}</dl>
      ${extra}
    </section>`;
  }

  function faixaPresenca(p) {
    const pr = p.presenca;
    const ref = dados.casas[p.casa]?.referencia || {};
    if (!pr) return faixa('Presença', 'Sem dado de presença para esta casa.', []);
    const aus = pr.sessoes - pr.presentes;
    const delta = ref.presenca_taxa != null ? pr.taxa - ref.presenca_taxa : null;
    const corTaxa = delta == null ? null : delta >= 0 ? 'var(--good)' : delta < -0.05 ? 'var(--bad)' : 'var(--mid)';
    return faixa('Presença', esc(pr.base), [
      [pct(pr.taxa, 1), 'de presença', delta == null ? '' : `${delta >= 0 ? '+' : '−'}${Math.abs(delta * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} pontos em relação à mediana`, corTaxa],
      [fmt(pr.presentes), 'presenças', `em ${fmt(pr.sessoes)} sessões ou votações`],
      [fmt(aus), 'ausências', pr.justificadas != null ? `${fmt(pr.justificadas)} justificadas` : 'justificativas não publicadas'],
      [pct(ref.presenca_taxa, 1), 'mediana da casa', `entre ${fmt(ref.n)} parlamentares`],
    ]);
  }

  function faixaCustos(p) {
    const c = p.custos || {};
    const ref = dados.casas[p.casa]?.referencia || {};
    const meses = Math.max(1, p.dias_em_exercicio / 30.44);
    const cats = Object.entries(c.cota_categorias || {}).slice(0, 6);
    const maxCat = cats[0]?.[1] || 1;
    const deltaCota = c.cota_mensal_media != null && ref.cota_mensal_media ? c.cota_mensal_media / ref.cota_mensal_media - 1 : null;
    const corCota = deltaCota == null ? null : deltaCota <= 0 ? 'var(--good)' : deltaCota > 0.15 ? 'var(--bad)' : 'var(--mid)';
    const extra = cats.length ? `<div class="gastos-grade">${cats.map(([k, v]) => `<div class="gasto"><span>${esc(k.charAt(0) + k.slice(1).toLowerCase())}</span><span>${brl(v)}</span><span class="trilho"><i style="width:${(v / maxCat) * 100}%"></i></span></div>`).join('')}</div>` : '';
    return faixa('Custos', 'Médias mensais desde o início do mandato.', [
      [brlMil(c.custo_estimado_mensal), 'custo estimado por mês', p.casa === 'camara' ? 'subsídio, cota e verba de gabinete' : 'subsídio e cota'],
      [brlMil(c.cota_mensal_media), 'cota parlamentar por mês', deltaCota == null ? '' : `${deltaCota <= 0 ? Math.round(-deltaCota * 100) + '% abaixo' : Math.round(deltaCota * 100) + '% acima'} da mediana de ${brlMil(ref.cota_mensal_media)}`, corCota],
      c.verba_gabinete_mensal != null ? [brlMil(c.verba_gabinete_mensal), 'verba de gabinete por mês', 'salários da equipe'] : null,
      [c.assessores ?? '–', 'pessoas no gabinete', ref.assessores_sp != null ? `mediana de SP: ${fmt(ref.assessores_sp)}` : ''],
      [brlMil(c.cota_total), 'cota no mandato', `em ${Math.round(meses)} meses`],
    ], extra);
  }

  async function viewPerfil(id) {
    const resumo = dados.parlamentares.find((p) => p.id === id);
    if (!resumo) return '<div class="wrap"><p class="vazio">Parlamentar não encontrado. <a href="#inicio">Voltar ao início</a></p></div>';
    let p;
    try {
      const r = await fetch(`data/p/${encodeURIComponent(id)}.json`);
      if (!r.ok) throw new Error(r.status);
      p = await r.json();
    } catch {
      return '<div class="wrap"><p class="vazio">Não foi possível carregar este perfil. Recarregue a página para tentar de novo.</p></div>';
    }
    estado.perfil = { filtro: 'todas', tema: '', limite: 15, lista: p.proposicoes?.lista || [] };
    const meu = scoreCom(resumo);
    const pr = p.proposicoes || { por_status: {}, lista: [] };
    const c = p.custos || {};
    const cats = Object.entries(c.cota_categorias || {}).slice(0, 6);
    const maxCat = cats[0]?.[1] || 1;
    const meses = Math.max(1, p.dias_em_exercicio / 30.44);
    const temasLinhas = Object.entries(pr.por_tema || {}).map(([t, n]) => [t, n, (pr.por_tema_aprovadas || {})[t] || 0]).sort((a, b) => b[1] - a[1]);
    const totalSt = soma(pr.por_status) || 1;
    const bancada = dados.casas[p.casa]?.bancada_sp?.por_tema || {};
    const simbBancada = soma(bancada) ? (bancada.simbolica || 0) / soma(bancada) : 0;
    const comps = Object.entries(dados.componentes).map(([k, cc]) => {
      const v = resumo.score.componentes[k];
      const ir = { agenda: 'prioritaria', direitos: (resumo.proposicoes?.impacto?.restringe ? 'restringe' : 'amplia'), producao: 'normativa', efetividade: 'aprovada', fiscalizacao: 'fiscalizacao' }[k];
      const tag = ir ? 'button' : 'div';
      return `<${tag} ${ir ? `type="button" data-filtro-ir="${ir}" title="Ver as propostas"` : ''} class="comp${ir ? ' comp-link' : ''}"><span class="rot">${esc(cc.rotulo)}${ir ? ' <i class="comp-seta" aria-hidden="true">→</i>' : ''}</span><span class="pct" style="color:${cor(v)}">${v == null ? '–' : Math.round(v)}</span>
        <span class="trilho"><i style="width:${v ?? 0}%;background:${cor(v)}"></i></span><span class="det">${esc(detalheComponente(k, p))}</span></${tag}>`;
    }).join('');

    return `
      <div class="wrap">
        <nav class="migalhas" aria-label="Você está em"><a href="#${p.casa}">Ranking ${DA_CASA[p.casa]}</a><span class="sep">/</span><span aria-current="page">${esc(p.nome)}</span></nav>
        <div class="perfil-cab">
          ${foto(resumo, 'xg')}
          <div><h1>${esc(p.nome)}</h1>
            <div class="meta"><a href="#partidos:${encodeURIComponent(p.partido)}" title="Ver análise do partido">${esc(p.partido)}</a><span>${esc(p.casa_nome)}</span><span>${fmt(Math.round(p.dias_em_exercicio))} dias em exercício</span>${p.url_oficial ? `<a href="${esc(p.url_oficial)}" target="_blank" rel="noopener">Página oficial</a>` : ''}</div>
          </div>
          <div class="placar">
            <div class="valor" style="color:${cor(meu)}">${meu == null ? '–' : n1(meu)}<small> /100</small></div>
            <div>${meu == null ? esc(resumo.score.motivo_sem_score || 'Sem score') : pesosAlterados() ? 'Com os seus pesos' : `${resumo.score.posicao}º de ${resumo.score.de} de SP ${NA_CASA[p.casa]}`}</div>
          </div>
        </div>

        <div class="pilha">
        ${faixaPresenca(p)}
        ${faixaCustos(p)}

        <div class="grade grade-2">
          <section class="cartao"><h3>Score por critério</h3><p class="muted">Nota de 0 a 100 em relação aos colegas da mesma casa. 50 é a mediana. Toque num critério para ver as propostas.</p><div class="comps">${comps}</div>
            <h4 class="sub-titulo">Tendência do score</h4>${sparkline(resumo.tendencia || [])}</section>
          <section class="cartao">
            <h3>Onde está o esforço</h3>
            <p class="muted">${pr.normativas ? `${pct(fracSimb(pr))} dos projetos são simbólicos. Na bancada de SP ${NA_CASA[p.casa]}, ${pct(simbBancada)}.` : 'Sem projetos de lei, PECs ou decretos no período.'}</p>
            ${nuvemTipos(pr.por_tipo, p.casa, { links: false })}
            ${pr.impacto ? `<h4 class="sub-titulo">Direção das propostas</h4>
            <div class="direcao">
              <button type="button" class="direcao-item amplia" data-filtro-ir="amplia"><b>${fmt(pr.impacto.amplia)}</b><span>ampliam direitos ou qualidade de vida</span></button>
              <button type="button" class="direcao-item restringe${pr.impacto.restringe ? '' : ' zero'}" data-filtro-ir="restringe"><b>${fmt(pr.impacto.restringe)}</b><span>restringem direitos</span></button>
            </div>
            <p class="muted direcao-nota">Toque para ver as propostas. <a href="#metodologia">Como classificamos</a></p>` : ''}
            <h4 class="sub-titulo">Temas dos projetos</h4>
            ${listaTemas(temasLinhas)}
          </section>
          <section class="cartao cheia">
            <h3>Propostas</h3>
            <p class="muted">${fmt(pr.normativas)} projetos de lei, PECs e decretos como primeiro autor (${fmt(pr.honorificas)} simbólicos), ${fmt(pr.fiscalizacao)} pedidos de fiscalização e ${fmt(pr.indicacoes)} indicações.</p>
            <div class="empilhada" role="img" aria-label="Situação dos projetos">${Object.entries(STATUS).map(([k, [r, cc]]) => (pr.por_status?.[k] ? `<i style="width:${(pr.por_status[k] / totalSt) * 100}%;background:${cc}" title="${r}: ${pr.por_status[k]}"></i>` : '')).join('')}</div>
            <div class="legenda">${Object.entries(STATUS).map(([k, [r, cc]]) => `<span style="--c:${cc}">${r} ${fmt(pr.por_status?.[k] || 0)}</span>`).join('')}</div>
            <div class="chips filtros-props" id="props-filtros">
              ${[['todas', 'Todas'], ['normativa', 'Substantivas'], ['prioritaria', 'Prioritárias'], ['aprovada', 'Aprovadas'], ['honorifica', 'Simbólicas'], ...(pr.impacto ? [['amplia', 'Ampliam direitos'], ['restringe', 'Restringem direitos']] : []), ['fiscalizacao', 'Fiscalização']].map(([k, r]) => `<button data-filtro="${k}" aria-pressed="${k === 'todas'}">${r}</button>`).join('')}
              <span class="campo"><label class="visualmente-oculto" for="tema-props">Tema</label><select id="tema-props"><option value="">Todos os temas</option>${temasLinhas.map(([t, n]) => `<option value="${t}">${esc(rotTema(t))} (${n})</option>`).join('')}</select></span>
            </div>
            <ul class="props" id="props">${listaPropsPerfil()}</ul>
          </section>
        </div>
        </div>
      </div>`;
  }

  function listaPropsPerfil() {
    const { filtro, tema, limite, lista } = estado.perfil;
    const f = { todas: () => true, normativa: (x) => x.categoria === 'normativa', prioritaria: (x) => x.categoria === 'normativa' && x.tema && grupoTema(x.tema) === 'prio', aprovada: (x) => x.status === 'aprovada', honorifica: (x) => x.categoria === 'honorifica', fiscalizacao: (x) => x.categoria === 'fiscalizacao',
      amplia: (x) => x.impacto && sinalImpacto(x.impacto) > 0, restringe: (x) => x.impacto && sinalImpacto(x.impacto) < 0 }[filtro];
    const itens = (lista || []).filter((x) => f(x) && (!tema || x.tema === tema));
    if (!itens.length) return '<li class="vazio">Nenhuma proposta neste filtro.</li>';
    return itens.slice(0, limite).map((x) => itemProposta(x)).join('') +
      (itens.length > limite ? `<li class="mais"><button class="btn" data-mais>Mostrar mais (${limite} de ${itens.length})</button></li>` : '');
  }

  // ================= Partidos =================
  const media = (xs) => { const v = xs.filter((x) => x != null && !Number.isNaN(x)); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  const somaCampo = (ms, f) => ms.reduce((a, p) => a + (f(p) || 0), 0);
  const n1s = (v) => (v == null ? '–' : (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toLocaleString('pt-BR', { maximumFractionDigits: 1, minimumFractionDigits: 1 }));
  const pctS = (v) => (v == null ? '–' : (v > 0 ? '+' : v < 0 ? '−' : '') + Math.round(Math.abs(v) * 100) + '%');
  function gruposDe(pr) {
    const g = { prio: 0, rel: 0, comp: 0, neg: 0 };
    for (const [t, n] of Object.entries(pr?.por_tema || {})) g[grupoTema(t)] += n;
    return g;
  }
  function cotaIdxDe(p) {
    const ref = dados.casas[p.casa]?.referencia?.cota_mensal_media;
    return p.custos?.cota_mensal_media != null && ref ? p.custos.cota_mensal_media / ref - 1 : null;
  }
  function membrosEscopo() { return estado.ptCasa === 'todas' ? dados.parlamentares : daCasa(estado.ptCasa); }

  function dadosPartidos() {
    const ms0 = membrosEscopo();
    const minimo = estado.ptCasa === 'senado' ? 1 : 2;
    const g = new Map();
    for (const p of ms0) { if (!g.has(p.partido)) g.set(p.partido, []); g.get(p.partido).push(p); }
    return [...g].map(([sigla, ms]) => {
      const sc = ms.map(scoreCom).filter((v) => v != null);
      const grupos = ms.reduce((a, p) => { const q = gruposDe(p.proposicoes); for (const k in a) a[k] += q[k]; return a; }, { prio: 0, rel: 0, comp: 0, neg: 0 });
      const normativas = somaCampo(ms, (p) => p.proposicoes?.normativas);
      return {
        sigla, membros: ms, n: ms.length, valido: ms.length >= minimo,
        score: media(sc), scoreMin: sc.length ? Math.min(...sc) : null, scoreMax: sc.length ? Math.max(...sc) : null,
        presenca: media(ms.map((p) => p.presenca?.taxa)),
        cotaIdx: media(ms.map(cotaIdxDe)),
        cota: media(ms.map((p) => p.custos?.cota_mensal_media)),
        assessores: media(ms.map((p) => p.custos?.assessores)),
        grupos, normativas,
        prioPor: grupos.prio / ms.length,
        simb: normativas ? grupos.neg / normativas : null,
        projPor: somaCampo(ms, (p) => p.proposicoes?.substantivas) / ms.length,
        aprovPor: somaCampo(ms, (p) => p.proposicoes?.substantivas_aprovadas) / ms.length,
        fiscPor: somaCampo(ms, (p) => p.proposicoes?.fiscalizacao) / ms.length,
        amplia: somaCampo(ms, (p) => p.proposicoes?.impacto?.amplia),
        restringe: somaCampo(ms, (p) => p.proposicoes?.impacto?.restringe),
        ...(() => {
          const subs = somaCampo(ms, (p) => p.proposicoes?.substantivas);
          const a = somaCampo(ms, (p) => p.proposicoes?.impacto?.amplia), r = somaCampo(ms, (p) => p.proposicoes?.impacto?.restringe);
          return { ampliaPct: subs ? a / subs : null, restringePor: r / ms.length, ampliaPor: a / ms.length };
        })(),
      };
    });
  }
  function mediaGeral() {
    const ms = membrosEscopo();
    const norm = somaCampo(ms, (p) => p.proposicoes?.normativas);
    const g = ms.reduce((a, p) => { const q = gruposDe(p.proposicoes); for (const k in a) a[k] += q[k]; return a; }, { prio: 0, rel: 0, comp: 0, neg: 0 });
    return {
      score: media(ms.map(scoreCom)), presenca: media(ms.map((p) => p.presenca?.taxa)), cotaIdx: media(ms.map(cotaIdxDe)),
      cota: media(ms.map((p) => p.custos?.cota_mensal_media)), prioPor: g.prio / (ms.length || 1), simb: norm ? g.neg / norm : null,
      projPor: somaCampo(ms, (p) => p.proposicoes?.substantivas) / (ms.length || 1),
    };
  }
  const umaCasa = () => estado.ptCasa !== 'todas';
  const fmtCota = (x) => (umaCasa() && x.cota != null ? `${brlMil(x.cota)}/mês` : `${pctS(x.cotaIdx)} vs mediana`);

  function viewPartidos() {
    return `<div id="pg-partidos">${conteudoPartidos()}</div>`;
  }

  function conteudoPartidos() {
    const L = dadosPartidos();
    const V = L.filter((x) => x.valido);
    const ms = membrosEscopo();
    const comScore = V.filter((x) => x.score != null).sort((a, b) => b.score - a.score);
    const maior = [...L].sort((a, b) => b.n - a.n)[0];
    const amplitude = comScore.length > 1 ? comScore[0].score - comScore[comScore.length - 1].score : null;
    const fora = L.filter((x) => !x.valido).length;
    const chips = [...L].sort((a, b) => b.n - a.n || a.sigla.localeCompare(b.sigla));
    return `
      <div class="wrap">
        <div class="pag-cab pt-cab">
          <h1>Análise por partido</h1>
          <p class="lead">Como cada partido de São Paulo entrega, gasta e escolhe suas pautas. Médias dos parlamentares de cada partido, com os mesmos dados e pesos do ranking.</p>
          <div class="controles">${segmentos([['todas', 'Todas', dados.parlamentares.length], ...CASAS.map(([id, r]) => [id, r, daCasa(id).length])], estado.ptCasa, 'data-pt-casa')}</div>
          <div class="heroi-numeros pt-numeros">
            <div><b>${fmt(L.length)}</b><span>partidos com mandato ${estado.ptCasa === 'todas' ? 'em SP' : NA_CASA[estado.ptCasa]}</span></div>
            <div><b>${maior ? esc(maior.sigla) : '–'}</b><span>maior bancada, com ${maior ? fmt(maior.n) : 0} parlamentares</span></div>
            <div><b>${amplitude == null ? '–' : n1(amplitude)}</b><span>pontos separam o melhor e o pior score médio</span></div>
          </div>
        </div>
        <section class="pt-escolha" aria-label="Escolha um partido">
          <p class="pt-rotulo">Escolha um partido para ver a ficha e destacá-lo em todos os gráficos</p>
          <div class="chips" id="pt-chips">${chips.map((x) => `<button type="button" data-partido-foco="${esc(x.sigla)}" aria-pressed="${x.sigla === estado.ptFoco}">${esc(x.sigla)} <span class="chip-n">${x.n}</span></button>`).join('')}</div>
          <div id="pt-ficha">${fichaPartido()}</div>
        </section>
      </div>

      <div class="faixa"><div class="wrap secao">
        <div class="secao-cab"><div><h2>Destaques entre os partidos</h2>
          <p>Os extremos em cada critério.${fora && estado.ptCasa !== 'senado' ? ` Partidos com um só parlamentar ficam de fora, porque a média de uma pessoa não representa o partido.` : ''}</p></div></div>
        ${destaquesPartidos(V)}
      </div></div>

      <div class="wrap secao">
        <div class="secao-cab"><div><h2>Quem entrega mais pelo que gasta</h2>
          <p>Cada bolha é um partido. Para cima, score médio maior; para a esquerda, gasto na cota menor que a mediana da casa. O tamanho da bolha acompanha o número de parlamentares.</p></div></div>
        <div class="cartao pt-mapa-cartao">${mapaPartidos(V)}</div>
      </div>

      <div class="wrap secao secao-div">
        <div class="secao-cab"><div><h2>Score médio e a distância dentro de cada partido</h2>
          <p>A barra mostra a média; cada ponto é um parlamentar. Partido com pontos espalhados tem gente muito boa e muito ruim na mesma bancada. Toque num ponto para abrir o perfil.</p></div></div>
        <div class="cartao">${dispersaoScore(comScore)}</div>
      </div>

      ${temImpacto() ? `<div class="wrap secao secao-div">
        <div class="secao-cab"><div><h2>Quem amplia e quem restringe direitos</h2>
          <p>Não basta propor muito: importa a direção. À direita, a fatia dos projetos que reduzem desigualdade, ampliam direitos ou criam política pública de qualidade de vida. À esquerda, as propostas que restringem direitos de minorias, retiram direitos conquistados ou enfraquecem a proteção ambiental. <a href="#metodologia">Veja as regras</a>.</p></div></div>
        <div class="cartao">${direitosPartidos(V)}</div>
      </div>` : ''}

      <div class="wrap secao secao-div">
        <div class="duas pt-duas">
          <section>
            <div class="secao-cab"><div><h2>Quem gasta mais e quem gasta menos</h2>
              <p>Gasto médio na cota parlamentar em relação à mediana da casa${umaCasa() ? '' : ', para comparar Câmara, Senado e ALESP na mesma régua'}.</p></div></div>
            <div class="cartao">${gastosPartidos(V)}</div>
          </section>
          <section>
            <div class="secao-cab"><div><h2>Quem mais propõe nas pautas para o povo</h2>
              <p>Projetos de lei, PECs e decretos por peso do tema. Ordenado por projetos em temas prioritários por parlamentar.</p></div></div>
            <div class="cartao">${pautasPartidos(V)}</div>
          </section>
        </div>
      </div>

      <div class="wrap secao secao-div">
        <div class="secao-cab"><div><h2>Todos os números</h2>
          <p>Toque no título de uma coluna para ordenar e num número para ver os projetos ou parlamentares por trás dele.</p></div></div>
        <div class="cartao pt-tabela-cartao" id="pt-tabela">${tabelaPartidos(L)}</div>
        <p class="pt-nota">O partido é a filiação atual informada pela casa. O score de cada parlamentar compara com colegas da mesma casa, então a média por partido pode juntar Câmara, Senado e ALESP. Gastos de casas diferentes são comparados pela distância até a mediana de cada casa. Se você mudar os pesos no ranking, esta página usa os seus pesos.</p>
      </div>
      <div class="pt-flutuante" id="pt-flut"${estado.ptFoco ? '' : ' hidden'}>${flutuante()}</div>`;
  }

  function flutuante() {
    return `<span>Em foco: <b>${esc(estado.ptFoco)}</b></span><button type="button" data-pt-ver>Ver ficha</button><button type="button" data-pt-limpar aria-label="Tirar o foco">✕</button>`;
  }

  // ---------- Ficha do partido: cada número abre o que está por trás dele ----------
  const detCache = {};
  const carregarDet = (id) => (detCache[id] ??= fetch(`data/p/${encodeURIComponent(id)}.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null));
  const temasDoGrupo = (g) => Object.keys(dados.temas || {}).filter((t) => grupoTema(t) === g).map(rotTema);

  // métricas: tipo 'pessoas' ordena os parlamentares; tipo 'projetos' lista as proposições
  const METRICAS = {
    score: { tipo: 'pessoas', titulo: 'Parlamentares por score', explica: 'Do maior para o menor score. Toque para abrir o perfil completo.',
      ord: (p) => scoreCom(p), val: (p) => n1(scoreCom(p)), cor: (p) => cor(scoreCom(p)) },
    presenca: { tipo: 'pessoas', titulo: 'Presença de cada parlamentar', explica: 'Do mais ao menos presente, nas sessões ou votações do mandato.',
      ord: (p) => p.presenca?.taxa, val: (p) => pct(p.presenca?.taxa, 1), sub: (p) => (p.presenca ? `${fmt(Math.round(p.presenca.taxa * p.presenca.sessoes))} de ${fmt(p.presenca.sessoes)}` : 'sem dado') },
    cota: { tipo: 'pessoas', titulo: 'Gasto com a cota parlamentar', explica: 'Média mensal, do maior para o menor gasto, comparada com a mediana da casa de cada um.',
      ord: (p) => p.custos?.cota_mensal_media, val: (p) => (p.custos?.cota_mensal_media != null ? `${brlMil(p.custos.cota_mensal_media)}/mês` : '–'),
      sub: (p) => { const i = cotaIdxDe(p); return i == null ? '' : `${pctS(i)} vs mediana ${DA_CASA[p.casa]}`; },
      cor: (p) => { const i = cotaIdxDe(p); return i == null ? null : i > 0.15 ? 'var(--bad)' : i <= 0 ? 'var(--good)' : 'var(--mid)'; } },
    prio: { tipo: 'projetos', titulo: 'Projetos em pautas prioritárias', explica: () => `Projetos de lei, PECs e decretos sobre ${temasDoGrupo('prio').join(', ').toLowerCase()}.`,
      f: (x) => x.categoria === 'normativa' && x.tema && grupoTema(x.tema) === 'prio' },
    simb: { tipo: 'projetos', titulo: 'Projetos simbólicos', explica: 'Nome de rua, data comemorativa, título de cidadão, utilidade pública e outras homenagens. Tiram pontos no score.',
      f: (x) => x.categoria === 'honorifica' || x.tema === 'simbolica' },
    amplia: { tipo: 'projetos', titulo: 'Propostas que ampliam direitos ou qualidade de vida', explica: 'Cada uma traz a regra que a classificou. As regras estão na metodologia.',
      f: (x) => x.impacto && sinalImpacto(x.impacto) > 0 },
    restringe: { tipo: 'projetos', titulo: 'Propostas que restringem direitos', explica: 'Cada uma traz a regra que a classificou. Confira a ementa e o texto oficial pelo link.',
      f: (x) => x.impacto && sinalImpacto(x.impacto) < 0 },
    subs: { tipo: 'projetos', titulo: 'Projetos substantivos', explica: 'Projetos de lei, PECs e decretos, sem contar os simbólicos.', f: (x) => x.categoria === 'normativa' },
    aprov: { tipo: 'projetos', titulo: 'Projetos aprovados', explica: 'Aprovados na casa ou transformados em norma.', f: (x) => x.status === 'aprovada' },
    fisc: { tipo: 'projetos', titulo: 'Pedidos de informação e fiscalização', explica: 'Requerimentos de informação e propostas de fiscalização do Executivo.', f: (x) => x.categoria === 'fiscalizacao' },
  };

  function fichaPartido() {
    const s = estado.ptFoco;
    if (!s) return '';
    const x = dadosPartidos().find((y) => y.sigla === s);
    if (!x) return `<div class="cartao pt-ficha"><p class="muted">${esc(s)} não tem parlamentares ${estado.ptCasa === 'todas' ? 'de SP' : NA_CASA[estado.ptCasa]}.</p></div>`;
    const G = mediaGeral();
    const casas = CASAS.map(([c, r]) => [r, x.membros.filter((p) => p.casa === c).length]).filter(([, n]) => n).map(([r, n]) => `${r} ${n}`).join(' · ');
    const delta = (v, ref, maiorMelhor, f) => {
      if (v == null || ref == null) return '';
      const d = v - ref;
      const bom = maiorMelhor ? d >= 0 : d <= 0;
      return `<span class="pt-delta ${Math.abs(d) < 1e-9 ? '' : bom ? 'bom' : 'ruim'}">${f(d)} vs média</span>`;
    };
    const tiles = [
      ['score', 'Score médio', n1(x.score), delta(x.score, G.score, true, n1s), x.score != null ? cor(x.score) : null],
      ['presenca', 'Presença média', pct(x.presenca, 1), delta(x.presenca, G.presenca, true, (d) => n1s(d * 100) + ' p.p.')],
      ['cota', umaCasa() ? 'Cota por mês' : 'Cota vs mediana', umaCasa() ? brlMil(x.cota) : pctS(x.cotaIdx), umaCasa() ? delta(x.cota, G.cota, false, (d) => (d >= 0 ? '+' : '−') + brlMil(Math.abs(d))) : delta(x.cotaIdx, G.cotaIdx, false, (d) => n1s(d * 100) + ' p.p.')],
      ['prio', 'Pautas prioritárias', n1(x.prioPor), delta(x.prioPor, G.prioPor, true, n1s), null, 'projetos por parlamentar'],
      ['simb', 'Projetos simbólicos', pct(x.simb), delta(x.simb, G.simb, false, (d) => n1s(d * 100) + ' p.p.')],
      ...(temImpacto() ? [
        ['amplia', 'Ampliam direitos', pct(x.ampliaPct), '', 'var(--good)', `${fmt(x.amplia)} propostas`],
        ['restringe', 'Restringem direitos', fmt(x.restringe), '', x.restringe ? 'var(--coral)' : null, 'propostas no mandato'],
      ] : []),
    ];
    const m = estado.ptMetrica in METRICAS ? estado.ptMetrica : 'score';
    return `<div class="cartao pt-ficha">
      <header class="pt-ficha-cab">
        <div><h2>${esc(x.sigla)}</h2><p class="muted">${fmt(x.n)} parlamentar${x.n > 1 ? 'es' : ''}${estado.ptCasa === 'todas' ? ` · ${casas}` : ` ${NA_CASA[estado.ptCasa]}`}${x.valido ? '' : ' · com uma só pessoa, a média não representa o partido'}</p></div>
        <button type="button" class="btn" data-pt-limpar>Fechar</button>
      </header>
      <p class="pt-dica">Toque num número para ver o que está por trás dele.</p>
      <div class="pt-tiles" role="group" aria-label="Indicadores do partido">${tiles.map(([k, r, v, d, c, sub]) => `<button type="button" class="pt-tile" data-pt-metrica="${k}" aria-pressed="${k === m}">
        <b${c ? ` style="color:${c}"` : ''}>${v}</b><span class="pt-tile-rot">${r}</span>${sub ? `<span class="pt-tile-sub">${sub}</span>` : ''}${d}<i class="pt-tile-seta" aria-hidden="true">→</i></button>`).join('')}</div>
      <div id="pt-detalhe" class="pt-detalhe" aria-live="polite"></div>
    </div>`;
  }

  async function renderDetalhe() {
    const el = document.getElementById('pt-detalhe');
    if (!el) return;
    const x = dadosPartidos().find((y) => y.sigla === estado.ptFoco);
    if (!x) { el.innerHTML = ''; return; }
    const k = estado.ptMetrica in METRICAS ? estado.ptMetrica : 'score';
    const M = METRICAS[k];
    const explica = typeof M.explica === 'function' ? M.explica() : M.explica;
    const cab = (n) => `<div class="pt-det-cab"><div><h3>${M.titulo}${n != null ? ` <span>${fmt(n)}</span>` : ''}</h3><p class="muted">${esc(explica)}</p></div></div>`;

    if (M.tipo === 'pessoas') {
      const ms = [...x.membros].sort((a, b) => (M.ord(b) ?? -Infinity) - (M.ord(a) ?? -Infinity));
      const lim = estado.ptMembros ? Infinity : 12;
      el.innerHTML = cab(null) + `<ul class="pt-membros">${ms.slice(0, lim).map((p) => `<li><a href="#p-${esc(p.id)}">${foto(p)}<span><b>${esc(p.nome)}</b><small>${rotCasa(p.casa)}${M.sub ? ` · ${esc(M.sub(p))}` : ''}</small></span><span class="pt-m-score"${M.cor ? ` style="color:${M.cor(p) || 'inherit'}"` : ''}>${M.val(p)}</span></a></li>`).join('')}</ul>
        ${ms.length > 12 ? `<button type="button" class="ver-todos" data-pt-membros>${estado.ptMembros ? 'Mostrar menos' : `Ver os ${ms.length} parlamentares`}</button>` : ''}`;
      return;
    }

    el.innerHTML = cab(null) + '<p class="vazio">Carregando as proposições…</p>';
    const token = (renderDetalhe.token = (renderDetalhe.token || 0) + 1);
    const dets = await Promise.all(x.membros.map((p) => carregarDet(p.id).then((d) => [p, d])));
    if (token !== renderDetalhe.token) return; // o usuário já trocou de métrica
    const itens = [];
    let truncado = false;
    for (const [p, d] of dets) {
      if (!d) continue;
      if (d.proposicoes?.lista_truncada) truncado = true;
      for (const it of d.proposicoes?.lista || []) if (M.f(it)) itens.push([it, p]);
    }
    itens.sort((a, b) => String(b[0].data || b[0].ano).localeCompare(String(a[0].data || a[0].ano)));
    const porAutor = {};
    for (const [, p] of itens) porAutor[p.id] = (porAutor[p.id] || 0) + 1;
    const autores = Object.entries(porAutor).sort((a, b) => b[1] - a[1]).map(([id, n]) => [x.membros.find((p) => p.id === id), n]);
    const filtroAutor = estado.ptAutor && porAutor[estado.ptAutor] ? estado.ptAutor : '';
    const lista = filtroAutor ? itens.filter(([, p]) => p.id === filtroAutor) : itens;
    const lim = estado.ptLimite;
    el.innerHTML = cab(itens.length) + (itens.length ? `
      ${autores.length > 1 ? `<div class="chips pt-autores" aria-label="Filtrar por autor"><button type="button" data-pt-autor="" aria-pressed="${!filtroAutor}">Todos</button>${autores.map(([p, n]) => `<button type="button" data-pt-autor="${esc(p.id)}" aria-pressed="${p.id === filtroAutor}">${esc(p.nome)} <span class="chip-n">${n}</span></button>`).join('')}</div>` : ''}
      <ul class="props">${lista.slice(0, lim).map(([it, p]) => itemProposta(it, p)).join('')}</ul>
      ${lista.length > lim ? `<button type="button" class="btn mais" data-pt-mais>Mostrar mais (${fmt(lim)} de ${fmt(lista.length)})</button>` : ''}
      ${truncado ? '<p class="pt-nota">Para quem tem muitas proposições, o site guarda as 400 mais recentes de cada parlamentar; os totais dos números acima consideram todas.</p>' : ''}`
      : '<p class="vazio">Nenhuma proposição nesta categoria.</p>');
  }

  /** Abre a ficha de um partido já na métrica pedida (usado pelos destaques, gráficos e tabela). */
  function abrirFicha(sigla, metrica) {
    estado.ptFoco = sigla; estado.ptMetrica = metrica || 'score'; estado.ptLimite = 25; estado.ptAutor = ''; estado.ptMembros = false;
    atualizarFoco();
    document.getElementById('pt-ficha')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function destaquesPartidos(V) {
    const ok = (f) => V.filter((x) => f(x) != null);
    const ext = (f, asc) => ok(f).sort((a, b) => (asc ? f(a) - f(b) : f(b) - f(a)))[0];
    const cartao = (x, rotulo, valor, sub, met) => (x ? `<button type="button" class="pt-dest" data-pt-abrir="${esc(x.sigla)}|${met}" data-pt="${esc(x.sigla)}">
      <span class="pt-dest-rot">${rotulo}</span><span class="pt-dest-sigla${x.sigla.length > 8 ? ' l2' : x.sigla.length > 5 ? ' l1' : ''}">${esc(x.sigla)}</span><span class="pt-dest-val">${valor}</span><span class="pt-dest-sub">${sub(x)}</span></button>` : '');
    const nP = (x) => `${x.n} parlamentar${x.n > 1 ? 'es' : ''}`;
    const bons = [
      cartao(ext((x) => x.score), 'Maior score médio', n1(ext((x) => x.score)?.score), nP, 'score'),
      cartao(ext((x) => x.cotaIdx, true), 'Gasta menos na cota', fmtCota(ext((x) => x.cotaIdx, true) || {}), nP, 'cota'),
      temImpacto() ? cartao(ext((x) => x.ampliaPct), 'Mais propostas que ampliam direitos', `${pct(ext((x) => x.ampliaPct)?.ampliaPct)} dos projetos`, nP, 'amplia') : '',
      cartao(ext((x) => x.prioPor), 'Mais pautas prioritárias', `${n1(ext((x) => x.prioPor)?.prioPor)} por parlamentar`, nP, 'prio'),
    ];
    const ruins = [
      cartao(ext((x) => x.score, true), 'Menor score médio', n1(ext((x) => x.score, true)?.score), nP, 'score'),
      cartao(ext((x) => x.cotaIdx), 'Gasta mais na cota', fmtCota(ext((x) => x.cotaIdx) || {}), nP, 'cota'),
      temImpacto() ? cartao(ext((x) => (x.restringe ? x.restringePor : null)), 'Mais propostas que restringem direitos', (() => { const y = ext((x) => (x.restringe ? x.restringePor : null)); return y ? `${fmt(y.restringe)} proposta${y.restringe > 1 ? 's' : ''}` : ''; })(), nP, 'restringe') : '',
      cartao(ext((x) => x.simb), 'Mais projetos simbólicos', `${pct(ext((x) => x.simb)?.simb)} dos projetos`, nP, 'simb'),
    ];
    if (V.length < 2) return '<p class="vazio">Poucos partidos para comparar nesta casa.</p>';
    return `<div class="podios">
      <section class="podio bem"><div class="podio-titulo"><h3>Manda Bem</h3><p>Melhores médias</p></div><div class="pt-dest-grade">${bons.join('')}</div></section>
      <section class="podio serio"><div class="podio-titulo"><h3>Sério mesmo???</h3><p>Piores médias</p></div><div class="pt-dest-grade">${ruins.join('')}</div></section>
    </div>`;
  }

  function mapaPartidos(V) {
    const L = V.filter((x) => x.score != null && x.cotaIdx != null);
    if (L.length < 2) return '<p class="vazio">Poucos partidos para montar o mapa nesta casa.</p>';
    const estreito = window.innerWidth < 640;
    const W = estreito ? 420 : 960, H = estreito ? 460 : 520;
    const m = { l: estreito ? 36 : 52, r: 16, t: 16, b: estreito ? 52 : 56 };
    const ax = Math.max(0.15, ...L.map((x) => Math.abs(x.cotaIdx))) * 1.2;
    const ys = L.map((x) => x.score);
    const y0 = Math.max(0, Math.floor((Math.min(45, ...ys) - 4) / 5) * 5);
    const y1 = Math.min(100, Math.ceil((Math.max(55, ...ys) + 4) / 5) * 5);
    const X = (v) => m.l + ((v + ax) / (2 * ax)) * (W - m.l - m.r);
    const Y = (v) => m.t + (1 - (v - y0) / (y1 - y0)) * (H - m.t - m.b);
    const maxN = Math.max(...L.map((x) => x.n));
    const R = (n) => (estreito ? 6 : 9) + (estreito ? 14 : 22) * Math.sqrt(n / maxN);
    const cx = X(0), cy = Y(50);
    const passo = ax > 0.6 ? 0.25 : ax > 0.3 ? 0.1 : 0.05;
    const tx = [];
    for (let v = -Math.floor(ax / passo) * passo; v <= ax + 1e-9; v += passo) tx.push(Math.round(v * 100) / 100);
    const ty = [];
    for (let v = y0; v <= y1; v += y1 - y0 > 40 ? 10 : 5) ty.push(v);
    const fs = estreito ? 11 : 12;
    const quad = (x, y, anchor, txt, cls) => `<text x="${x}" y="${y}" text-anchor="${anchor}" class="pt-quad ${cls}">${txt}</text>`;
    // rótulos: dentro da bolha quando cabe; senão ao lado, com desvio simples de colisão
    const ordem = [...L].sort((a, b) => b.n - a.n);
    // rótulos: testa posições em volta da bolha e fica com a primeira livre
    const bate = (a, b) => a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3];
    const bolhas = ordem.map((x) => { const r = R(x.n); return [X(x.cotaIdx) - r * 0.8, Y(x.score) - r * 0.8, r * 1.6, r * 1.6, x.sigla]; });
    const colocados = [];
    const rotulos = [...ordem].reverse().map((x) => {
      const r = R(x.n), bx = X(x.cotaIdx), by = Y(x.score);
      const w = x.sigla.length * fs * 0.66, h = fs + 2;
      const cands = [];
      if (r * 2 > w + 8) cands.push([bx - w / 2, by - h / 2, true]);
      cands.push([bx + r + 4, by - h / 2], [bx - r - 4 - w, by - h / 2], [bx - w / 2, by - r - 3 - h], [bx - w / 2, by + r + 3],
        [bx + r * 0.7, by - r * 0.7 - h], [bx + r * 0.7, by + r * 0.7], [bx - r * 0.7 - w, by - r * 0.7 - h], [bx - r * 0.7 - w, by + r * 0.7]);
      const livre = (c) => { const k = [c[0], c[1], w, h]; return k[0] >= m.l && k[0] + w <= W - m.r && k[1] >= m.t && k[1] + h <= H - m.b
        && !colocados.some((o) => bate(o, k)) && !bolhas.some((b) => b[4] !== x.sigla && bate(b, k)); };
      const c = cands.find(livre) || cands.find((c2) => !colocados.some((o) => bate(o, [c2[0], c2[1], w, h]))) || cands[0];
      colocados.push([c[0], c[1], w, h]);
      return { x, tx: c[0] + w / 2, ty: c[1] + h - 3, dentro: !!c[2] };
    });
    return `<svg class="pt-mapa" viewBox="0 0 ${W} ${H}" role="img" aria-label="Mapa dos partidos: score médio por gasto na cota em relação à mediana">
      <rect x="${m.l}" y="${m.t}" width="${cx - m.l}" height="${cy - m.t}" class="pt-q-bom"/>
      <rect x="${cx}" y="${cy}" width="${W - m.r - cx}" height="${H - m.b - cy}" class="pt-q-ruim"/>
      ${ty.map((v) => `<line x1="${m.l}" x2="${W - m.r}" y1="${Y(v)}" y2="${Y(v)}" class="pt-grade"/><text x="${m.l - 8}" y="${Y(v) + 4}" text-anchor="end" class="pt-eixo">${v}</text>`).join('')}
      ${tx.map((v) => `<line y1="${m.t}" y2="${H - m.b}" x1="${X(v)}" x2="${X(v)}" class="pt-grade"/><text x="${X(v)}" y="${H - m.b + 18}" text-anchor="middle" class="pt-eixo">${v === 0 ? 'mediana' : pctS(v)}</text>`).join('')}
      <line x1="${cx}" x2="${cx}" y1="${m.t}" y2="${H - m.b}" class="pt-meio"/><line x1="${m.l}" x2="${W - m.r}" y1="${cy}" y2="${cy}" class="pt-meio"/>
      ${quad(m.l + 10, m.t + 20, 'start', 'Entrega mais e gasta menos', 'bom')}
      ${quad(W - m.r - 10, H - m.b - 12, 'end', 'Entrega menos e gasta mais', 'ruim')}
      ${estreito ? '' : quad(W - m.r - 10, m.t + 20, 'end', 'Entrega mais e gasta mais', '') + quad(m.l + 10, H - m.b - 12, 'start', 'Entrega menos e gasta menos', '')}
      <text x="${m.l}" y="${H - 8}" class="pt-eixo-t">← gasta menos</text><text x="${W - m.r}" y="${H - 8}" text-anchor="end" class="pt-eixo-t">gasta mais →</text>
      <text x="${m.l - (estreito ? 28 : 40)}" y="${m.t - 2}" class="pt-eixo-t" transform="rotate(-90 ${m.l - (estreito ? 28 : 40)} ${m.t - 2})" text-anchor="end">score médio</text>
      ${ordem.map((x) => `<g class="pt-bolha" data-pt="${esc(x.sigla)}" data-partido-foco="${esc(x.sigla)}" tabindex="0" role="button" aria-label="${esc(x.sigla)}: score ${n1(x.score)}, cota ${pctS(x.cotaIdx)} da mediana">
        <title>${esc(x.sigla)} · ${x.n} parlamentares · score médio ${n1(x.score)} · cota ${fmtCota(x)}</title>
        <circle cx="${X(x.cotaIdx)}" cy="${Y(x.score)}" r="${R(x.n)}" style="fill:${cor(x.score)}"/></g>`).join('')}
      ${rotulos.map((r) => `<text x="${r.tx}" y="${r.ty}" text-anchor="middle" class="pt-rot${r.dentro ? ' dentro' : ''}" data-pt="${esc(r.x.sigla)}" style="font-size:${fs}px">${esc(r.x.sigla)}</text>`).join('')}
    </svg>`;
  }

  function dispersaoScore(L) {
    if (!L.length) return '<p class="vazio">Sem score para comparar.</p>';
    return `<div class="pt-disp">
      <div class="pt-disp-eixo" aria-hidden="true"><span></span><span class="pt-escala">${[0, 25, 50, 75, 100].map((v) => `<i style="left:${v}%">${v}</i>`).join('')}</span><span></span></div>
      ${L.map((x) => `<div class="pt-disp-linha" data-pt="${esc(x.sigla)}">
        <button type="button" class="pt-sigla" data-partido-foco="${esc(x.sigla)}">${esc(x.sigla)}<small>${x.n}</small></button>
        <span class="pt-trilho">
          <i class="pt-mediana" style="left:50%"></i>
          <i class="pt-media" style="width:${x.score}%;background:${cor(x.score)}"></i>
          ${x.membros.map((p) => { const v = scoreCom(p); return v == null ? '' : `<a class="pt-ponto" href="#p-${esc(p.id)}" style="left:${v}%" title="${esc(p.nome)} (${rotCasa(p.casa)}): ${n1(v)}"><span class="visualmente-oculto">${esc(p.nome)}</span></a>`; }).join('')}
        </span>
        <span class="pt-valor" style="color:${cor(x.score)}">${n1(x.score)}</span>
      </div>`).join('')}
      <div class="legenda"><span style="--c:var(--good)">Média 60 ou mais</span><span style="--c:var(--mid)">40 a 60</span><span style="--c:var(--bad)">Abaixo de 40</span><span class="leg-ponto">Cada parlamentar</span></div>
    </div>`;
  }

  function direitosPartidos(V) {
    const L = V.filter((x) => x.normativas > 0).sort((a, b) => (b.ampliaPct ?? 0) - 2 * b.restringePor - ((a.ampliaPct ?? 0) - 2 * a.restringePor) || b.ampliaPct - a.ampliaPct);
    if (!L.length) return '<p class="vazio">Sem projetos no período.</p>';
    const maxA = Math.max(0.05, ...L.map((x) => x.ampliaPct || 0));
    const maxR = Math.max(1, ...L.map((x) => x.restringe));
    return `<div class="pt-barras">
      <div class="pt-dir-cab" aria-hidden="true"><span></span><span class="ruim">restringem direitos</span><span></span><span class="bom">ampliam direitos</span><span></span></div>
      ${L.map((x) => `<div class="pt-dir-linha" data-pt="${esc(x.sigla)}">
        <button type="button" class="pt-sigla" data-partido-foco="${esc(x.sigla)}">${esc(x.sigla)}<small>${x.n}</small></button>
        <span class="pt-dir-n ruim">${x.restringe ? `<button type="button" class="pt-num-link ruim" data-pt-abrir="${esc(x.sigla)}|restringe" title="Ver as propostas">${fmt(x.restringe)}</button>` : ''}</span>
        <span class="pt-dir"><span class="esq">${x.restringe ? `<i style="width:${(x.restringe / maxR) * 100}%"></i>` : ''}</span><span class="dir"><i style="width:${((x.ampliaPct || 0) / maxA) * 100}%"></i></span></span>
        <span class="pt-dir-n bom"><button type="button" class="pt-num-link bom" data-pt-abrir="${esc(x.sigla)}|amplia" title="Ver as propostas">${pct(x.ampliaPct)}</button></span>
      </div>`).join('')}
      <div class="legenda"><span style="--c:var(--coral)">Propostas que restringem (total)</span><span style="--c:var(--good)">Fatia dos projetos que ampliam</span></div>
    </div>`;
  }

  function gastosPartidos(V) {
    const L = V.filter((x) => x.cotaIdx != null).sort((a, b) => b.cotaIdx - a.cotaIdx);
    if (!L.length) return '<p class="vazio">Sem dados de cota.</p>';
    const ax = Math.max(0.1, ...L.map((x) => Math.abs(x.cotaIdx)));
    return `<div class="pt-barras">
      <div class="pt-div-cab" aria-hidden="true"><span></span><span><b class="bom">gasta menos</b><b>mediana</b><b class="ruim">gasta mais</b></span><span></span></div>
      ${L.map((x) => {
        const w = (Math.abs(x.cotaIdx) / ax) * 50;
        return `<div class="pt-div-linha" data-pt="${esc(x.sigla)}">
          <button type="button" class="pt-sigla" data-partido-foco="${esc(x.sigla)}">${esc(x.sigla)}<small>${x.n}</small></button>
          <span class="pt-div"><i class="${x.cotaIdx > 0 ? 'ruim' : 'bom'}" style="${x.cotaIdx > 0 ? 'left' : 'right'}:50%;width:${w}%"></i></span>
          <button type="button" class="pt-valor pt-num-link" data-pt-abrir="${esc(x.sigla)}|cota" title="Ver o gasto de cada parlamentar"><b class="${x.cotaIdx > 0 ? 'ruim' : 'bom'}">${pctS(x.cotaIdx)}</b>${umaCasa() && x.cota != null ? `<small>${brlMil(x.cota)}/mês</small>` : ''}</button>
        </div>`;
      }).join('')}
    </div>`;
  }

  function pautasPartidos(V) {
    const L = V.filter((x) => x.normativas > 0).sort((a, b) => b.prioPor - a.prioPor);
    if (!L.length) return '<p class="vazio">Sem projetos no período.</p>';
    const cores = { prio: 'var(--accent)', rel: 'color-mix(in srgb, var(--accent) 45%, var(--surface))', comp: 'color-mix(in srgb, var(--faint) 45%, var(--surface))', neg: 'var(--coral)' };
    return `<div class="pt-barras">
      ${L.map((x) => {
        const tot = soma(x.grupos) || 1;
        return `<div class="pt-pauta-linha" data-pt="${esc(x.sigla)}">
          <button type="button" class="pt-sigla" data-partido-foco="${esc(x.sigla)}">${esc(x.sigla)}<small>${x.n}</small></button>
          <span class="pt-pilha" title="${esc(x.sigla)}: ${x.grupos.prio} prioritários, ${x.grupos.rel} relevantes, ${x.grupos.comp} complementares, ${x.grupos.neg} simbólicos">
            ${['prio', 'rel', 'comp', 'neg'].map((k) => (x.grupos[k] ? `<i style="width:${(x.grupos[k] / tot) * 100}%;background:${cores[k]}"></i>` : '')).join('')}
          </span>
          <button type="button" class="pt-valor pt-num-link" data-pt-abrir="${esc(x.sigla)}|prio" title="Ver os projetos"><b>${n1(x.prioPor)}</b><small>prioritários/parl.</small></button>
        </div>`;
      }).join('')}
      <div class="legenda"><span style="--c:${cores.prio}">Prioritários</span><span style="--c:${cores.rel}">Relevantes</span><span style="--c:${cores.comp}">Complementares</span><span style="--c:${cores.neg}">Simbólicos</span></div>
    </div>`;
  }

  const MET_COL = { n: 'score', score: 'score', presenca: 'presenca', cotaIdx: 'cota', projPor: 'subs', prioPor: 'prio', aprovPor: 'aprov', simb: 'simb', fiscPor: 'fisc', ampliaPct: 'amplia', restringe: 'restringe' };
  function tabelaPartidos(L = dadosPartidos()) {
    const cols = [
      ['n', 'Parlamentares', (x) => x.n, fmt, 'neutro'],
      ['score', 'Score médio', (x) => x.score, n1, 'maior'],
      ['presenca', 'Presença', (x) => x.presenca, (v) => pct(v, 1), 'maior'],
      ['cotaIdx', umaCasa() ? 'Cota por mês' : 'Cota vs mediana', (x) => x.cotaIdx, (v, x) => (umaCasa() ? brlMil(x.cota) : pctS(v)), 'menor'],
      ['projPor', 'Projetos substantivos', (x) => x.projPor, n1, 'maior'],
      ['prioPor', 'Pautas prioritárias', (x) => x.prioPor, n1, 'maior'],
      ['aprovPor', 'Aprovados', (x) => x.aprovPor, n1, 'maior'],
      ['simb', 'Simbólicos', (x) => x.simb, (v) => pct(v), 'menor'],
      ...(temImpacto() ? [['ampliaPct', 'Ampliam direitos', (x) => x.ampliaPct, (v) => pct(v), 'maior'], ['restringe', 'Restringem direitos', (x) => x.restringe, fmt, 'menor']] : []),
      ['fiscPor', 'Fiscalização', (x) => x.fiscPor, n1, 'maior'],
    ];
    const [k, dir] = estado.ptOrdem;
    const col = cols.find((c) => c[0] === k) || cols[1];
    const lista = [...L].sort((a, b) => {
      if (a.valido !== b.valido) return a.valido ? -1 : 1;
      const va = col[2](a), vb = col[2](b);
      if (va == null) return 1; if (vb == null) return -1;
      return dir === 'asc' ? va - vb : vb - va;
    });
    const ext = Object.fromEntries(cols.map(([key, , f]) => { const vs = L.filter((x) => x.valido).map(f).filter((v) => v != null); return [key, [Math.min(...vs), Math.max(...vs)]]; }));
    const larg = (key, v) => {
      const [a, b] = ext[key];
      if (v == null || !Number.isFinite(a) || !b) return 0;
      return a >= 0 ? (v / b) * 100 : b === a ? 100 : ((v - a) / (b - a)) * 100;
    };
    return `<div class="pt-tabela-rolagem"><table class="pt-tabela">
      <thead><tr><th scope="col">Partido</th>${cols.map(([key, r]) => `<th scope="col" aria-sort="${key === k ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}"><button type="button" data-pt-ord="${key}">${r}${key === k ? (dir === 'asc' ? ' ↑' : ' ↓') : ''}</button></th>`).join('')}</tr></thead>
      <tbody>${lista.map((x) => `<tr data-pt="${esc(x.sigla)}"${x.valido ? '' : ' class="pt-fraco"'}>
        <th scope="row"><button type="button" class="pt-sigla" data-partido-foco="${esc(x.sigla)}">${esc(x.sigla)}</button></th>
        ${cols.map(([key, , f, fm, sentido]) => { const v = f(x); const met = MET_COL[key]; const cel = `<span class="pt-cel ${sentido}" style="--w:${x.valido ? larg(key, v) : 0}%">${fm(v, x)}</span>`; return `<td>${met ? `<button type="button" class="pt-cel-btn" data-pt-abrir="${esc(x.sigla)}|${met}" title="Ver detalhes">${cel}</button>` : cel}</td>`; }).join('')}
      </tr>`).join('')}</tbody></table></div>
      ${L.some((x) => !x.valido) ? '<p class="pt-nota">Em cinza, partidos com um só parlamentar.</p>' : ''}`;
  }

  function aplicarFoco() {
    const f = estado.ptFoco;
    document.querySelectorAll('#pg-partidos [data-pt]').forEach((el) => {
      el.classList.toggle('apagado', !!f && el.dataset.pt !== f);
      el.classList.toggle('em-foco', !!f && el.dataset.pt === f);
    });
    document.querySelectorAll('#pt-chips [data-partido-foco]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.partidoFoco === f));
    const fl = $('#pt-flut');
    if (fl) { fl.hidden = !f; fl.innerHTML = f ? flutuante() : ''; }
  }
  function atualizarFoco() {
    rerender('pt-ficha', fichaPartido);
    renderDetalhe();
    aplicarFoco();
    history.replaceState(null, '', '#partidos' + (estado.ptFoco ? ':' + encodeURIComponent(estado.ptFoco) : ''));
  }

  // ================= Metodologia =================
  function viewMetodologia() {
    const total = Object.values(pesosOficiais).reduce((a, b) => a + b, 0);
    const grupos = {};
    for (const [t, v] of Object.entries(dados.temas || {})) (grupos[grupoTema(t)] ??= { peso: v.peso, temas: [] }).temas.push(v.rotulo);
    return `
      <div class="wrap metodo">
        <h1>Como o score é calculado</h1>
        <div class="texto">
          <p>Cada critério vira uma nota de 0 a 100 dentro da mesma casa. Uma nota 75 em presença quer dizer que a pessoa esteve mais presente que 75% dos colegas. Deputados federais e senadores de SP são comparados com todos os parlamentares do país na mesma casa; deputados estaduais, com os 94 da ALESP. O score é a média ponderada dessas notas.</p>
          <p>Se um critério não tem dado para uma casa, ele sai da conta e os outros pesos são redistribuídos. Quem tem menos de 120 dias em exercício ou menos de 60% dos critérios disponíveis aparece sem score.</p>
        </div>
        <h2>Critérios e pesos</h2>
        <dl class="criterios-lista">${Object.values(dados.componentes).map((c) => `<div><dt>${esc(c.rotulo)} <span>${Math.round((c.peso / total) * 100)}%</span></dt><dd>${esc(c.descricao)}</dd></div>`).join('')}</dl>
        <h2>Peso dos temas</h2>
        <div class="texto"><p>Cada projeto de lei, PEC ou decreto recebe um tema principal, identificado por palavras-chave na ementa. A soma dos pesos forma o critério Relevância da agenda. As prioridades são uma escolha editorial do projeto, publicada aqui para que qualquer pessoa possa discordar e recalcular.</p></div>
        <dl class="criterios-lista">${['prio', 'rel', 'comp', 'neg'].filter((g) => grupos[g]).map((g) => `<div><dt>${ROT_GRUPO[g].replace(/^./, (x) => x.toUpperCase())} <span>${grupos[g].peso > 0 ? '+' : ''}${String(grupos[g].peso).replace('.', ',')}</span></dt><dd>${grupos[g].temas.map(esc).join(', ')}</dd></div>`).join('')}</dl>
        ${dados.impacto ? `<h2>Direção das propostas</h2>
        <div class="texto"><p>Além do tema, cada projeto de lei, PEC ou decreto é lido pela direção: amplia ou restringe direitos? A classificação é automática, por regras de palavras na ementa, e propositalmente estreita: na dúvida, a proposta fica neutra. Cada proposta classificada aparece no perfil do parlamentar com o nome da regra, para quem quiser conferir.</p>
        <p>Propostas que ampliam somam ${dados.impacto_pesos?.amplia ?? 1} ponto; as que restringem tiram ${Math.abs(dados.impacto_pesos?.restringe ?? -2)}. O saldo é dividido pelo número de projetos, então conta a qualidade do que a pessoa propõe, não o volume.</p></div>
        <dl class="criterios-lista">${Object.entries(dados.impacto).sort((a, b) => a[1].sinal - b[1].sinal).map(([, r]) => `<div class="${r.ativa ? '' : 'desligada'}"><dt>${esc(r.rotulo)} <span class="${r.sinal > 0 ? 'bom' : 'ruim'}">${r.sinal > 0 ? 'soma' : 'tira'}</span></dt><dd>${esc(r.descricao)}${r.contestada ? `<br><b>Regra contestada, ${r.ativa ? 'ligada' : 'desligada'} nesta versão.</b>` : ''}</dd></div>`).join('')}</dl>` : ''}
        <h2>Limites que você precisa conhecer</h2>
        <ul class="limites">
          <li>A direção das propostas é uma escolha editorial declarada: o projeto considera que reduzir desigualdade e proteger minorias e o meio ambiente é bom para a população. Quem discorda pode zerar esse critério em "Ajustar pesos" no ranking.</li>
          <li>Quantidade não é qualidade. O score mede atividade e custo observáveis; não avalia o mérito ou a orientação política de nenhuma proposta.</li>
          <li>A classificação por tema é automática e acerta em torno de 9 em cada 10 ementas. Erros acontecem, em especial em ementas que só citam o número da lei alterada.</li>
          <li>Só contam proposições em que a pessoa é a primeira autora. Coautorias e trabalho em comissões ainda não entram no score; pareceres de relator aparecem só como tipo de proposição.</li>
          <li>Presença segue a mesma regra nas três casas: licenças e missões oficiais saem da conta; qualquer outra ausência conta, justificada ou não. Na Câmara e na ALESP a base são as sessões deliberativas do Plenário; no Senado, as votações nominais.</li>
          <li>Na ALESP, quem assumiu como suplente é medido desde o início da legislatura.</li>
          <li>Custo estimado = subsídio + média mensal da cota + verba de gabinete (só a Câmara publica). Auxílios, imóvel funcional e salários de assessores no Senado e na ALESP não entram.</li>
          <li>Os pódios usam o mesmo score do ranking. Os motivos exibidos são os dois critérios com nota mais alta (Manda Bem) ou mais baixa (Sério mesmo???).</li>
        </ul>
      </div>`;
  }

  // ================= Rotas =================
  async function rota() {
    const h = decodeURIComponent(location.hash.slice(1));
    const app = $('#app');
    let html, nav = 'inicio', rolar = null;
    if (h.startsWith('p-')) {
      app.innerHTML = '<p class="vazio">Carregando perfil…</p>';
      html = await viewPerfil(h.slice(2));
      nav = '';
    } else if (h.startsWith('tipo-')) {
      const [, casa, tipo, tema] = h.split('-');
      if (CASAS.some(([c]) => c === casa)) estado.casa = casa;
      app.innerHTML = '<p class="vazio">Carregando…</p>';
      html = await viewTipo(estado.casa, dados.tipos?.[tipo] ? tipo : 'lei', dados.temas?.[tema] ? tema : '');
      nav = 'tipo';
    } else if (h === 'partidos' || h.startsWith('partidos:')) {
      const sigla = h.split(':')[1] || '';
      if (sigla) { estado.ptFoco = sigla; estado.ptCasa = 'todas'; }
      html = viewPartidos();
      nav = 'partidos';
    } else if (h === 'metodologia') {
      html = viewMetodologia();
      nav = 'metodologia';
    } else {
      if (CASAS.some(([c]) => c === h)) { estado.casa = h; rolar = 'sec-ranking'; }
      html = viewInicio();
    }
    app.innerHTML = html;
    if (nav === 'partidos') { aplicarFoco(); renderDetalhe(); }
    document.querySelectorAll('[data-nav]').forEach((a) => (a.dataset.nav === nav ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
    $('[data-nav="tipo"]').setAttribute('href', `#tipo-${estado.casa}-lei`);
    if (rolar) document.getElementById(rolar)?.scrollIntoView();
    else window.scrollTo(0, 0);
  }

  function rerender(id, fn) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = fn();
  }

  // ================= Eventos (delegados) =================
  function ligarEventos() {
    const app = $('#app');
    app.addEventListener('click', (e) => {
      const t = e.target;
      const ptc = t.closest('[data-pt-casa]');
      if (ptc) { estado.ptCasa = ptc.dataset.ptCasa; rerender('pg-partidos', conteudoPartidos); aplicarFoco(); renderDetalhe(); return; }
      const pf = t.closest('[data-partido-foco]');
      if (pf) { const s = pf.dataset.partidoFoco; estado.ptFoco = estado.ptFoco === s ? '' : s; estado.ptMembros = false; estado.ptMetrica = 'score'; estado.ptAutor = ''; atualizarFoco(); return; }
      if (t.closest('[data-pt-membros]')) { estado.ptMembros = !estado.ptMembros; renderDetalhe(); return; }
      const ab = t.closest('[data-pt-abrir]');
      if (ab) { const [sg, met] = ab.dataset.ptAbrir.split('|'); abrirFicha(sg, met); return; }
      const pm = t.closest('[data-pt-metrica]');
      if (pm) {
        estado.ptMetrica = pm.dataset.ptMetrica; estado.ptLimite = 25; estado.ptAutor = ''; estado.ptMembros = false;
        document.querySelectorAll('[data-pt-metrica]').forEach((b) => b.setAttribute('aria-pressed', b === pm));
        renderDetalhe(); return;
      }
      const pa = t.closest('[data-pt-autor]');
      if (pa) { estado.ptAutor = pa.dataset.ptAutor; estado.ptLimite = 25; renderDetalhe(); return; }
      if (t.closest('[data-pt-mais]')) { estado.ptLimite += 50; renderDetalhe(); return; }
      if (t.closest('[data-pt-limpar]')) { estado.ptFoco = ''; atualizarFoco(); return; }
      if (t.closest('[data-pt-ver]')) { $('#pt-ficha')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
      const po = t.closest('[data-pt-ord]');
      if (po) {
        const k = po.dataset.ptOrd;
        const menor = k === 'cotaIdx' || k === 'simb';
        estado.ptOrdem = estado.ptOrdem[0] === k ? [k, estado.ptOrdem[1] === 'asc' ? 'desc' : 'asc'] : [k, menor ? 'asc' : 'desc'];
        rerender('pt-tabela', tabelaPartidos); aplicarFoco(); return;
      }
      const podio = t.closest('[data-podio]');
      if (podio) { estado.podio = podio.dataset.podio; rerender('sec-podios', podios); return; }
      const casa = t.closest('[data-casa]');
      if (casa) {
        estado.casa = casa.dataset.casa; estado.partido = ''; estado.todosTemas = false; estado.rankLimite = 20;
        rerender('sec-esforco', secaoEsforco); rerender('sec-ranking', secaoRanking);
        $('[data-nav="tipo"]').setAttribute('href', `#tipo-${estado.casa}-lei`);
        return;
      }
      const tc = t.closest('[data-tipo-casa]');
      if (tc) { const partes = location.hash.slice(1).split('-'); location.hash = `tipo-${tc.dataset.tipoCasa}-${partes[2] || 'lei'}`; return; }
      if (t.closest('[data-todos-temas]')) { estado.todosTemas = !estado.todosTemas; rerender('sec-esforco', secaoEsforco); return; }
      const linha = t.closest('.linha[data-id]');
      if (linha) { location.hash = 'p-' + linha.dataset.id; return; }
      if (t.closest('#btn-pesos')) {
        estado.pesosAbertos = !estado.pesosAbertos;
        $('#pesos').hidden = !estado.pesosAbertos;
        $('#btn-pesos').setAttribute('aria-pressed', estado.pesosAbertos);
        return;
      }
      if (t.closest('#restaurar')) {
        pesos = { ...pesosOficiais }; store.set('placar-pesos', null);
        rerender('sec-ranking', secaoRanking); rerender('sec-podios', podios);
        return;
      }
      const ir = t.closest('[data-filtro-ir]');
      if (ir) { const b = document.querySelector(`#props-filtros [data-filtro="${ir.dataset.filtroIr}"]`); if (b) { b.click(); $('#props-filtros').scrollIntoView({ behavior: 'smooth', block: 'center' }); } return; }
      const filtro = t.closest('[data-filtro]');
      if (filtro) {
        estado.perfil.filtro = filtro.dataset.filtro; estado.perfil.limite = 15;
        document.querySelectorAll('#props-filtros [data-filtro]').forEach((b) => b.setAttribute('aria-pressed', b === filtro));
        rerender('props', listaPropsPerfil);
        return;
      }
      if (t.closest('[data-rank-mais]')) { estado.rankLimite = Infinity; rerender('ranking', linhasRanking); return; }
      if (t.closest('[data-mais]')) { estado.perfil.limite += 30; rerender('props', listaPropsPerfil); }
    });
    app.addEventListener('input', (e) => {
      const t = e.target;
      if (t.id === 'busca') { estado.busca = t.value.trim(); rerender('ranking', linhasRanking); }
      if (t.dataset.k) {
        pesos[t.dataset.k] = Number(t.value);
        $(`#peso-val-${t.dataset.k}`).textContent = t.value;
        store.set('placar-pesos', pesos);
        $('#nota-casa').textContent = notaCasa();
        rerender('ranking', linhasRanking);
        rerender('sec-podios', podios);
      }
    });
    app.addEventListener('change', (e) => {
      const t = e.target;
      if (t.id === 'partido') { estado.partido = t.value; rerender('ranking', linhasRanking); }
      if (t.id === 'ordem') { estado.ordem = t.value; rerender('ranking', linhasRanking); }
      if (t.id === 'tema') {
        estado.tema = t.value;
        if (t.value && estado.ordem === 'score' && t.value !== 'simbolica') { estado.ordem = 'tema'; $('#ordem').value = 'tema'; }
        if (!t.value && estado.ordem === 'tema') { estado.ordem = 'score'; $('#ordem').value = 'score'; }
        rerender('ranking', linhasRanking);
      }
      if (t.id === 'tema-props') { estado.perfil.tema = t.value; estado.perfil.limite = 15; rerender('props', listaPropsPerfil); }
    });
    app.addEventListener('keydown', (e) => {
      const g = e.target.closest?.('g[data-partido-foco]');
      if (g && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); g.dispatchEvent(new MouseEvent('click', { bubbles: true })); }
    });
    window.addEventListener('hashchange', rota);
  }

  async function iniciar() {
    try {
      const r = await fetch('data/latest.json', { cache: 'no-cache' });
      dados = await r.json();
    } catch {
      $('#app').innerHTML = '<p class="vazio">Não foi possível carregar os dados. Recarregue a página.</p>';
      return;
    }
    $('#aviso-amostra').hidden = !dados.amostra;
    $('#data-ref').textContent = new Date(dados.data_referencia + 'T12:00').toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
    $('#versao').textContent = 'v' + dados.versao_metodologia;
    pesosOficiais = Object.fromEntries(Object.entries(dados.componentes).map(([k, c]) => [k, c.peso]));
    const salvos = store.get('placar-pesos');
    pesos = { ...pesosOficiais };
    if (salvos && typeof salvos === 'object') for (const k of Object.keys(pesos)) if (typeof salvos[k] === 'number') pesos[k] = salvos[k];
    ligarEventos();
    rota();
  }

  iniciar();
})();
