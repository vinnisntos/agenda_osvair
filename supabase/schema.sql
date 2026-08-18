-- ============================================================================
-- Agenda Osvair — Schema Supabase
-- Este script é IDEMPOTENTE — pode ser executado novamente sem problemas,
-- inclusive sobre o banco que já tinha a versão anterior (sem o fluxo de
-- orçamento). Ele migra os dados existentes automaticamente.
--
-- Fluxo de status do agendamento:
--   solicitado         -> cliente enviou o pedido. Data/horário AINDA NÃO
--                         ficam reservados — outros clientes podem pedir o
--                         mesmo horário enquanto não houver aprovação.
--   orcamento_enviado  -> admin enviou um valor pelo painel, aguardando a
--                         resposta do cliente.
--   confirmado         -> cliente aprovou o orçamento. SÓ NESTE MOMENTO o
--                         horário é de fato gravado na agenda (bloqueado
--                         para os demais clientes).
--   recusado           -> orçamento recusado (pelo cliente ou pelo admin).
--   concluido          -> corrida realizada.
--   cancelado          -> um agendamento CONFIRMADO que precisou ser
--                         cancelado depois.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- Tabela: agendamentos
-- ----------------------------------------------------------------------------
create table if not exists public.agendamentos (
  id                    uuid primary key default gen_random_uuid(),
  created_at            timestamptz not null default now(),
  data                  date not null,
  horario               time not null,
  nome_completo         text not null,
  whatsapp              text not null,
  origem                text not null,
  destino               text not null,
  passageiros           smallint not null default 1 check (passageiros between 1 and 8),
  malas                 smallint not null default 0 check (malas between 0 and 10),
  observacoes           text,
  status                text not null default 'solicitado'
);

comment on table public.agendamentos is 'Solicitacoes de corrida/transfer feitas pelos clientes.';

-- Colunas novas do fluxo de orcamento (adicionadas via migracao para quem ja tinha a tabela)
alter table public.agendamentos add column if not exists orcamento_valor numeric(10,2);
alter table public.agendamentos add column if not exists orcamento_observacoes text;
alter table public.agendamentos add column if not exists aprovacao_token uuid not null default gen_random_uuid();

-- Migra dados da versao anterior do schema (status 'pendente' deixou de existir)
update public.agendamentos set status = 'solicitado' where status = 'pendente';

-- Enum de status via CHECK constraint (recriada para incluir os novos valores)
alter table public.agendamentos drop constraint if exists agendamentos_status_check;
alter table public.agendamentos add constraint agendamentos_status_check
  check (status in ('solicitado', 'orcamento_enviado', 'confirmado', 'recusado', 'concluido', 'cancelado'));

-- Só um agendamento CONFIRMADO por data/horario — e so o confirmado ocupa a agenda
drop index if exists uniq_agendamento_ativo;
create unique index if not exists uniq_agendamento_confirmado
  on public.agendamentos (data, horario)
  where status = 'confirmado';

create index if not exists idx_agendamentos_data on public.agendamentos (data);
create index if not exists idx_agendamentos_status on public.agendamentos (status);

-- ----------------------------------------------------------------------------
-- Tabela: horarios_bloqueados
-- horario = NULL  -> bloqueia o dia inteiro (ex: manutencao, folga)
-- horario preenchido -> bloqueia apenas aquele horario especifico
-- ----------------------------------------------------------------------------
create table if not exists public.horarios_bloqueados (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  data        date not null,
  horario     time,
  motivo      text
);

comment on table public.horarios_bloqueados is 'Bloqueios manuais feitos pelo admin (folga, manutencao do veiculo, etc).';

create index if not exists idx_bloqueios_data on public.horarios_bloqueados (data);

-- ----------------------------------------------------------------------------
-- RLS (Row Level Security)
-- ----------------------------------------------------------------------------
alter table public.agendamentos enable row level security;
alter table public.horarios_bloqueados enable row level security;

-- Qualquer visitante (anon) pode CRIAR uma solicitacao, sempre como 'solicitado'.
-- Isso NAO reserva o horario — so o campo status='confirmado' faz isso.
drop policy if exists "anon pode inserir agendamento pendente" on public.agendamentos;
drop policy if exists "anon pode inserir solicitacao" on public.agendamentos;
create policy "anon pode inserir solicitacao"
  on public.agendamentos
  for insert
  to anon
  with check (status = 'solicitado');

