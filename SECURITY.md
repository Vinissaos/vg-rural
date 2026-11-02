# Política de segurança: VG Rural

O VG Rural vai armazenar matrículas de imóveis, escrituras, contratos, documentos
fiscais, dados financeiros e societários. Segurança tem prioridade sobre prazo e conveniência.

## Como reportar uma vulnerabilidade

Não abra issue pública. Envie o relato de forma privada aos mantenedores, pelo
recurso de _Private vulnerability reporting_ do GitHub neste repositório (a ser
habilitado) ou pelo contato indicado por eles. Inclua passos para reproduzir e o
impacto. Não acesse dados de terceiros durante a investigação.

## Regras obrigatórias para contribuições

1. **Nenhum segredo no repositório.** Use `.env.local` (ignorado pelo Git). O
   `.env.example` contém apenas nomes e valores fictícios.
2. **Nada sensível no navegador.** Variáveis `NEXT_PUBLIC_*` são públicas. O build
   falha se alguma tiver nome ou valor com aparência de segredo.
3. **Chaves administrativas** (ex.: `service_role` do Supabase) nunca entram no
   runtime do Next.js. O ESLint bloqueia referências a elas em `src/`.
4. **Variáveis de ambiente** só são lidas por `src/lib/env`, sempre validadas com Zod.
5. **Somente dados fictícios** em desenvolvimento, testes, seeds e capturas de tela.
6. **Logs sem dados confidenciais**: nada de conteúdo de documentos, CPF/CNPJ,
   valores financeiros, tokens, cookies ou URLs assinadas.
7. **Nenhuma verificação é desativada para "passar" a CI.** Exceções precisam de
   justificativa escrita, aprovação, prazo de expiração e verificação automática
   (ver `docs/seguranca/vulnerabilidades-conhecidas.md`).
8. **Dependências** com versão exata, lockfile versionado, publicadas há pelo
   menos 24 h (`minimumReleaseAge`) e sem scripts de instalação não aprovados.
9. **PWA (futuro):** é proibido cache offline de dados privados ou documentos.
10. **Integração à `main` só por Pull Request**, com os três jobs da CI verdes,
    revisão manual de arquivos críticos e merge manual (agentes de IA nunca
    fazem merge). Procedimento: [`docs/seguranca/procedimento-de-integracao.md`](docs/seguranca/procedimento-de-integracao.md).

## Controles implementados (Etapa 0.1)

| Controle                                                                                                                                                                        | Onde                                                         | Verificação                     |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------- |
| CSP com nonce por requisição, sem `unsafe-inline`/`eval`                                                                                                                        | `src/proxy.ts`, `src/lib/security/csp.ts`                    | testes unitários + `pnpm smoke` |
| HSTS, nosniff, X-Frame-Options, Referrer/Permissions-Policy, COOP/CORP                                                                                                          | `src/lib/security/headers.ts`                                | testes unitários + `pnpm smoke` |
| `X-Powered-By` removido, sem source maps no navegador                                                                                                                           | `next.config.ts`                                             | testes unitários                |
| Páginas dinâmicas com `Cache-Control: no-store`                                                                                                                                 | `src/app/layout.tsx`                                         | `pnpm smoke`                    |
| Bloqueio de segredos em `NEXT_PUBLIC_*` no build                                                                                                                                | `next.config.ts`                                             | testes unitários                |
| Varredura de segredos no bundle                                                                                                                                                 | `scripts/check-bundle-secrets.ts`                            | CI                              |
| Detecção de segredos no histórico Git                                                                                                                                           | gitleaks na CI                                               | CI                              |
| Auditoria de dependências: `pnpm audit --prod` sem exceções + auditoria completa via `pnpm audit:gate` (exceções temporárias por GHSA, com expiração; relatórios como artefato) | `scripts/audit-gate.ts`, `security/audit-exceptions.json`    | testes unitários + CI           |
| Não indexação: `X-Robots-Tag: noindex, nofollow` em todas as rotas + `metadata.robots`                                                                                          | `src/lib/security/headers.ts`                                | testes unitários + `pnpm smoke` |
| Validação de ambiente no build/dev/start e na inicialização do servidor; produção exige `APP_ENV` e `NEXT_PUBLIC_SITE_URL` explícitos (HTTPS público em staging/produção)       | `next.config.ts`, `src/instrumentation.ts`, `src/lib/env`    | testes unitários                |
| Varredura de segredos no corpo das respostas reais + segredo-canário na CI                                                                                                      | `scripts/smoke-headers.ts`, `scripts/lib/response-checks.ts` | testes unitários + CI           |

