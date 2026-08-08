(function () {
  const CFG = window.APP_CONFIG;
  const MESES = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
  const DIAS_SEMANA = ['domingo','segunda','terça','quarta','quinta','sexta','sábado'];

  let state = {
    date: null,        // Date (dia local, sem hora)
    time: null,        // "HH:MM"
    horariosOcupados: [],
    diaBloqueado: false
  };

  const el = (id) => document.getElementById(id);

  // -------------------- Calendario --------------------
  const calendarEl = el('calendar');
  createCalendar(calendarEl, {
    minDate: new Date(),
    onSelectDate: async (date) => {
      state.date = date;
      state.time = null;
      el('btn-to-form').disabled = true;
      el('time-section').classList.remove('hidden');
      await loadDisponibilidade(date);
      renderTimeSlots();
    }
  });

  // -------------------- Disponibilidade --------------------
  async function loadDisponibilidade(date) {
    el('time-loading').classList.remove('hidden');
    el('time-empty').classList.add('hidden');
    el('time-grid').innerHTML = '';

    const isoDate = toISODate(date);
    const { data, error } = await window.sb.rpc('get_disponibilidade', { p_data: isoDate });

    el('time-loading').classList.add('hidden');

    if (error) {
      console.error(error);
      el('time-empty').textContent = 'Não foi possível carregar os horários. Tente novamente.';
      el('time-empty').classList.remove('hidden');
      state.horariosOcupados = [];
      state.diaBloqueado = true;
      return;
    }

    state.diaBloqueado = !!data.dia_bloqueado;
    state.horariosOcupados = (data.horarios_ocupados || []).map((t) => t.slice(0, 5));
  }

  function generateSlots() {
    const { START_HOUR, END_HOUR, SLOT_MINUTES } = CFG.BUSINESS_HOURS;
    const slots = [];
    for (let m = START_HOUR * 60; m <= END_HOUR * 60; m += SLOT_MINUTES) {
      const h = String(Math.floor(m / 60)).padStart(2, '0');
      const mm = String(m % 60).padStart(2, '0');
      slots.push(`${h}:${mm}`);
    }
    return slots;
  }

  function isPastForToday(hhmm) {
    const today = new Date();
    const isToday = state.date.toDateString() === today.toDateString();
    if (!isToday) return false;
    const [h, m] = hhmm.split(':').map(Number);
    const slotDate = new Date(today);
    slotDate.setHours(h, m, 0, 0);
    const limit = new Date(today.getTime() + CFG.MIN_ADVANCE_HOURS * 3600 * 1000);
    return slotDate < limit;
  }

  function renderTimeSlots() {
    const grid = el('time-grid');
    grid.innerHTML = '';

    if (state.diaBloqueado) {
      el('time-empty').textContent = 'Osvair não está disponível nesta data.';
      el('time-empty').classList.remove('hidden');
      return;
    }

    const slots = generateSlots();
    let anyAvailable = false;

    slots.forEach((hhmm) => {
      const ocupado = state.horariosOcupados.includes(hhmm);
      const passou = isPastForToday(hhmm);
      const disabled = ocupado || passou;
      if (!disabled) anyAvailable = true;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = hhmm;
      btn.disabled = disabled;
      btn.className = `slot-btn border rounded-xl py-2.5 text-sm font-medium ${
        state.time === hhmm ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-200 text-gray-700'
      }`;
      btn.addEventListener('click', () => {
        state.time = hhmm;
        el('btn-to-form').disabled = false;
        renderTimeSlots();
      });
      grid.appendChild(btn);
    });

    el('time-empty').classList.toggle('hidden', anyAvailable);
    if (!anyAvailable) el('time-empty').textContent = 'Nenhum horário disponível nesta data.';
  }

  // -------------------- Navegacao entre etapas --------------------
  function goToStep(step) {
    ['step-datetime', 'step-form', 'step-success'].forEach((id) => el(id).classList.add('hidden'));
    el(step).classList.remove('hidden');
    const progMap = { 'step-datetime': 1, 'step-form': 2, 'step-success': 3 };
    for (let i = 1; i <= 3; i++) {
      el(`prog-${i}`).className = `h-1 flex-1 rounded-full ${i <= progMap[step] ? 'bg-gray-900' : 'bg-gray-200'}`;
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function formatDateTimeLabel(date, time) {
    return `${DIAS_SEMANA[date.getDay()]}, ${date.getDate()} ${MESES[date.getMonth()]} · ${time}`;
  }

  function toISODate(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  el('btn-to-form').addEventListener('click', () => {
    el('summary-datetime').textContent = formatDateTimeLabel(state.date, state.time);
    goToStep('step-form');
  });

  el('btn-back-to-date').addEventListener('click', () => goToStep('step-datetime'));

  // -------------------- Envio do formulario --------------------
  el('booking-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const fd = new FormData(form);
    const payload = {
      data: toISODate(state.date),
      horario: state.time,
      nome_completo: fd.get('nome_completo').trim(),
      whatsapp: fd.get('whatsapp').trim(),
      origem: fd.get('origem').trim(),
      destino: fd.get('destino').trim(),
      passageiros: parseInt(fd.get('passageiros'), 10),
      malas: parseInt(fd.get('malas'), 10),
      observacoes: (fd.get('observacoes') || '').trim() || null,
      status: 'solicitado'
    };

    const errorEl = el('form-error');
    errorEl.classList.add('hidden');

    const submitBtn = el('btn-submit');
    submitBtn.disabled = true;
    el('btn-submit-text').innerHTML = '<span class="spinner inline-block align-middle"></span>';

    const { error } = await window.sb.from('agendamentos').insert(payload);

    submitBtn.disabled = false;
    el('btn-submit-text').textContent = 'Solicitar agendamento';

    if (error) {
      console.error(error);
      errorEl.textContent = 'Não foi possível enviar sua solicitação. Tente novamente.';
      errorEl.classList.remove('hidden');
      return;
    }

    showSuccess(payload);
    form.reset();
  });

  function buildWhatsAppMessage(p) {
    const label = formatDateTimeLabel(state.date, state.time);
    const lines = [
      `Olá Osvair! Gostaria de solicitar um transporte:`,
      ``,
      `*Data/Horário:* ${label}`,
      `*Nome:* ${p.nome_completo}`,
      `*WhatsApp:* ${p.whatsapp}`,
      `*Origem:* ${p.origem}`,
      `*Destino:* ${p.destino}`,
      `*Passageiros/Malas:* ${p.passageiros} / ${p.malas}`,
    ];
    if (p.observacoes) lines.push(`*Observações:* ${p.observacoes}`);
    lines.push(``, `Aguardo o orçamento, obrigado!`);
    return lines.join('\n');
  }

  function showSuccess(p) {
    const label = formatDateTimeLabel(state.date, state.time);
    el('res-datetime').textContent = label;
    el('res-nome').textContent = p.nome_completo;
    el('res-origem').textContent = p.origem;
    el('res-destino').textContent = p.destino;

    const msg = encodeURIComponent(buildWhatsAppMessage(p));
    const link = `https://wa.me/${CFG.WHATSAPP_NUMBER}?text=${msg}`;
    el('btn-whatsapp').href = link;
    window.open(link, '_blank');

    goToStep('step-success');
  }

  el('btn-new-booking').addEventListener('click', () => {
    state = { date: null, time: null, horariosOcupados: [], diaBloqueado: false };
    el('btn-to-form').disabled = true;
    el('time-section').classList.add('hidden');
    createCalendar(calendarEl, {
      minDate: new Date(),
      onSelectDate: async (date) => {
        state.date = date;
        state.time = null;
        el('btn-to-form').disabled = true;
        el('time-section').classList.remove('hidden');
        await loadDisponibilidade(date);
        renderTimeSlots();
      }
    });
    goToStep('step-datetime');
  });
})();
