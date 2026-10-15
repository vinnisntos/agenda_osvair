(function () {
  const el = (id) => document.getElementById(id);
  const MESES = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
  const DIAS_SEMANA = ['domingo','segunda','terça','quarta','quinta','sexta','sábado'];

  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  const token = params.get('token');

  let current = null;

  function fmtMoeda(valor) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor);
  }

  function fmtDateTimeLabel(iso, horario) {
    const [y, m, d] = iso.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    return `${DIAS_SEMANA[date.getDay()]}, ${d} ${MESES[m - 1]} · ${horario.slice(0, 5)}`;
  }

  function showState(status) {
    ['solicitado', 'orcamento', 'confirmado', 'recusado', 'concluido'].forEach((s) => {
      el(`state-${s}`)?.classList.add('hidden');
    });
    const map = { solicitado: 'state-solicitado', orcamento_enviado: 'state-orcamento', confirmado: 'state-confirmado', recusado: 'state-recusado', cancelado: 'state-recusado', concluido: 'state-concluido' };
    const target = map[status];
    if (target) el(target).classList.remove('hidden');
    el('orcamento-acoes').classList.toggle('hidden', status !== 'orcamento_enviado');
  }

  function render(row) {
    current = row;
    el('v-datetime').textContent = fmtDateTimeLabel(row.data, row.horario);
    el('v-nome').textContent = row.nome_completo;
    el('v-origem').textContent = row.origem;
    el('v-destino').textContent = row.destino;

    if (row.orcamento_valor != null) {
      el('v-valor').textContent = fmtMoeda(row.orcamento_valor);
      el('v-obs').textContent = row.orcamento_observacoes || '';
    }

    showState(row.status);
    el('loading').classList.add('hidden');
    el('content').classList.remove('hidden');
  }

  async function load() {
    if (!id || !token) {
      el('loading').classList.add('hidden');
      el('not-found').classList.remove('hidden');
      return;
    }

    const { data, error } = await window.sb.rpc('get_solicitacao_publica', { p_id: id, p_token: token });

    if (error || !data) {
      console.error(error);
      el('loading').classList.add('hidden');
      el('not-found').classList.remove('hidden');
      return;
    }

    render(data);
  }

  async function responder(aprovado) {
    const errorEl = el('resposta-erro');
    errorEl.classList.add('hidden');

    const { data, error } = await window.sb.rpc('responder_orcamento', { p_id: id, p_token: token, p_aprovado: aprovado });

    if (error || !data || !data.ok) {
      const motivo = data?.erro === 'horario_indisponivel'
        ? 'Esse horário acabou de ser confirmado em outra solicitação. Fale com o Osvair pelo WhatsApp para ajustar.'
        : 'Não foi possível registrar sua resposta. Atualize a página e tente novamente.';
      errorEl.textContent = motivo;
      errorEl.classList.remove('hidden');
      return false;
    }

    current.status = data.status;
    showState(data.status);
    return true;
  }

  el('btn-aprovar').addEventListener('click', async () => {
    const btn = el('btn-aprovar');
    btn.disabled = true;
    el('btn-aprovar-text').innerHTML = '<span class="spinner inline-block align-middle"></span>';
    await responder(true);
    btn.disabled = false;
    el('btn-aprovar-text').textContent = 'Aprovar e reservar minha data';
  });

  el('btn-recusar').addEventListener('click', () => {
    el('recusar-wrap').classList.add('hidden');
    el('recusar-confirm').classList.remove('hidden');
  });

  el('btn-recusar-cancelar').addEventListener('click', () => {
    el('recusar-confirm').classList.add('hidden');
    el('recusar-wrap').classList.remove('hidden');
  });

  el('btn-recusar-confirmar').addEventListener('click', async () => {
    el('btn-recusar-confirmar').disabled = true;
    await responder(false);
  });

  load();
})();
