# Agenda Osvair

Sistema de agendamento online para transporte executivo, com fluxo de solicitação, orçamento e aprovação do cliente antes da confirmação na agenda.

## Visão geral

Aplicação **web estática**, sem etapa de build, com persistência e autenticação em backend gerenciado (BaaS). Projetada para ser leve, rápida de hospedar e de baixo custo operacional.

## Stack

**Frontend**
- HTML5 + JavaScript (vanilla, ES modules)
- Tailwind CSS (via CDN)
- Sem framework, sem bundler, sem etapa de build

**Backend / Dados**
- [Supabase](https://supabase.com) (PostgreSQL gerenciado)
- Autenticação via Supabase Auth
- Regras de acesso via Row Level Security (RLS)
- Regras de negócio no banco via funções RPC (Postgres functions)

**Integrações**
- WhatsApp (link universal `wa.me`), sem custo de API

**Infraestrutura**
- AWS EC2
- nginx como servidor web / proxy reverso
- SSL via Certbot (Let's Encrypt)
- pm2 (opcional, para deploy via processo Node)
- Deploy via Git (`git pull` no servidor)

## Arquitetura

```
┌──────────────┐        ┌───────────────────┐        ┌──────────────┐
│  Navegador   │◄──────►│   nginx (AWS EC2)   │◄──────►│   Supabase   │
│ HTML/JS/CSS  │  HTTPS │  arquivos estáticos │  HTTPS │  Postgres +  │
└──────────────┘        └───────────────────┘        │  Auth + RLS  │
                                                        └──────────────┘
```

Sem servidor de aplicação: o frontend fala diretamente com o Supabase via SDK JS, protegido por políticas de RLS no banco.

## Características técnicas

- Zero dependências de build — deploy é apenas cópia de arquivos estáticos
- Autenticação e autorização delegadas ao Supabase Auth + RLS
- Design mobile-first
- Painel administrativo autenticado, separado da área pública

---

Projeto privado — código e dados de negócio não incluídos nesta descrição.