Limites da detecção de segredos: [`docs/seguranca/deteccao-de-segredos.md`](docs/seguranca/deteccao-de-segredos.md).
Vulnerabilidades conhecidas em acompanhamento: [`docs/seguranca/vulnerabilidades-conhecidas.md`](docs/seguranca/vulnerabilidades-conhecidas.md).

## Em implementação (Etapa 0.2b, ainda não integrada)

Estes controles existem na branch da Etapa 0.2b e só valem depois de validados
com o Supabase local na CI e integrados à `main`:

| Controle                                                                                                                                                                             | Onde                                                                                                                       | Verificação                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| Supabase **local** com cadastro público desligado, TOTP ligado, SMS e serviços desnecessários desligados, só `public` exposto pela API                                               | `supabase/config.toml`                                                                                                     | testes unitários             |
| Privilégios padrão revogados para objetos da aplicação; `EXECUTE` de `PUBLIC` revogado globalmente para rotinas criadas por `postgres`                                               | `supabase/migrations/`                                                                                                     | pgTAP (pendente de execução) |
| Detectores de catálogo (RLS forçada, `SECURITY DEFINER`, `security_invoker`, `EXECUTE` público) provados por meta-testes descartáveis                                                | `supabase/tests/database/`                                                                                                 | pgTAP (pendente de execução) |
| Portas do Supabase local acessíveis só pelo localhost (rede Docker presa a 127.0.0.1, inspeção, sockets e conexão ativa)                                                             | `scripts/supabase-local.ts`, `scripts/lib/local-network.ts`                                                                | testes unitários + CI        |
| Saída do CLI nunca impressa crua (log temporário exclusivo 700/600, removido ao final); falhas mostram só trechos mascarados por padrões conhecidos; limpeza segura em caso de falha | `scripts/supabase-local.ts`, `scripts/lib/redact-log.ts`, `scripts/lib/secure-log.ts`, `scripts/lib/supabase-lifecycle.ts` | testes unitários             |

Os testes de catálogo **não provam isolamento entre organizações**: isso só será
testado a partir da Etapa 0.2c, com as tabelas de negócio.

## Planejado (Etapa 0.2, decisões propostas)

Nenhum destes controles está implementado. Todos estão registrados como
"Proposto" e só valem depois de implementados, testados e revisados.

| Controle proposto                                                                                                                                                      | Documento                                                 |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Isolamento por organização: autorização no servidor + RLS forçada; `aal2`, sessão ativa e vínculo vigente em toda tabela de negócio; escopo de fazendas `all`/`listed` | [ADR 0002](docs/adr/0002-multitenancy-rls.md)             |
| Supabase Auth somente no servidor, cookies `httpOnly`, token de 15 min, MFA TOTP para todos, dois fatores para proprietários, recuperação com espera de 72 h           | [ADR 0004](docs/adr/0004-autenticacao-sessoes-mfa.md)     |
| Limite de requisições por IP, usuário, organização e operação, com falha segura                                                                                        | [ADR 0005](docs/adr/0005-rate-limiting.md)                |
| Papéis com permissões; não delegação; administradores sem acesso automático a financeiro e confidenciais; proteção contra reclassificação de documentos                | [ADR 0006](docs/adr/0006-papeis-permissoes-concessoes.md) |
| Auditoria só de inserção (privilégios e triggers), autor tirado do JWT, sem IP nesta etapa, exportação externa imutável antes de documentos reais, descarte controlado | [ADR 0007](docs/adr/0007-auditoria.md)                    |
| Supabase local, pgTAP, testes de integração e quarto job da CI                                                                                                         | [ADR 0008](docs/adr/0008-supabase-local-e-testes.md)      |

Regras adicionais que passam a valer a partir da Etapa 0.2:

- A chave secreta de **projeto Supabase hospedado** nunca entra no runtime do
  Next.js nem na CI; scripts administrativos rodam apenas no ambiente do operador.
- As chaves efêmeras do Supabase local só podem ser usadas pelos testes e pela
  preparação de dados fictícios, nunca pelo código da aplicação.
- Nenhuma conexão com projeto Supabase hospedado sem autorização expressa.
- Nenhuma tela de autenticação publicada na internet antes do limite de requisições (Etapa 0.2g).
- Respostas autenticadas nunca entram em cache compartilhado.

Ver também [`docs/threat-model.md`](docs/threat-model.md) e [`docs/roteiro.md`](docs/roteiro.md).
