// Calendario mensal simples, sem dependencias externas.
// createCalendar(container, options) devolve { render, getSelected }
function createCalendar(container, { minDate, onSelectDate }) {
  const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  const DIAS = ['D','S','T','Q','Q','S','S'];

  let viewYear = minDate.getFullYear();
  let viewMonth = minDate.getMonth();
  let selected = null;

  function toDateOnly(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  function render() {
    const today = toDateOnly(new Date());
    const firstDay = new Date(viewYear, viewMonth, 1);
    const startWeekday = firstDay.getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

    const canGoPrev = new Date(viewYear, viewMonth, 1) > new Date(minDate.getFullYear(), minDate.getMonth(), 1);

    let html = `
      <div class="cal-head">
        <button type="button" data-nav="prev" class="cal-nav" aria-label="Mês anterior" ${canGoPrev ? '' : 'disabled'}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
        <span class="cal-title" aria-live="polite">${MESES[viewMonth]} ${viewYear}</span>
        <button type="button" data-nav="next" class="cal-nav" aria-label="Próximo mês">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M9 18l6-6-6-6"/></svg>
        </button>
      </div>
      <div class="cal-week" aria-hidden="true">
        ${DIAS.map(d => `<div>${d}</div>`).join('')}
      </div>
      <div class="cal-grid" role="group" aria-label="Dias de ${MESES[viewMonth]}">
    `;

    for (let i = 0; i < startWeekday; i++) html += `<div></div>`;

    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(viewYear, viewMonth, day);
      const dateOnly = toDateOnly(date);
      const isPast = dateOnly < today || dateOnly < toDateOnly(minDate);
      const isSelected = selected && dateOnly.getTime() === selected.getTime();
      const isToday = dateOnly.getTime() === today.getTime();
      html += `<button type="button"
        class="cal-day ${isSelected ? 'selected' : ''} ${isToday ? 'today' : ''}"
        data-day="${day}"
        aria-label="${day} de ${MESES[viewMonth]}${isToday ? ', hoje' : ''}"
        ${isSelected ? 'aria-pressed="true"' : ''}
        ${isPast ? 'disabled' : ''}
      >${day}</button>`;
    }

    html += `</div>`;
    container.innerHTML = html;

    container.querySelector('[data-nav="prev"]')?.addEventListener('click', () => {
      viewMonth--; if (viewMonth < 0) { viewMonth = 11; viewYear--; }
      render();
    });
    container.querySelector('[data-nav="next"]')?.addEventListener('click', () => {
      viewMonth++; if (viewMonth > 11) { viewMonth = 0; viewYear++; }
      render();
    });
    container.querySelectorAll('[data-day]').forEach(btn => {
      btn.addEventListener('click', () => {
        selected = toDateOnly(new Date(viewYear, viewMonth, parseInt(btn.dataset.day, 10)));
        render();
        onSelectDate(selected);
      });
    });
  }

  render();
  return { render, getSelected: () => selected };
}
