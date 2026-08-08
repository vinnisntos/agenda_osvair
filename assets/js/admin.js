(function () {
  const el = (id) => document.getElementById(id);
  let currentTab = 'solicitado';
  let allBookings = [];
  let orcamentoBookingId = null;

  // -------------------- Sessao --------------------
  async function init() {
    const { data } = await window.sb.auth.getSession();
    if (data.session) {
      showDashboard();
    } else {
      el('view-login').classList.remove('hidden');
    }
  }

  window.sb.auth.onAuthStateChange((_event, session) => {
    if (session) showDashboard();
  });

  el('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = el('login-email').value.trim();
    const password = el('login-password').value;
    const errorEl = el('login-error');
    errorEl.classList.add('hidden');

    const { error } = await window.sb.auth.signInWithPassword({ email, password });
    if (error) {
      errorEl.textContent = 'E-mail ou senha inválidos.';
      errorEl.classList.remove('hidden');
      return;
    }
    showDashboard();
  });

  el('btn-logout').addEventListener('click', async () => {
    await window.sb.auth.signOut();
    el('view-dashboard').classList.add('hidden');
    el('view-login').classList.remove('hidden');
  });

  function showDashboard() {
    el('view-login').classList.add('hidden');
    el('view-dashboard').classList.remove('hidden');
    setActiveTab('solicitado');
    loadBookings();
  }

  // -------------------- Tabs --------------------
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => setActiveTab(btn.dataset.tab));
  });

  function setActiveTab(tab) {
    currentTab = tab;
    document.querySelectorAll('.tab-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.tab === tab);
    });
    renderList();
  }

  function matchesTab(status, tab) {
    if (tab === 'recusado') return status === 'recusado' || status === 'cancelado';
    return status === tab;
  }

  // -------------------- Listagem --------------------
  async function loadBookings() {
    el('list-loading').classList.remove('hidden');
    el('list-empty').classList.add('hidden');
    el('list').innerHTML = '';

    const { data, error } = await window.sb
      .from('agendamentos')
      .select('*')
      .order('data', { ascending: true })
      .order('horario', { ascending: true });

    el('list-loading').classList.add('hidden');

    if (error) {
      console.error(error);
      el('list').innerHTML = `<p class="text-sm text-red-600">Erro ao carregar agendamentos.</p>`;
      return;
    }

    allBookings = data;
    renderList();
  }

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
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor);
  }

  const STATUS_LABEL = {
    solicitado: 'solicitado',
    orcamento_enviado: 'orçamento enviado',
    confirmado: 'confirmado',
    concluido: 'concluído',
    recusado: 'recusado',
    cancelado: 'cancelado'
  };

  function aprovacaoLink(b) {
    return `${window.location.origin}/orcamento.html?id=${b.id}&token=${b.aprovacao_token}`;
  }

  function renderList() {
    const filtered = allBookings.filter((b) => matchesTab(b.status, currentTab));
    el('list-empty').classList.toggle('hidden', filtered.length > 0);
    el('list').innerHTML = '';

    filtered.forEach((b) => {
      const card = document.createElement('div');
      card.className = 'card-agendamento';
      card.innerHTML = `
        <div class="flex items-start justify-between mb-2">
          <div>
            <p class="font-semibold text-gray-900">${esc(b.nome_completo)}</p>
            <p class="text-xs text-gray-400 mt-0.5">${fmtData(b.data)} · ${b.horario.slice(0,5)}</p>
          </div>
          <span class="badge-${b.status} text-xs font-medium px-2 py-1 rounded-full whitespace-nowrap">${esc(STATUS_LABEL[b.status] || b.status)}</span>
        </div>
        <div class="text-sm text-gray-600 space-y-1 mb-3">
          <p><span class="text-gray-400">De:</span> ${esc(b.origem)}</p>
          <p><span class="text-gray-400">Para:</span> ${esc(b.destino)}</p>
          <p><span class="text-gray-400">Passageiros/Malas:</span> ${Number(b.passageiros)} / ${Number(b.malas)}</p>
          ${b.observacoes ? `<p><span class="text-gray-400">Obs:</span> ${esc(b.observacoes)}</p>` : ''}
          ${b.orcamento_valor != null ? `<p><span class="text-gray-400">Orçamento:</span> <strong class="text-gray-900">${fmtMoeda(b.orcamento_valor)}</strong>${b.orcamento_observacoes ? ' — ' + esc(b.orcamento_observacoes) : ''}</p>` : ''}
        </div>
        <div class="flex items-center gap-2 flex-wrap">
          <a href="https://wa.me/${b.whatsapp.replace(/\D/g,'')}" target="_blank" rel="noopener"
            class="action-btn bg-gray-100 text-gray-700">WhatsApp</a>
          ${actionsFor(b)}
        </div>
      `;
      wireActions(card, b);
      el('list').appendChild(card);
    });
  }

  function actionsFor(b) {
    if (b.status === 'solicitado') {
      return `
        <button data-open-orcamento class="action-btn bg-gray-900 text-white">Enviar orçamento</button>
        <button data-action="recusado" class="action-btn bg-red-50 text-red-600">Recusar</button>
      `;
    }
    if (b.status === 'orcamento_enviado') {
      return `
        <button data-copy-link class="action-btn bg-gray-100 text-gray-700">Copiar link</button>
        <button data-action="confirmado" class="action-btn bg-gray-900 text-white">Cliente aprovou</button>
        <button data-action="recusado" class="action-btn bg-red-50 text-red-600">Cliente recusou</button>
      `;
    }
    if (b.status === 'confirmado') {
      return `
        <button data-action="concluido" class="action-btn bg-gray-900 text-white">Concluir</button>
        <button data-action="cancelado" class="action-btn bg-red-50 text-red-600">Cancelar</button>
      `;
    }
    return '';
  }

  function wireActions(card, booking) {
    card.querySelectorAll('[data-action]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        const { error } = await window.sb
          .from('agendamentos')
          .update({ status: btn.dataset.action })
          .eq('id', booking.id);
        if (error) {
          console.error(error);
          alert(error.code === '23505'
            ? 'Esse horário já foi confirmado em outra solicitação.'
            : 'Não foi possível atualizar o agendamento.');
          btn.disabled = false;
          return;
        }
        await loadBookings();
      });
    });

    const openOrcamentoBtn = card.querySelector('[data-open-orcamento]');
    if (openOrcamentoBtn) {
      openOrcamentoBtn.addEventListener('click', () => openOrcamentoModal(booking));
    }

    const copyLinkBtn = card.querySelector('[data-copy-link]');
    if (copyLinkBtn) {
      copyLinkBtn.addEventListener('click', async () => {
        await navigator.clipboard.writeText(aprovacaoLink(booking));
        const original = copyLinkBtn.textContent;
        copyLinkBtn.textContent = 'Copiado!';
        setTimeout(() => { copyLinkBtn.textContent = original; }, 1500);
      });
    }
  }

  // -------------------- Enviar orçamento --------------------
  function openOrcamentoModal(booking) {
    orcamentoBookingId = booking.id;
    el('orcamento-cliente-info').textContent =
      `${booking.nome_completo} · ${fmtData(booking.data)} às ${booking.horario.slice(0,5)}`;
    el('orcamento-form').reset();
    el('modal-orcamento').classList.remove('hidden');
  }

  el('btn-close-modal-orcamento').addEventListener('click', () => el('modal-orcamento').classList.add('hidden'));

  el('orcamento-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const valor = parseFloat(fd.get('valor'));
    const observacoes = (fd.get('observacoes') || '').trim() || null;

    const submitBtn = el('btn-orcamento-submit');
    submitBtn.disabled = true;

    const { data, error } = await window.sb
      .from('agendamentos')
      .update({ orcamento_valor: valor, orcamento_observacoes: observacoes, status: 'orcamento_enviado' })
      .eq('id', orcamentoBookingId)
      .select()
      .single();

    submitBtn.disabled = false;

    if (error) {
      console.error(error);
      alert('Não foi possível salvar o orçamento. Tente novamente.');
      return;
    }

    const link = aprovacaoLink(data);
    const msg = [
      `Olá ${data.nome_completo}! Segue o orçamento do seu transporte:`,
      ``,
      `Data/Horário: ${fmtData(data.data)} às ${data.horario.slice(0,5)}`,
      `Valor: ${fmtMoeda(data.orcamento_valor)}`,
      observacoes ? `Obs: ${observacoes}` : null,
      ``,
      `Para confirmar, aprove pelo link abaixo:`,
      link
    ].filter(Boolean).join('\n');

    window.open(`https://wa.me/${data.whatsapp.replace(/\D/g,'')}?text=${encodeURIComponent(msg)}`, '_blank');

    el('modal-orcamento').classList.add('hidden');
    await loadBookings();
  });

  // -------------------- Bloqueio de dia/horario --------------------
  el('btn-bloquear').addEventListener('click', () => {
    el('modal-bloqueio').classList.remove('hidden');
    loadBloqueios();
  });
  el('btn-close-modal').addEventListener('click', () => el('modal-bloqueio').classList.add('hidden'));

  el('bloqueio-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = {
      data: fd.get('data'),
      horario: fd.get('horario') || null,
      motivo: fd.get('motivo') || null
    };
    const { error } = await window.sb.from('horarios_bloqueados').insert(payload);
    if (error) {
      alert('Não foi possível bloquear. Tente novamente.');
      return;
    }
    e.target.reset();
    loadBloqueios();
  });

  async function loadBloqueios() {
    const hoje = new Date().toISOString().slice(0, 10);
    const { data, error } = await window.sb
      .from('horarios_bloqueados')
      .select('*')
      .gte('data', hoje)
      .order('data', { ascending: true });

    const container = el('bloqueios-list');
    if (error || !data.length) {
      container.innerHTML = `<p class="text-sm text-gray-400">Nenhum bloqueio futuro.</p>`;
      return;
    }

    container.innerHTML = data.map((bq) => `
      <div class="flex items-center justify-between text-sm border border-gray-100 rounded-lg px-3 py-2">
        <span>${fmtData(bq.data)}${bq.horario ? ' · ' + bq.horario.slice(0,5) : ' · dia todo'}${bq.motivo ? ' — ' + esc(bq.motivo) : ''}</span>
        <button data-del="${bq.id}" class="text-gray-400 hover:text-red-600 text-xs">Remover</button>
      </div>
    `).join('');

    container.querySelectorAll('[data-del]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        await window.sb.from('horarios_bloqueados').delete().eq('id', btn.dataset.del);
        loadBloqueios();
      });
    });
  }

  init();
})();
