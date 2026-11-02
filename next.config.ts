import type { NextConfig } from "next";

import { validateEnv } from "./src/lib/env/schema";
import { securityHeaders } from "./src/lib/security/headers";
import { findSensitivePublicEnv } from "./src/lib/security/secret-detection";

// Executado em `next build`, `next dev` e `next start`: configuração inválida
// interrompe o processo antes de compilar ou servir qualquer página.
validateEnv(process.env);

// Falha o build/servidor se algum segredo estiver exposto como NEXT_PUBLIC_*.
const exposed = findSensitivePublicEnv(process.env);
if (exposed.length > 0) {
  throw new Error(
    `Variáveis NEXT_PUBLIC_ com aparência de segredo: ${exposed.join(", ")}. ` +
      "Tudo com esse prefixo vai para o navegador.",
  );
}

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // Source maps de produção não são publicados no navegador.
  productionBrowserSourceMaps: false,
  async headers() {
    return [{ source: "/:path*", headers: [...securityHeaders] }];
  },
};

export default nextConfig;
