# Detecção de segredos: camadas e limites

Nenhuma camada é suficiente sozinha. Todas reportam **apenas** nome do arquivo ou
rota, regra e posição, **nunca o valor** encontrado.

| Camada                                             | Quando roda             | O que verifica                                                                         |
| -------------------------------------------------- | ----------------------- | -------------------------------------------------------------------------------------- |
| Bloqueio de `NEXT_PUBLIC_*` (`next.config.ts`)     | `build`, `dev`, `start` | Variáveis públicas com nome ou valor de segredo                                        |
| ESLint                                             | `pnpm lint` / CI        | `process.env` fora de `src/lib/env`; menções a `service_role`/`sb_secret_` em `src/`   |
| gitleaks                                           | CI (histórico completo) | Segredos versionados no Git                                                            |
| Varredura do bundle (`pnpm check:bundle`)          | após o build / CI       | Arquivos enviados ao navegador (`.next/static`) e HTML/RSC pré-renderados              |
| Varredura das respostas (`pnpm smoke`)             | servidor rodando / CI   | Corpo real (HTML/JSON) de `/`, `/api/health` e de uma página 404                       |
| Segredo-canário (CI)                               | cada execução da CI     | Valor aleatório em `SMOKE_CANARY_SECRET` não pode aparecer no bundle nem nas respostas |
| Mascaramento de logs (`scripts/lib/redact-log.ts`) | falha do Supabase local | Saída do CLI só em arquivo; em falha, apenas as últimas linhas mascaradas              |

## O que é detectado

- Padrões conhecidos: chave secreta do Supabase (`sb_secret_…`), JWT com papel
  administrativo (`service_role`, `supabase_admin`), bloco de chave privada,
  chave de acesso AWS e token do GitHub.
- O valor exato de qualquer variável de **servidor** com nome sensível (`*SECRET*`,
  `*TOKEN*`, `*PASSWORD*`, `*_KEY` etc.) com 12 ou mais caracteres, presente no
  ambiente em que a verificação roda.

## Limites conhecidos

1. **Formatos desconhecidos** não são reconhecidos por padrão. Só são pegos se o
   valor estiver no ambiente da verificação (caso do canário).
2. **Valores transformados** (codificados em base64, cortados, concatenados no
   navegador) escapam da comparação exata.
3. **Cobertura de rotas:** o teste de fumaça só visita as rotas listadas em
   `scripts/smoke-headers.ts`. Cada rota nova relevante deve ser adicionada. Hoje
   não há páginas autenticadas; quando houver, o teste precisará de uma sessão
   fictícia.
4. **Na CI não existem segredos reais.** A comparação por valor só tem efeito
   com o canário. Em ambientes com segredos reais, rode a varredura com eles no
   ambiente, sem registrar a saída fora do terminal.
5. **Chaves do Supabase local** (Etapa 0.2b): a saída do `supabase start` imprime
   chaves publishable/secret e a URL do banco. `scripts/supabase-local.ts` grava essa
   saída só num log dentro de um diretório temporário exclusivo (`mkdtemp`, permissão
   700; arquivo 600), removido ao final de cada comando, com ou sem falha. Em falha,
   mostra apenas as últimas linhas mascaradas. O mascaramento cobre **padrões
   conhecidos** (chaves `sb_*`, JWTs, credenciais em URL, query string de URLs
   pré-assinadas, atribuições com nome sensível e blocos de chave privada); **não
   garante** reconhecer todo segredo possível, por isso a saída crua nunca é
   impressa. A saída do `supabase test db` também passa pelo mascaramento, porque o
   download de imagens pode imprimir URLs pré-assinadas. O mascaramento é feito no
   texto inteiro antes do corte das linhas. Se a inicialização ou a verificação de
   rede falhar, o script tenta `supabase stop` deste projeto e mantém a falha original. Na CI, `supabase status` e `--debug`
   são proibidos e o job do banco não publica artefatos. As chaves locais podem ser
   valores padrão conhecidos: trate-as sempre como segredo e nunca exponha as portas.
6. **Dados confidenciais de negócio** (CPF, valores, conteúdo de documentos) não
   são segredos de formato fixo e não são detectados aqui. A proteção deles virá
   de autorização, RLS e regras de log das próximas etapas.
