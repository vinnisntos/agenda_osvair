# Agenda Osvair — Agendamento Online (Transporte Executivo)

Aplicação estática (HTML + Tailwind CDN + JavaScript vanilla) com persistência em
[Supabase](https://supabase.com). Sem etapa de build — basta subir os arquivos em
qualquer hospedagem estática.

## Estrutura

```
agenda_osvair/
├── index.html                        → app do cliente (solicitar corrida)
├── orcamento.html                    → página pública onde o cliente aprova/recusa o orçamento
├── admin/index.html                  → painel do Osvair (login + gestão)
├── config/
│   ├── appsettings.example.json      → modelo committado no Git (sem segredos)
│   └── appsettings.json              → chaves reais — IGNORADO pelo Git (.gitignore)
├── assets/
│   ├── css/style.css                 → tema grafite/preto/branco, mobile-first
│   └── js/
│       ├── bootstrap.js              → busca config/appsettings.json em runtime,
│       │                               cria o client Supabase e só então carrega
│       │                               os demais scripts da página
│       ├── calendar.js               → calendário mensal reutilizável
│       ├── booking.js                → fluxo do cliente (solicitação)
│       ├── orcamento.js              → fluxo de aprovação do orçamento
│       └── admin.js                  → fluxo do painel
└── supabase/schema.sql               → tabelas, RLS, RPCs e função de disponibilidade
```

**Por que nenhuma chave fica no repositório:** `bootstrap.js` não recebe as
chaves embutidas no JS — ele faz `fetch('/config/appsettings.json')` em tempo
de execução. Esse arquivo é ignorado pelo Git (`.gitignore`) e só existe de
fato no servidor (ver seção 6). O que vai pro GitHub é apenas o modelo
`appsettings.example.json`.

---

## 1. Configurar o Supabase

1. Crie um projeto em [supabase.com](https://supabase.com).
2. Abra **SQL Editor** e execute todo o conteúdo de `supabase/schema.sql`.
   Isso cria as tabelas `agendamentos` e `horarios_bloqueados`, as políticas de
   RLS e as funções (`get_disponibilidade`, `get_solicitacao_publica`,
   `responder_orcamento`) usadas pelo fluxo de orçamento. O script é
   **idempotente** — pode rodar de novo sempre que atualizar o projeto, mesmo
   que o banco já tenha a versão anterior do schema; ele migra os dados
   existentes automaticamente.
3. Em **Authentication → Users**, clique em "Add user" e crie a conta do Osvair
   (e-mail + senha). Esse é o login do painel `/admin`.
4. Em **Authentication → Settings**, desative **"Allow new users to sign up"**
   — assim ninguém além do Osvair consegue criar login.
5. Em **Project Settings → API**, copie a **Project URL** e a **anon public key**.

## 2. Preencher `config/appsettings.json`

Esse arquivo **não existe no Git**. Localmente, copie o modelo e preencha com
os dados reais do seu projeto Supabase:

```bash
cp config/appsettings.example.json config/appsettings.json
```

```json
{
  "SUPABASE_URL": "https://xxxxxxxx.supabase.co",
  "SUPABASE_ANON_KEY": "eyJhbGciOi...",
  "WHATSAPP_NUMBER": "5511999999999",
  "BUSINESS_HOURS": { "START_HOUR": 0, "END_HOUR": 23, "SLOT_MINUTES": 60 },
  "MIN_ADVANCE_HOURS": 2,
  "BUSINESS_NAME": "Osvair Dos Santos",
  "BUSINESS_SUBTITLE": "Transporte Executivo · VW Jetta 2019"
}
```

Em produção, esse mesmo arquivo é criado diretamente no servidor AWS (fora do
Git) — ver seção 6.

> A chave `anon` do Supabase é pública por design — a segurança real vem das
> políticas de RLS definidas em `schema.sql`: visitantes só conseguem
> **inserir** solicitações; apenas o Osvair autenticado consegue **ler,
> atualizar ou excluir** agendamentos e bloqueios. Mesmo assim, ela fica de
> fora do repositório para que a rotação/gestão da chave seja feita só pela
> infraestrutura da AWS, sem precisar de um novo commit.

## 3. Fluxo de solicitação → orçamento → aprovação → agenda

A reserva não é automática: o Osvair decide o valor de cada corrida antes de
qualquer horário ser travado na agenda.

```
Cliente solicita  →  Osvair envia orçamento  →  Cliente aprova  →  Grava na agenda
   (solicitado)         (orcamento_enviado)      (link próprio)       (confirmado)
```

1. **Solicitação** — o cliente escolhe data/horário desejados e envia o
   formulário. Isso cria uma linha em `agendamentos` com `status = "solicitado"`.
   **Esse horário ainda não fica reservado** — outro cliente pode solicitar o
   mesmo horário enquanto não houver aprovação (a agenda é aberta até a
   confirmação).
2. **Orçamento** — no painel (`/admin`), na aba **Solicitações**, o Osvair
   clica em "Enviar orçamento", preenche o valor (e observações, se quiser) e
   confirma. Isso grava `orcamento_valor`/`orcamento_observacoes`, muda o
   status para `orcamento_enviado` e abre o WhatsApp com uma mensagem já
   pronta contendo o valor e um **link exclusivo** de aprovação
   (`orcamento.html?id=...&token=...`).
3. **Aprovação do cliente** — o cliente abre o link (sem precisar de login),
   vê o valor e clica em **"Aprovar e reservar minha data"** ou recusa. Essa
   ação chama a função `responder_orcamento` no banco, validada pelo token
   único daquela solicitação.
4. **Grava na agenda** — só neste momento o status vira `confirmado` e o
   horário passa a contar como ocupado em `get_disponibilidade` — é isso que
   efetivamente bloqueia a data para os demais clientes. Se dois clientes
   aprovarem o mesmo horário quase ao mesmo tempo, o segundo recebe um erro
   amigável (o índice único do banco impede dois agendamentos confirmados no
   mesmo horário).

Se o cliente confirmar por WhatsApp em vez de clicar no link, o Osvair pode
fazer a mesma coisa manualmente: na aba **Orçamentos**, os botões
**"Cliente aprovou"** / **"Cliente recusou"** aplicam a mesma transição.

## 4. Como a integração com o WhatsApp funciona

Não é necessário nenhuma API paga do WhatsApp — tudo usa o link universal
`https://wa.me/<numero>?text=<mensagem>`, em dois momentos:

- **Na solicitação** (`booking.js`): ao enviar o formulário, abre o WhatsApp
  do Osvair com um resumo do pedido, para o cliente confirmar o envio.
- **No envio do orçamento** (`admin.js`): ao clicar em "Enviar orçamento", o
  painel monta a mensagem com o valor e o link de aprovação, e abre o
  WhatsApp *do cliente* (usando o telefone que ele informou no formulário)
  para o Osvair enviar.

```js
const link = `https://wa.me/${numero}?text=${encodeURIComponent(mensagem)}`;
window.open(link, "_blank");
```

Para trocar o número do Osvair, edite `WHATSAPP_NUMBER` em
`config/appsettings.json`.

## 5. Painel do administrador (`/admin`)

- Login via Supabase Auth (e-mail/senha criados no passo 1.3).
- Abas **Solicitações / Orçamentos / Confirmados / Concluídos / Recusados**.
- Aba **Solicitações**: "Enviar orçamento" (abre o modal de valor e manda pelo
  WhatsApp) ou "Recusar" direto.
- Aba **Orçamentos**: "Copiar link" (o mesmo link de aprovação, caso precise
  reenviar), "Cliente aprovou" / "Cliente recusou" (marcação manual, para
  quando a resposta vem por fora do link).
- Aba **Confirmados**: "Concluir" ou "Cancelar".
- Botão **"Bloquear horário"** abre um modal para bloquear um dia inteiro
  (ex: folga) ou um horário específico (ex: manutenção do carro). Bloqueios
  aparecem automaticamente como indisponíveis no site do cliente, através da
  função `get_disponibilidade`.

## 6. Rodar localmente

Como o app faz `fetch` para `config/appsettings.json` e para o Supabase, abra
por um servidor local (não `file://`):

```bash
cp config/appsettings.example.json config/appsettings.json   # preencha antes
npx serve .
# ou
python -m http.server 8080
```

Acesse `http://localhost:PORTA/` (cliente) e `http://localhost:PORTA/admin/`
(painel).

## 7. Deploy na AWS (EC2 + nginx + pm2)

O repositório GitHub nunca terá `config/appsettings.json`. Ele é criado uma
única vez, direto no servidor, fora do controle de versão.

**a) Deploy dos arquivos**

```bash
# no servidor, dentro da pasta do projeto já clonado do GitHub
git clone <url-do-repo> agenda_osvair
cd agenda_osvair

# cria o arquivo de config real, direto no servidor — nunca via commit
cp config/appsettings.example.json config/appsettings.json
nano config/appsettings.json   # preenche SUPABASE_URL, SUPABASE_ANON_KEY, WHATSAPP_NUMBER
```

Em deploys futuros (`git pull`), esse arquivo permanece intacto porque está
no `.gitignore` — o `git pull` nunca sobrescreve nem remove um arquivo
ignorado que já existe localmente.

**b) Servindo com nginx**

