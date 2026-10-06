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
  const estado = { casa: 'camara', busca: '', partido: '', ordem: 'score' };

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
    const ult = (v) => (v == null ? -Infinity : v);
    const ord = {
      score: (a, b) => ult(b.meu) - ult(a.meu),
      assiduidade: (a, b) => ult(b.presenca?.taxa) - ult(a.presenca?.taxa),
      aprovadas: (a, b) => ult(b.proposicoes?.substantivas_aprovadas) - ult(a.proposicoes?.substantivas_aprovadas),
      cota: (a, b) => (a.custos.cota_mensal_media ?? Infinity) - (b.custos.cota_mensal_media ?? Infinity),
      nome: (a, b) => a.nome.localeCompare(b.nome, 'pt-BR'),
    }[estado.ordem];
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
        <span class="quem"><strong>${esc(p.nome)}</strong><span>${esc(p.partido)}</span></span>
        <span class="score">${scoreHtml}</span>
        <span class="componentes" aria-label="Percentis por critério">${barras}</span>
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
  }

  function renderLista() {
    renderAbas();
    renderPartidos();
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
        return `${pr.substantivas ?? 0} proposições substantivas como primeira autora; ${pr.honorificas ?? 0} honoríficas ficaram de fora. Mediana: ${ref.substantivas ?? '–'}.`;
      case 'efetividade':
        return `${pr.substantivas_aprovadas ?? 0} aprovadas de ${pr.substantivas ?? 0}. Taxa mediana da casa: ${pct(ref.taxa_aprovacao, 1)}.`;
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
  let limiteProps = 15;
  function renderProps(lista) {
    const f = {
      todas: () => true,
      normativa: (x) => x.categoria === 'normativa',
      aprovada: (x) => x.status === 'aprovada',
      honorifica: (x) => x.categoria === 'honorifica',
      fiscalizacao: (x) => x.categoria === 'fiscalizacao',
    }[filtroProps];
    const itens = lista.filter(f);
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
      return `<li class="prop"><span class="id">${x.url ? `<a href="${esc(x.url)}" target="_blank" rel="noopener">${id}</a>` : id}</span>
        <span class="em">${esc(x.ementa)}</span><span class="selo" style="--c:${c}">${esc(rot)}</span></li>`;
    }).join('') : '<li class="vazio">Nenhuma proposição nesse filtro.</li>') +
      (itens.length > mostrar.length ? `<li style="padding-top:12px"><button class="btn" data-mais>Mostrar mais (${mostrar.length} de ${itens.length})</button></li>` : '');
  }

  async function abrirPerfil(id) {
    const resumo = dados.parlamentares.find((p) => p.id === id);
    limiteProps = 15;
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
        <h3>Propostas</h3>
        <p class="muted">${pr.normativas ?? 0} proposições normativas como primeira autora (${pr.honorificas ?? 0} honoríficas), ${pr.fiscalizacao ?? 0} de fiscalização e ${pr.indicacoes ?? 0} indicações.</p>
        <div class="empilhada" role="img" aria-label="Situação das proposições normativas">${empilhada}</div>
        <div class="legenda">${legenda}</div>
        <div class="props-filtros" style="margin-top:16px" id="props-filtros">
          ${[['todas', 'Todas'], ['normativa', 'Substantivas'], ['aprovada', 'Aprovadas'], ['honorifica', 'Honoríficas'], ['fiscalizacao', 'Fiscalização']].map(([k, r]) => `<button class="chip" data-filtro="${k}" aria-pressed="${filtroProps === k}">${r}</button>`).join('')}
        </div>
        <ul class="props" id="props">${renderProps(pr.lista || [])}</ul>
      </section>`;

    $('#props').addEventListener('click', (e) => {
      if (!e.target.closest('[data-mais]')) return;
      limiteProps += 30;
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
