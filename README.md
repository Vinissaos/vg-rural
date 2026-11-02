# VG Rural

SaaS web para gestão de holdings rurais, fazendas, documentos e financeiro,
desenvolvido com **segurança e proteção de dados como requisito principal**.

> **Estado atual:** fundação técnica segura em desenvolvimento. O projeto **ainda
> não tem funcionalidades de negócio** (login, cadastro de fazendas, documentos ou
> financeiro). O que existe hoje é a base de segurança, a infraestrutura local de
> banco de dados, a automação de verificações na CI e a documentação de
> arquitetura das próximas etapas. Detalhes em [Estado atual](#estado-atual-de-desenvolvimento).

## Problema que o projeto busca resolver

Holdings rurais concentram informações críticas: matrículas de imóveis, escrituras,
contratos, documentos fiscais, dados financeiros e societários (sócios, quotas,
CPF/CNPJ). Esse tipo de informação exige controle de acesso rigoroso, isolamento
entre clientes, rastreabilidade e cuidado com a LGPD.

O VG Rural pretende reunir essa gestão em uma aplicação web em que cada holding
tenha seus dados isolados, com autenticação multifator, permissões por papel e
proteção documental. Por isso o desenvolvimento começou pela base de segurança,
antes de qualquer funcionalidade de negócio.

## Funcionalidades implementadas

### Aplicação (Next.js)

- Página inicial institucional e rota de verificação de disponibilidade
  (`/api/health`), sem expor versão, ambiente ou dependências.
- **Content Security Policy com nonce por requisição** (`src/proxy.ts`), com
  `strict-dynamic`, sem `unsafe-inline`/`unsafe-eval` em produção, aplicada também
  a requisições de prefetch.
- **Cabeçalhos de segurança**: HSTS, `X-Content-Type-Options`, `X-Frame-Options`,
  `Referrer-Policy`, `Permissions-Policy`, COOP/CORP e `X-Robots-Tag: noindex`.
- **Validação de variáveis de ambiente com Zod** no build e na inicialização do
  servidor; o build falha se uma variável pública (`NEXT_PUBLIC_*`) parecer segredo.
- Regras de lint que proíbem ler `process.env` fora do módulo validado e citar
  chaves administrativas no código da aplicação.

### Verificações de segurança automatizadas

- **Varredura de segredos no bundle** enviado ao navegador (`scripts/check-bundle-secrets.ts`).
- **Teste de fumaça** que confere cabeçalhos e procura segredos no corpo das
  respostas reais, inclusive páginas 404 e requisições de prefetch
  (`scripts/smoke-headers.ts`), com um segredo-canário gerado a cada execução da CI.
- **Auditoria de dependências bloqueante** (`scripts/audit-gate.ts`): qualquer
  vulnerabilidade conhecida reprova a CI, exceto exceções temporárias registradas,
  com prazo de expiração e condições verificadas automaticamente.
- **gitleaks** sobre todo o histórico do Git, com checksum do binário verificado.
- Política de dependências: versões exatas, lockfile obrigatório, publicação há
  pelo menos 24 h (`minimumReleaseAge`) e scripts de instalação bloqueados.

### Banco de dados local (Supabase) — Etapa 0.2b

- **Supabase local via Docker** com configuração endurecida (`supabase/config.toml`):
  cadastro público desativado, MFA TOTP habilitado, sem SMS, apenas o schema
  `public` exposto pela API e serviços desnecessários desligados.
- **Migração de travas de privilégio**: novos objetos da aplicação não recebem
  acesso automático dos papéis da API, e funções novas não são executáveis por
  `PUBLIC` sem permissão explícita.
- **Testes de banco com pgTAP**: privilégios efetivos, detectores de catálogo
  (RLS forçada, `SECURITY DEFINER`, `security_invoker`, `EXECUTE` público) provados
  por meta-testes em transações descartáveis, e verificação de que nada sobrou.
- **Script de ciclo de vida** (`scripts/supabase-local.ts`): sobe o banco numa rede
  Docker presa a `127.0.0.1`, verifica que nenhuma porta ficou exposta fora do
  localhost, limpa os serviços em caso de falha e mascara chaves nos logs.

### Integração contínua (GitHub Actions)

Quatro jobs, com permissões mínimas e actions fixadas por SHA:

1. Lint, tipos, testes, build e varredura do bundle (mais o teste de fumaça).
2. Vulnerabilidades conhecidas (auditoria de dependências).
3. Banco local e testes de isolamento (Supabase + pgTAP).
4. Detecção de segredos (gitleaks).

Também há Dependabot para atualizações de dependências e das actions.

### Documentação de arquitetura

- 8 ADRs (decisões de arquitetura) em [`docs/adr`](docs/adr): stack, isolamento
  multi-tenant com RLS, cabeçalhos e CSP, autenticação/sessões/MFA, limite de
  requisições, papéis e permissões, auditoria e estratégia de testes.
- [Modelo de ameaças](docs/threat-model.md), [plano LGPD](docs/lgpd/plano-lgpd.md),
  [roteiro](docs/roteiro.md) e [política de segurança](SECURITY.md).

As decisões das ADRs 0002 e 0004 a 0007 estão registradas como **propostas** e
ainda não foram implementadas.

## Tecnologias utilizadas

| Camada                 | Tecnologia                                   |
| ---------------------- | -------------------------------------------- |
| Framework              | Next.js 16 (App Router) e React 19           |
| Linguagem              | TypeScript 6 em modo estrito                 |
| Estilo                 | Tailwind CSS 4                               |
| Validação              | Zod 4                                        |
| Banco local            | Supabase CLI 2.122.0, PostgreSQL 17 (Docker) |
| Testes                 | Vitest (unitários) e pgTAP (banco)           |
| Qualidade              | ESLint 9 e Prettier                          |
| Gerenciador de pacotes | pnpm 10                                      |
| CI/CD                  | GitHub Actions, Dependabot e gitleaks        |

Os scripts de verificação em `scripts/` são TypeScript executado diretamente pelo
Node.js (remoção de tipos nativa).

## Como executar localmente

### Requisitos

- Node.js 22.18 ou superior (versão em `.nvmrc`)
- pnpm 10.28 ou superior
- Docker, apenas para o banco de dados local (`pnpm db:*`)

### Aplicação

```bash
pnpm install --frozen-lockfile
cp .env.example .env.local   # valores locais e fictícios
pnpm dev                     # http://localhost:3000
```

### Verificações

```bash
pnpm test           # testes automatizados
pnpm verify         # formatação, lint, tipos, testes, build e varredura do bundle
pnpm audit:gate     # auditoria de dependências
```

### Banco de dados local (opcional, requer Docker)

```bash
pnpm db:start    # sobe o Supabase local preso a 127.0.0.1 e verifica as portas
pnpm db:verify   # confirma que nenhuma porta ficou exposta fora do localhost
pnpm db:test     # testes pgTAP de privilégios e de catálogo
pnpm db:stop     # para os serviços locais
```

Use sempre `pnpm db:start` em vez de `supabase start` direto. O script cria a rede
local segura e nunca imprime as chaves geradas pelo Supabase.

## Estado atual de desenvolvimento

| Etapa     | Escopo                                                                      | Situação                                                     |
| --------- | --------------------------------------------------------------------------- | ------------------------------------------------------------ |
| 0.1       | Fundação segura: Next.js, TypeScript, testes, CSP, cabeçalhos, CI           | Concluída                                                    |
| 0.2a      | Documentação e decisões de arquitetura (ADRs, ameaças, LGPD)                | Concluída                                                    |
| 0.2b      | Supabase local, migração de privilégios, testes pgTAP e 4º job da CI        | Implementada; aguardando a primeira execução na CI do GitHub |
| 0.2c–0.2g | Tabelas e RLS, permissões, autenticação e MFA, telas, limite de requisições | Planejadas                                                   |
| 1–4       | Holdings e fazendas, documentos, financeiro, societário                     | Planejadas                                                   |

**Ainda não implementado:** login e MFA na aplicação, tabelas de negócio, isolamento
entre organizações por RLS, armazenamento de documentos, módulos financeiro e
societário, limite de requisições, deploy público e PWA.

**Resultados verificados até aqui:**

- 215 testes unitários (Vitest) aprovados.
- 35 asserções pgTAP aprovadas no Supabase local, validadas em ambiente
  descartável. A versão final da Etapa 0.2b ainda precisa rodar na CI.

Todo dado usado em desenvolvimento e testes é **fictício**.

## Capturas de tela

Ainda não há capturas de tela: a interface atual é apenas uma página inicial
provisória, e as telas do produto (login, gestão de fazendas, documentos e
financeiro) ainda não foram desenvolvidas.

## Estrutura

```
src/
  app/                  Rotas (App Router): página inicial e /api/health
  lib/env/              Variáveis de ambiente validadas com Zod
  lib/security/         CSP, cabeçalhos e detecção de segredos
  proxy.ts              CSP com nonce por requisição
  instrumentation.ts    Validação do ambiente na inicialização do servidor
scripts/                Varredura do bundle, teste de fumaça, auditoria e Supabase local
supabase/               Configuração local, migrações e testes pgTAP
tests/                  Testes automatizados (somente dados fictícios)
security/               Exceções temporárias da auditoria de dependências
docs/                   ADRs, modelo de ameaças, LGPD, runbooks e roteiro
.github/                CI, Dependabot e CODEOWNERS
```

## Autor

**Vinicius Gabriel Miranda Neves**
