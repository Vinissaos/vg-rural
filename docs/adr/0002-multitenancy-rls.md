# ADR 0002: Isolamento entre organizações (multi-tenant) e RLS

- **Status:** Proposto (revisado na Etapa 0.2a; implementação prevista nas Etapas 0.2c e 0.2d)
- **Data:** 2026-10-23 (revisão: 2026-10-27)
- **Relacionados:** [ADR 0004](0004-autenticacao-sessoes-mfa.md) (sessões e MFA),
  [ADR 0006](0006-papeis-permissoes-concessoes.md) (papéis e permissões),
  [ADR 0007](0007-auditoria.md) (auditoria), [ADR 0008](0008-supabase-local-e-testes.md) (testes)

## Contexto

Cada cliente do VG Rural é uma holding com matrículas, escrituras, contratos,
dados financeiros e societários. Um vazamento entre clientes é o pior incidente
possível do produto. Um mesmo usuário pode participar de mais de uma holding e,
dentro de uma holding, ter acesso apenas a algumas fazendas.

## Decisão proposta

Defesa em camadas, **as duas obrigatórias e testadas**:

1. **Autorização no servidor (Next.js):** toda Server Action, rota e carregamento
   de dados verifica sessão, organização ativa, vínculo vigente, permissão e nível
   de MFA antes de agir, num módulo central (`src/lib/authz`). Falha fechada: na
   dúvida, nega.
2. **Row Level Security (PostgreSQL/Supabase)** como última barreira, válida
   mesmo que a camada do servidor falhe.

O Next.js acessa o banco **com o JWT do usuário**. A `service_role` (chave
secreta) não existe no runtime da aplicação.

### Modelo de dados (rascunho)

| Tabela                 | Papel no modelo                                                                                                    |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `organizations`        | A holding: unidade de isolamento (tenant), com `status` (`active`, `sem_responsavel`, …)                           |
| `profiles`             | Dados mínimos do usuário (`user_id` → `auth.users`, nome de exibição)                                              |
| `organization_members` | Vínculo usuário × organização: **um papel por organização**, `status`, `expires_at`, `farm_scope` (`all`/`listed`) |
| `farms`                | Fazendas; cada fazenda pertence a **uma única** organização. Versão mínima na Etapa 0.2c                           |
| `member_farm_scope`    | Lista de fazendas de um membro com escopo `listed` (FKs compostas para o vínculo e para a fazenda)                 |
| `member_grants`        | Concessões explícitas de permissões sensíveis ([ADR 0006](0006-papeis-permissoes-concessoes.md))                   |
| `audit_log`            | Trilha de auditoria só de inserção ([ADR 0007](0007-auditoria.md))                                                 |

- Um usuário pode ter vínculos com várias organizações, com papéis diferentes em
  cada uma. O papel de uma organização **nunca** vale em outra.
- O escopo de fazendas **só restringe**: a permissão efetiva é a interseção entre
  o que o papel (mais as concessões) permite e as fazendas do escopo do membro.
- Visão consolidada entre holdings diferentes está fora do escopo: o usuário tem
  um vínculo em cada uma.

### Escopo de fazendas

| Situação                                         | `farm_scope = all`             | `farm_scope = listed`                                  |
| ------------------------------------------------ | ------------------------------ | ------------------------------------------------------ |
| Registro de uma fazenda da organização           | Acessa (sujeito às permissões) | Acessa só se a fazenda estiver na lista                |
| Fazenda criada depois da atribuição do escopo    | Acessa                         | Não acessa até ser incluída na lista                   |
| Lista vazia                                      | —                              | **Nenhuma** fazenda; não há fallback para "todas"      |
| Registro da holding sem fazenda (`farm_id` nulo) | Acessa (sujeito às permissões) | **Não acessa**                                         |
| Registro ligado a várias fazendas                | Acessa                         | Só se **todas** as fazendas ligadas estiverem na lista |

- **Padrão seguro:** novo vínculo nasce com `listed` e lista vazia, salvo
  atribuição explícita de `all` por quem pode delegá-la. Ausência de linhas
  **nunca** significa acesso total.
- Proprietários têm sempre `all` (garantido por regra no banco).
- Atribuir ou alterar escopo segue o princípio de não delegação do
  [ADR 0006](0006-papeis-permissoes-concessoes.md): quem tem `listed` não atribui
  `all` nem fazendas fora da própria lista.
- Exceções mínimas para membros `listed`, necessárias para operar: ler o próprio
  vínculo e o nome da organização (seletor de organização). São listadas no
  catálogo de exceções e testadas.

### Organização ativa

- É uma escolha de interface guardada em cookie (apenas o identificador, sem
  dado sensível). O servidor **sempre** confere o vínculo antes de usá-la.
- O RLS não depende desse cookie; as consultas também filtram explicitamente
  pela organização.
- Papéis e organizações **não** são gravados como claims no JWT: ficariam
  desatualizados após uma remoção. O vínculo é consultado no banco a cada operação.

### Regras de RLS

