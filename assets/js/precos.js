(function () {
  const el = (id) => document.getElementById(id);
  const entries = [
    ['Alphaville', 380, 285], ['Alumínio', 140, 105], ['Americana', 550, 412.5],
    ['Aparecida do Norte', 1150, 862.5], ['Apiaí', 1100, 825], ['Araçariguama', 260, 195],
    ['Araçoiaba da Serra', 120, 90], ['Araçoiaba da Serra / Éden - Aparecidinha', 180, 135],
    ['Aramar', 170, 127.5], ['Barueri', 370, 277.5], ['Bertioga', 1150, 862.5],
    ['Boituva', 220, 165], ['Botucatu', 650, 487.5], ['Bragança Paulista', 670, 502.5],
    ['Catarina Aeroporto R. Cast. Branco / Ret. antes Posto Quinta Mar.', 240, 180],
    ['Campinas / Valinhos / Vinhedo', 410, 307.5], ['Capela do Alto', 180, 135],
    ['Carapicuíba', 410, 307.5], ['Cerquilho', 330, 247.5], ['Cesário Lange', 400, 300],
    ['Congonhas / São Paulo Centro', 450, 337.5], ['Congonhas / Itu', 500, 375],
    ['Congonhas / Hotel Fasano - Município Porto Feliz', 600, 450],
    ['Congonhas / Alumínio', 450, 337.5], ['Congonhas / Barueri grande São Paulo / Viracopos', 500, 375],
    ['Congonhas / Condomínio Lago Azul sentido Araçoiaba', 500, 375],
    ['Cotia / Vargem Grande Paulista', 410, 307.5], ['Cumbica / Guarulhos', 500, 375],
    ['Cumbica / Itu', 580, 435], ['Cumbica / Hotel Fasano - Município Porto Feliz', 700, 525],
    ['Cumbica / Alumínio', 500, 375], ['Cumbica / Araçoiaba', 500, 375],
    ['Grande ABC / Campinas / Viracopos / Valinhos', 600, 450],
    ['Guarulhos / Campinas / Valinhos / Vinhedo', 550, 412.5], ['Guapiara', 720, 540],
    ['George Oetterer', 80, 60], ['Holambra', 580, 435], ['Hortolândia / Monte Mor / Sumaré', 450, 337.5],
    ['Hotel Fazenda Boa Vista - Fasano', 180, 135], ['Hora parada em SP', 50, 37.5],
    ['Ibiúna', 300, 225], ['Ilha Comprida', 950, 712.5], ['Indaiatuba', 280, 210],
    ['Itu', 180, 135], ['Iperó', 200, 150], ['Itanhaém', 950, 712.5],
    ['Itapecerica da Serra / Taboão da Serra / Embu das Artes', 410, 307.5],
    ['Itapetininga', 330, 247.5], ['Itatiba', 480, 360], ['Itupeva', 400, 300],
    ['Jaguariúna', 580, 435], ['Jundiaí', 400, 300], ['Mairinque', 150, 112.5],
    ['Mauá / Santo André / São Bernardo / Diadema / São Caetano ABCD', 550, 412.5],
    ['Mogi das Cruzes / Suzano / São José dos Campos', 700, 525],
    ['Mongaguá / Santos / Guarujá / Peruíbe / Praia Grande', 950, 712.5],
    ['Osasco', 400, 300], ['Piedade', 170, 127.5], ['Pilar do Sul', 230, 172.5],
    ['Piracicaba', 420, 315], ['Piracicaba via Aeroporto de Viracopos', 650, 487.5],
    ['Porto Feliz', 180, 135], ['Salto', 250, 187.5], ['Salto de Pirapora', 150, 112.5],
    ['São Paulo / Hotel Fasano - Município Porto Feliz', 580, 435], ['São Roque', 200, 150],
    ['Sarapuí', 260, 195], ['Taxa deslocamento ponto adicional perímetro Sorocaba e Votorantim', 30, 22.5],
    ['Tapiraí', 350, 262.5], ['Tatuí', 300, 225], ['Tietê', 330, 247.5], ['Várzea Paulista', 440, 330],
    ['Viracopos / Origem Boituva / Iperó', 480, 360], ['Viracopos / Alumínio', 400, 300],
    ['Viracopos / Condomínio Lago Azul sentido Araçoiaba', 400, 300],
    ['Viracopos / São Roque / Alumínio / Mairinque', 450, 337.5], ['Viracopos / Itu / Salto', 350, 262.5],
    ['Viracopos / Hotel Fasano - Município Porto Feliz', 450, 337.5],
    ['[Adicional] Deslocamento adicional', 30, 22.5], ['[Adicional] Hora adicional', 50, 37.5],
    ['[Adicional] KM adicional', 4, 3]
  ].map(([label, original, discounted]) => ({ label, original, discounted, additional: label.startsWith('[Adicional]') }));

  const money = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  const normalize = (value) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

  function render() {
    const query = normalize(el('precos-busca').value.trim());
    const onlyAdditional = el('precos-mostrar-adicionais').checked;
    const filtered = entries.filter((entry) => (!query || normalize(entry.label).includes(query)) && (!onlyAdditional || entry.additional));
    const list = el('precos-lista');
    list.innerHTML = '';
    el('precos-empty').classList.toggle('hidden', filtered.length > 0);
    el('precos-contagem').textContent = `${filtered.length} ${filtered.length === 1 ? 'referência' : 'referências'}`;

    filtered.forEach((entry) => {
      const item = document.createElement('article');
      item.className = 'price-item';
      item.setAttribute('role', 'listitem');
      item.innerHTML = `
        <div class="min-w-0">
          <p class="price-item-title">${entry.label}</p>
          <p class="price-item-original">Original: ${money(entry.original)}</p>
        </div>
        <div class="price-item-value">
          <span class="price-item-label">Com 25% OFF</span>
          <strong>${money(entry.discounted)}</strong>
        </div>`;
      list.appendChild(item);
    });
  }

  function showPrices() {
    ['view-dashboard', 'view-financeiro', 'view-recibos'].forEach((id) => el(id).classList.add('hidden'));
    el('view-precos').classList.remove('hidden');
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  el('btn-ir-precos').addEventListener('click', showPrices);
  el('btn-precos-ir-agendamentos').addEventListener('click', () => {
    el('view-precos').classList.add('hidden');
    el('view-dashboard').classList.remove('hidden');
  });
  el('btn-precos-ir-financeiro').addEventListener('click', () => {
    el('view-precos').classList.add('hidden');
    el('btn-ir-financeiro').click();
  });
  el('btn-precos-ir-recibos').addEventListener('click', () => {
    el('view-precos').classList.add('hidden');
    el('btn-ir-recibos').click();
  });
  el('btn-logout-precos').addEventListener('click', async () => {
    await window.sb.auth.signOut();
    el('view-precos').classList.add('hidden');
    el('view-login').classList.remove('hidden');
  });
  el('precos-busca').addEventListener('input', render);
  el('precos-mostrar-adicionais').addEventListener('change', render);
  window.adminPrices = { show: showPrices };
})();
