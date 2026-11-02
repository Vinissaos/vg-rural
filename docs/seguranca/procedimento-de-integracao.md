# Procedimento de integração à `main`

> **Por que este documento existe:** o repositório é privado e está no GitHub
> Free, plano em que a proteção obrigatória da `main` (rulesets, branch
> protection e revisão obrigatória de code owners) **não está disponível**. Estas
> regras substituem essa proteção por disciplina documentada. Elas valem para
> pessoas e para agentes de IA, e não são aplicadas automaticamente pelo GitHub.
> Se o plano mudar, aplicar a proteção proposta no fim deste documento.

## Regras obrigatórias

1. **Nunca enviar alterações diretamente para a `main`.** Todo trabalho acontece
   em branches de desenvolvimento.
2. **Toda integração à `main` acontece por Pull Request.**
3. **Antes de cada merge, os três jobs da CI precisam estar verdes no último
   commit do PR:**
   - `Lint, tipos, testes, build e bundle`
   - `Vulnerabilidades conhecidas`
   - `Detecção de segredos (gitleaks)`
4. **Alterações em arquivos críticos exigem revisão manual linha a linha** (lista
   abaixo e em [`.github/CODEOWNERS`](../../.github/CODEOWNERS)).
5. **Nunca fazer merge com testes ou verificações falhando**, nem desativar,
   pular ou enfraquecer verificações para conseguir um resultado verde.
6. **Agentes de IA nunca fazem merge**, não aprovam PRs e não ativam merge
   automático. O merge é sempre uma ação manual do responsável.

## Arquivos críticos (revisão manual obrigatória)

