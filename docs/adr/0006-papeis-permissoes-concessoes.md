# ADR 0006: Papéis, permissões e concessões

- **Status:** Proposto (implementação prevista nas Etapas 0.2c a 0.2e)
- **Data:** 2026-10-27
- **Relacionados:** [ADR 0002](0002-multitenancy-rls.md), [ADR 0004](0004-autenticacao-sessoes-mfa.md),
  [ADR 0007](0007-auditoria.md)

## Contexto

Holdings rurais reúnem perfis com necessidades muito diferentes: sócios,
administradores, equipe financeira, equipe de documentos, consulta e contadores
externos. Documentos confidenciais e dados financeiros exigem controle mais
rígido do que o restante.

## Decisão proposta

### Permissões como unidade de controle

Cada papel é um conjunto de **permissões binárias** (o usuário tem ou não tem).
O mapa papel → permissões fica numa função SQL e num módulo TypeScript; um teste
garante que os dois são idênticos. Condições como "só documentos fiscais" são
expressas por permissões próprias, nunca por exceções dentro do código.

### Papéis (identificador técnico em inglês, nome exibido em português)

| Identificador         | Nome exibido     | Resumo                                                                 |
| --------------------- | ---------------- | ---------------------------------------------------------------------- |
| `owner`               | Proprietário     | Responsável pela organização; único que delega permissões sensíveis    |
| `admin`               | Administrador    | Gerencia membros sem permissões sensíveis; sem acesso sensível próprio |
| `finance`             | Financeiro       | Lê e lança dados financeiros; lê documentos fiscais não confidenciais  |
| `documents`           | Documentos       | Lê, envia e versiona documentos normais e restritos                    |
| `viewer`              | Leitor           | Consulta documentos de sensibilidade normal                            |
| `external_accountant` | Contador externo | Leitura financeira e de documentos fiscais, com prazo obrigatório      |

### Documentos: dois eixos independentes

- **Sensibilidade:** `normal`, `restricted` (ex.: contratos, escrituras) e
  `confidential` (ex.: dados bancários, documentos de sócios com CPF). Nome
  exibido: normal, restrito, confidencial.
- **Categoria:** por exemplo `fiscal` e `corporate` (societário). A lista
  completa será definida na Etapa 2.

Regra de leitura de um documento `d` (além do isolamento por organização e do
escopo de fazendas do [ADR 0002](0002-multitenancy-rls.md)):

- `d.sensitivity = confidential` → exige `documents.confidential.read`,
  **qualquer que seja a categoria**;
- caso contrário → exige a permissão do nível (`documents.normal.read` ou
  `documents.restricted.read`) **ou** (`d.category = fiscal` e `documents.fiscal.read`).

### Permissões

| Permissão                      | Significado                                                           | Sensível |
| ------------------------------ | --------------------------------------------------------------------- | -------- |
| `org.manage`                   | Configurar a organização, transferir a propriedade                    | sim      |
| `members.manage`               | Gerenciar membros, sujeito à regra de não delegação                   | não      |
| `grants.manage`                | Conceder e revogar permissões sensíveis                               | sim      |
| `audit.read`                   | Ler a trilha de auditoria da organização                              | sim      |
| `documents.normal.read`        | Ler documentos `normal`                                               | não      |
| `documents.restricted.read`    | Ler documentos `restricted`                                           | não      |
| `documents.fiscal.read`        | Ler documentos da categoria `fiscal` que não sejam `confidential`     | não      |
| `documents.normal.write`       | Enviar, versionar e editar documentos `normal`                        | não      |
| `documents.restricted.write`   | Enviar, versionar e editar documentos `restricted`                    | não      |
| `documents.confidential.read`  | Ler documentos `confidential`                                         | sim      |
| `documents.confidential.write` | Enviar, versionar, editar e (re)classificar documentos `confidential` | sim      |
| `finance.read`                 | Ler dados financeiros                                                 | sim      |
| `finance.write`                | Lançar e editar dados financeiros                                     | sim      |

### Matriz inicial (proposta)

