-- Etapa 0.2b: confirma que os meta-testes não deixaram objetos no banco.
--
-- Todo arquivo de teste roda numa transação desfeita (rollback). Este arquivo,
-- executado por último, verifica que nenhum objeto com o prefixo vg_meta_ ficou
-- para trás em nenhum schema.
begin;

create extension if not exists pgtap with schema extensions;

select plan(3);

select is((select count(*)::int from pg_class where relname like 'vg\_meta\_%'), 0,
  'nenhuma tabela, view ou sequência de meta-teste ficou no banco');
select is((select count(*)::int from pg_proc where proname like 'vg\_meta\_%'), 0,
  'nenhuma rotina de meta-teste ficou no banco');
select is((select count(*)::int from pg_namespace where nspname like 'vg\_meta\_%'), 0,
  'nenhum schema de meta-teste ficou no banco');

select * from finish();

rollback;
