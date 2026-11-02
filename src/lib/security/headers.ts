/**
 * Cabeçalhos de segurança estáticos, aplicados a todas as rotas via next.config.ts.
 * A CSP depende de nonce por requisição e é aplicada em src/proxy.ts.
 */
export const securityHeaders: ReadonlyArray<{ key: string; value: string }> = [
  // HTTPS obrigatório por 2 anos. Sem "preload" até o domínio definitivo existir,
  // porque a inclusão na lista de preload é difícil de reverter.
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Redundante com frame-ancestors da CSP; cobre navegadores antigos.
  { key: "X-Frame-Options", value: "DENY" },
  // URLs internas (ids de documentos, organizações) não vazam para outros sites.
  { key: "Referrer-Policy", value: "no-referrer" },
  {
    key: "Permissions-Policy",
    value:
      "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  // Aplicação privada: nenhuma rota (páginas, APIs, assets) deve ser indexada.
  // Não há robots.txt com Disallow de propósito: o buscador precisa conseguir
  // acessar a URL para ler este cabeçalho e respeitar o noindex.
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
];
