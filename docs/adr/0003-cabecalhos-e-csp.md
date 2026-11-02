# ADR 0003: Cabeçalhos de segurança e CSP com nonce

- **Status:** Aceito (Etapa 0.1)
- **Data:** 2026-10-23

## Decisão

- **CSP com nonce por requisição** gerado em `src/proxy.ts` (128 bits aleatórios),
  com `strict-dynamic` e sem `unsafe-inline`/`unsafe-eval` em produção. Também
  `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'` e `form-action 'self'`.
- **Cabeçalhos estáticos** em `next.config.ts`: HSTS (2 anos, sem `preload` até
  existir domínio definitivo), `nosniff`, `X-Frame-Options: DENY`,
  `Referrer-Policy: no-referrer`, `Permissions-Policy` restritiva, COOP/CORP `same-origin`
  e `X-Robots-Tag: noindex, nofollow` em todas as rotas. Não há `robots.txt` com
  `Disallow`, de propósito: o buscador precisa acessar a URL para ler o `noindex`.

## Consequências

- O nonce exige **renderização dinâmica** de todas as páginas (sem páginas
  estáticas/ISR). É aceitável: o produto é uma aplicação autenticada e as
  respostas saem com `Cache-Control: no-store`, o que também evita cache de
  dados privados em proxies e no navegador.
- Em desenvolvimento a CSP é relaxada (`unsafe-eval`, estilos inline) por
  exigência do React/Next. Os testes garantem que isso não vale em produção.
- Scripts ou estilos de terceiros exigirão revisão explícita da CSP.
