# Modelo de ameaças

Documento vivo. Atualizado a cada módulo. Revisado na Etapa 0.2a (2026-10-27):
as mitigações das Etapas 0.2b a 0.2g são **propostas** (ver ADRs 0002 e 0004 a 0008)
até serem implementadas e testadas.

## Ativos

| Ativo                                                    | Sensibilidade |
| -------------------------------------------------------- | ------------- |
| Matrículas, escrituras, contratos, documentos fiscais    | Crítica       |
| Dados financeiros e bancários                            | Crítica       |
| Dados societários de holdings (sócios, quotas, CPF/CNPJ) | Crítica       |
| Credenciais, sessões, fatores de MFA                     | Crítica       |
| Vínculos, papéis, escopos e concessões de acesso         | Crítica       |
| Trilha de auditoria                                      | Alta          |
| Backups                                                  | Crítica       |

## Ameaças principais e mitigações

| Ameaça                                                                                                         | Mitigação                                                                                                                                                                            | Etapa                            |
| -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------- |
| Usuário de uma organização acessa dados de outra                                                               | Autorização no servidor **e** RLS forçada; FKs compostas; testes automatizados de isolamento                                                                                         | 0.2c / 0.2e                      |
| Papel de uma organização usado em outra (usuário em várias)                                                    | Papel por vínculo; vínculo consultado no banco a cada operação; papéis fora do JWT; teste com usuário em duas organizações                                                           | 0.2c / 0.2d                      |
| Escopo de fazendas mal aplicado (lista vazia ou registro da holding liberando acesso)                          | Escopo `all`/`listed` explícito; lista vazia = nenhuma fazenda; `listed` não acessa registros sem fazenda; novo vínculo nasce `listed` vazio                                         | 0.2d                             |
| Escalada de papel (ex.: leitor vira admin)                                                                     | Papéis só alterados por funções auditadas; princípio de não delegação; ninguém altera o próprio papel; matriz papel × ação testada                                                   | 0.2c                             |
| Administrador obtém acesso financeiro ou confidencial indiretamente (outra conta, papel, convite ou concessão) | Não delegação: só se atribui papel contido nas próprias permissões; papéis e permissões sensíveis só pelo proprietário; concessões pessoais e não transferíveis                      | 0.2c                             |
| Administrador acessa financeiro ou confidenciais sem motivo                                                    | Sem acesso automático; concessão explícita do proprietário, com motivo e auditada; políticas por sensibilidade                                                                       | 0.2c                             |
| Reclassificação indevida de documento (ex.: `confidential` → `normal`)                                         | Transições com `confidential` exigem `documents.confidential.write`; `USING` e `WITH CHECK` sobre a classificação; versão não altera classificação; rebaixamento auditado com motivo | 0.2c / Documentos                |
| Organização fica sem proprietário                                                                              | Regra no banco impede remover o último proprietário; transferência em duas etapas; estado `sem_responsavel` e procedimento do operador                                               | 0.2c                             |
| Roubo de senha                                                                                                 | MFA TOTP obrigatório para todos; RLS exige `aal2`, sessão ativa e vínculo vigente em **todas** as tabelas de negócio                                                                 | 0.2c / 0.2f                      |
| Perda dos fatores de MFA do proprietário                                                                       | Dois fatores verificados (proposto), verificação periódica de cada um; limitação registrada: não há como provar dispositivos independentes                                           | 0.2f / antes de usuários reais   |
| Roubo de token de sessão por XSS                                                                               | Autenticação somente no servidor com cookies `httpOnly`; CSP com nonce; nenhum token em respostas                                                                                    | 0.1 ✅ (CSP) / 0.2f              |
| Token válido após logout ou desligamento                                                                       | Política restritiva exige sessão ativa em `auth.sessions`; vínculo consultado a cada operação; token de 15 min (proposto); escopo de logout explícito                                | 0.2c / 0.2e                      |
| Cache compartilhado entrega sessão ou dados de outro usuário                                                   | `private, no-store` em respostas autenticadas e com `Set-Cookie`; sem ISR/`use cache` com dados de usuário; cliente Supabase por requisição                                          | 0.1 ✅ (no-store) / 0.2f         |
| CSRF                                                                                                           | Server Actions só POST com checagem de origem; `SameSite=Lax`; `Origin` conferido em rotas que alteram dados                                                                         | 0.2f                             |
| Força bruta, enumeração de contas, abuso de API                                                                | Limites por IP, usuário, organização e operação; limites do Supabase Auth; falha segura; mensagens uniformes                                                                         | 0.2g                             |
| Engenharia social na recuperação de MFA                                                                        | Verificação por canal pré-cadastrado; espera de 72 h (proposta) com notificações e cancelamento; sem atalho de urgência                                                              | Antes de usuários reais          |
| Disputa na renovação de sessão (requisições paralelas)                                                         | Renovação centralizada no proxy; tratamento de sessão nula; teste específico                                                                                                         | 0.2f                             |
| Vazamento de segredo no frontend                                                                               | `NEXT_PUBLIC_*` validado no build; varredura do bundle; ESLint; gitleaks; chave secreta do Supabase fora do runtime                                                                  | 0.1 ✅                           |
| XSS / injeção de scripts                                                                                       | CSP com nonce; React escapa saída; `react/no-danger` no lint; Zod nas entradas                                                                                                       | 0.1 ✅                           |
| Clickjacking                                                                                                   | `frame-ancestors 'none'` + `X-Frame-Options: DENY`                                                                                                                                   | 0.1 ✅                           |
| Cache de dados privados (proxy, navegador, PWA)                                                                | `no-store` nas páginas; PWA sem cache offline de dados privados                                                                                                                      | 0.1 ✅ / PWA                     |
| Upload de malware                                                                                              | Quarentena obrigatória + varredura antivírus antes de liberar o arquivo                                                                                                              | Documentos                       |
| Vazamento de link de documento                                                                                 | Download autorizado e transmitido pelo servidor para documentos sensíveis; URL assinada só de vida curta e para baixa sensibilidade                                                  | Documentos                       |
| Adulteração de documento                                                                                       | Hash SHA-256 no upload; versões imutáveis; exclusão lógica com retenção                                                                                                              | Documentos                       |
| Adulteração da auditoria pela aplicação ou pela API                                                            | Privilégios revogados (inclusive de `service_role`); RLS forçada; triggers contra UPDATE/DELETE/TRUNCATE; autor tirado do JWT                                                        | 0.2c                             |
| Adulteração da auditoria por conta privilegiada do banco                                                       | O banco não impede (triggers podem ser desativados); exportação externa imutável, conferência periódica e acesso restrito com MFA às contas privilegiadas                            | Antes de qualquer documento real |
| Dados confidenciais em logs                                                                                    | Logger com lista de campos permitidos e mascaramento; erros sem valores; auditoria sem conteúdo nem IP nesta etapa                                                                   | 0.2+                             |
| Perda de dados / ransomware                                                                                    | PITR + backup externo criptografado + **restauração testada de verdade**                                                                                                             | Antes de produção                |
| Dependência maliciosa                                                                                          | Versões exatas, lockfile, `minimumReleaseAge`, scripts bloqueados, `pnpm audit`, Dependabot                                                                                          | 0.1 ✅                           |

