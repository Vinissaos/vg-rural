# Vulnerabilidades conhecidas em dependências

A auditoria completa continua **bloqueante** na CI. Ela é feita por
`pnpm audit:gate` (`scripts/audit-gate.ts`), que roda o `pnpm audit` completo,
sem filtro de severidade, e só aceita advisories cobertos por uma exceção
temporária registrada em [`security/audit-exceptions.json`](../../security/audit-exceptions.json),
sob condições verificadas automaticamente. Nenhum override de dependência é usado.

## Como a verificação decide (falha fechada)

| Situação                                                                    | Resultado                                                        |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Só advisories cobertos por exceção válida                                   | Aprova e registra cada um como **risco conhecido** (aviso na CI) |
| Qualquer advisory sem exceção, de qualquer severidade, inclusive transitivo | **Reprova**                                                      |
| Advisory em `pnpm audit --prod` (produção)                                  | **Reprova**: exceções não valem para produção                    |
| Pacote coberto por exceção presente na árvore de produção                   | **Reprova**                                                      |
| Exceção expirada                                                            | **Reprova**                                                      |
| Correção oficial publicada (`patched_versions` diferente de `<0.0.0`)       | **Reprova** e pede atualização e remoção da exceção              |
| Advisory coberto deixou de aparecer                                         | **Reprova** e pede remoção da exceção sem uso                    |
| Mudança de severidade, faixa vulnerável, versão encontrada ou caminho       | **Reprova** e pede reavaliação                                   |
| Relatório inválido, incompleto, inconsistente ou com advisories silenciados | **Reprova**                                                      |
| Auditoria indisponível (ex.: registro fora do ar) ou erro de execução       | **Reprova**                                                      |

Detalhes de implementação verificados durante a análise:

- O advisory é identificado pelo campo `github_advisory_id` do relatório (GHSA),
  além de módulo, severidade, faixas de versões e caminhos exatos.
- A disponibilidade de correção vem do próprio relatório (`patched_versions`),
  sem consulta extra à rede. Isso não adiciona nenhum ponto de falha à CI.
- O campo `dev` do relatório do pnpm **não é confiável** (marcou `false` para a
  cadeia do `braces`, que era só de desenvolvimento). Por isso a presença em produção é verificada
  por `pnpm audit --prod` e pela árvore de `pnpm list --prod`.
- O pnpm usa o código de saída 1 tanto para "há vulnerabilidades" quanto para erros.
  A verificação confere sempre a estrutura e a consistência do relatório.

Os relatórios brutos (`audit-full.json`, `audit-prod.json`, `prod-tree.json`) e o
resultado (`audit-gate-result.json`) são publicados como artefato
`auditoria-dependencias` em toda execução da CI (90 dias). Contêm apenas
metadados públicos de pacotes.

## Exceções ativas

**Nenhuma.** O arquivo `security/audit-exceptions.json` está com a lista vazia:
qualquer advisory, de qualquer severidade e em qualquer dependência, reprova a CI.
O mecanismo de exceções continua disponível para uso futuro, sempre com aprovação
explícita, prazo de expiração e verificação automática.

## Limites conhecidos

- A expiração só é conferida quando a CI roda: a cada push e PR e, depois que o
  workflow estiver na `main`, semanalmente (`schedule`). Antes disso, uma CI
  parada não "fica vermelha" sozinha na data.
- A verificação depende do serviço de auditoria do registro npm. Se ele estiver
  indisponível, a CI reprova (comportamento seguro) e basta reexecutar depois.

## Resolvidas

### GHSA-vfj7-8cjw-p6xm: `braces` (alta): advisory retirado

- **Resolução:** o GitHub **retirou** o advisory em **23/10/2026**, com a
  justificativa _"This advisory has been withdrawn because it's not a practically
  exploitable vulnerability"_. O registro npm deixou de reportá-lo e o
  `pnpm audit` completo passou a mostrar 0 vulnerabilidades, sem nenhuma mudança
  no lockfile.
- **Detecção:** a verificação `pnpm audit:gate` reprovou com "exceção sem uso",
  como projetado, exigindo a remoção da exceção.
- **Ação:** exceção removida de `security/audit-exceptions.json`, com
  autorização do responsável. Nenhuma dependência foi alterada.
- **Histórico da exceção:** temporária, aprovada em 23/10/2026, com validade até
  o fim de 21/11/2026 (horário de Brasília), restrita a desenvolvimento e ao
  caminho único `eslint-config-next@16.4.2` → `@next/eslint-plugin-next@16.4.2`
  → `fast-glob@3.3.1` → `micromatch@4.0.8` → `braces@3.0.3`.
- **Avaliação de exploração registrada na época** (coerente com a retirada): o
  plugin só usa `fast-glob` na regra `no-html-link-for-pages`, com o padrão vindo
  de `settings.next.rootDir` do nosso `eslint.config.mjs`, que não define essa
  opção. A parte vulnerável não recebia entrada externa e não chegava ao servidor
  nem ao bundle.
