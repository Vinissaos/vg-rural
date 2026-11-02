import { describe, expect, it } from "vitest";

import nextConfig from "../../next.config";
import { buildContentSecurityPolicy, generateNonce } from "@/lib/security/csp";
import { securityHeaders } from "@/lib/security/headers";

function directive(csp: string, name: string): string {
  return (
    csp
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${name} `)) ?? ""
  );
}

describe("Content Security Policy", () => {
  const nonce = "bm9uY2UtZGUtdGVzdGU=";
  const prod = buildContentSecurityPolicy({ nonce, isDev: false });

  it("em produção usa nonce e não permite unsafe-inline/unsafe-eval em scripts", () => {
    const scripts = directive(prod, "script-src");
    expect(scripts).toContain(`'nonce-${nonce}'`);
    expect(scripts).toContain("'strict-dynamic'");
    expect(scripts).not.toMatch(/unsafe-(inline|eval)/);
    expect(directive(prod, "style-src")).not.toContain("unsafe-inline");
  });

  it("bloqueia framing, plugins e envio de formulários a terceiros", () => {
    expect(directive(prod, "frame-ancestors")).toBe("frame-ancestors 'none'");
    expect(directive(prod, "object-src")).toBe("object-src 'none'");
    expect(directive(prod, "form-action")).toBe("form-action 'self'");
    expect(directive(prod, "base-uri")).toBe("base-uri 'self'");
    expect(directive(prod, "default-src")).toBe("default-src 'self'");
    expect(prod).toContain("upgrade-insecure-requests");
  });

  it("só relaxa a política em desenvolvimento", () => {
    const dev = buildContentSecurityPolicy({ nonce, isDev: true });
    expect(directive(dev, "script-src")).toContain("'unsafe-eval'");
    expect(dev).not.toContain("upgrade-insecure-requests");
  });

  it("gera nonces aleatórios de 128 bits", () => {
    const nonces = new Set(Array.from({ length: 100 }, generateNonce));
    expect(nonces.size).toBe(100);
    for (const value of nonces) {
      expect(Buffer.from(value, "base64")).toHaveLength(16);
    }
  });
});

describe("cabeçalhos de segurança estáticos", () => {
  const byName = Object.fromEntries(
    securityHeaders.map(({ key, value }) => [key.toLowerCase(), value]),
  );

  it("inclui o conjunto mínimo exigido", () => {
    expect(byName).toMatchObject({
      "strict-transport-security": "max-age=63072000; includeSubDomains",
      "x-content-type-options": "nosniff",
      "x-frame-options": "DENY",
      "referrer-policy": "no-referrer",
      "cross-origin-opener-policy": "same-origin",
      "cross-origin-resource-policy": "same-origin",
    });
    expect(byName["permissions-policy"]).toContain("camera=()");
  });

  it("impede indexação de todas as rotas (X-Robots-Tag)", () => {
    expect(byName["x-robots-tag"]).toBe("noindex, nofollow");
  });

  it("next.config aplica os cabeçalhos a todas as rotas e oculta X-Powered-By", async () => {
    expect(nextConfig.poweredByHeader).toBe(false);
    expect(nextConfig.productionBrowserSourceMaps).toBe(false);
    const rules = await nextConfig.headers!();
    expect(rules).toEqual([
      { source: "/:path*", headers: [...securityHeaders] },
    ]);
  });
});
