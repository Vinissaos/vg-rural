# Roteiro de implementação

Cada etapa só começa após aprovação explícita, revisão e CI verde da anterior.
Cada subetapa da 0.2 é um Pull Request separado, com merge manual pelo responsável.

| Etapa | Escopo                                                                                                                                   | Status                          |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| 0.1   | Esqueleto seguro: Next.js, TS estrito, lint, testes, env, cabeçalhos, CI, documentação                                                   | ✅ Concluída                    |
| 0.2a  | Documentação e decisões: ADRs 0002 (revisado) e 0004 a 0008, modelo de ameaças, LGPD, procedimento, CODEOWNERS                           | ✅ Concluída (PR #3, `532e2c9`) |
| 0.2b  | Supabase **local**: CLI, `config.toml` endurecido, migração de travas (privilégios padrão), 4º job da CI com testes de catálogo          | Em andamento                    |
| 0.2c  | Estrutura central e RLS: organizações, perfis, vínculos, fazendas (mínima), concessões, auditoria, seeds fictícios, testes de isolamento | Não iniciada                    |
| 0.2d  | Vários vínculos e escopo por fazenda; mapa de permissões em SQL e TypeScript com teste de igualdade                                      | Não iniciada                    |
| 0.2e  | Módulo `src/lib/authz` e cliente Supabase do servidor (sem interface); testes de integração (IDOR/BOLA, sessão)                          | Não iniciada                    |
| 0.2f  | Telas de login, MFA, logout e seletor de organização; proxy com sessão e CSP; cookies `httpOnly`                                         | Não iniciada                    |
| 0.2g  | Limite de requisições e proteção contra abuso                                                                                            | Não iniciada                    |
| Gate  | Nenhuma publicação na internet antes da 0.2g; nenhum documento real antes do gate de produção                                            | —                               |
| 1     | Holdings e fazendas                                                                                                                      | Não iniciado                    |
| 2     | Documentos (quarentena, antivírus, hash, versões, download autorizado pelo servidor)                                                     | Não iniciado                    |
| 3     | Financeiro                                                                                                                               | Não iniciado                    |
| 4     | Societário                                                                                                                               | Não iniciado                    |
| —     | Backups com teste real de restauração, LGPD operacional, exportação externa da auditoria, revisão de segurança externa                   | Antes de produção               |
| —     | PWA (somente assets estáticos em cache; nenhum dado privado offline)                                                                     | Futuro                          |

## Critérios de aprovação por subetapa

| Etapa | Critérios                                                                                                                                                                                                                                                                                                    |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0.2a  | Só documentação e CODEOWNERS; decisões pendentes marcadas como "Proposto"; três jobs verdes                                                                                                                                                                                                                  |
| 0.2b  | Quatro jobs verdes; nenhuma chave commitada; nenhuma conexão remota; instalação do CLI verificada; portas só no localhost; privilégios efetivos e meta-testes passando; nenhum resíduo dos meta-testes; log do job sem chaves                                                                                |
| 0.2c  | Testes de catálogo (incluindo políticas restritivas em toda tabela de negócio e catálogo de exceções), isolamento, não delegação, reclassificação, proprietário obrigatório, auditoria (privilégios, triggers, descarte) e sessão passando; prova de que falham sem a política; revisão manual das políticas |
| 0.2d  | Testes de vários vínculos e de escopo `all`/`listed` (lista vazia, registro da holding, várias fazendas, vínculo novo) passando; mapa de permissões idêntico em SQL e TypeScript                                                                                                                             |
| 0.2e  | Testes de integração (IDOR/BOLA, sessão revogada e expirada, não delegação pelo servidor) passando; nenhuma chave secreta no runtime                                                                                                                                                                         |
| 0.2f  | Cookies `httpOnly` verificados; nenhum token nas respostas; `no-store` verificado; CSP sem afrouxamento; escopo de logout explícito; dois fatores do proprietário exigidos                                                                                                                                   |
| 0.2g  | Testes de abuso e de falha segura do limitador passando                                                                                                                                                                                                                                                      |

## Gate antes de qualquer documento real

Autenticação, autorização, MFA, limite de requisições, Storage privado, backups
com restauração testada, **exportação da auditoria para armazenamento externo
imutável com conferência periódica**, procedimentos de recuperação de MFA (de
usuários e do operador), revisão independente e requisitos essenciais da LGPD.

## Diretrizes já acordadas para as próximas etapas

- Autorização no servidor **além** do RLS. As duas camadas são testadas.
- Uploads só são liberados após verificação de malware (status `quarentena` → `liberado`/`bloqueado`).
- Documentos de maior sensibilidade são baixados por rota do servidor que
  autoriza, audita e transmite o arquivo. URLs assinadas só quando justificadas, de vida curta.
- Nenhum dado confidencial em logs.
- A recuperação de backups é uma funcionalidade e precisa de teste real de restauração.
- Nenhuma complexidade de segurança sem justificativa e testes.
- Código gerado por IA é revisado antes de cada merge.