**Mudança registrada na Etapa 0.2a:** a cadeia de hash na auditoria foi
substituída, nesta etapa, por camadas de privilégio e triggers mais exportação
externa imutável com conferência periódica, exigidas antes de qualquer documento
real (ver [ADR 0007](adr/0007-auditoria.md)). Decisão proposta.

## Testes de isolamento e permissões (obrigatórios antes de usuários reais)

Cenário fictício com duas organizações ("Fazenda Alfa Ltda." e "Holding Beta S.A."),
usuários de cada papel, um usuário "Multi" (`admin` na Alfa, `viewer` na Beta) e
um administrador com uma segunda conta fictícia.

### Catálogo do banco

1. Toda tabela em `public` tem RLS ativada **e forçada**.
2. Nenhuma função `SECURITY DEFINER` fora da lista permitida, nem sem `search_path` fixo.
3. Nenhuma view sem `security_invoker`.
4. `anon` sem privilégios em tabelas de negócio; nenhuma permissão inesperada para `authenticated`.
5. Toda tabela classificada; **toda tabela de negócio** com as políticas
   restritivas (`aal2`, sessão ativa, vínculo vigente); nenhuma exceção fora do catálogo.

### Isolamento entre organizações

6. Usuário da Alfa não lê, insere, altera nem exclui dados da Beta, nem informando o `organization_id` dela.
7. Não é possível mover um registro de organização (`UPDATE organization_id`).
8. Não é possível referenciar entidade de outra organização (FK composta).
9. Contagens, `RETURNING` e mensagens de erro não revelam dados de outra organização.

