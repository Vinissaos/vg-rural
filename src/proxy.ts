import { NextResponse, type NextRequest } from "next/server";

import { isDevelopment } from "@/lib/env/runtime";
import { buildContentSecurityPolicy, generateNonce } from "@/lib/security/csp";

export function proxy(request: NextRequest) {
  const nonce = generateNonce();
  const csp = buildContentSecurityPolicy({ nonce, isDev: isDevelopment });

  // O Next.js lê a CSP do cabeçalho da requisição para aplicar o nonce aos
  // próprios scripts durante a renderização.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

// Sem condições de cabeçalho (has/missing): cabeçalhos de prefetch como
// `Purpose` e `next-router-prefetch` são controlados pelo cliente, e excluí-los
// fazia o servidor devolver o HTML completo da página sem CSP.
export const config = {
  matcher: [{ source: "/((?!_next/static|_next/image|favicon.ico).*)" }],
};