-- Admin tambem pode criar agendamentos manualmente (cliente por telefone,
-- corrida propria, orcamento manual) direto do painel.
drop policy if exists "admin pode inserir agendamentos" on public.agendamentos;
create policy "admin pode inserir agendamentos"
  on public.agendamentos
  for insert
  to authenticated
  with check (true);

-- Apenas o admin logado (authenticated) pode ver/gerenciar os agendamentos
drop policy if exists "admin pode ver agendamentos" on public.agendamentos;
create policy "admin pode ver agendamentos"
  on public.agendamentos
  for select
  to authenticated
  using (true);

drop policy if exists "admin pode atualizar agendamentos" on public.agendamentos;
create policy "admin pode atualizar agendamentos"
  on public.agendamentos
  for update
  to authenticated
  using (true)
  with check (true);

drop policy if exists "admin pode excluir agendamentos" on public.agendamentos;
create policy "admin pode excluir agendamentos"
  on public.agendamentos
  for delete
  to authenticated
  using (true);

-- horarios_bloqueados: somente admin tem acesso direto.
drop policy if exists "admin pode gerenciar bloqueios" on public.horarios_bloqueados;
create policy "admin pode gerenciar bloqueios"
  on public.horarios_bloqueados
  for all
  to authenticated
  using (true)
  with check (true);

-- ----------------------------------------------------------------------------
-- Funcao publica de disponibilidade
-- So conta como ocupado: agendamentos 'confirmado' + bloqueios manuais.
-- Solicitacoes ainda em 'solicitado'/'orcamento_enviado' NAO bloqueiam o
-- horario para outros clientes — o admin decide qual solicitacao confirmar.
-- ----------------------------------------------------------------------------
create or replace function public.get_disponibilidade(p_data date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dia_bloqueado boolean;
  v_horarios time[];
begin
  select exists (
    select 1 from public.horarios_bloqueados
    where data = p_data and horario is null
  ) into v_dia_bloqueado;

  select coalesce(array_agg(distinct horario), array[]::time[])
  into v_horarios
  from (
    select horario from public.agendamentos
      where data = p_data and status = 'confirmado'
    union
    select horario from public.horarios_bloqueados
      where data = p_data and horario is not null
  ) t;

  return jsonb_build_object(
    'dia_bloqueado', v_dia_bloqueado,
    'horarios_ocupados', to_jsonb(v_horarios)
  );
end;
$$;

grant execute on function public.get_disponibilidade(date) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- Pagina publica de aprovacao do orcamento (link enviado pelo admin via
-- WhatsApp). Acesso restrito por token — sem token certo, nada e retornado.
-- ----------------------------------------------------------------------------
create or replace function public.get_solicitacao_publica(p_id uuid, p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.agendamentos;
begin
  select * into v_row
  from public.agendamentos
  where id = p_id and aprovacao_token = p_token;

  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'id', v_row.id,
    'data', v_row.data,
    'horario', v_row.horario,
    'nome_completo', v_row.nome_completo,
    'origem', v_row.origem,
    'destino', v_row.destino,
    'passageiros', v_row.passageiros,
    'malas', v_row.malas,
    'observacoes', v_row.observacoes,
    'status', v_row.status,
    'orcamento_valor', v_row.orcamento_valor,
    'orcamento_observacoes', v_row.orcamento_observacoes
  );
end;
$$;

grant execute on function public.get_solicitacao_publica(uuid, uuid) to anon;

-- Cliente aprova ou recusa o orcamento. So funciona enquanto o status ainda
-- for 'orcamento_enviado' — evita reaprovar/reprovar depois do fato.
-- Se dois clientes aprovarem o mesmo horario ao mesmo tempo, o segundo recebe
-- erro 'horario_indisponivel' (protegido pelo indice unico uniq_agendamento_confirmado).
create or replace function public.responder_orcamento(p_id uuid, p_token uuid, p_aprovado boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  select status into v_status
  from public.agendamentos
  where id = p_id and aprovacao_token = p_token
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'erro', 'nao_encontrado');
  end if;

  if v_status <> 'orcamento_enviado' then
    return jsonb_build_object('ok', false, 'erro', 'status_invalido', 'status', v_status);
  end if;

  begin
    update public.agendamentos
    set status = case when p_aprovado then 'confirmado' else 'recusado' end
    where id = p_id;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'erro', 'horario_indisponivel');
  end;

  return jsonb_build_object(
    'ok', true,
    'status', case when p_aprovado then 'confirmado' else 'recusado' end
  );
