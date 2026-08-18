(function () {
  const el = (id) => document.getElementById(id);

  const state = {
    inicio: null,
    fim: null,
    gastos: [],
    ganhos: [],
    agendamentos: [],
    activeListTab: 'ganhos',
    chart: null,
    seriesVisible: {
      particular: true, uber: true, gastos: true, liquido: true,
      naoTrabalhado: false, pendentes: false, recusados: false
    },
    initialized: false
  };

  const STATUS_PENDENTE = ['solicitado', 'orcamento_enviado'];
  const STATUS_RECUSADO = ['recusado', 'cancelado'];

  const CATEGORIA_GASTO_LABEL = { combustivel: 'Combustível', manutencao: 'Manutenção', outros: 'Outros' };
  const TIPO_CORRIDA_LABEL = { cheia: 'Corrida cheia', aproveitamento: 'Aproveitamento', dia_trabalhado: 'Dia trabalhado' };

  // -------------------- Helpers --------------------
  function esc(str) {
    return String(str ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function fmtData(iso) {
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  }

  function fmtMoeda(valor) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor || 0);
  }

  function toISO(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function parseISO(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  function addDays(date, n) {
    const d = new Date(date);
    d.setDate(d.getDate() + n);
    return d;
  }

  function buildDayRange(inicio, fim) {
    const days = [];
    let cur = parseISO(inicio);
    const end = parseISO(fim);
    while (cur <= end) {
      days.push(toISO(cur));
      cur = addDays(cur, 1);
    }
    return days;
  }

  // -------------------- Navegacao --------------------
  el('btn-ir-financeiro').addEventListener('click', () => {
    el('view-dashboard').classList.add('hidden');
    el('view-financeiro').classList.remove('hidden');
    if (!state.initialized) {
      state.initialized = true;
      applyPreset('15');
    } else {
      loadFinanceiro();
    }
  });

  el('btn-ir-agendamentos').addEventListener('click', () => {
    el('view-financeiro').classList.add('hidden');
    el('view-dashboard').classList.remove('hidden');
  });

  el('btn-logout-financeiro').addEventListener('click', async () => {
    await window.sb.auth.signOut();
    el('view-financeiro').classList.add('hidden');
    el('view-dashboard').classList.add('hidden');
    el('view-login').classList.remove('hidden');
  });

  // -------------------- Periodo --------------------
  document.querySelectorAll('.preset-btn').forEach((btn) => {
    btn.addEventListener('click', () => applyPreset(btn.dataset.preset));
  });

  function applyPreset(preset) {
    document.querySelectorAll('.preset-btn').forEach((b) => b.classList.toggle('active', b.dataset.preset === preset));
    const hoje = new Date();
    let inicio;
    if (preset === 'mes') {
      inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    } else {
      inicio = addDays(hoje, -(parseInt(preset, 10) - 1));
    }
    state.inicio = toISO(inicio);
    state.fim = toISO(hoje);
    el('fin-data-inicio').value = state.inicio;
    el('fin-data-fim').value = state.fim;
    loadFinanceiro();
  }

  el('btn-fin-aplicar').addEventListener('click', () => {
    const inicio = el('fin-data-inicio').value;
    const fim = el('fin-data-fim').value;
    if (!inicio || !fim || inicio > fim) {
      alert('Selecione um período válido (data inicial não pode ser depois da final).');
      return;
    }
    document.querySelectorAll('.preset-btn').forEach((b) => b.classList.remove('active'));
    state.inicio = inicio;
    state.fim = fim;
    loadFinanceiro();
  });

  // -------------------- Carregamento --------------------
  async function loadFinanceiro() {
    el('fin-loading').classList.remove('hidden');
    el('fin-resumo').classList.add('hidden');
    el('fin-chart-section').classList.add('hidden');

    const [gastosRes, ganhosRes, agendamentosRes] = await Promise.all([
      window.sb.from('gastos').select('*').gte('data', state.inicio).lte('data', state.fim).order('data', { ascending: true }),
      window.sb.from('ganhos').select('*').gte('data', state.inicio).lte('data', state.fim).order('data', { ascending: true }),
      window.sb.from('agendamentos').select('id,data,status').gte('data', state.inicio).lte('data', state.fim)
    ]);

    el('fin-loading').classList.add('hidden');

    if (gastosRes.error || ganhosRes.error || agendamentosRes.error) {
      console.error(gastosRes.error || ganhosRes.error || agendamentosRes.error);
      el('fin-loading').textContent = 'Erro ao carregar dados financeiros.';
      el('fin-loading').classList.remove('hidden');
      return;
    }

    state.gastos = gastosRes.data;
    state.ganhos = ganhosRes.data;
    state.agendamentos = agendamentosRes.data;

    el('fin-resumo').classList.remove('hidden');
    el('fin-chart-section').classList.remove('hidden');

    renderResumo();
    renderChart();
    renderList();
  }

  // -------------------- Resumo --------------------
  function computeSummary() {
    const particularTotal = state.ganhos.filter((g) => g.categoria === 'particular').reduce((s, g) => s + Number(g.valor), 0);
    const uberTotal = state.ganhos.filter((g) => g.categoria === 'uber').reduce((s, g) => s + Number(g.valor), 0);
    const brutoTotal = particularTotal + uberTotal;
    const gastosTotal = state.gastos.reduce((s, g) => s + Number(g.valor), 0);
    const liquido = brutoTotal - gastosTotal;
    const diasTrabalhados = new Set(state.ganhos.map((g) => g.data)).size;
    const totalDias = buildDayRange(state.inicio, state.fim).length;
    const diasNaoTrabalhados = Math.max(0, totalDias - diasTrabalhados);
    const pendentes = state.agendamentos.filter((a) => STATUS_PENDENTE.includes(a.status)).length;
    const recusados = state.agendamentos.filter((a) => STATUS_RECUSADO.includes(a.status)).length;
    return {
      particularTotal, uberTotal, brutoTotal, gastosTotal, liquido,
      diasTrabalhados, diasNaoTrabalhados, totalDias, pendentes, recusados
    };
  }

  function renderResumo() {
    const s = computeSummary();
    el('fin-bruto-particular').textContent = fmtMoeda(s.particularTotal);
    el('fin-bruto-uber').textContent = fmtMoeda(s.uberTotal);
    el('fin-bruto-total').textContent = fmtMoeda(s.brutoTotal);
    el('fin-gastos-total').textContent = fmtMoeda(s.gastosTotal);
    const liqEl = el('fin-liquido');
    liqEl.textContent = fmtMoeda(s.liquido);
    liqEl.classList.toggle('text-emerald-700', s.liquido >= 0);
    liqEl.classList.toggle('text-red-600', s.liquido < 0);
    el('fin-dias-trabalhados').textContent = s.diasTrabalhados;
    el('fin-dias-nao-trabalhados').textContent = s.diasNaoTrabalhados;
    el('fin-pendentes').textContent = s.pendentes;
    el('fin-recusados').textContent = s.recusados;
  }

  // -------------------- Grafico --------------------
  function renderChart() {
    const days = buildDayRange(state.inicio, state.fim);
    const workedSet = new Set(state.ganhos.map((g) => g.data));

    const byDay = {};
    days.forEach((d) => { byDay[d] = { particular: 0, uber: 0, gastos: 0, pendentes: 0, recusados: 0 }; });
    state.ganhos.forEach((g) => { byDay[g.data][g.categoria] += Number(g.valor); });
    state.gastos.forEach((g) => { byDay[g.data].gastos += Number(g.valor); });
    state.agendamentos.forEach((a) => {
      if (STATUS_PENDENTE.includes(a.status)) byDay[a.data].pendentes += 1;
      else if (STATUS_RECUSADO.includes(a.status)) byDay[a.data].recusados += 1;
    });

    const labels = days.map((d) => fmtData(d).slice(0, 5));
    const particularData = days.map((d) => byDay[d].particular);
    const uberData = days.map((d) => byDay[d].uber);
    const gastosData = days.map((d) => byDay[d].gastos);
    const liquidoData = days.map((d) => byDay[d].particular + byDay[d].uber - byDay[d].gastos);
    const naoTrabalhadoData = days.map((d) => (workedSet.has(d) ? null : 1));
    const pendentesData = days.map((d) => byDay[d].pendentes);
    const recusadosData = days.map((d) => byDay[d].recusados);

    const datasets = [
      { _key: 'particular', type: 'line', label: 'Ganhos particular', data: particularData, borderColor: '#2b5a8a', backgroundColor: '#2b5a8a', tension: 0.25, pointRadius: 2, hidden: !state.seriesVisible.particular, order: 1 },
      { _key: 'uber', type: 'line', label: 'Ganhos Uber', data: uberData, borderColor: '#111111', backgroundColor: '#111111', tension: 0.25, pointRadius: 2, hidden: !state.seriesVisible.uber, order: 1 },
      { _key: 'gastos', type: 'line', label: 'Gastos', data: gastosData, borderColor: '#c0392b', backgroundColor: '#c0392b', tension: 0.25, pointRadius: 2, hidden: !state.seriesVisible.gastos, order: 1 },
      { _key: 'liquido', type: 'line', label: 'Líquido', data: liquidoData, borderColor: '#1f6b3f', backgroundColor: '#1f6b3f', borderWidth: 2.5, tension: 0.25, pointRadius: 2, hidden: !state.seriesVisible.liquido, order: 1 },
      { _key: 'naoTrabalhado', type: 'bar', label: 'Dias não trabalhados', data: naoTrabalhadoData, backgroundColor: 'rgba(160,160,160,0.35)', yAxisID: 'y1', barPercentage: 1, categoryPercentage: 1, hidden: !state.seriesVisible.naoTrabalhado, order: 10 },
      { _key: 'pendentes', type: 'bar', label: 'Orçamentos pendentes', data: pendentesData, backgroundColor: 'rgba(217,119,6,0.6)', yAxisID: 'yCount', hidden: !state.seriesVisible.pendentes, order: 5 },
      { _key: 'recusados', type: 'bar', label: 'Orçamentos recusados/cancelados', data: recusadosData, backgroundColor: 'rgba(138,31,31,0.6)', yAxisID: 'yCount', hidden: !state.seriesVisible.recusados, order: 5 }
    ];

    if (state.chart) {
      state.chart.data.labels = labels;
      state.chart.data.datasets = datasets;
      state.chart.update();
      return;
    }

    state.chart = new Chart(el('fin-chart').getContext('2d'), {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                if (ctx.dataset._key === 'naoTrabalhado') return ctx.raw ? 'Dia não trabalhado' : null;
                if (ctx.dataset._key === 'pendentes' || ctx.dataset._key === 'recusados') return `${ctx.dataset.label}: ${ctx.raw}`;
                return `${ctx.dataset.label}: ${fmtMoeda(ctx.raw)}`;
              }
            }
          }
        },
        scales: {
          y: { beginAtZero: true, ticks: { callback: (v) => 'R$ ' + v } },
          y1: { display: false, min: 0, max: 1 },
          yCount: {
            position: 'right',
            beginAtZero: true,
            ticks: { stepSize: 1, precision: 0 },
            grid: { drawOnChartArea: false },
            title: { display: true, text: 'Qtd.' }
          }
        }
      }
    });
  }

  document.querySelectorAll('[data-series]').forEach((chk) => {
    chk.addEventListener('change', () => {
      const key = chk.dataset.series;
      state.seriesVisible[key] = chk.checked;
      if (!state.chart) return;
      const ds = state.chart.data.datasets.find((d) => d._key === key);
      if (ds) { ds.hidden = !chk.checked; state.chart.update(); }
    });
  });

  // -------------------- Listas --------------------
  document.querySelectorAll('[data-fin-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.activeListTab = btn.dataset.finTab;
      document.querySelectorAll('[data-fin-tab]').forEach((b) => b.classList.toggle('active', b.dataset.finTab === state.activeListTab));
      renderList();
    });
  });

  function renderList() {
    const items = state.activeListTab === 'ganhos' ? state.ganhos : state.gastos;
    const sorted = [...items].sort((a, b) => (a.data < b.data ? 1 : -1));
    el('fin-list-empty').classList.toggle('hidden', sorted.length > 0);
    el('fin-list').innerHTML = '';

    sorted.forEach((item) => {
      const row = document.createElement('div');
      row.className = 'fin-list-row flex items-start justify-between gap-3';
      if (state.activeListTab === 'ganhos') {
        row.innerHTML = `
          <div class="text-sm">
            <p class="text-xs text-gray-400 mb-1">${fmtData(item.data)}</p>
            <span class="badge-categoria-${item.categoria} text-xs font-medium px-2 py-0.5 rounded-full">${item.categoria === 'uber' ? 'Uber' : 'Particular'}</span>
            ${item.agendamento_id ? `<span class="text-xs text-gray-400 ml-1">· via agenda</span>` : ''}
            ${item.tipo_corrida ? `<span class="text-xs text-gray-500 ml-1">${esc(TIPO_CORRIDA_LABEL[item.tipo_corrida] || item.tipo_corrida)}</span>` : ''}
            ${item.partida || item.chegada ? `<p class="text-gray-600 mt-1">${esc(item.partida || '—')} → ${esc(item.chegada || '—')}</p>` : ''}
            ${item.observacoes ? `<p class="text-gray-400 text-xs mt-1">${esc(item.observacoes)}</p>` : ''}
          </div>
          <div class="text-right shrink-0">
            <p class="font-semibold text-emerald-700">${fmtMoeda(item.valor)}</p>
            <button data-del-ganho="${item.id}" class="text-xs text-gray-400 hover:text-red-600 mt-1">Excluir</button>
          </div>
        `;
      } else {
        row.innerHTML = `
          <div class="text-sm">
            <p class="text-xs text-gray-400 mb-1">${fmtData(item.data)}</p>
            <span class="badge-categoria-${item.categoria} text-xs font-medium px-2 py-0.5 rounded-full">${esc(CATEGORIA_GASTO_LABEL[item.categoria] || item.categoria)}</span>
            ${item.subcategoria ? `<span class="text-xs text-gray-500 ml-1">${esc(item.subcategoria)}</span>` : ''}
            ${item.descricao ? `<p class="text-gray-400 text-xs mt-1">${esc(item.descricao)}</p>` : ''}
          </div>
          <div class="text-right shrink-0">
            <p class="font-semibold text-red-600">${fmtMoeda(item.valor)}</p>
            <button data-del-gasto="${item.id}" class="text-xs text-gray-400 hover:text-red-600 mt-1">Excluir</button>
          </div>
        `;
      }
      el('fin-list').appendChild(row);
    });

    el('fin-list').querySelectorAll('[data-del-ganho]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('Excluir este ganho?')) return;
        await window.sb.from('ganhos').delete().eq('id', btn.dataset.delGanho);
        await loadFinanceiro();
      });
    });
    el('fin-list').querySelectorAll('[data-del-gasto]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('Excluir este gasto?')) return;
        await window.sb.from('gastos').delete().eq('id', btn.dataset.delGasto);
        await loadFinanceiro();
      });
    });
  }

  // -------------------- Modal: novo gasto --------------------
  el('btn-novo-gasto').addEventListener('click', () => {
    el('gasto-form').reset();
    el('gasto-error').classList.add('hidden');
    el('gasto-data').value = state.fim || toISO(new Date());
    el('gasto-categoria').value = 'combustivel';
    toggleSubcategoriaWrap();
    el('modal-gasto').classList.remove('hidden');
  });
  el('btn-close-modal-gasto').addEventListener('click', () => el('modal-gasto').classList.add('hidden'));

  function toggleSubcategoriaWrap() {
    el('gasto-subcategoria-wrap').classList.toggle('hidden', el('gasto-categoria').value !== 'manutencao');
  }
  el('gasto-categoria').addEventListener('change', toggleSubcategoriaWrap);

  el('gasto-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const categoria = fd.get('categoria');
    const valor = parseFloat(fd.get('valor'));
    if (!(valor >= 0)) {
      el('gasto-error').textContent = 'Informe um valor válido.';
      el('gasto-error').classList.remove('hidden');
      return;
    }
    const payload = {
      data: fd.get('data'),
      categoria,
      subcategoria: categoria === 'manutencao' ? ((fd.get('subcategoria') || '').trim() || null) : null,
      descricao: (fd.get('descricao') || '').trim() || null,
      valor
    };
    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    const { error } = await window.sb.from('gastos').insert(payload);
    submitBtn.disabled = false;

    if (error) {
      console.error(error);
      el('gasto-error').textContent = 'Não foi possível salvar o gasto. Tente novamente.';
      el('gasto-error').classList.remove('hidden');
      return;
    }
    el('modal-gasto').classList.add('hidden');
    await loadFinanceiro();
  });

  // -------------------- Modal: novo ganho --------------------
  el('btn-novo-ganho').addEventListener('click', () => {
    el('ganho-form').reset();
    el('ganho-error').classList.add('hidden');
    el('ganho-data').value = state.fim || toISO(new Date());
    el('ganho-categoria').value = 'particular';
    toggleTipoCorridaWrap();
    el('modal-ganho').classList.remove('hidden');
  });
  el('btn-close-modal-ganho').addEventListener('click', () => el('modal-ganho').classList.add('hidden'));

  function toggleTipoCorridaWrap() {
    el('ganho-tipo-corrida-wrap').classList.toggle('hidden', el('ganho-categoria').value !== 'uber');
  }
  el('ganho-categoria').addEventListener('change', toggleTipoCorridaWrap);

  el('ganho-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const categoria = fd.get('categoria');
    const valor = parseFloat(fd.get('valor'));
    if (!(valor >= 0)) {
      el('ganho-error').textContent = 'Informe um valor válido.';
      el('ganho-error').classList.remove('hidden');
      return;
    }
    const payload = {
      data: fd.get('data'),
      categoria,
      tipo_corrida: categoria === 'uber' ? fd.get('tipo_corrida') : null,
      partida: (fd.get('partida') || '').trim() || null,
      chegada: (fd.get('chegada') || '').trim() || null,
      valor,
      observacoes: (fd.get('observacoes') || '').trim() || null
    };
    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    const { error } = await window.sb.from('ganhos').insert(payload);
    submitBtn.disabled = false;

    if (error) {
      console.error(error);
      el('ganho-error').textContent = 'Não foi possível salvar o ganho. Tente novamente.';
      el('ganho-error').classList.remove('hidden');
      return;
    }
    el('modal-ganho').classList.add('hidden');
    await loadFinanceiro();
  });

  // -------------------- Exportacao --------------------
  function periodoLabel() {
    return `${fmtData(state.inicio)} a ${fmtData(state.fim)}`;
  }

  el('btn-export-pdf').addEventListener('click', () => {
    if (!state.inicio) return;
    const s = computeSummary();
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    doc.setFontSize(14);
    doc.text('Relatório financeiro — Osvair Dos Santos', 14, 16);
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Período: ${periodoLabel()}`, 14, 23);

    doc.setTextColor(0);
    doc.autoTable({
      startY: 28,
      theme: 'plain',
      styles: { fontSize: 9 },
      body: [
        ['Bruto particular', fmtMoeda(s.particularTotal)],
        ['Bruto Uber', fmtMoeda(s.uberTotal)],
        ['Bruto total', fmtMoeda(s.brutoTotal)],
        ['Gastos', fmtMoeda(s.gastosTotal)],
        ['Líquido', fmtMoeda(s.liquido)],
        ['Dias trabalhados', String(s.diasTrabalhados)],
        ['Dias não trabalhados', String(s.diasNaoTrabalhados)],
        ['Orçamentos pendentes', String(s.pendentes)],
        ['Recusados/cancelados', String(s.recusados)]
      ]
    });

    let y = doc.lastAutoTable.finalY + 8;
    doc.setFontSize(11);
    doc.text('Ganhos', 14, y);
    doc.autoTable({
      startY: y + 3,
      head: [['Data', 'Categoria', 'Tipo', 'Partida', 'Chegada', 'Valor']],
      body: [...state.ganhos].sort((a, b) => a.data < b.data ? -1 : 1).map((g) => [
        fmtData(g.data),
        g.categoria === 'uber' ? 'Uber' : 'Particular',
        g.tipo_corrida ? (TIPO_CORRIDA_LABEL[g.tipo_corrida] || g.tipo_corrida) : '—',
        g.partida || '—',
        g.chegada || '—',
        fmtMoeda(g.valor)
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [17, 17, 17] }
    });

    y = doc.lastAutoTable.finalY + 8;
    doc.setFontSize(11);
    doc.text('Gastos', 14, y);
    doc.autoTable({
      startY: y + 3,
      head: [['Data', 'Categoria', 'Item', 'Descrição', 'Valor']],
      body: [...state.gastos].sort((a, b) => a.data < b.data ? -1 : 1).map((g) => [
        fmtData(g.data),
        CATEGORIA_GASTO_LABEL[g.categoria] || g.categoria,
        g.subcategoria || '—',
        g.descricao || '—',
        fmtMoeda(g.valor)
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [17, 17, 17] }
    });

    doc.save(`financeiro_${state.inicio}_a_${state.fim}.pdf`);
  });

  el('btn-export-xlsx').addEventListener('click', () => {
    if (!state.inicio) return;
    const s = computeSummary();

    const resumoSheet = XLSX.utils.aoa_to_sheet([
      ['Relatório financeiro — Osvair Dos Santos'],
      [`Período: ${periodoLabel()}`],
      [],
      ['Bruto particular', s.particularTotal],
      ['Bruto Uber', s.uberTotal],
      ['Bruto total', s.brutoTotal],
      ['Gastos', s.gastosTotal],
      ['Líquido', s.liquido],
      ['Dias trabalhados', s.diasTrabalhados],
      ['Dias não trabalhados', s.diasNaoTrabalhados],
      ['Orçamentos pendentes', s.pendentes],
      ['Recusados/cancelados', s.recusados]
    ]);

    const ganhosSheet = XLSX.utils.json_to_sheet(
      [...state.ganhos].sort((a, b) => a.data < b.data ? -1 : 1).map((g) => ({
        Data: fmtData(g.data),
        Categoria: g.categoria === 'uber' ? 'Uber' : 'Particular',
        Tipo: g.tipo_corrida ? (TIPO_CORRIDA_LABEL[g.tipo_corrida] || g.tipo_corrida) : '',
        Partida: g.partida || '',
        Chegada: g.chegada || '',
        Valor: Number(g.valor),
        Observações: g.observacoes || ''
      }))
    );

    const gastosSheet = XLSX.utils.json_to_sheet(
      [...state.gastos].sort((a, b) => a.data < b.data ? -1 : 1).map((g) => ({
        Data: fmtData(g.data),
        Categoria: CATEGORIA_GASTO_LABEL[g.categoria] || g.categoria,
        Item: g.subcategoria || '',
        Descrição: g.descricao || '',
        Valor: Number(g.valor)
      }))
    );

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, resumoSheet, 'Resumo');
    XLSX.utils.book_append_sheet(wb, ganhosSheet, 'Ganhos');
    XLSX.utils.book_append_sheet(wb, gastosSheet, 'Gastos');
    XLSX.writeFile(wb, `financeiro_${state.inicio}_a_${state.fim}.xlsx`);
  });
})();