| Permissão                      | owner | admin | finance | documents | viewer | external_accountant |
| ------------------------------ | ----- | ----- | ------- | --------- | ------ | ------------------- |
| `org.manage`                   | ✅    | ❌    | ❌      | ❌        | ❌     | ❌                  |
| `members.manage`               | ✅    | ✅    | ❌      | ❌        | ❌     | ❌                  |
| `grants.manage`                | ✅    | ❌    | ❌      | ❌        | ❌     | ❌                  |
| `audit.read`                   | ✅    | 🔑    | ❌      | ❌        | ❌     | ❌                  |
| `documents.normal.read`        | ✅    | ✅    | ❌      | ✅        | ✅     | ❌                  |
| `documents.restricted.read`    | ✅    | ✅    | ❌      | ✅        | ❌     | ❌                  |
| `documents.fiscal.read`        | ✅    | ✅    | ✅      | ✅        | ❌     | ✅                  |
| `documents.normal.write`       | ✅    | ✅    | ❌      | ✅        | ❌     | ❌                  |
| `documents.restricted.write`   | ✅    | ✅    | ❌      | ✅        | ❌     | ❌                  |
| `documents.confidential.read`  | ✅    | 🔑    | ❌      | 🔑        | ❌     | ❌                  |
| `documents.confidential.write` | ✅    | 🔑    | ❌      | 🔑        | ❌     | ❌                  |
| `finance.read`                 | ✅    | 🔑    | ✅      | ❌        | ❌     | ✅                  |
| `finance.write`                | ✅    | 🔑    | ✅      | ❌        | ❌     | ❌                  |

🔑 = só por **concessão explícita** do proprietário. MFA (`aal2`), sessão ativa e
vínculo vigente são exigidos de todos os papéis em todas as tabelas de negócio
([ADR 0002](0002-multitenancy-rls.md), [ADR 0004](0004-autenticacao-sessoes-mfa.md)).

### Princípio de não delegação

Vale para **toda** forma de atribuir acesso: papel, concessão, escopo de
fazendas, prazo de vínculo e, no futuro, convites (que usarão as mesmas funções).
Verificado na função do banco que faz a alteração e, antes, no `authz`.

1. **Ninguém delega o que não possui.** O conjunto de permissões do papel
   atribuído precisa estar contido nas permissões efetivas de quem atribui
   naquela organização, e o escopo de fazendas atribuído precisa estar contido
   no escopo de quem atribui.
2. **Permissões sensíveis só são delegadas pelo proprietário**, mesmo que outro
   membro as possua por concessão. Por isso, papéis que contêm permissões
   sensíveis (`owner`, `finance`, `external_accountant`) **só são atribuídos pelo
   proprietário**. Um `admin` atribui apenas `admin`, `documents` e `viewer`.
3. **Concessões são pessoais e não transferíveis:** quem recebe uma concessão
   não pode repassá-la, nem atribuir papel que a contenha.
4. **A regra vale qualquer que seja a conta alvo**, inclusive uma segunda conta
   da mesma pessoa. Não há como um administrador obter acesso financeiro por
   outra conta, papel, convite ou concessão.
5. **Ninguém altera, rebaixa, remove nem muda o escopo de um membro cujas
   permissões efetivas não estejam contidas nas suas** (ex.: `admin` não altera
   membro `finance`, nem amplia o escopo de fazendas dele).
6. Ninguém altera o próprio papel, as próprias concessões ou o próprio escopo.
7. A organização **nunca fica sem proprietário ativo**.
8. Toda alteração exige `aal2`, sessão ativa e registro na auditoria.

### Concessões explícitas

- **Administradores não recebem acesso ao financeiro, à auditoria nem a
  documentos confidenciais por padrão.**
- Tabela `member_grants` (organização, usuário, permissão, quem concedeu,
  quando, motivo obrigatório, validade opcional). Só o proprietário concede ou
  revoga, por função do banco que registra auditoria.
