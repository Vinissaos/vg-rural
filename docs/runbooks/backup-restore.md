# Runbook: backup e recuperação (planejamento)

> **Ainda não implementado.** Nenhum backup é considerado válido até passar por
> um **teste real de restauração** documentado.

## Estratégia proposta

| Camada                                                         | Objetivo                                             |
| -------------------------------------------------------------- | ---------------------------------------------------- |
| PITR do banco (Supabase)                                       | Recuperar de erro humano recente (minutos)           |
| Dump lógico diário criptografado em provedor e conta separados | Recuperar de perda do provedor ou da conta principal |
| Cópia dos objetos do Storage para o mesmo destino externo      | Documentos recuperáveis junto com os metadados       |

Metas iniciais propostas: **RPO ≤ 24 h** (dump externo; minutos com PITR) e **RTO ≤ 4 h**.

## Teste de restauração (obrigatório antes de produção e depois trimestral)

1. Restaurar o backup num ambiente isolado, nunca sobre produção.
2. Conferir: contagem de registros por tabela, integridade da cadeia de hash da
   auditoria, hashes SHA-256 de uma amostra de documentos, políticas RLS presentes
   e testes de isolamento passando.
3. Medir o tempo total (comparar com o RTO).
4. Registrar data, responsável, resultado e problemas encontrados.
