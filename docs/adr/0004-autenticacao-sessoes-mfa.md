# ADR 0004: Autenticação, sessões e MFA

- **Status:** Proposto (implementação prevista nas Etapas 0.2e e 0.2f)
- **Data:** 2026-10-27
- **Relacionados:** [ADR 0002](0002-multitenancy-rls.md), [ADR 0003](0003-cabecalhos-e-csp.md),
  [ADR 0005](0005-rate-limiting.md), [ADR 0006](0006-papeis-permissoes-concessoes.md),
  [ADR 0008](0008-supabase-local-e-testes.md)

## Contexto

O VG Rural usará o **Supabase Auth**. Não haverá senhas, tokens nem mecanismos de
recuperação próprios. A sessão segue a orientação oficial do Supabase para
Next.js, com uma adaptação de segurança (cookies `httpOnly`) analisada abaixo.

Fontes consultadas em 2026-10-26, nos arquivos que geram a documentação oficial
(o site `supabase.com` estava inacessível no ambiente de análise):
`guides/auth/server-side/creating-a-client`, `server-side/advanced-guide`,
`guides/auth/sessions`, `guides/auth/auth-mfa` e `auth-mfa/totp`, além do código
publicado do `@supabase/ssr` 0.12.7 e da documentação local do Next.js 16.4.2.
**Tudo deve ser reconferido na versão vigente no momento da implementação.**

### Estado atual (Etapa 0.1) × proposta

- **Já implementado e testado (Etapa 0.1, [ADR 0003](0003-cabecalhos-e-csp.md)):**
  CSP com nonce por requisição e `connect-src 'self'`, cabeçalhos de segurança,
  páginas dinâmicas com `Cache-Control: no-store`, `proxy.ts` que só aplica a CSP,
  validação de ambiente e bloqueio de chaves administrativas no código.
- **Ainda não existe:** login, sessão, MFA, cliente Supabase, `authz` ou
  qualquer conexão com o Supabase. **Tudo o que segue neste ADR é proposta.**

### O que a documentação oficial estabelece

- O guia oficial já usa `proxy.ts` (Next.js 16). Server Components **não podem
  gravar cookies**: o proxy é obrigatório para renovar a sessão (`getClaims()` +
  `setAll`).
- No servidor, usar `getClaims()` (verifica assinatura e expiração). **Nunca**
  confiar em `getSession()` no servidor.
- `getClaims()` não detecta sessão revogada: um token não expirado continua
  válido. Só `getUser()` ou a consulta do `session_id` em `auth.sessions` detectam.
- Cookies `httpOnly`: o guia avançado diz que "não é necessário"; o guia de
  sessões diz que é possível **apenas** em aplicações em que toda a lógica roda no
  servidor, com "suporte limitado" das bibliotecas. No código do `@supabase/ssr`,
  o padrão é `httpOnly: false`, mas o `cookieOptions` informado o sobrescreve.
- Respostas com `Set-Cookie` em cache compartilhado podem entregar a sessão de um
  usuário a outro. Desde a versão 0.10, o `setAll` recebe cabeçalhos de cache que
  devem ser aplicados à resposta.
- O cliente Supabase deve ser criado **por requisição**, nunca no escopo do módulo.
- Refresh tokens são de uso único (tolerância de 10 s): requisições paralelas
  com o token vencido podem disputar a renovação.
- Tempo de vida do token: padrão de 1 h; **não usar menos de 5 min**. Limites de
  sessão (duração máxima, inatividade, sessão única) só existem no plano Pro.
- MFA no banco: política `AS RESTRICTIVE` com `auth.jwt()->>'aal' = 'aal2'`. Para
  sessão em `aal1`, a recomendação é redirecionar ao segundo fator, não devolver 401/403.

## Alternativas avaliadas