Como é um site 100% estático (sem Node por trás), o nginx pode servir a pasta
diretamente — não é necessário processo Node/pm2 nesse caso:

```nginx
server {
    listen 80;
    server_name agenda.osvairsantos.com.br;

    root /var/www/agenda_osvair;
    index index.html;

    location / {
        try_files $uri $uri/ =404;
    }

    location = /config/appsettings.json {
        add_header Cache-Control "no-store";
    }
}
```

Depois rode `certbot --nginx -d agenda.osvairsantos.com.br` para o SSL.

**b-alt) Se preferir servir via pm2** (ex.: já usa pm2 para outros apps e
quer manter o mesmo padrão de operação, com nginx só como proxy/TLS):

```bash
npm install -g serve
```

`ecosystem.config.js`:
```js
module.exports = {
  apps: [{
    name: "agenda-osvair",
    script: "serve",
    args: "-s . -l 3000",
    cwd: "/var/www/agenda_osvair",
    autorestart: true
  }]
};
```

```bash
pm2 start ecosystem.config.js
pm2 save
```

E o nginx faz só o proxy:
```nginx
server {
    listen 80;
    server_name agenda.osvairsantos.com.br;
    location / {
        proxy_pass http://127.0.0.1:3000;
    }
}
```

**c) DNS**

