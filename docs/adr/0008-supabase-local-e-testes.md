# ADR 0008: Supabase local e estratégia de testes

- **Status:** Em implementação na Etapa 0.2b (validação com o Supabase local pendente);
  as partes das Etapas 0.2c em diante continuam propostas
- **Data:** 2026-10-27 (atualização: 2026-10-28)
- **Relacionados:** [ADR 0002](0002-multitenancy-rls.md), [ADR 0004](0004-autenticacao-sessoes-mfa.md)

## Contexto

As regras de isolamento e permissões precisam ser testadas num banco real antes
de qualquer usuário real, sem conexão com projeto hospedado e sem dados reais.

## Decisão proposta

### Ambiente

- **Supabase local** (Docker) iniciado pelo Supabase CLI. Nenhuma conexão com
  projeto hospedado até autorização expressa.
- **Somente dados fictícios** (ex.: "Fazenda Alfa Ltda." e "Holding Beta S.A."),
  usuários fictícios de cada papel e um usuário com vínculos em duas organizações.
- As chaves do ambiente local são geradas pelo CLI durante a execução, mascaradas
  na CI e **nunca** commitadas.

### Supabase CLI (proposta sujeita a verificação)

- **Via npm, como devDependency com versão exata.** Em 2026-10-26, o pacote
  `supabase` (2.122.0) não tinha script de instalação, distribuía os binários
  por `optionalDependencies` por plataforma (também sem scripts) e tinha
  atestação de proveniência no npm. Isso é compatível com
  `onlyBuiltDependencies: []`, com a integridade do lockfile e com o
  `minimumReleaseAge`.
- Alternativa: binário dos releases oficiais com checksum verificado, como o
  gitleaks na CI.
- **Verificado em 2026-10-28 (Etapa 0.2b), `supabase@2.122.0`:**
  - publicado em 2026-10-23 (respeita o `minimumReleaseAge` de 24 h);
  - sem `preinstall`/`install`/`postinstall` no pacote principal nem nos pacotes de
    plataforma; atestação de proveniência e assinaturas no registro npm;
  - executável `dist/supabase.js` só localiza e executa o binário da plataforma,
    sem baixar nada; a variável `SUPABASE_CLI_BINARY_OVERRIDE` troca o binário e é
    recusada por `scripts/supabase-local.ts`;
  - 15 pacotes novos no lockfile, todos com `integrity` igual à do registro;
    `pnpm install` não pediu build de nenhum deles; `pnpm audit:gate` aprovado sem
    exceções (500 dependências auditadas);
  - `pnpm exec supabase --version` = 2.122.0. O `supabase init` dessa versão foi
    usado só para conferir o template: o `config.toml` usa apenas chaves dele.
- **Ainda a verificar:** as imagens Docker baixadas pelo CLI (fixadas por tag,
  conforme a versão do CLI, não por digest). O CLI também consulta a versão mais
  recente na internet ao rodar `init`; não afeta segurança, mas é registrado.
- **Requisito de Node:** os scripts `.ts` rodam direto no Node, que só remove
  tipos sem flag a partir da 22.18.0 (`engines.node >= 22.18.0`).

### Rede local presa ao localhost

- `pnpm db:start` cria a rede `vg-rural-local` com
  `com.docker.network.bridge.host_binding_ipv4=127.0.0.1` (orientação da
  documentação do Supabase) e inicia com `supabase start --network-id`.
- Reprova (e para os serviços) se: a rede existir sem essa opção; algum container
  publicar porta fora do loopback (`docker inspect`, endereço efetivo); algum socket
  da faixa 54320–54329 escutar fora do loopback (`ss`); ou alguma porta aceitar
  conexão por um endereço externo da máquina (tentativa ativa).
- A opção da rede só controla IPv4; IPv6 é coberto pelas verificações acima.
- Qualquer falha depois de tentar iniciar (inicialização parcial, erro de
  inspeção ou de parsing, porta exposta) dispara `supabase stop --no-backup` deste
  projeto. Uma falha da limpeza é registrada sem esconder a falha original. A
  limpeza nunca remove redes ou containers por nome e nunca é remota.
- A saída do CLI vai para um log num diretório temporário exclusivo (700/600),
  removido ao final de cada comando.

### Migração de privilégios (Etapa 0.2b)

- Revoga, para objetos **futuros da aplicação** criados por `postgres` em `public`,
  as concessões automáticas a `anon`, `authenticated` e `service_role`.
- Revoga o `EXECUTE` de `PUBLIC` na forma **global** (sem `IN SCHEMA`), única que
  funciona no PostgreSQL. Vale para rotinas criadas por `postgres` em qualquer
  schema: funções auxiliares do RLS e extensões habilitadas depois exigem
  `GRANT EXECUTE` explícito.
- Não altera objetos existentes nem schemas administrados pelo Supabase. Os testes
  pgTAP confirmam que `auth.uid()`/`auth.jwt()` continuam executáveis por
  `authenticated` e que `auth.users` continua de `supabase_auth_admin`.

### Meta-testes descartáveis