| Critério            | A. SSR convencional (cliente no navegador + servidor)                                         | B. Somente servidor, cookies `httpOnly`                                           |
| ------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Suporte oficial     | Caminho documentado                                                                           | "Suporte limitado"; opção técnica aceita pela biblioteca                          |
| Next.js 16          | Compatível                                                                                    | Compatível; o navegador nunca fala com o Supabase                                 |
| Renovação de sessão | Proxy + cliente do navegador                                                                  | Só proxy e Server Actions: o proxy é crítico e precisa de teste próprio           |
| MFA                 | APIs no navegador                                                                             | APIs `auth.mfa.*` em Server Actions; o QR do TOTP vai ao navegador só no cadastro |
| CSP                 | `connect-src` precisa incluir o domínio do projeto Supabase                                   | `connect-src 'self'` permanece                                                    |
| Impacto de XSS      | Script injetado lê access e refresh token e assume a conta em outra máquina, mesmo com `aal2` | Script age só enquanto a página está aberta; não extrai os tokens                 |
| CSRF                | Server Actions: só POST + Origin × Host; `SameSite=Lax`                                       | Igual; rotas que alteram dados conferem `Origin` explicitamente                   |
| Limitações          | —                                                                                             | Sem Realtime e sem upload direto do navegador com a sessão do usuário             |

## Decisão proposta: alternativa B

1. **Somente o cliente do servidor** (`createServerClient` do `@supabase/ssr`),
   num módulo com `import "server-only"`. O ESLint proibirá `@supabase/*` em
   componentes de cliente e o uso de `createBrowserClient`.
2. **Cookies de sessão:** `HttpOnly`, `Secure` (fora do ambiente local),
   `SameSite=Lax`, `Path=/`, sem domínio amplo. `Max-Age` longo, como orienta a
   documentação: quem encerra a sessão é o Supabase Auth.
3. **`proxy.ts` único** compondo CSP e sessão: repassa nonce e CSP nos cabeçalhos
   da requisição, repassa os cookies renovados à requisição (para os Server
   Components verem o token novo), copia cookies e cabeçalhos de cache do
   `setAll` para a resposta e aplica `Cache-Control: private, no-store`. Usa só
   `getClaims()` e **não toma decisões de autorização**.
4. **Autorização na camada de dados** (`src/lib/authz`): cada operação valida
   sessão, vínculo e permissão. Operações críticas (mudança de papel, concessões,
   transferência de propriedade) também chamam `getUser()`.
5. **Revogação imediata no banco:** política restritiva exige que o `session_id`
   do JWT exista em `auth.sessions` (ADR 0002).
6. **Tempo de vida do access token: 15 minutos (proposto)**, dentro da faixa
   documentada (mínimo de 5 min). A revogação não depende desse prazo.
7. **Cadastro público desativado.** Na primeira implementação, só usuários e
   organizações fictícios criados por seed local. Convites ficam para etapa posterior.
8. **Login** por e-mail e senha do Supabase Auth, seguido do segundo fator.
   Recuperação de senha pelo fluxo PKCE do Supabase, com troca do código numa rota do servidor.
9. **Logout:** `signOut` com escopo **explícito**. A documentação do Supabase
   informa que `signOut()` sem escopo assume `global` e encerra todas as sessões
   do usuário; por isso o escopo nunca fica implícito:
   - logout comum: `scope: 'local'` (só a sessão atual);
   - incidente, troca de senha por suspeita ou desligamento de usuário:
     `scope: 'global'`, registrado na auditoria.

   Em seguida, apaga os cookies, faz navegação completa (não navegação no
   cliente) e envia `Clear-Site-Data: "cache"` (proposto).

### MFA

- **TOTP obrigatório para todos os usuários com acesso a dados de clientes.**
  Sem SMS (risco de clonagem de chip).
- `aal2` exigido em duas camadas: `authz` no servidor e políticas restritivas no
  banco. Sessão `aal1` é redirecionada à tela do segundo fator.