No provedor de DNS de `osvairsantos.com.br`, crie um registro `A` apontando
`agenda` para o IP público da instância EC2 (ou `CNAME` se estiver atrás de
um load balancer/CloudFront).

**d) Atualizações futuras**

```bash
git pull
pm2 restart agenda-osvair   # só se estiver usando a opção pm2
```

`config/appsettings.json` nunca precisa ser tocado de novo, a menos que a
chave do Supabase seja rotacionada.

## 8. Segurança — pontos já cobertos no schema

- **RLS habilitado** nas duas tabelas: visitante anônimo só pode `INSERT` em
  `agendamentos` com `status = 'solicitado'`; leitura/atualização/exclusão
  exigem sessão autenticada (o Osvair).
- **Índice único parcial** `(data, horario) WHERE status = 'confirmado'`
  garante que só existe um agendamento confirmado por horário, mesmo com
  requisições simultâneas — é essa checagem que impede duas aprovações do
  mesmo horário.
- **Função `get_disponibilidade`** roda como `SECURITY DEFINER` e só considera
  agendamentos `confirmado` + bloqueios manuais — solicitações e orçamentos
  ainda em negociação não aparecem como ocupados, e nenhum dado pessoal de
  outros clientes é exposto.
- **Página de aprovação (`orcamento.html`)** não usa login: ela só acessa a
  solicitação certa através das funções `get_solicitacao_publica` e
  `responder_orcamento`, ambas exigindo o `id` **e** o `aprovacao_token`
  (um UUID aleatório específico daquela linha) — sem os dois, nada é
  retornado.
- Textos enviados pelos clientes (nome, origem, destino, observações) são
  escapados antes de renderizar no painel, para evitar XSS.
