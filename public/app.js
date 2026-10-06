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
        <p>Score de 0 a 100 dos parlamentares de SP ${NA_CASA[estado.casa]}. Toque numa linha para ver o perfil completo.</p></div></div>
      <div class="filtros">
        <div class="campo busca"><label class="visualmente-oculto" for="busca">Buscar parlamentar</label><input id="busca" type="search" placeholder="Buscar por nome" value="${esc(estado.busca)}" autocomplete="off"></div>
        <div class="campo"><label class="visualmente-oculto" for="partido">Partido</label><select id="partido"><option value="">Todos os partidos</option>${ps.map((p) => `<option${p === estado.partido ? ' selected' : ''}>${esc(p)}</option>`).join('')}</select></div>
        <div class="campo"><label class="visualmente-oculto" for="tema">Tema</label><select id="tema"><option value="">Todos os temas</option>${temas.map((t) => `<option value="${t}"${t === estado.tema ? ' selected' : ''}>${esc(rotTema(t))}</option>`).join('')}</select></div>
        <div class="campo"><label class="visualmente-oculto" for="ordem">Ordenar</label><select id="ordem">
          ${[['score', 'Maior score'], ['assiduidade', 'Maior presença'], ['aprovadas', 'Mais projetos aprovados'], ['cota', 'Menor gasto na cota'], ['simbolicas', 'Menos projetos simbólicos'], ['tema', 'Mais projetos no tema'], ['nome', 'Nome']]
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
      simbolicas: (a, b) => fracSimb(a.proposicoes) - fracSimb(b.proposicoes),
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
    const data = x.data ? new Date(x.data + 'T12:00').toLocaleDateString('pt-BR') : '';
    return `<li class="prop">
      <span class="ident">${x.url ? `<a href="${esc(x.url)}" target="_blank" rel="noopener">${id}</a>` : `<b>${id}</b>`}
        ${autor ? `<a href="#p-${esc(autor.id)}" class="autor">${esc(autor.nome)}</a>` : ''}
        ${data ? `<span>${data}</span>` : ''}${tema}</span>
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
      return `<div class="comp"><span class="rot">${esc(cc.rotulo)}</span><span class="pct" style="color:${cor(v)}">${v == null ? '–' : Math.round(v)}</span>
        <span class="trilho"><i style="width:${v ?? 0}%;background:${cor(v)}"></i></span><span class="det">${esc(detalheComponente(k, p))}</span></div>`;
    }).join('');

    return `
      <div class="wrap">
        <nav class="migalhas" aria-label="Você está em"><a href="#${p.casa}">Ranking ${DA_CASA[p.casa]}</a><span class="sep">/</span><span aria-current="page">${esc(p.nome)}</span></nav>
        <div class="perfil-cab">
          ${foto(resumo, 'xg')}
          <div><h1>${esc(p.nome)}</h1>
            <div class="meta"><span>${esc(p.partido)}</span><span>${esc(p.casa_nome)}</span><span>${fmt(Math.round(p.dias_em_exercicio))} dias em exercício</span>${p.url_oficial ? `<a href="${esc(p.url_oficial)}" target="_blank" rel="noopener">Página oficial</a>` : ''}</div>
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
          <section class="cartao"><h3>Score por critério</h3><p class="muted">Nota de 0 a 100 em relação aos colegas da mesma casa. 50 é a mediana.</p>${comps}
            <h4 class="sub-titulo">Tendência do score</h4>${sparkline(resumo.tendencia || [])}</section>
          <section class="cartao">
            <h3>Onde está o esforço</h3>
            <p class="muted">${pr.normativas ? `${pct(fracSimb(pr))} dos projetos são simbólicos. Na bancada de SP ${NA_CASA[p.casa]}, ${pct(simbBancada)}.` : 'Sem projetos de lei, PECs ou decretos no período.'}</p>
            ${nuvemTipos(pr.por_tipo, p.casa, { links: false })}
            <h4 class="sub-titulo">Temas dos projetos</h4>
            ${listaTemas(temasLinhas)}
          </section>
          <section class="cartao cheia">
            <h3>Propostas</h3>
            <p class="muted">${fmt(pr.normativas)} projetos de lei, PECs e decretos como primeiro autor (${fmt(pr.honorificas)} simbólicos), ${fmt(pr.fiscalizacao)} pedidos de fiscalização e ${fmt(pr.indicacoes)} indicações.</p>
            <div class="empilhada" role="img" aria-label="Situação dos projetos">${Object.entries(STATUS).map(([k, [r, cc]]) => (pr.por_status?.[k] ? `<i style="width:${(pr.por_status[k] / totalSt) * 100}%;background:${cc}" title="${r}: ${pr.por_status[k]}"></i>` : '')).join('')}</div>
            <div class="legenda">${Object.entries(STATUS).map(([k, [r, cc]]) => `<span style="--c:${cc}">${r} ${fmt(pr.por_status?.[k] || 0)}</span>`).join('')}</div>
            <div class="chips filtros-props" id="props-filtros">
              ${[['todas', 'Todas'], ['normativa', 'Substantivas'], ['aprovada', 'Aprovadas'], ['honorifica', 'Simbólicas'], ['fiscalizacao', 'Fiscalização']].map(([k, r]) => `<button data-filtro="${k}" aria-pressed="${k === 'todas'}">${r}</button>`).join('')}
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
    const f = { todas: () => true, normativa: (x) => x.categoria === 'normativa', aprovada: (x) => x.status === 'aprovada', honorifica: (x) => x.categoria === 'honorifica', fiscalizacao: (x) => x.categoria === 'fiscalizacao' }[filtro];
    const itens = (lista || []).filter((x) => f(x) && (!tema || x.tema === tema));
    if (!itens.length) return '<li class="vazio">Nenhuma proposta neste filtro.</li>';
    return itens.slice(0, limite).map((x) => itemProposta(x)).join('') +
      (itens.length > limite ? `<li class="mais"><button class="btn" data-mais>Mostrar mais (${limite} de ${itens.length})</button></li>` : '');
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
        <h2>Limites que você precisa conhecer</h2>
        <ul class="limites">
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
    } else if (h === 'metodologia') {
      html = viewMetodologia();
      nav = 'metodologia';
    } else {
      if (CASAS.some(([c]) => c === h)) { estado.casa = h; rolar = 'sec-ranking'; }
      html = viewInicio();
    }
    app.innerHTML = html;
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