### Vários vínculos e escopo de fazendas

10. O usuário Multi não exerce na Beta o papel que tem na Alfa.
11. Escopo `listed` acessa só as fazendas da lista; escopo `all` acessa todas, inclusive fazendas novas.
12. Escopo `listed` com lista vazia não acessa nenhuma fazenda.
13. Escopo `listed` não acessa registros da holding sem fazenda; registro ligado a
    várias fazendas exige todas na lista.
14. Novo vínculo sem escopo definido não acessa nenhuma fazenda.

### Permissões, não delegação e escalada

15. Matriz papel × concessão × `aal` × sensibilidade × categoria × comando em todas as tabelas.
16. Administrador sem concessão não acessa financeiro, auditoria nem documentos confidenciais.
17. Administrador não atribui `owner`, `finance` nem `external_accountant` (nem a
    uma segunda conta própria) e não concede permissões.
18. Quem tem concessão não a repassa nem atribui papel que a contenha.
19. Ninguém altera, remove ou amplia o escopo de membro com permissões que não possui;
    ninguém altera o próprio papel, concessões ou escopo.
20. Usuário não consegue se promover nem entrar em outra organização.
21. A organização nunca fica sem proprietário ativo.
22. Sem `documents.confidential.write`, não é possível rebaixar ou elevar documento
    de/para `confidential`, enviar versão nem editar documento confidencial; nova
    versão não altera a classificação; rebaixamento autorizado é auditado.

### Auditoria

23. `INSERT`, `UPDATE`, `DELETE` e `TRUNCATE` negados para `anon`, `authenticated`
    e `service_role`; triggers rejeitam as mesmas operações de papel com privilégio
    na tabela; o autor registrado é o do JWT.
24. Descarte só pelo papel de retenção e só de registros vencidos, com registro do descarte.

### Sessão e MFA

25. Sessão `aal1` bloqueada pelo banco em todas as tabelas de negócio (exceção: a própria linha de `profiles`).
26. Membro removido perde acesso imediatamente, mesmo com token ainda válido.
27. Após logout global, token não expirado é negado pelo banco; logout comum encerra só a sessão atual.
28. Concessão ou vínculo vencido (`expires_at`) perde efeito.
29. Token expirado ou adulterado é rejeitado.
30. Proprietário com um único fator verificado é negado em financeiro, confidenciais,
    concessões, `org.manage` e atribuição de papéis com permissões sensíveis.

### Camada do servidor

31. Autorização no servidor nega as mesmas operações **antes** de chegar ao banco (IDOR/BOLA).
32. Troca de organização: cookie de organização sem vínculo é rejeitado; nenhuma resposta traz dados da organização anterior.
33. Nenhum token em HTML, payload RSC ou respostas; nenhum cliente Supabase no bundle.
34. Toda resposta autenticada ou com `Set-Cookie` sai com `Cache-Control: private, no-store`.
35. Server Action ou rota de alteração com `Origin` divergente é rejeitada.
36. Limites de requisições e falha segura do limitador (Etapa 0.2g).

### Etapa de Documentos

37. Storage: não é possível listar, baixar ou enviar arquivos no prefixo de outra organização.

**Prova de eficácia:** remover uma política de propósito deve fazer os testes falharem
(roteiro em [ADR 0008](adr/0008-supabase-local-e-testes.md)).
