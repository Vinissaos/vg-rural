-- Etapa 0.2b: detectores de catálogo e meta-testes.
--
-- Os detectores procuram, nos schemas da aplicação (public e app_private):
--   - tabelas sem RLS ativada E forçada;
--   - rotinas SECURITY DEFINER em schema exposto ou sem search_path fixo;
--   - views sem security_invoker (e views materializadas, que ignoram RLS);
--   - rotinas executáveis por PUBLIC.
--
-- Na Etapa 0.2b ainda não há tabelas de negócio: detector vazio NÃO é evidência de
-- isolamento entre organizações. Por isso cada detector é provado por meta-testes:
-- objetos inseguros (e seguros, como controle) são criados dentro desta transação,
-- e o detector precisa acusar os inseguros e ignorar os seguros. Tudo é desfeito
-- pelo rollback; 999_sem_residuos_test.sql confirma que nada sobrou.
begin;

create extension if not exists pgtap with schema extensions;

select plan(15);

create function pg_temp.vg_tabelas_sem_rls()
returns table (objeto text) language sql stable as $$
  select format('%I.%I', n.nspname, c.relname)
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname in ('public', 'app_private')
     and c.relkind in ('r', 'p')
     and not (c.relrowsecurity and c.relforcerowsecurity)
$$;

create function pg_temp.vg_rotinas_definer_inseguras()
returns table (objeto regprocedure) language sql stable as $$
  select p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where p.prosecdef
     and n.nspname in ('public', 'app_private')
     and (
       n.nspname = 'public'
       or not exists (
         select 1
           from unnest(coalesce(p.proconfig, '{}'::text[])) as c(cfg)
          where c.cfg like 'search_path=%'
       )
     )
$$;

create function pg_temp.vg_views_sem_security_invoker()
returns table (objeto text) language sql stable as $$
  select format('%I.%I', n.nspname, c.relname)
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname in ('public', 'app_private')
     and (
       c.relkind = 'm'
       or (
         c.relkind = 'v'
         and not exists (
           select 1
             from unnest(coalesce(c.reloptions, '{}'::text[])) as o(opt)
            where lower(o.opt) in ('security_invoker=true', 'security_invoker=on',
                                   'security_invoker=1', 'security_invoker=yes')
         )
       )
     )
$$;

create function pg_temp.vg_rotinas_executaveis_por_public()
returns table (objeto regprocedure) language sql stable as $$
  select p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
   where n.nspname in ('public', 'app_private')
     and a.grantee = 0
     and a.privilege_type = 'EXECUTE'
$$;

select diag(
  'Objetos da aplicação examinados antes dos meta-testes: '
  || (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname in ('public', 'app_private') and c.relkind in ('r', 'p', 'v', 'm'))
  || ' tabelas/views e '
  || (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname in ('public', 'app_private'))
  || ' rotinas. Catálogo vazio não prova isolamento entre organizações.'
);

-- 1-4. Estado atual do banco: nenhum objeto inseguro nos schemas da aplicação.
select is_empty('select * from pg_temp.vg_tabelas_sem_rls()',
  'nenhuma tabela da aplicação sem RLS ativada e forçada');
select is_empty('select * from pg_temp.vg_rotinas_definer_inseguras()',
  'nenhuma rotina SECURITY DEFINER exposta ou sem search_path fixo');
select is_empty('select * from pg_temp.vg_views_sem_security_invoker()',
  'nenhuma view sem security_invoker nem view materializada');
select is_empty('select * from pg_temp.vg_rotinas_executaveis_por_public()',
  'nenhuma rotina da aplicação executável por PUBLIC');

-- Meta-testes: objetos inseguros e seguros, criados como postgres nesta transação.
set local role postgres;

create table public.vg_meta_sem_rls (id integer);

create table public.vg_meta_rls_sem_force (id integer);
alter table public.vg_meta_rls_sem_force enable row level security;

create table public.vg_meta_rls_completa (id integer);
alter table public.vg_meta_rls_completa enable row level security;
alter table public.vg_meta_rls_completa force row level security;

create view public.vg_meta_view_insegura as select 1 as x;
create view public.vg_meta_view_segura with (security_invoker = true) as select 1 as x;
create materialized view public.vg_meta_view_materializada as select 1 as x;

create function public.vg_meta_definer_publica() returns integer
  language sql security definer set search_path = '' as $$ select 1 $$;
create function app_private.vg_meta_definer_sem_search_path() returns integer
  language sql security definer as $$ select 1 $$;
create function app_private.vg_meta_definer_segura() returns integer
  language sql security definer set search_path = '' as $$ select 1 $$;

create function public.vg_meta_executavel() returns integer language sql as $$ select 1 $$;
grant execute on function public.vg_meta_executavel() to public;

reset role;

-- 5-7. Detector de RLS.
select ok(exists (select 1 from pg_temp.vg_tabelas_sem_rls() where objeto = 'public.vg_meta_sem_rls'),
  'meta-teste: tabela sem RLS é acusada');
select ok(exists (select 1 from pg_temp.vg_tabelas_sem_rls() where objeto = 'public.vg_meta_rls_sem_force'),
  'meta-teste: tabela com RLS ativada mas não forçada é acusada');
select ok(not exists (select 1 from pg_temp.vg_tabelas_sem_rls() where objeto = 'public.vg_meta_rls_completa'),
  'controle: tabela com RLS ativada e forçada não é acusada');

-- 8-10. Detector de views.
select ok(exists (select 1 from pg_temp.vg_views_sem_security_invoker() where objeto = 'public.vg_meta_view_insegura'),
  'meta-teste: view sem security_invoker é acusada');
select ok(exists (select 1 from pg_temp.vg_views_sem_security_invoker() where objeto = 'public.vg_meta_view_materializada'),
  'meta-teste: view materializada em schema da aplicação é acusada');
select ok(not exists (select 1 from pg_temp.vg_views_sem_security_invoker() where objeto = 'public.vg_meta_view_segura'),
  'controle: view com security_invoker não é acusada');

-- 11-13. Detector de SECURITY DEFINER.
select ok(exists (select 1 from pg_temp.vg_rotinas_definer_inseguras() where objeto = 'public.vg_meta_definer_publica()'::regprocedure),
  'meta-teste: SECURITY DEFINER em schema exposto é acusada, mesmo com search_path');
select ok(exists (select 1 from pg_temp.vg_rotinas_definer_inseguras() where objeto = 'app_private.vg_meta_definer_sem_search_path()'::regprocedure),
  'meta-teste: SECURITY DEFINER sem search_path fixo é acusada');
select ok(not exists (select 1 from pg_temp.vg_rotinas_definer_inseguras() where objeto = 'app_private.vg_meta_definer_segura()'::regprocedure),
  'controle: SECURITY DEFINER em app_private com search_path vazio não é acusada');

-- 14-15. Detector de rotinas executáveis por PUBLIC.
select ok(exists (select 1 from pg_temp.vg_rotinas_executaveis_por_public() where objeto = 'public.vg_meta_executavel()'::regprocedure),
  'meta-teste: rotina com EXECUTE concedido a PUBLIC é acusada');
select ok(not exists (select 1 from pg_temp.vg_rotinas_executaveis_por_public() where objeto = 'app_private.vg_meta_definer_segura()'::regprocedure),
  'controle: rotina nova sem GRANT explícito não é executável por PUBLIC');

select * from finish();

rollback;
