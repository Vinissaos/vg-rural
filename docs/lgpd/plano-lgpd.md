# Plano de conformidade com a LGPD (planejamento)

> Documento de planejamento técnico. Não substitui orientação jurídica: os
> itens marcados (⚖️) precisam de validação por profissional do direito.

## Dados pessoais previstos

| Categoria                    | Exemplos                                            | Origem                 |
| ---------------------------- | --------------------------------------------------- | ---------------------- |
| Identificação de usuários    | nome, e-mail, telefone                              | cadastro               |
| Sócios e representantes      | nome, CPF, estado civil, endereço, participação     | documentos societários |
| Proprietários e contrapartes | nome, CPF/CNPJ em matrículas, escrituras, contratos | documentos             |
| Financeiros                  | dados bancários, valores, recebíveis                | lançamentos            |
| Registros de acesso          | data/hora, ações, sessão (trilha de auditoria)      | sistema                |
| Autenticação                 | e-mail, fatores de MFA (no Supabase Auth), sessões  | cadastro e login       |
| Recuperação de acesso        | telefone ou e-mail de contato pré-cadastrado        | cadastro (proposto)    |

## Decisões da Etapa 0.2a (propostas)

Ver [ADR 0004](../adr/0004-autenticacao-sessoes-mfa.md), [ADR 0005](../adr/0005-rate-limiting.md)
e [ADR 0007](../adr/0007-auditoria.md).

- **Auditoria sem IP** nesta etapa (minimização). O registro de IP será
  reavaliado com o limite de requisições, com base legal e retenção definidas. ⚖️
- A auditoria não guarda conteúdo de documentos, CPF/CNPJ, valores financeiros,
  tokens nem cookies.
- **Descarte controlado da auditoria:** registros vencidos só são apagados por
  função de manutenção executada por papel dedicado, conforme prazos por tipo de
  ação; cada descarte é registrado sem conteúdo e refletido na exportação
  externa, cujo bloqueio de retenção segue os mesmos prazos. ⚖️
- Contadores de limite de requisições usam identificadores derivados (hash) com
  expiração curta.
- O contato de recuperação de MFA é dado pessoal coletado só para segurança da
  conta; precisa de base legal e prazo de retenção. ⚖️
- Fornecedores novos (armazenamento de contadores, SMTP, hospedagem) exigem
  avaliação de DPA e de transferência internacional antes do uso. ⚖️
- Desenvolvimento e testes usam **somente dados fictícios**.

## Ações planejadas

1. ⚖️ Inventário de tratamento (ROPA) com base legal por finalidade.
2. ⚖️ Encarregado (DPO) e canal para titulares.
3. ⚖️ Política de privacidade e termos de uso.
4. Atendimento a direitos dos titulares (acesso, correção, portabilidade, eliminação),
   respeitando prazos legais de guarda fiscal, contábil e contratual. ⚖️
5. ⚖️ Contratos de operador (DPA) com fornecedores (banco de dados, hospedagem, e-mail).
6. Dados hospedados no Brasil (região São Paulo) sempre que possível. Avaliar transferências internacionais. ⚖️
7. Minimização: coletar só o necessário. Criptografia em nível de aplicação para
   campos críticos (a avaliar no módulo correspondente).
8. Política de retenção e descarte, inclusive em backups.
9. ⚖️ Plano de resposta a incidentes com comunicação à ANPD e aos titulares nos
   prazos da regulamentação vigente.
10. Logs e auditoria sem conteúdo confidencial, com retenção definida. ⚖️
11. Retenção de registros de autenticação e de auditoria, inclusive na exportação
    externa da auditoria exigida antes de qualquer documento real, e procedimento
    de descarte controlado ([ADR 0007](../adr/0007-auditoria.md)). ⚖️
