-- Etapa 0.2b: privilégios EFETIVOS após a migração de travas de privilégio.
--
-- Roda como postgres dentro de uma transação desfeita no fim (rollback).
-- Os objetos de teste usam o prefixo vg_meta_ e desaparecem com o rollback;
-- 999_sem_residuos_test.sql confirma que nada sobrou.
--
-- Estes testes verificam privilégios e não provam isolamento entre organizações,
-- que só será testado a partir da Etapa 0.2c, com as tabelas de negócio.
begin;

create extension if not exists pgtap with schema extensions;

select plan(17);

-- 1-4. Ninguém além do dono cria objetos no schema public.
select ok(not has_schema_privilege('public', 'public', 'CREATE'),
  'PUBLIC não cria objetos em public');
select ok(not has_schema_privilege('anon', 'public', 'CREATE'),
  'anon não cria objetos em public');
select ok(not has_schema_privilege('authenticated', 'public', 'CREATE'),
  'authenticated não cria objetos em public');
select ok(not has_schema_privilege('service_role', 'public', 'CREATE'),
  'service_role não cria objetos em public');

-- 5. Padrões por schema de postgres em public não concedem nada aos papéis da Data API
--    (consulta da documentação do Supabase, "Check your default privileges").
select is(
  (select count(*)::int
     from pg_default_acl d
     cross join lateral aclexplode(d.defaclacl) a
    where d.defaclrole = 'postgres'::regrole
      and d.defaclnamespace = 'public'::regnamespace
      and a.grantee in ('anon'::regrole, 'authenticated'::regrole, 'service_role'::regrole)),
  0,
  'pg_default_acl de postgres em public não concede nada a anon, authenticated e service_role'
);

-- 6-7. O padrão GLOBAL de rotinas de postgres existe e não concede EXECUTE a PUBLIC.
select ok(
  exists (select 1 from pg_default_acl
           where defaclrole = 'postgres'::regrole
             and defaclnamespace = 0
             and defaclobjtype = 'f'),
  'existe padrão global de rotinas para postgres (revogação sem IN SCHEMA)'
);
select is(
  (select count(*)::int
     from pg_default_acl d
     cross join lateral aclexplode(d.defaclacl) a
    where d.defaclrole = 'postgres'::regrole
      and d.defaclnamespace = 0
      and d.defaclobjtype = 'f'
      and a.grantee = 0
      and a.privilege_type = 'EXECUTE'),
  0,
  'o padrão global de rotinas de postgres não concede EXECUTE a PUBLIC'
);

-- Objetos de teste criados por postgres, como fará uma migração da aplicação.
set local role postgres;
create table public.vg_meta_tabela (id integer);
create sequence public.vg_meta_sequencia;
create function public.vg_meta_funcao() returns integer language sql as $$ select 1 $$;
create procedure public.vg_meta_procedimento() language sql as $$ select 1 $$;
create function app_private.vg_meta_auxiliar() returns integer language sql as $$ select 1 $$;
create schema vg_meta_schema;
create function vg_meta_schema.vg_meta_funcao() returns integer language sql as $$ select 1 $$;

-- 8. Tabela nova em public: nenhum privilégio para os papéis da Data API.
select is(
  (select count(*)::int
     from unnest(array['anon', 'authenticated', 'service_role']) as r(papel)
     cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE',
                             'REFERENCES', 'TRIGGER', 'MAINTAIN']) as p(privilegio)
    where has_table_privilege(r.papel, 'public.vg_meta_tabela', p.privilegio)),
  0,
  'tabela nova em public não concede privilégios a anon, authenticated e service_role'
);

-- 9. Sequência nova em public: nenhum privilégio.
select is(
  (select count(*)::int
     from unnest(array['anon', 'authenticated', 'service_role']) as r(papel)
     cross join unnest(array['USAGE', 'SELECT', 'UPDATE']) as p(privilegio)
    where has_sequence_privilege(r.papel, 'public.vg_meta_sequencia', p.privilegio)),
  0,
  'sequência nova em public não concede privilégios a anon, authenticated e service_role'
);

-- 10-13. Rotinas novas: sem EXECUTE para PUBLIC e para os papéis da Data API,
--        em public, em app_private e em outro schema (alcance global da revogação).
select is(
  (select count(*)::int
     from unnest(array['public', 'anon', 'authenticated', 'service_role']) as r(papel)
    where has_function_privilege(r.papel, 'public.vg_meta_funcao()', 'EXECUTE')),
  0,
  'função nova em public não é executável por PUBLIC, anon, authenticated nem service_role'
);
select is(
  (select count(*)::int
     from unnest(array['public', 'anon', 'authenticated', 'service_role']) as r(papel)
    where has_function_privilege(r.papel, 'public.vg_meta_procedimento()', 'EXECUTE')),
  0,
  'procedimento novo em public não é executável por PUBLIC, anon, authenticated nem service_role'
);
select is(
  (select count(*)::int
     from unnest(array['public', 'anon', 'authenticated', 'service_role']) as r(papel)
    where has_function_privilege(r.papel, 'app_private.vg_meta_auxiliar()', 'EXECUTE')),
  0,
  'função nova em app_private não é executável por PUBLIC, anon, authenticated nem service_role'
);
select is(
  (select count(*)::int
     from unnest(array['public', 'anon', 'authenticated', 'service_role']) as r(papel)
    where has_function_privilege(r.papel, 'vg_meta_schema.vg_meta_funcao()', 'EXECUTE')),
  0,
  'função nova em outro schema também não é executável por PUBLIC (revogação global)'
);

-- 14. Nenhuma rotina de teste tem PUBLIC na ACL (inclusive a ACL padrão implícita).
select is(
  (select count(*)::int
     from pg_proc p
     cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    where p.proname like 'vg\_meta\_%'
      and a.grantee = 0),
  0,
  'nenhuma rotina nova criada por postgres concede privilégio a PUBLIC'
);

-- 15. app_private não é acessível pelos papéis da Data API.
select is(
  (select count(*)::int
     from unnest(array['public', 'anon', 'authenticated', 'service_role']) as r(papel)
    where has_schema_privilege(r.papel, 'app_private', 'USAGE')),
  0,
  'app_private sem USAGE para PUBLIC, anon, authenticated e service_role'
);

reset role;

-- 16-17. Objetos administrados pelo Supabase continuam como estavam: a revogação
--        global vale só para objetos criados futuramente por postgres.
select ok(
  has_function_privilege('authenticated', 'auth.uid()', 'EXECUTE')
  and has_function_privilege('authenticated', 'auth.jwt()', 'EXECUTE'),
  'auth.uid() e auth.jwt() continuam executáveis por authenticated (usados pelo RLS)'
);
select is(
  (select tableowner::text from pg_tables where schemaname = 'auth' and tablename = 'users'),
  'supabase_auth_admin',
  'auth.users continua pertencendo a supabase_auth_admin'
);

select * from finish();

rollback;
