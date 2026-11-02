# ADR 0005: Limite de requisições (rate limiting) e proteção contra abuso

- **Status:** Proposto (implementação prevista na Etapa 0.2g; a escolha do
  armazenamento depende da hospedagem, ainda não definida)
- **Data:** 2026-10-27
- **Relacionados:** [ADR 0004](0004-autenticacao-sessoes-mfa.md), [ADR 0007](0007-auditoria.md)

## Contexto

Login, segundo fator, recuperação de senha e operações sobre documentos e dados
financeiros são alvos de força bruta, enumeração de contas, abuso de API e
ataques volumétricos. Nenhuma tela de autenticação será publicada na internet
antes de existir proteção contra abuso testada.

## Requisitos

1. Limites por **IP**, por **usuário**, por **organização** e por **tipo de operação**
   (ex.: login, segundo fator, recuperação de senha, download de documento,
   exportação, alterações em membros e concessões).
2. Os limites próprios do **Supabase Auth** (login, envio de e-mail, verificação
   de OTP, renovação de token) serão revistos e configurados explicitamente, no
   ambiente local (`config.toml`) e, depois, no projeto hospedado.
3. Contadores em **armazenamento compartilhado** entre instâncias: memória local
   não serve em ambiente com várias instâncias ou serverless.
4. **Cabeçalhos de IP enviados pelo cliente não são confiáveis** (`X-Forwarded-For`
   e similares podem ser forjados). Só é usado o IP informado pela infraestrutura
   de hospedagem, de forma validada e documentada para a plataforma escolhida.
5. **Falha segura:** se o limitador estiver indisponível, operações críticas
   (login, segundo fator, recuperação, alterações de permissões, download de
   documentos sensíveis) são **negadas**, com mensagem genérica. Operações de
   leitura de baixo risco podem seguir com registro do incidente. Esse
   comportamento é documentado e testado.
6. Respostas não revelam se uma conta existe (mensagens e tempos uniformes, na
   medida do possível).
7. Nenhum dado pessoal desnecessário nos contadores: chaves derivadas (hash) de
   IP e de identificadores, com expiração curta.

## Alternativas para os contadores

| Opção                                          | Volumétrico | Latência | Custo e operação                      | Disponibilidade e observações                                                                         |
| ---------------------------------------------- | ----------- | -------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Proteção na borda (WAF/CDN da hospedagem)      | Melhor      | Mínima   | Depende do plano da plataforma        | Barra tráfego antes da aplicação; regras por usuário/organização são limitadas                        |
| Armazenamento dedicado (ex.: Redis gerenciado) | Bom         | Baixa    | Novo fornecedor: contrato, DPA e LGPD | Ponto de falha adicional, coberto pela regra de falha segura                                          |
| Contadores no PostgreSQL                       | Fraco       | Moderada | Sem novo fornecedor                   | Um ataque volumétrico vira carga no banco principal; aceitável só como camada interna de baixo volume |

## Decisão proposta

- **Camadas complementares:** proteção na borda para tráfego volumétrico, mais
  limites na aplicação por usuário, organização e operação, mais os limites
  nativos do Supabase Auth.
- O armazenamento dos contadores da aplicação **não fica fixado em PostgreSQL**:
  a escolha entre armazenamento dedicado e banco será feita junto com a
  hospedagem, comparando ataques volumétricos, latência, custo e disponibilidade.
- Os limites e janelas iniciais serão definidos na implementação, com base nos
  fluxos reais, e documentados aqui.

## Testes obrigatórios

1. Exceder o limite de cada operação crítica bloqueia novas tentativas pelo
   período definido.
2. Limites por usuário e por organização são independentes do IP (troca de IP não reinicia o contador).
3. `X-Forwarded-For` e similares enviados pelo cliente não alteram a chave do limite.
4. Limitador indisponível: operações críticas são negadas; o evento é registrado.
5. Mensagens de login e recuperação não revelam a existência da conta.

## Pendências

- Hospedagem e plataforma de borda (decisão posterior; região preferencial São Paulo).
- Armazenamento dos contadores e respectivo contrato e avaliação LGPD.
- Valores dos limites e das janelas.
- Se e como registrar IP (hoje fora da auditoria; ver [ADR 0007](0007-auditoria.md) e o plano LGPD).
