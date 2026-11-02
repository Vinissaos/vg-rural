-- Etapa 0.2b: travas de privilégio para objetos da APLICAÇÃO.
--
-- Referências:
--   - Supabase, "Securing your API" > "Revoke default privileges".
--   - PostgreSQL 17, ALTER DEFAULT PRIVILEGES: privilégios padrão por schema só
--     somam aos globais; o EXECUTE de PUBLIC em funções é global e só é removido
--     sem IN SCHEMA.
--
-- Esta migração:
--   - não cria tabelas de negócio;
--   - não altera objetos já existentes;
--   - não altera nenhum objeto ou schema administrado pelo Supabase (auth, storage,
--     realtime, graphql, graphql_public, extensions, vault, supabase_*). Os comandos
--     "for role postgres" só afetam objetos criados futuramente pelo papel postgres.

-- 1. Ninguém além do dono cria objetos no schema public.
revoke create on schema public from public, anon, authenticated, service_role;

-- 2. Objetos FUTUROS criados por postgres em public não recebem as concessões
--    automáticas que o Supabase dá aos papéis da Data API (padrão por schema).
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  revoke all on functions from anon, authenticated, service_role;

-- 3. EXECUTE para PUBLIC em funções e procedimentos é padrão GLOBAL do PostgreSQL.
--    Esta forma, sem IN SCHEMA, vale para rotinas criadas por postgres em QUALQUER
--    schema daqui em diante (inclusive app_private e extensões habilitadas por
--    postgres). Cada rotina passa a exigir GRANT EXECUTE explícito para quem a usa,
--    inclusive as funções auxiliares chamadas pelas políticas RLS (Etapa 0.2c).
alter default privileges for role postgres revoke execute on functions from public;

-- 4. Schema privado da aplicação, para as funções auxiliares da Etapa 0.2c.
--    Não está em api.schemas (supabase/config.toml), portanto não é exposto pela API.
create schema if not exists app_private;
revoke all on schema app_private from public, anon, authenticated, service_role;
