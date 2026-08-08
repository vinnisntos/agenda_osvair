// Carrega a configuracao em runtime a partir de /config/appsettings.json — esse arquivo
// NUNCA fica no repositorio Git (veja .gitignore). Em produção ele e colocado manualmente
// no servidor (ou por um script de deploy) com as chaves reais do Supabase.
// Só depois de configurado + client Supabase pronto, carrega os scripts da pagina
// (declarados em data-next no proprio <script src="bootstrap.js">), evitando qualquer
// referencia a window.APP_CONFIG / window.sb antes de existirem.
(async function () {
  // document.currentScript só é valido de forma sincrona, antes do primeiro await.
  const scriptTag = document.currentScript;

  const showFatalError = (msg) => {
    document.body.innerHTML = `
      <div style="max-width:420px;margin:15vh auto;padding:1.5rem;text-align:center;
                  font-family:system-ui,sans-serif;color:#444">
        <p style="font-weight:600;margin-bottom:.5rem">Configuração indisponível</p>
        <p style="font-size:.9rem;color:#777">${msg}</p>
      </div>`;
  };

  let config;
  try {
    const res = await fetch('/config/appsettings.json', { cache: 'no-store' });
    if (!res.ok) throw new Error('http ' + res.status);
    config = await res.json();
  } catch (err) {
    console.error('Falha ao carregar config/appsettings.json', err);
    showFatalError('Não foi possível carregar as configurações do sistema. Verifique se config/appsettings.json existe no servidor (copie de config/appsettings.example.json e preencha as chaves).');
    return;
  }

  window.APP_CONFIG = config;
  window.sb = window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY);

  const nextScripts = (scriptTag.dataset.next || '').split(',').map((s) => s.trim()).filter(Boolean);

  for (const src of nextScripts) {
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error('Falha ao carregar ' + src));
      document.body.appendChild(s);
    });
  }
})();