- **Proprietários (`owner`): dois fatores TOTP verificados (proposto)**, com a
  orientação de manter o segundo em dispositivo ou gerenciador de senhas separado.
  - **Limitação:** o sistema **não consegue comprovar** que os dois fatores estão
    em dispositivos independentes. Dois segredos TOTP podem estar no mesmo
    aplicativo do mesmo celular; o número de fatores prova apenas que existem dois
    segredos cadastrados e verificados.
  - **Controles verificáveis:** (a) existência de pelo menos dois fatores TOTP com
    status `verified` em `auth.mfa_factors`; (b) cada fator foi verificado com
    sucesso no cadastro; (c) verificação periódica de cada fator, um de cada vez
    (proposta: a cada 90 dias), que prova que cada segredo continua utilizável;
    (d) cadastro e remoção de fatores registrados na auditoria e notificados por
    e-mail; (e) declaração do proprietário, no cadastro, de que o segundo fator
    está em dispositivo separado (controle procedimental, não técnico).
  - **Onde é aplicado:** no `authz` e numa função do banco (`SECURITY DEFINER`,
    lendo `auth.mfa_factors`) usada pelas políticas de `finance.*`,
    `documents.confidential.*`, `grants.manage` e `org.manage`, e pelas funções
    que atribuem papéis com permissões sensíveis (`owner`, `finance`,
    `external_accountant`), quando quem age é proprietário. Assim, sem o segundo
    fator, o proprietário também não obtém acesso sensível de forma indireta
    (por exemplo, atribuindo `finance` a outra conta). Sem os dois fatores, ele
    mantém o acesso não sensível e é levado ao cadastro do segundo fator.
- Após remover um fator, a sessão é renovada imediatamente (`refreshSession()`),
  porque a queda de `aal2` para `aal1` só ocorre na renovação.
- **Sem códigos de recuperação próprios:** o Supabase não oferece esse recurso, e
  criá-lo seria um mecanismo de recuperação próprio, vetado por este projeto.

### Recuperação de MFA (proposta, sem exigir segundo aprovador)

A empresa pode ter um único responsável. O procedimento protege contra
engenharia social por verificação em canal pré-cadastrado e período de espera,
não por um segundo aprovador:

1. Pedido registrado com protocolo. Nada é resolvido no mesmo contato.
2. Verificação de identidade **pelo canal cadastrado previamente** (retorno ao
   telefone ou e-mail do cadastro, nunca ao contato informado no pedido). Para
   proprietários, também documento que comprove a representação da holding.
3. **Período de espera de 72 horas (proposto)**, com notificação ao e-mail da
   conta e a todos os proprietários e administradores da organização, incluindo
   um link para cancelar o pedido.
4. Só então o operador da plataforma remove os fatores por script administrativo
   **fora do Next.js** (a chave secreta fica apenas no ambiente do operador),
   encerra todas as sessões e exige novo cadastro de fatores no próximo login.
5. Registro na auditoria. Não há atalho para urgência.

O procedimento operacional detalhado será escrito antes do primeiro usuário real.

**Conta do próprio operador:** hoje o operador da plataforma e o responsável
pela empresa podem ser a mesma pessoa, sem ninguém para executar o procedimento
acima em seu favor. A raiz de confiança passa a ser a conta da organização no
painel do Supabase (com MFA próprio e recuperação definida pelo provedor). O
procedimento de recuperação da conta do operador, com o mesmo período de espera,
é pendência obrigatória antes do primeiro usuário real.

### Cache de respostas autenticadas

1. Toda resposta autenticada e toda resposta com `Set-Cookie`:
   `Cache-Control: private, no-store`.
2. Proibido em áreas autenticadas: ISR, `revalidate`, `"use cache"`,
   `"use cache: remote"`, `unstable_cache` e `"use cache: private"` (este guarda
   dados no navegador). `cacheComponents` permanece desligado e `staleTimes` não
   é configurado. Regras do ESLint vão reforçar a proibição.
3. Cliente Supabase criado por requisição (regra de lint e teste).
4. Na escolha da hospedagem, verificar se a CDN respeita `no-store` em respostas com cookie.
5. PWA futura: o service worker nunca guarda HTML, payload RSC nem respostas de API.

### CSRF