- Todo arquivo pgTAP roda em `begin … rollback`; objetos de teste usam o prefixo
  `vg_meta_`; o último arquivo confirma que nada sobrou. Testes estáticos (Vitest)
  reprovam arquivo sem `rollback`, com `commit` ou com objeto fora do prefixo.
- Detectores de catálogo vazios **não** são evidência de isolamento entre
  organizações: cada detector é provado por meta-testes que precisam acusar o
  objeto inseguro e ignorar o seguro.

### Camadas de teste

| Camada             | Ferramenta                                       | Cobre                                                                                 |
| ------------------ | ------------------------------------------------ | ------------------------------------------------------------------------------------- |
| Catálogo do banco  | pgTAP (`supabase test db`)                       | RLS forçada, funções, views, privilégios, classificação de tabelas                    |
| Políticas (matriz) | pgTAP, simulando `authenticated` e claims do JWT | Papel × concessão × `aal` × sensibilidade × comando, isolamento entre organizações    |
| Integração         | Vitest contra o Supabase local                   | `authz`, Server Actions, IDOR/BOLA, sessão revogada ou expirada, troca de organização |
| Unidade            | Vitest                                           | Proxy (CSP + cookies), mapa de permissões, validações                                 |
| Respostas e bundle | Smoke e varredura existentes, ampliados          | Cabeçalhos, `no-store`, ausência de tokens e de cliente Supabase no navegador         |

- Funções auxiliares de teste próprias (sem pacotes de terceiros no banco).
- Tokens **expirados** de teste são assinados apenas com a chave do ambiente
  local. Tokens **adulterados** têm assinatura inválida ou feita com outra chave,
  gerada só para o teste. Nenhuma chave de projeto hospedado é usada.
- As chaves efêmeras do Supabase local (inclusive a secreta) só podem ser usadas
  pelos testes e pela preparação dos dados fictícios, nunca pelo código da aplicação.
- **Prova de eficácia:** um roteiro documentado remove uma política de propósito
  e mostra os testes falhando.
- **Testes de navegador completos (ex.: Playwright):** só quando a interface
  exigir, com justificativa própria e revisão da dependência.

### CI

- Um **quarto job** ("Banco local e testes de isolamento") a partir da Etapa
  0.2b, com permissão mínima, timeout e actions fixadas por SHA.
- Os três jobs atuais permanecem inalterados e obrigatórios.

### Validação local de 2026-10-28 (ambiente descartável)

- Docker 29.9.1 com a API só no socket Unix local; Supabase CLI 2.122.0; imagens
  `supabase/postgres:17.11.0.006`, `gotrue:v2.197.0`, `postgrest:v16.5`, `kong:2.8.1`
  (apenas banco, Auth, REST e gateway; demais serviços desligados).
- Rede `vg-rural-local` com `host_binding_ipv4=127.0.0.1`; portas 54321 e 54322
  publicadas só em 127.0.0.1 (inspeção dos containers, sockets em escuta, regras de
  NAT com destino 127.0.0.1 e tentativa ativa recusada pelos endereços externos).
- Migração aplicada pelo papel `postgres` no banco local. `pg_default_acl` de
  `postgres`: entrada global de rotinas sem `PUBLIC`; entradas de `public` sem os
  papéis da Data API. Os padrões do schema `storage` (administrado pelo Supabase)
  continuam concedendo acesso aos papéis da API, como esperado: a aplicação não cria
  objetos nesse schema (atenção na Etapa 2).
- pgTAP: 35 de 35 asserções aprovadas, na ordem 001, 002, 999. O CLI instala o pgTAP
  antes dos testes e não o deixa instalado depois.
- Mutações reais em transação desfeita confirmaram que as checagens não são vazias:
  desfazer a revogação global faz `PUBLIC` executar rotina nova; desfazer a revogação
  por schema faz `anon` ler tabela nova; revogar só com `IN SCHEMA` não remove o
  `EXECUTE` de `PUBLIC` (comportamento documentado do PostgreSQL).
- Auth: cadastro público recusado (`signup_disabled`); `graphql_public` fora da API
  (`PGRST106`); `auth.uid()`/`auth.role()` executáveis por `authenticated`.
- Correções feitas durante a validação: `supabase test db` precisa de
  `--local --network-id vg-rural-local` (senão procura a rede padrão do CLI), e o
  download de imagens imprime URLs pré-assinadas de CDNs e registros, agora mascaradas.

## Consequências

- CI mais lenta e com dependência de Docker; isolado num job próprio para não
  afetar os demais.
- O procedimento de integração passa a exigir quatro jobs verdes a partir da
  Etapa 0.2b.

## Pendências

- Primeira execução **na CI** do job do banco e conferência manual do log desse job.
- Na Etapa 0.2c, um teste de catálogo deve exigir que todo objeto da aplicação
  pertença a `postgres`, porque as travas de privilégio padrão valem só para objetos
  criados por esse papel.
- Comportamento da verificação de rede no Docker Desktop, OrbStack e Podman.
- Tempo de execução aceitável do novo job.
