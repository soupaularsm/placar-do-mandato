(() => {
  'use strict';
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const brl = (v) => (v == null ? '–' : 'R$ ' + Math.round(v).toLocaleString('pt-BR'));
  const pct = (v, d = 0) => (v == null ? '–' : (v * 100).toLocaleString('pt-BR', { maximumFractionDigits: d, minimumFractionDigits: d }) + '%');
  const n1 = (v) => (v == null ? '–' : v.toLocaleString('pt-BR', { maximumFractionDigits: 1, minimumFractionDigits: 1 }));
  const iniciais = (nome) => nome.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
  const cor = (v) => (v == null ? 'var(--line)' : v >= 60 ? 'var(--high)' : v >= 40 ? 'var(--mid)' : 'var(--low)');
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sem armazenamento */ } },
  };

  const CASAS = [['camara', 'Câmara'], ['senado', 'Senado'], ['alesp', 'ALESP']];
  const STATUS = {
    aprovada: ['Aprovada', 'var(--high)'],
    andamento: ['Em andamento', 'var(--accent)'],
    arquivada: ['Arquivada', 'var(--muted)'],
    rejeitada: ['Rejeitada', 'var(--low)'],
  };

  let dados = null;
  let pesosOficiais = {};
  let pesos = {};
  const estado = { casa: 'camara', busca: '', partido: '', ordem: 'score', tema: '' };
  const fmt = (n) => (n ?? 0).toLocaleString('pt-BR');

  // ---------- Temas ----------
  const rotTema = (t) => dados.temas?.[t]?.rotulo || t;
  const pesoTema = (t) => dados.temas?.[t]?.peso ?? 0;
  const grupoTema = (t) => {
    const w = pesoTema(t);
    return w < 0 ? 'neg' : w >= 1 ? 'prio' : w >= 0.5 ? 'rel' : 'comp';
  };
  const ROT_GRUPO = { prio: 'prioritário', rel: 'relevante', comp: 'complementar', neg: 'tira pontos' };
  const fracSimbolica = (pr) => (pr?.normativas ? (pr.por_tema?.simbolica || 0) / pr.normativas : 0);

  /** Barras horizontais de temas. pt = {tema: n}, ap = {tema: aprovadas}. */
  function graficoTemas(pt = {}, ap = {}, { clicavel = false, limite = 18 } = {}) {
    const linhas = Object.entries(pt).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).slice(0, limite);
    if (!linhas.length) return '<p class="muted">Sem projetos de lei, PECs ou decretos no período.</p>';
    const max = linhas[0][1];
    const total = Object.values(pt).reduce((a, b) => a + b, 0);
    return `<ul class="temas${clicavel ? ' clicavel' : ''}">${linhas.map(([t, n]) => {
      const g = grupoTema(t);
      const a = ap[t] || 0;
      const dica = `${rotTema(t)}: ${fmt(n)} propostas (${Math.round((n / total) * 100)}%), ${fmt(a)} aprovadas`;
      const conteudo = `<span class="tema-rot">${esc(rotTema(t))}<em class="grupo grupo-${g}">${ROT_GRUPO[g]}</em></span>
          <span class="tema-num num">${fmt(n)}<small> · ${Math.round((n / total) * 100)}%</small></span>
          <span class="tema-barra" aria-hidden="true"><i class="b-${g}" style="width:${(n / max) * 100}%"></i>${a ? `<i class="b-aprov" style="width:${(a / max) * 100}%"></i>` : ''}</span>`;
      return `<li title="${esc(dica)}">${clicavel ? `<button type="button" data-tema="${esc(t)}" aria-pressed="${estado.tema === t}">${conteudo}</button>` : conteudo}</li>`;
    }).join('')}</ul>
    <div class="legenda" style="margin-top:8px"><span style="--c:var(--accent)">Apresentadas</span><span style="--c:var(--aprov)">Aprovadas</span><span style="--c:var(--neg)">Simbólicas</span></div>`;
  }

  function chipsTipos(por) {
    const ent = Object.entries(por || {}).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
    if (!ent.length) return '';
    return `<ul class="tipos">${ent.map(([t, n]) => `<li><span>${esc(dados.tipos?.[t] || t)}</span><b class="num">${fmt(n)}</b></li>`).join('')}</ul>`;
  }

  function tagsLinha(p) {
    const pr = p.proposicoes || {};
    const pt = pr.por_tema || {};
    let top = Object.entries(pt).filter(([t]) => t !== 'simbolica' && t !== 'outros').sort((a, b) => b[1] - a[1]).slice(0, 2).map(([t]) => t);
    if (estado.tema && estado.tema !== 'simbolica') top = [estado.tema, ...top.filter((t) => t !== estado.tema)].slice(0, 2);
    const tags = top.map((t) => `<em class="tag${t === estado.tema ? ' ativo' : ''}">${esc(rotTema(t))}${t === estado.tema ? ` ${fmt(pt[t])}` : ''}</em>`);
    const fs = fracSimbolica(pr);
    if (fs >= 0.25 || estado.tema === 'simbolica') tags.push(`<em class="tag tag-neg">${Math.round(fs * 100)}% simbólicas</em>`);
    return tags.length ? `<span class="tags">${tags.join('')}</span>` : '';
  }

  // ---------- Score com pesos do visitante ----------
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

  // ---------- Avatar ----------
  function avatar(p) {
    const ini = esc(iniciais(p.nome));
    if (!p.foto) return `<div class="avatar" aria-hidden="true">${ini}</div>`;
    return `<div class="avatar" aria-hidden="true"><img src="${esc(p.foto)}" alt="" loading="lazy" onerror="this.parentNode.textContent='${ini}'"></div>`;
  }

  // ---------- Lista ----------
  function renderAbas() {
    $('#abas').innerHTML = CASAS.map(([id, rot]) => {
      const qtd = dados.parlamentares.filter((p) => p.casa === id).length;
      return `<button role="tab" id="aba-${id}" aria-selected="${estado.casa === id}" data-casa="${id}">${rot}<span class="qtd">${qtd}</span></button>`;
    }).join('');
  }

  function renderPartidos() {
    const ps = [...new Set(dados.parlamentares.filter((p) => p.casa === estado.casa).map((p) => p.partido))].sort();
    const sel = $('#partido');
    if (!ps.includes(estado.partido)) estado.partido = '';
    sel.innerHTML = '<option value="">Todos</option>' + ps.map((p) => `<option${p === estado.partido ? ' selected' : ''}>${esc(p)}</option>`).join('');
  }

  function renderNotaCasa() {
    const c = dados.casas[estado.casa];
    const el = $('#nota-casa');
    el.classList.remove('erro');
    if (!c) { el.textContent = ''; return; }
    if (c.status !== 'ok') {
      el.classList.add('erro');
      el.textContent = c.status === 'desatualizado'
        ? `A coleta desta semana falhou. Mostrando os dados da semana anterior (${new Date(c.atualizado_em).toLocaleDateString('pt-BR')}).`
        : 'Dados desta casa ainda não disponíveis.';
      return;
    }
    const comp = c.benchmark === 'nacional' ? `comparados com os ${c.referencia.n} parlamentares do país na mesma casa` : `comparados entre os ${c.referencia.n} da casa`;
    const faltas = [];
    if (!c.disponivel?.assiduidade) faltas.push('presença');
    if (!c.disponivel?.custo_pessoal) faltas.push('tamanho do gabinete');
    el.textContent = `${c.nome}: ${comp}. Mandato contado desde ${new Date(c.inicio_legislatura + 'T12:00').toLocaleDateString('pt-BR')}.` +
      (faltas.length ? ` Ainda sem dado de ${faltas.join(' e ')}; esses critérios ficam fora do score.` : '') +
      (pesosAlterados() ? ' Ranking com os seus pesos.' : '');
  }

  function renderRanking() {
    const todos = dados.parlamentares.filter((p) => p.casa === estado.casa).map((p) => ({ ...p, meu: scoreCom(p) }));
    const porScore = todos.filter((p) => p.meu != null).sort((a, b) => b.meu - a.meu);
    const posicao = new Map(porScore.map((p, i) => [p.id, i + 1]));

    let lista = todos;
    if (estado.busca) {
      const q = estado.busca.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
      lista = lista.filter((p) => p.nome.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().includes(q));
    }
    if (estado.partido) lista = lista.filter((p) => p.partido === estado.partido);
    if (estado.tema) lista = lista.filter((p) => (p.proposicoes?.por_tema?.[estado.tema] || 0) > 0);
    const ult = (v) => (v == null ? -Infinity : v);
    const ord = {
      score: (a, b) => ult(b.meu) - ult(a.meu),
      assiduidade: (a, b) => ult(b.presenca?.taxa) - ult(a.presenca?.taxa),
      aprovadas: (a, b) => ult(b.proposicoes?.substantivas_aprovadas) - ult(a.proposicoes?.substantivas_aprovadas),
      cota: (a, b) => (a.custos.cota_mensal_media ?? Infinity) - (b.custos.cota_mensal_media ?? Infinity),
      nome: (a, b) => a.nome.localeCompare(b.nome, 'pt-BR'),
      tema: (a, b) => (b.proposicoes?.por_tema?.[estado.tema] || 0) - (a.proposicoes?.por_tema?.[estado.tema] || 0),
      simbolicas: (a, b) => fracSimbolica(a.proposicoes) - fracSimbolica(b.proposicoes),
    }[estado.ordem === 'tema' && !estado.tema ? 'score' : estado.ordem];
    lista.sort(ord);

    const chaves = Object.keys(dados.componentes);
    const el = $('#ranking');
    if (!lista.length) { el.innerHTML = '<li class="vazio">Ninguém encontrado com esses filtros.</li>'; return; }
    el.innerHTML = lista.map((p) => {
      const pos = posicao.get(p.id);
      const barras = chaves.map((k) => {
        const v = p.score.componentes[k];
        const rot = dados.componentes[k].rotulo;
        return v == null
          ? `<i class="na" title="${esc(rot)}: sem dado"></i>`
          : `<i style="height:${Math.max(4, v)}%;background:${cor(v)}" title="${esc(rot)}: percentil ${Math.round(v)}"></i>`;
      }).join('');
      const scoreHtml = p.meu == null
        ? `<div class="sem-score">${esc(p.score.motivo_sem_score || 'Sem score')}</div>`
        : `<div class="valor">${n1(p.meu)}<small> /100</small></div><div class="trilho"><i style="width:${p.meu}%;background:${cor(p.meu)}"></i></div>`;
      const pr = p.proposicoes;
      return `<li><button class="linha" data-id="${esc(p.id)}" aria-label="Abrir perfil de ${esc(p.nome)}">
        <span class="pos">${pos ?? '–'}</span>
        ${avatar(p)}
        <span class="quem"><strong>${esc(p.nome)}</strong><span>${esc(p.partido)}</span>${tagsLinha(p)}</span>
        <span class="score">${scoreHtml}</span>
        <span class="componentes" style="grid-template-columns:repeat(${chaves.length},1fr)" aria-label="Percentis por critério">${barras}</span>
        <span class="dado d1"><b>${pct(p.presenca?.taxa)}</b><span>presença</span></span>
        <span class="dado d2"><b>${pr ? `${pr.substantivas_aprovadas}/${pr.substantivas}` : '–'}</b><span>aprovadas de propostas</span></span>
      </button></li>`;
    }).join('');
  }

  function renderPesos() {
    $('#pesos-grade').innerHTML = Object.entries(dados.componentes).map(([k, c]) => `
      <div class="peso">
        <label for="peso-${k}">${esc(c.rotulo)}</label>
        <span class="num" id="peso-val-${k}">${pesos[k]}</span>
        <input type="range" id="peso-${k}" data-k="${k}" min="0" max="40" step="1" value="${pesos[k]}">
      </div>`).join('');
  }

  function renderMetodologia() {
    const total = Object.values(pesosOficiais).reduce((a, b) => a + b, 0);
    $('#lista-criterios').innerHTML = Object.entries(dados.componentes).map(([k, c]) =>
      `<div><dt>${esc(c.rotulo)} <span class="num">${Math.round((c.peso / total) * 100)}%</span></dt><dd>${esc(c.descricao)}</dd></div>`).join('');
    $('#versao').textContent = 'v' + dados.versao_metodologia;
    const grupos = {};
    for (const [t, v] of Object.entries(dados.temas || {})) (grupos[grupoTema(t)] ??= { peso: v.peso, temas: [] }).temas.push(v.rotulo);
    $('#lista-temas').innerHTML = ['prio', 'rel', 'comp', 'neg'].filter((g) => grupos[g]).map((g) =>
      `<div><dt>${esc(ROT_GRUPO[g].replace(/^./, (c) => c.toUpperCase()))} <span class="num">${grupos[g].peso > 0 ? '+' : ''}${String(grupos[g].peso).replace('.', ',')}</span></dt><dd>${grupos[g].temas.map(esc).join(', ')}</dd></div>`).join('');
  }

  function renderTemasFiltro() {
    const sel = $('#tema');
    const ids = Object.keys(dados.temas || {});
    sel.innerHTML = '<option value="">Todos</option>' + ids.map((t) => `<option value="${t}"${t === estado.tema ? ' selected' : ''}>${esc(rotTema(t))}</option>`).join('');
  }

  function renderPanorama() {
    const c = dados.casas[estado.casa];
    const b = c?.bancada_sp;
    const el = $('#panorama');
    if (!b) { el.hidden = true; return; }
    el.hidden = false;
    const pt = b.por_tema || {};
    const total = Object.values(pt).reduce((x, y) => x + y, 0);
    const simb = pt.simbolica || 0;
    const prio = Object.entries(pt).filter(([t]) => grupoTema(t) === 'prio').reduce((x, [, n]) => x + n, 0);
    const aprovTotal = Object.values(b.por_tema_aprovadas || {}).reduce((x, y) => x + y, 0);
    const aprovSimb = (b.por_tema_aprovadas || {}).simbolica || 0;
    const desde = new Date(c.inicio_legislatura + 'T12:00').getFullYear();
    el.innerHTML = `
      <header>
        <h2>Onde a bancada de SP concentra esforço</h2>
        <p class="muted">${fmt(total)} projetos de lei, PECs e decretos apresentados pelos ${b.parlamentares} parlamentares de SP ${c.nome === 'Senado Federal' ? 'no Senado' : c.nome === 'Câmara dos Deputados' ? 'na Câmara' : 'na ALESP'} desde ${desde}, por tema. Toque num tema para ver quem mais propõe sobre ele.</p>
      </header>
      <div class="panorama-grade">
        <div class="manchetes">
          <div class="manchete"><b class="num">${total ? Math.round((simb / total) * 100) : 0}%</b><span>são simbólicas: nome de via, data comemorativa, título, utilidade pública</span></div>
          <div class="manchete"><b class="num">${total ? Math.round((prio / total) * 100) : 0}%</b><span>tratam de temas prioritários: segurança, saúde, educação, crianças, contas públicas e cidades</span></div>
          <div class="manchete"><b class="num">${aprovTotal ? Math.round((aprovSimb / aprovTotal) * 100) : 0}%</b><span>das aprovadas são simbólicas</span></div>
        </div>
        <div class="min0">${graficoTemas(pt, b.por_tema_aprovadas, { clicavel: true })}</div>
      </div>
      <h3 class="sub">Tipos de proposição apresentados</h3>
      ${chipsTipos(b.por_tipo)}`;
  }

  function renderLista() {
    renderAbas();
    renderPartidos();
    renderTemasFiltro();
    renderPanorama();
    renderNotaCasa();
    renderRanking();
  }

  // ---------- Perfil ----------
  function detalheComponente(k, p, ref) {
    const pr = p.proposicoes || {};
    const c = p.custos || {};
    switch (k) {
      case 'assiduidade':
        return p.presenca ? `${p.presenca.presentes} de ${p.presenca.sessoes} (${pct(p.presenca.taxa, 1)}). Mediana da casa: ${pct(ref.presenca_taxa, 1)}.` : 'Sem dado de presença para esta casa.';
      case 'producao':
        return `${pr.substantivas ?? 0} proposições substantivas como primeira autora; ${pr.honorificas ?? 0} simbólicas ficaram de fora. Mediana: ${ref.substantivas ?? '–'}.`;
      case 'efetividade':
        return `${pr.substantivas_aprovadas ?? 0} aprovadas de ${pr.substantivas ?? 0}. Taxa mediana da casa: ${pct(ref.taxa_aprovacao, 1)}.`;
      case 'agenda': {
        const pt = pr.por_tema || {};
        const soma = (g) => Object.entries(pt).filter(([t]) => grupoTema(t) === g).reduce((x, [, n]) => x + n, 0);
        return `${soma('prio')} propostas em temas prioritários, ${soma('rel')} em relevantes, ${soma('comp')} complementares e ${pt.simbolica || 0} simbólicas, que tiram pontos.`;
      }
      case 'fiscalizacao':
        return `${pr.fiscalizacao ?? 0} requerimentos de informação ou fiscalização. Mediana: ${ref.fiscalizacao ?? '–'}.`;
      case 'custo_cota':
        return c.cota_mensal_media != null ? `${brl(c.cota_mensal_media)} por mês em média. Mediana da casa: ${brl(ref.cota_mensal_media)}.` : 'Sem dado de cota.';
      case 'custo_pessoal':
        return c.assessores != null ? `${c.assessores} pessoas no gabinete. Mediana entre os de SP: ${ref.assessores_sp ?? '–'}.` : 'Sem dado de pessoal de gabinete.';
      default:
        return '';
    }
  }

  function sparkline(serie) {
    const pts = serie.filter(([, v]) => v != null);
    if (pts.length < 2) return '<p class="muted">A tendência aparece a partir da segunda semana de coleta.</p>';
    const W = 300, H = 56, pad = 6;
    const vs = pts.map(([, v]) => v);
    const min = Math.min(...vs) - 2, max = Math.max(...vs) + 2;
    const x = (i) => pad + (i / (pts.length - 1)) * (W - pad * 2);
    const y = (v) => H - pad - ((v - min) / (max - min || 1)) * (H - pad * 2);
    const d = pts.map(([, v], i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
    const ult = pts[pts.length - 1];
    return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Score nas últimas ${pts.length} semanas">
      <path d="${d}L${x(pts.length - 1)},${H}L${x(0)},${H}Z" fill="var(--accent-soft)"/>
      <path d="${d}" fill="none" stroke="var(--accent)" stroke-width="2" vector-effect="non-scaling-stroke"/>
      <circle cx="${x(pts.length - 1)}" cy="${y(ult[1])}" r="3.5" fill="var(--accent)"/></svg>
      <p class="muted" style="font-size:12px;margin:6px 0 0">${new Date(pts[0][0] + 'T12:00').toLocaleDateString('pt-BR')} a ${new Date(ult[0] + 'T12:00').toLocaleDateString('pt-BR')}</p>`;
  }

  let filtroProps = 'todas';
  let filtroTemaProps = '';
  let limiteProps = 15;
  function renderProps(lista) {
    const f = {
      todas: () => true,
      normativa: (x) => x.categoria === 'normativa',
      aprovada: (x) => x.status === 'aprovada',
      honorifica: (x) => x.categoria === 'honorifica',
      fiscalizacao: (x) => x.categoria === 'fiscalizacao',
    }[filtroProps];
    const itens = lista.filter((x) => f(x) && (!filtroTemaProps || x.tema === filtroTemaProps));
    const mostrar = itens.slice(0, limiteProps);
    const selo = (x) => {
      if (x.categoria === 'fiscalizacao') return ['Fiscalização', 'var(--accent)'];
      if (x.categoria === 'indicacao') return ['Indicação', 'var(--muted)'];
      const s = STATUS[x.status] || STATUS.andamento;
      return x.categoria === 'honorifica' ? [s[0] + ' · honorífica', 'var(--muted)'] : s;
    };
    return (mostrar.length ? mostrar.map((x) => {
      const [rot, c] = selo(x);
      const id = `${esc(x.sigla)} ${esc(x.numero)}/${esc(x.ano)}`;
      const tema = x.tema ? `<em class="tag${grupoTema(x.tema) === 'neg' ? ' tag-neg' : ''}">${esc(rotTema(x.tema))}</em>` : '';
      const tipo = x.tipo && dados.tipos?.[x.tipo] ? `<span class="tipo-rot">${esc(dados.tipos[x.tipo])}</span>` : '';
      return `<li class="prop"><span class="id">${x.url ? `<a href="${esc(x.url)}" target="_blank" rel="noopener">${id}</a>` : id}${tipo}</span>
        <span class="em">${esc(x.ementa)}${tema ? `<span class="tags">${tema}</span>` : ''}</span><span class="selo" style="--c:${c}">${esc(rot)}</span></li>`;
    }).join('') : '<li class="vazio">Nenhuma proposição nesse filtro.</li>') +
      (itens.length > mostrar.length ? `<li style="padding-top:12px"><button class="btn" data-mais>Mostrar mais (${mostrar.length} de ${itens.length})</button></li>` : '');
  }

  async function abrirPerfil(id) {
    const resumo = dados.parlamentares.find((p) => p.id === id);
    limiteProps = 15;
    filtroTemaProps = '';
    if (!resumo) return mostrarLista();
    $('#lista-view').hidden = true;
    $('#perfil-view').hidden = false;
    const el = $('#perfil');
    el.innerHTML = '<p class="muted">Carregando…</p>';
    window.scrollTo(0, 0);
    let p;
    try {
      const r = await fetch(`data/p/${encodeURIComponent(id)}.json`);
      if (!r.ok) throw new Error(r.status);
      p = await r.json();
    } catch {
      el.innerHTML = '<button class="voltar" data-voltar>← Voltar ao ranking</button><p>Não foi possível carregar este perfil. Recarregue a página para tentar de novo.</p>';
      return;
    }
    const ref = dados.casas[p.casa]?.referencia || {};
    const meu = scoreCom(resumo);
    const comps = Object.entries(dados.componentes).map(([k, c]) => {
      const v = resumo.score.componentes[k];
      return `<div class="comp-linha"><span class="rot">${esc(c.rotulo)}</span><span class="pct" style="color:${cor(v)}">${v == null ? '–' : Math.round(v)}</span>
        <div class="trilho"><i style="width:${v ?? 0}%;background:${cor(v)}"></i><span class="mediana" title="Mediana da casa"></span></div>
        <span class="det">${esc(detalheComponente(k, p, ref))}</span></div>`;
    }).join('');

    const pr = p.proposicoes || { por_status: {}, lista: [] };
    const totalSt = Object.values(pr.por_status).reduce((a, b) => a + b, 0) || 1;
    const empilhada = Object.entries(STATUS).map(([k, [, c]]) => `<i style="width:${((pr.por_status[k] || 0) / totalSt) * 100}%;background:${c}" title="${STATUS[k][0]}: ${pr.por_status[k] || 0}"></i>`).join('');
    const legenda = Object.entries(STATUS).map(([k, [rot, c]]) => `<span style="--c:${c}">${rot} <b class="num">${pr.por_status[k] || 0}</b></span>`).join('');

    const c = p.custos || {};
    const cats = Object.entries(c.cota_categorias || {}).slice(0, 6);
    const maxCat = cats[0]?.[1] || 1;
    const meses = Math.max(1, p.dias_em_exercicio / 30.44);

    el.innerHTML = `
      <button class="voltar" data-voltar>← Voltar ao ranking</button>
      <div class="perfil-topo">
        ${avatar(p)}
        <div><h2>${esc(p.nome)}</h2><div class="meta">${esc(p.partido)} · ${esc(p.casa_nome)} · ${Math.round(p.dias_em_exercicio)} dias em exercício na legislatura${p.url_oficial ? ` · <a href="${esc(p.url_oficial)}" target="_blank" rel="noopener">página oficial</a>` : ''}</div></div>
        <div class="placar">
          <div class="valor" style="color:${cor(meu)}">${meu == null ? '–' : n1(meu)}<small> /100</small></div>
          <div>${meu == null ? esc(resumo.score.motivo_sem_score || 'Sem score') : `${pesosAlterados() ? 'Com os seus pesos' : `${resumo.score.posicao}º de ${resumo.score.de} de SP nesta casa`}`}</div>
        </div>
      </div>

      <div class="grade">
        <section class="bloco"><h3>Score por critério</h3><p class="muted">Percentil em relação aos pares. A marca no meio de cada barra é a mediana.</p>${comps}</section>
        <section class="bloco"><h3>Tendência semanal</h3><p class="muted">Score oficial a cada atualização.</p>${sparkline(resumo.tendencia || [])}
          <h3 style="margin-top:22px">Presença</h3>
          <div class="kpis" style="margin-top:10px">
            <div class="kpi"><b>${pct(p.presenca?.taxa, 1)}</b><span>${esc(p.presenca?.base || 'sem dado')}</span></div>
            <div class="kpi"><b>${p.presenca ? p.presenca.sessoes - p.presenca.presentes : '–'}</b><span>ausências contadas</span></div>
            ${p.presenca?.justificadas != null ? `<div class="kpi"><b>${p.presenca.justificadas}</b><span>ausências justificadas</span></div>` : ''}
          </div>
        </section>
      </div>

      <section class="bloco">
        <h3>Custos</h3><p class="muted">Médias mensais desde o início do mandato.</p>
        <div class="kpis">
          <div class="kpi"><b>${brl(c.custo_estimado_mensal)}</b><span>custo estimado por mês</span></div>
          <div class="kpi"><b>${brl(c.cota_mensal_media)}</b><span>cota parlamentar por mês</span></div>
          ${c.verba_gabinete_mensal != null ? `<div class="kpi"><b>${brl(c.verba_gabinete_mensal)}</b><span>verba de gabinete por mês</span></div>` : ''}
          <div class="kpi"><b>${c.assessores ?? '–'}</b><span>pessoas no gabinete</span></div>
          <div class="kpi"><b>${brl(c.cota_total)}</b><span>cota no mandato (${Math.round(meses)} meses)</span></div>
        </div>
        ${cats.length ? `<div class="barras">${cats.map(([k, v]) => `<div class="barra"><span>${esc(k)}</span><span class="num">${brl(v)}</span><div class="trilho"><i style="width:${(v / maxCat) * 100}%"></i></div></div>`).join('')}</div>` : ''}
      </section>

      <section class="bloco">
        <h3>Onde está o esforço</h3>
        <p class="muted">Projetos de lei, PECs e decretos por tema. ${pr.normativas ? `${Math.round(fracSimbolica(pr) * 100)}% são simbólicos; na bancada de SP desta casa, a média é ${(() => { const b = dados.casas[p.casa]?.bancada_sp?.por_tema || {}; const t = Object.values(b).reduce((x, y) => x + y, 0); return t ? Math.round(((b.simbolica || 0) / t) * 100) : 0; })()}%.` : ''}</p>
        ${graficoTemas(pr.por_tema, pr.por_tema_aprovadas)}
        <h3 class="sub">Tipos de proposição</h3>
        ${chipsTipos(pr.por_tipo)}
      </section>

      <section class="bloco">
        <h3>Propostas</h3>
        <p class="muted">${pr.normativas ?? 0} proposições normativas como primeira autora (${pr.honorificas ?? 0} simbólicas), ${pr.fiscalizacao ?? 0} de fiscalização e ${pr.indicacoes ?? 0} indicações.</p>
        <div class="empilhada" role="img" aria-label="Situação das proposições normativas">${empilhada}</div>
        <div class="legenda">${legenda}</div>
        <div class="props-filtros" style="margin-top:16px" id="props-filtros">
          ${[['todas', 'Todas'], ['normativa', 'Substantivas'], ['aprovada', 'Aprovadas'], ['honorifica', 'Simbólicas'], ['fiscalizacao', 'Fiscalização']].map(([k, r]) => `<button class="chip" data-filtro="${k}" aria-pressed="${filtroProps === k}">${r}</button>`).join('')}
          <label class="visualmente-oculto" for="tema-props">Tema</label>
          <select id="tema-props" class="chip-select"><option value="">Todos os temas</option>${Object.entries(pr.por_tema || {}).sort((a, b) => b[1] - a[1]).map(([t, n]) => `<option value="${t}">${esc(rotTema(t))} (${n})</option>`).join('')}</select>
        </div>
        <ul class="props" id="props">${renderProps(pr.lista || [])}</ul>
      </section>`;

    $('#props').addEventListener('click', (e) => {
      if (!e.target.closest('[data-mais]')) return;
      limiteProps += 30;
      $('#props').innerHTML = renderProps(pr.lista || []);
    });
    $('#tema-props').addEventListener('change', (e) => {
      filtroTemaProps = e.target.value;
      limiteProps = 15;
      $('#props').innerHTML = renderProps(pr.lista || []);
    });
    $('#props-filtros').addEventListener('click', (e) => {
      const b = e.target.closest('[data-filtro]');
      if (!b) return;
      filtroProps = b.dataset.filtro;
      limiteProps = 15;
      $('#props-filtros').querySelectorAll('.chip').forEach((x) => x.setAttribute('aria-pressed', x === b));
      $('#props').innerHTML = renderProps(pr.lista || []);
    });
  }

  function definirTema(t) {
    estado.tema = t;
    if (t && estado.ordem === 'score') estado.ordem = t === 'simbolica' ? 'score' : 'tema';
    if (!t && estado.ordem === 'tema') estado.ordem = 'score';
    $('#ordem').value = estado.ordem;
    renderTemasFiltro();
    renderPanorama();
    renderRanking();
  }

  function mostrarLista() {
    $('#perfil-view').hidden = true;
    $('#lista-view').hidden = false;
    renderLista();
  }

  function rota() {
    const h = decodeURIComponent(location.hash.slice(1));
    if (h.startsWith('p-')) return abrirPerfil(h.slice(2));
    if (CASAS.some(([c]) => c === h)) estado.casa = h;
    mostrarLista();
    if (h === 'metodologia') $('#metodologia').scrollIntoView();
  }

  // ---------- Eventos ----------
  function ligarEventos() {
    $('#abas').addEventListener('click', (e) => {
      const b = e.target.closest('[data-casa]');
      if (!b) return;
      estado.casa = b.dataset.casa;
      estado.partido = '';
      location.hash = estado.casa;
    });
    $('#busca').addEventListener('input', (e) => { estado.busca = e.target.value.trim(); renderRanking(); });
    $('#partido').addEventListener('change', (e) => { estado.partido = e.target.value; renderRanking(); });
    $('#ordem').addEventListener('change', (e) => { estado.ordem = e.target.value; renderRanking(); });
    $('#tema').addEventListener('change', (e) => { definirTema(e.target.value); });
    $('#panorama').addEventListener('click', (e) => {
      const b = e.target.closest('[data-tema]');
      if (!b) return;
      definirTema(estado.tema === b.dataset.tema ? '' : b.dataset.tema);
      $('#ranking').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    $('#ranking').addEventListener('click', (e) => {
      const b = e.target.closest('[data-id]');
      if (b) location.hash = 'p-' + b.dataset.id;
    });
    $('#perfil').addEventListener('click', (e) => {
      if (e.target.closest('[data-voltar]')) location.hash = estado.casa;
    });
    $('#btn-pesos').addEventListener('click', (e) => {
      const aberto = $('#pesos').hidden;
      $('#pesos').hidden = !aberto;
      e.currentTarget.setAttribute('aria-pressed', aberto);
    });
    $('#pesos-grade').addEventListener('input', (e) => {
      const k = e.target.dataset.k;
      if (!k) return;
      pesos[k] = Number(e.target.value);
      $(`#peso-val-${k}`).textContent = pesos[k];
      store.set('placar-pesos', pesos);
      renderNotaCasa();
      renderRanking();
    });
    $('#restaurar').addEventListener('click', () => {
      pesos = { ...pesosOficiais };
      store.set('placar-pesos', null);
      renderPesos();
      renderNotaCasa();
      renderRanking();
    });
    window.addEventListener('hashchange', rota);
  }

  async function iniciar() {
    try {
      const r = await fetch('data/latest.json', { cache: 'no-cache' });
      dados = await r.json();
    } catch {
      $('#ranking').innerHTML = '<li class="vazio">Não foi possível carregar os dados. Recarregue a página.</li>';
      return;
    }
    $('#aviso-amostra').hidden = !dados.amostra;
    $('#data-ref').textContent = new Date(dados.data_referencia + 'T12:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
    pesosOficiais = Object.fromEntries(Object.entries(dados.componentes).map(([k, c]) => [k, c.peso]));
    const salvos = store.get('placar-pesos');
    pesos = { ...pesosOficiais, ...(salvos && typeof salvos === 'object' ? salvos : {}) };
    renderPesos();
    renderMetodologia();
    ligarEventos();
    rota();
  }

  iniciar();
})();