- Server Actions: o Next.js aceita só POST e compara `Origin` com `Host`. Não
  configurar `serverActions.allowedOrigins` sem necessidade documentada.
- Route Handlers que alteram dados conferem `Origin` explicitamente e nunca
  alteram dados em `GET`.
- Cookies `SameSite=Lax`. A configuração de `X-Forwarded-Host` na hospedagem
  precisa ser revisada.

## Limitações aceitas

- Fica-se fora do caminho mais testado da biblioteca. Compensação: testes
  próprios, versão fixada e revisão a cada atualização do `@supabase/ssr`.
- Sem Realtime e sem upload direto do navegador com a sessão do usuário. Mudar
  isso exige revisar este ADR (incluindo CSP e risco de XSS).
- Disputa de renovação com requisições paralelas: tratar sessão nula com
  elegância (nova tentativa ou nova autenticação).
- O XSS continua capaz de agir enquanto a página está aberta. A CSP com nonce
  continua sendo a barreira principal.
- Limites de sessão do Supabase (duração máxima, inatividade) dependem do plano
  Pro. A decisão de plano é posterior (região preferencial: São Paulo).
- A checagem de "sessão ativa" detecta logout e revogação imediatamente, mas
  **não** encerra na hora uma sessão vencida por duração máxima ou inatividade:
  segundo a documentação, essas sessões só são removidas de `auth.sessions` cerca
  de 24 h depois, e o limite só é aplicado na próxima renovação. Se esses limites
  forem adotados, o `authz` também confere a idade da sessão.
- `getClaims()` verifica localmente apenas em projetos com chaves de assinatura
  assimétricas (padrão dos projetos novos); com segredo simétrico, consulta o
  servidor de Auth. Confirmar o tipo de chave no ambiente local e no hospedado.

## Testes obrigatórios

1. Cookies de login e renovação com `HttpOnly`, `Secure` (em HTTPS), `SameSite=Lax` e `Path=/`.
2. Nenhum token em HTML, payload RSC, respostas de Server Actions ou páginas de
   erro (ampliação da varredura de respostas para JWT e refresh token).
3. Nenhum cliente Supabase no bundle do navegador (varredura do bundle).
4. Proxy: nonce e cookies convivem; toda resposta com `Set-Cookie` sai com `no-store`.
5. Duas requisições paralelas com token vencido não causam loop de logout nem vazam erro.
6. Server Action com `Origin` divergente rejeitada; rota de alteração sem `Origin` válido rejeitada.
7. Sessão `aal1` redirecionada pelo servidor e negada pelo banco em todas as
   tabelas de negócio (só a própria linha de `profiles` é exceção).
8. Após logout global, token ainda não expirado aceito pelo `getClaims()`, mas
   **negado pelo banco** (checagem de `auth.sessions`).
9. Token expirado ou com assinatura adulterada rejeitado (tokens de teste
   assinados apenas com a chave do ambiente local).
10. Após logout ou troca de organização, nenhuma página autenticada reaparece
    sem nova validação.
11. Logout comum encerra só a sessão atual (outra sessão do mesmo usuário
    continua válida); logout global encerra todas.
12. Proprietário com um único fator verificado é negado (servidor e banco) em
    financeiro, documentos confidenciais, concessões, `org.manage` e atribuição
    de papéis com permissões sensíveis; com dois, é aceito.
13. Remover um fator do proprietário retira o acesso sensível após a renovação
    da sessão e gera registro de auditoria.

## Pendências

- Reconferir a documentação do Supabase e do Next.js na versão vigente.
- Confirmar na prática que `cookieOptions.httpOnly` funciona em todos os fluxos
  (login, renovação, MFA, PKCE e logout).
- Definir a hospedagem, o plano do Supabase e o provedor de SMTP.
- Escrever o procedimento operacional de recuperação de MFA.
- Escrever o procedimento de recuperação da conta do operador da plataforma.
- Definir a periodicidade da verificação dos fatores dos proprietários (proposta: 90 dias).