1. Toda tabela de negócio tem `organization_id NOT NULL` e RLS `ENABLE` + `FORCE`.
2. Políticas separadas por comando (`SELECT`, `INSERT`, `UPDATE`, `DELETE`),
   aplicadas a `authenticated`. Nenhuma política para `anon`.
3. `UPDATE` sempre com `USING` **e** `WITH CHECK`; `organization_id` imutável
   (revogação de `UPDATE` na coluna ou trigger).
4. Chaves estrangeiras compostas `(organization_id, id)` impedem referências
   entre organizações.
5. Funções auxiliares em schema privado (`app_private`, não exposto pela API):
   `is_member`, `has_permission`, `in_farm_scope`, `is_aal2`, `session_is_active`.
   Todas `SECURITY DEFINER`, `SET search_path = ''`, nomes qualificados, `STABLE`,
   `REVOKE EXECUTE FROM PUBLIC`. Nas políticas, `(select auth.uid())` para desempenho.
6. **Políticas restritivas** (`AS RESTRICTIVE`) em **toda tabela de negócio
   com `organization_id`**, somadas às permissivas, porque todas guardam dados
   de clientes:
   - `aal2` obrigatório (`auth.jwt()->>'aal' = 'aal2'`);
   - **sessão ativa**: o `session_id` do JWT precisa existir em `auth.sessions`,
     o que fecha o intervalo entre o logout e a expiração do token (ADR 0004);
   - vínculo vigente (não removido e dentro de `expires_at`);
   - organização `sem_responsavel` bloqueia alterações sensíveis.
7. **Exceções mínimas**, cada uma justificada, listada num catálogo de exceções
   e coberta por teste:
   - `profiles` (tabela sem `organization_id`): só a **própria** linha, para ler
     e alterar o nome de exibição; é a única leitura permitida em `aal1`,
     necessária na tela do segundo fator. Nunca dados de outros usuários;
   - membros com escopo `listed` leem o próprio vínculo e o nome da organização
     (seletor de organização). É exceção ao escopo de fazendas, **não** ao item 6:
     continuam exigidos `aal2`, sessão ativa e vínculo vigente.

   O cadastro e o desafio de MFA usam as APIs do Supabase Auth, não tabelas de
   negócio, e não precisam de exceção.

8. **Registro de classificação:** toda tabela é classificada como `sensitive` ou
   `standard`. A classificação `sensitive` indica exigências **adicionais** de
   permissão (ex.: `finance.*`, `documents.confidential.*`); as políticas
   restritivas do item 6 valem para as duas classes. Um teste de catálogo falha
   se existir tabela sem classificação, tabela de negócio sem as políticas
   restritivas ou exceção fora do catálogo.
9. Dados críticos dentro de uma entidade (ex.: conta bancária) ficam em **tabela
   separada** com política mais rígida: o RLS controla linhas, não colunas por usuário.
10. Views sempre com `security_invoker = true`. Funções em schemas expostos são
    `SECURITY INVOKER`. Funções `SECURITY DEFINER` só de uma lista permitida,
    verificada por teste.
11. Privilégios padrão revogados: tabelas novas não ganham permissões automáticas
    para `anon`/`authenticated` (`ALTER DEFAULT PRIVILEGES`); cada permissão é
    concedida explicitamente. **A verificar** na implementação, pois o Supabase
    anunciou mudanças nesses padrões.
12. Superfície mínima: desativar `pg_graphql` e Realtime se não forem usados e
    expor apenas o schema necessário.
13. Vínculos, papéis, escopos e concessões **não** são alterados por `INSERT`,
    `UPDATE` ou `DELETE` direto da aplicação: só por funções auditadas que aplicam
    o princípio de não delegação ([ADR 0006](0006-papeis-permissoes-concessoes.md)).
14. Documentos: as políticas consideram a sensibilidade antes (`USING`) e depois
    (`WITH CHECK`) de cada alteração, impedindo reclassificação indevida
    ([ADR 0006](0006-papeis-permissoes-concessoes.md)).
15. Storage (Etapa 2): bucket privado, caminho `{organization_id}/…`, política em
    `storage.objects` consultando a tabela de documentos, download de documentos
    sensíveis por rota do servidor.

## Consequências

- Cada consulta paga o custo das funções auxiliares (vínculo e sessão). É aceito
  em troca da revogação imediata; índices e `(select …)` reduzem o custo.
- A checagem de `auth.sessions` depende de um schema interno do Supabase, usado
  conforme a documentação oficial. Mudanças nele precisam ser acompanhadas.
- Toda tabela nova exige classificação, políticas e testes no mesmo PR.

## Pendências

- Confirmar na implementação o comportamento atual dos privilégios padrão do Supabase.
- Medir o custo das políticas com dados fictícios em volume antes da produção.
- Modelagem de registros ligados a várias fazendas (Etapa 1), mantendo a regra
  de "todas as fazendas ligadas".

## Testes exigidos antes de qualquer usuário real

Ver "Testes de isolamento e permissões" em [`../threat-model.md`](../threat-model.md)
e a estratégia em [ADR 0008](0008-supabase-local-e-testes.md).
