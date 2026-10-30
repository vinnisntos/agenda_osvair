// Barra de navegação inferior do painel (Agenda, Financeiro, Recibos e "+" novo agendamento).
// Reaproveita os botões de navegação já existentes, para não duplicar a lógica de cada tela.
(function () {
  const el = (id) => document.getElementById(id);
  const nav = el('admin-nav');
  const views = { dashboard: el('view-dashboard'), financeiro: el('view-financeiro'), recibos: el('view-recibos'), precos: el('view-precos') };
  const buttons = [...nav.querySelectorAll('[data-go]')];

  function openPrices() {
    if (window.adminPrices && typeof window.adminPrices.show === 'function') {
      window.adminPrices.show();
      return;
    }
    views.dashboard.classList.add('hidden');
    views.financeiro.classList.add('hidden');
    views.recibos.classList.add('hidden');
    views.precos.classList.remove('hidden');
    window.scrollTo(0, 0);
  }

  function go(target) {
    const current = Object.keys(views).find((k) => !views[k].classList.contains('hidden'));
    if (current === target) { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    if (target === 'financeiro') {
      views.recibos.classList.add('hidden');
      views.precos.classList.add('hidden');
      el('btn-ir-financeiro').click(); // carrega o período na primeira vez
    } else if (target === 'recibos') {
      views.precos.classList.add('hidden');
      el('btn-ir-recibos').click();
    } else if (target === 'precos') {
      openPrices();
    } else {
      views.financeiro.classList.add('hidden');
      views.recibos.classList.add('hidden');
      views.precos.classList.add('hidden');
      views.dashboard.classList.remove('hidden');
    }
    window.scrollTo({ top: 0 });
  }

  // a barra acompanha a tela visível (inclusive quando a troca vem de outro botão) e some no login
  function sync() {
    const current = Object.keys(views).find((k) => !views[k].classList.contains('hidden'));
    nav.classList.toggle('hidden', !current);
    buttons.forEach((b) => {
      if (b.dataset.go === current) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    });
  }

  buttons.forEach((b) => b.addEventListener('click', () => go(b.dataset.go)));
  el('btn-ir-precos').addEventListener('click', openPrices);
  nav.querySelector('[data-new]').addEventListener('click', () => el('btn-novo-agendamento').click());

  const obs = new MutationObserver(sync);
  [...Object.values(views), el('view-login')].forEach((v) => obs.observe(v, { attributes: true, attributeFilter: ['class'] }));
  sync();
})();