end;
$$;

grant execute on function public.responder_orcamento(uuid, uuid, boolean) to anon;

-- ----------------------------------------------------------------------------
-- Tabela: gastos
-- Controle de despesas do veiculo/operacao (combustivel, manutencao, etc).
-- ----------------------------------------------------------------------------
create table if not exists public.gastos (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  data          date not null,
  categoria     text not null,
  subcategoria  text,
  descricao     text,
  valor         numeric(10,2) not null check (valor >= 0)
);

comment on table public.gastos is 'Despesas do veiculo/operacao: combustivel, manutencao (pneu, freio, oleo...), outros.';

alter table public.gastos drop constraint if exists gastos_categoria_check;
alter table public.gastos add constraint gastos_categoria_check
  check (categoria in ('combustivel', 'manutencao', 'outros'));

create index if not exists idx_gastos_data on public.gastos (data);

alter table public.gastos enable row level security;

drop policy if exists "admin pode gerenciar gastos" on public.gastos;
create policy "admin pode gerenciar gastos"
  on public.gastos
  for all
  to authenticated
  using (true)
  with check (true);

-- ----------------------------------------------------------------------------
-- Tabela: ganhos
-- Corridas/receitas: particulares (feitas fora do app) e da Uber (cheia,
-- aproveitamento de corrida ou dia trabalhado com valor fechado).
-- ----------------------------------------------------------------------------
create table if not exists public.ganhos (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  data          date not null,
  categoria     text not null,
  tipo_corrida  text,
  partida       text,
  chegada       text,
  valor         numeric(10,2) not null check (valor >= 0),
  observacoes   text
);

comment on table public.ganhos is 'Receitas: corridas particulares e corridas/dias trabalhados na Uber.';

-- Vincula o ganho ao agendamento de origem quando a corrida foi concluida
-- direto pela agenda (evita registrar o mesmo agendamento duas vezes: o
-- unique permite reaproveitar o mesmo vinculo se o admin marcar "Concluir"
-- mais de uma vez, e remove o ganho automaticamente se o agendamento for
-- excluido).
alter table public.ganhos add column if not exists agendamento_id uuid references public.agendamentos(id) on delete cascade;

alter table public.ganhos drop constraint if exists ganhos_agendamento_id_key;
alter table public.ganhos add constraint ganhos_agendamento_id_key unique (agendamento_id);

create index if not exists idx_ganhos_agendamento_id on public.ganhos (agendamento_id);

alter table public.ganhos drop constraint if exists ganhos_categoria_check;
alter table public.ganhos add constraint ganhos_categoria_check
  check (categoria in ('particular', 'uber'));

alter table public.ganhos drop constraint if exists ganhos_tipo_corrida_check;
alter table public.ganhos add constraint ganhos_tipo_corrida_check
  check (
    (categoria = 'uber' and tipo_corrida in ('cheia', 'aproveitamento', 'dia_trabalhado'))
    or (categoria = 'particular' and tipo_corrida is null)
  );

create index if not exists idx_ganhos_data on public.ganhos (data);
create index if not exists idx_ganhos_categoria on public.ganhos (categoria);

alter table public.ganhos enable row level security;

drop policy if exists "admin pode gerenciar ganhos" on public.ganhos;
create policy "admin pode gerenciar ganhos"
  on public.ganhos
  for all
  to authenticated
  using (true)
  with check (true);

-- ============================================================================
-- Depois de rodar este script (primeira vez):
-- 1. Em Authentication > Users, crie o usuario do Osvair (email + senha).
-- 2. Em Authentication > Providers/Settings, desative "Allow new users to
--    sign up" para que ninguem alem do Osvair consiga criar conta.
-- ============================================================================
