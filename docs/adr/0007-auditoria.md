# ADR 0007: Trilha de auditoria

- **Status:** Proposto (implementação prevista na Etapa 0.2c)
- **Data:** 2026-10-27
- **Relacionados:** [ADR 0002](0002-multitenancy-rls.md), [ADR 0006](0006-papeis-permissoes-concessoes.md)

## Contexto

É preciso saber quem alterou acessos, papéis, escopos, concessões, classificação
de documentos e configurações de cada organização, sem criar um novo repositório
de dados confidenciais e sem complexidade desproporcional.

## Decisão proposta

### Estrutura

Uma tabela `audit_log` com:

- `id`, `occurred_at` (padrão `now()`), `organization_id`;
- `actor_user_id` e `actor_session_id`, **obtidos do JWT dentro do banco**,
  nunca recebidos da aplicação, para que o autor não possa ser forjado;
- `action` (lista fechada), `target_type`, `target_id`;
- `details jsonb`, montado pela função a partir de campos conhecidos, **sem
  conteúdo de documentos, CPF/CNPJ, valores financeiros, tokens ou cookies**.

A chave estrangeira para `organizations` **não** apaga em cascata: excluir uma
organização nunca apaga a sua trilha de auditoria.

### Escrita

- Só por triggers nas tabelas de controle de acesso (vínculos, escopos,
  concessões, organização, transferência de propriedade, reclassificação de
  documentos) e pela função `app_private.log_event()` (`SECURITY DEFINER`,
  `search_path` fixo).
- Ninguém grava diretamente na tabela.

### Proteção contra UPDATE, DELETE e TRUNCATE

Camadas, da mais forte para a mais fraca diante de cada tipo de conta:

| Camada                                                                                                                                                                                             | Protege contra                                             |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| **Privilégios:** tabela pertence a um papel dedicado sem login (`audit_owner`); `anon`, `authenticated` e `service_role` sem `INSERT`, `UPDATE`, `DELETE` nem `TRUNCATE`; `REVOKE ALL FROM PUBLIC` | A aplicação, a API de dados e a chave secreta              |
| **RLS forçada** sem políticas de `UPDATE`/`DELETE`                                                                                                                                                 | Acesso pela API, mesmo com privilégio concedido por engano |
| **Triggers:** `BEFORE UPDATE OR DELETE ... FOR EACH ROW` e `BEFORE TRUNCATE ... FOR EACH STATEMENT` que sempre falham (exceto o descarte controlado abaixo)                                        | Erros de manutenção e contas com privilégio de tabela      |
| **Exportação externa imutável** (antes da produção)                                                                                                                                                | Contas privilegiadas do banco                              |

**Limitações diante de contas privilegiadas (registradas, não resolvidas no banco):**

- `service_role` ignora o RLS (`BYPASSRLS`), mas não os privilégios: por isso os
  privilégios são revogados também dela.
- O dono da tabela e superusuários (ex.: `postgres` e contas administrativas do
  Supabase) podem desativar triggers (`ALTER TABLE ... DISABLE TRIGGER`),
  alterar `session_replication_role` (que impede o disparo de triggers comuns),
  apagar ou recriar a tabela.
- Portanto, **o banco sozinho não garante imutabilidade**. A garantia vem da
  exportação periódica para armazenamento externo imutável (com bloqueio de
  retenção), mais a conferência periódica entre o banco e a exportação
  (quantidade de registros e sequência de `id` sem lacunas inexplicadas), mais o
  acesso restrito e com MFA às contas privilegiadas.
- Avaliar na implementação se o Supabase permite _event triggers_ para registrar
  alterações de estrutura (DDL) na tabela de auditoria.

### Sem cadeia de hash nesta etapa (proposta)

- Uma cadeia de hash exige serializar as escritas (disputa e complexidade) e
  não protege contra quem tem acesso de superusuário: ele pode recalcular a cadeia.
- Compensação obrigatória: as camadas acima mais a **exportação externa imutável
  e a conferência periódica, exigidas antes de qualquer documento real** (gate do
  roteiro).
- Esta decisão altera o que constava no modelo de ameaças inicial e deve ser
  revista se a exportação externa não for viável.

### Leitura

Permissão `audit.read` (proprietário, ou administrador com concessão), `aal2`,
sessão ativa e somente a própria organização.

### Sem IP nesta etapa (proposta)

O IP não é registrado na auditoria da Etapa 0.2. A decisão será revista junto
com o limite de requisições ([ADR 0005](0005-rate-limiting.md)) e a política de
retenção do plano LGPD.

### Descarte controlado (LGPD)

- Prazos de retenção por tipo de ação, definidos no plano LGPD (⚖️).
- Descarte **somente** por uma função de manutenção executada por um papel
  dedicado (`audit_retention`), nunca pela aplicação, pela API ou por usuários.
- O trigger permite `DELETE` apenas quando o executor é esse papel **e** o
  registro é mais antigo que o prazo vigente, lido de uma tabela de configuração
  que a aplicação não altera. `UPDATE` e `TRUNCATE` continuam sempre bloqueados.
- Cada descarte gera um registro próprio na auditoria (período, quantidade e
  tipos de ação, sem conteúdo) e é refletido na exportação externa, cujo
  bloqueio de retenção segue os mesmos prazos.
- O procedimento é documentado e testado antes da produção.

## Testes obrigatórios

1. `INSERT`, `UPDATE`, `DELETE` e `TRUNCATE` diretos negados para `anon`,
   `authenticated` e `service_role`.
2. Triggers rejeitam `UPDATE`, `DELETE` e `TRUNCATE` mesmo de um papel com
   privilégio na tabela.
3. O autor registrado é o do JWT, mesmo que a chamada tente informar outro.
4. Mudanças de papel, escopo, concessões, transferência de propriedade e
   reclassificação de documentos geram registro.
5. Leitura de auditoria de outra organização negada; leitura sem `aal2` ou sem
   `audit.read` negada.
6. `details` contém apenas os campos permitidos.
7. Descarte: o papel `audit_retention` apaga só registros vencidos; registros
   dentro do prazo e qualquer outro papel são rejeitados; o descarte gera registro.
8. Excluir uma organização não apaga a sua auditoria.

## Pendências

- Lista fechada de ações da primeira versão.
- Prazos de retenção (plano LGPD) e destino da exportação externa.
- Viabilidade de _event triggers_ no Supabase.