| Caminho                                                           | Por quê                                                               |
| ----------------------------------------------------------------- | --------------------------------------------------------------------- |
| `src/lib/security/`, `src/proxy.ts`, `next.config.ts`             | CSP, cabeçalhos, detecção de segredos e bloqueio de `NEXT_PUBLIC_*`   |
| `src/lib/env/`, `src/instrumentation.ts`                          | Validação de variáveis de ambiente na inicialização                   |
| `eslint.config.mjs`                                               | Regras que bloqueiam `process.env` e chaves administrativas no código |
| `security/`, `scripts/`, `tests/unit/audit-gate.test.ts`          | Exceções de risco, verificação da auditoria e testes que as garantem  |
| `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `.npmrc` | Comandos da CI (ex.: `audit:gate`), versões e regras de instalação    |
| `.github/`                                                        | Workflow da CI, Dependabot e o próprio `CODEOWNERS`                   |
| `supabase/` (a partir da Etapa 0.2b)                              | Configuração do Auth, migrações, políticas RLS, seeds e testes pgTAP  |
| `src/lib/authz/`, `src/lib/supabase/` (a partir da Etapa 0.2e)    | Autorização no servidor e cliente Supabase                            |
| `docs/adr/`                                                       | Decisões de arquitetura e segurança                                   |

Uma mudança nesses caminhos pode desligar uma verificação de segurança e ainda
assim deixar a CI verde, porque a CI executa o código do próprio PR. Por isso o
verde da CI não basta: o diff precisa ser lido.

## Checklist antes de cada merge

- [ ] O PR parte de uma branch de desenvolvimento e tem como destino a `main`.
- [ ] Os três jobs da CI estão verdes **no último commit** do PR (não em um commit anterior).
- [ ] O job `Vulnerabilidades conhecidas` não mostra advisory novo. Os avisos de
      "risco conhecido" correspondem só às exceções vigentes em
      [`vulnerabilidades-conhecidas.md`](vulnerabilidades-conhecidas.md), dentro do prazo.
- [ ] O artefato `auditoria-dependencias` da execução foi baixado e conferido
      (quatro relatórios JSON, sem segredos).
- [ ] O diff de arquivos críticos foi lido por inteiro e as mudanças estão justificadas na descrição do PR.
- [ ] Nenhum teste foi removido, pulado (`.skip`, `.only`) ou enfraquecido sem justificativa aprovada.
- [ ] Nenhum dado real, documento, credencial ou segredo foi incluído.
- [ ] O merge é feito manualmente pelo responsável, de preferência por squash.

A partir da Etapa 0.2b, o job "Banco local e testes de isolamento" (ADR 0008)
também precisa estar verde no último commit.

## Checklist adicional para migrações e políticas RLS (a partir da Etapa 0.2b)

- [ ] Toda tabela nova tem `organization_id NOT NULL`, RLS `ENABLE` + `FORCE` e classificação (`sensitive`/`standard`).
- [ ] Políticas por comando, para `authenticated`; nenhuma para `anon`; `UPDATE` com `USING` e `WITH CHECK`.
- [ ] **Toda** tabela de negócio tem as políticas restritivas (`aal2`, sessão ativa, vínculo vigente); exceções só do catálogo de exceções, com teste.
- [ ] Escopo de fazendas aplicado: `listed` vazio não acessa nada; `listed` não acessa registros sem fazenda.
- [ ] Funções que alteram vínculos, papéis, escopos ou concessões aplicam o princípio de não delegação (ADR 0006) e registram auditoria.
- [ ] Políticas de documentos conferem a classificação em `USING` e `WITH CHECK` (sem reclassificação indevida).
- [ ] Chaves estrangeiras compostas `(organization_id, id)`.
- [ ] Funções `SECURITY DEFINER` só da lista permitida, com `search_path` vazio e `REVOKE EXECUTE FROM PUBLIC`.
- [ ] Views com `security_invoker = true`.
- [ ] Nenhuma permissão concedida a `anon`; permissões a `authenticated` explícitas e justificadas.
- [ ] Testes negativos novos no mesmo PR, incluindo a prova de que falham sem a política.
- [ ] Seeds só com dados fictícios; nenhuma chave do ambiente local commitada.
- [ ] Nenhuma migração aplicada a projeto hospedado sem autorização expressa.
- [ ] Rotinas novas criadas por `postgres` não têm `EXECUTE` para ninguém por padrão
      (revogação global da Etapa 0.2b): cada `GRANT EXECUTE` é explícito e justificado,
      inclusive para funções auxiliares usadas por políticas RLS e para extensões novas.
- [ ] Testes pgTAP rodam inteiros em `begin … rollback`, com objetos de teste
      prefixados por `vg_meta_`.

## Regras para o Supabase local e para os logs da CI (a partir da Etapa 0.2b)

- Iniciar sempre por `pnpm db:start` (rede Docker presa a 127.0.0.1, com verificação
  de portas). A verificação reprova se qualquer porta ficar exposta fora do localhost.
- Proibido na CI: `supabase status`, `--debug`, `supabase link`, impressão crua de
  logs de containers e publicação de artefatos do job do banco.
- No primeiro PR com o job do banco, conferir manualmente o log desse job para
  confirmar que nenhuma chave local apareceu.

## Regras específicas para agentes de IA

- Trabalhar e enviar commits **somente** na branch de desenvolvimento autorizada.
- Não executar `git push` para a `main`, não fazer merge, não aprovar PRs e não
  ativar merge automático.
- Não fazer push sem autorização explícita do responsável.
- Não alterar arquivos críticos sem pedido explícito, e sempre destacá-los no
  resumo entregue ao responsável.
- Relatar falhas de teste ou de CI como elas são, sem contorná-las.

## Se algo for enviado à `main` por engano

1. Não reescrever o histórico da `main` (sem force push).
2. Abrir imediatamente um PR com a reversão (`git revert`) e seguir este procedimento.
3. Se houver suspeita de segredo exposto: considerar o segredo comprometido,
   revogá-lo e trocá-lo **antes** de qualquer limpeza do histórico.

## Pendências registradas

- **Conferência independente do artefato da execução #3 da CI** (commit
  `085c7ed`): o artefato `auditoria-dependencias` foi publicado com quatro
  arquivos, mas não foi possível baixá-lo no ambiente do agente (rede bloqueada).
  A conferência indireta (mesmo commit, relatórios gerados localmente, sem
  segredos) foi feita. Falta a conferência direta pelo responsável.

## Proteção recomendada caso o plano mude (GitHub Pro ou superior)

Ruleset "Proteção da main" na branch padrão, ativo e **sem lista de bypass**:
bloquear exclusão e force push; exigir PR com **0 aprovações** (permite PRs do
próprio autor); exigir resolução de conversas; exigir os três jobs acima como
checks obrigatórios, com branch atualizada; histórico linear opcional. A revisão
obrigatória de code owners só deve ser ativada quando houver um segundo revisor.