- Permissões concedíveis: apenas as marcadas como sensíveis e de leitura ou
  escrita de dados (`audit.read`, `documents.confidential.*`, `finance.*`).
  `org.manage`, `grants.manage` e `members.manage` nunca são concedidas.
- `external_accountant` nunca recebe permissão de escrita, nem por concessão.
- Concessões nunca ultrapassam o escopo de fazendas do membro.

### Proteção contra reclassificação indevida de documentos

1. Toda operação considera a sensibilidade **antes e depois** da alteração:
   `USING` confere a permissão sobre o registro atual e `WITH CHECK` sobre o
   registro resultante.
2. **Qualquer transição que envolva `confidential`** (para ou a partir dele,
   inclusive `confidential` → `normal`) exige `documents.confidential.write`.
3. Rebaixar a sensibilidade (`confidential` → `restricted`/`normal`,
   `restricted` → `normal`) exige permissão de escrita no nível de origem e
   motivo obrigatório; é sempre registrado na auditoria e notificado ao proprietário.
4. **A classificação só muda por operação própria de reclassificação.** Enviar
   uma nova versão nunca altera a classificação, e a versão herda a
   sensibilidade do documento.
5. Criar, versionar, editar metadados, mover entre fazendas ou excluir um
   documento exige a permissão de escrita do seu nível. Mover entre fazendas
   exige acesso às duas.
6. Sem a permissão de leitura do nível, o usuário não vê nem a existência do
   documento (sem metadados, contagens ou mensagens de erro reveladoras).

### Contador externo

Vínculo com `expires_at` obrigatório, somente leitura (mesmo por concessão),
sem documentos societários, normalmente com escopo `listed` de fazendas.

### Organização sem proprietário

- **Prevenção:** regra no banco impede rebaixar, remover ou excluir a conta do
  último proprietário ativo (o vínculo com `auth.users` usa `ON DELETE RESTRICT`).
- **Transferência de propriedade em duas etapas:** o proprietário inicia com
  `aal2`, o destinatário aceita com `aal2`; tudo auditado e notificado.
- Proprietários têm sempre escopo `all` de fazendas.
- Ter um segundo proprietário é recomendado, mas não exigido.
- **Se ainda assim ocorrer** (falecimento, incapacidade, perda total de acesso):
  a organização passa a `sem_responsavel` (dados intactos, nenhuma alteração
  sensível, garantida também por política no banco) e a nova titularidade só é
  atribuída pelo procedimento do operador da plataforma, com prova documental de
  representação (contrato social ou procuração), período de espera e
  notificações, como na recuperação de MFA.

## Testes obrigatórios (além da matriz completa)

1. `admin` não atribui `owner`, `finance` nem `external_accountant`, nem a uma
   segunda conta própria; não concede nenhuma permissão.
2. Membro com concessão de `finance.read` não repassa a concessão nem atribui papel `finance`.
3. `admin` não altera, remove nem amplia o escopo de membro com permissões que ele não tem.
4. Ninguém altera o próprio papel, concessões ou escopo.
5. Concessão de escrita a `external_accountant` é rejeitada.
6. Usuário sem `documents.confidential.write` não rebaixa nem eleva documento de/para
   `confidential`, não envia versão nem edita metadados de documento confidencial.
7. Nova versão não altera a classificação.
8. Rebaixamento autorizado gera registro de auditoria com motivo.
9. Documento confidencial não aparece em listagens, contagens ou erros para quem não tem leitura.
10. `finance` e `external_accountant` leem documento fiscal `restricted`, mas não
    documento fiscal `confidential`.

## Consequências

- O RLS e o `authz` consultam a mesma definição de permissões; divergências são
  detectadas por teste.
- O `admin` fica com poder operacional limitado; operações sensíveis dependem do
  proprietário. É intencional.
- A matriz é inicial e deve ser validada com o uso real antes da produção.

## Pendências

- Validar a matriz (em especial `admin` × `documents.fiscal.read` e as concessões
  possíveis a `documents`).
- Lista completa de categorias de documentos (Etapa 2).
- Fluxo de convites (etapa posterior), obrigatoriamente pelas mesmas funções e regras.
