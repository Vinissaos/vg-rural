import { AsyncLocalStorage } from "node:async_hooks";

import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { config, proxy } from "@/proxy";

function run(headers: Record<string, string> = {}) {
  return proxy(new NextRequest("http://localhost:3000/", { headers }));
}

/**
 * Usa o utilitário oficial do Next para saber se o proxy roda numa requisição,
 * com as mesmas regras de matcher do servidor. Ele espera a global
 * AsyncLocalStorage, que o servidor do Next define e o Vitest não.
 */
async function proxyRunsFor(
  url: string,
  headers: Record<string, string> = {},
): Promise<boolean> {
  const scope = globalThis as { AsyncLocalStorage?: unknown };
  scope.AsyncLocalStorage ??= AsyncLocalStorage;
  const { unstable_doesMiddlewareMatch } =
    await import("next/experimental/testing/server");
  return unstable_doesMiddlewareMatch({ config, url, headers });
}

// Cabeçalhos que navegadores e o roteador do Next enviam em prefetch. Um cliente
// também pode enviá-los à vontade, então não podem desligar a CSP.
const PREFETCH_HEADERS: ReadonlyArray<[string, Record<string, string>]> = [
  ["Purpose: prefetch", { purpose: "prefetch" }],
  ["next-router-prefetch", { "next-router-prefetch": "1" }],
  ["Sec-Purpose: prefetch", { "sec-purpose": "prefetch" }],
  ["prefetch RSC", { rsc: "1", "next-router-prefetch": "1" }],
];

describe("proxy (CSP por requisição)", () => {
  it("define a CSP na resposta com o mesmo nonce repassado à renderização", () => {
    const response = run();
    const csp = response.headers.get("content-security-policy");
    expect(csp).toMatch(/'nonce-[A-Za-z0-9+/=]+'/);

    const nonce = /'nonce-([^']+)'/.exec(csp!)![1];
    // NextResponse.next({ request: { headers } }) repassa via x-middleware-request-*.
    expect(response.headers.get("x-middleware-request-x-nonce")).toBe(nonce);
    expect(
      response.headers.get("x-middleware-request-content-security-policy"),
    ).toBe(csp);
  });

  it("usa um nonce diferente a cada requisição", () => {
    const a = run().headers.get("content-security-policy");
    const b = run().headers.get("content-security-policy");
    expect(a).not.toBe(b);
  });

  it.each(PREFETCH_HEADERS)(
    "define a CSP com nonce em requisição de prefetch (%s)",
    (_name, headers) => {
      const response = run(headers);
      const csp = response.headers.get("content-security-policy");
      expect(csp).toMatch(/'nonce-[A-Za-z0-9+/=]+'/);
      expect(
        response.headers.get("x-middleware-request-content-security-policy"),
      ).toBe(csp);
    },
  );
});

describe("matcher do proxy", () => {
  it.each(PREFETCH_HEADERS)(
    "executa o proxy em páginas e APIs mesmo com cabeçalho de prefetch (%s)",
    async (_name, headers) => {
      expect(await proxyRunsFor("/", headers)).toBe(true);
      expect(await proxyRunsFor("/api/health", headers)).toBe(true);
    },
  );

  it("executa o proxy em navegação normal", async () => {
    expect(await proxyRunsFor("/")).toBe(true);
    expect(await proxyRunsFor("/rota-qualquer")).toBe(true);
    expect(await proxyRunsFor("/api/health")).toBe(true);
  });

  it("não intercepta assets estáticos do Next", async () => {
    expect(await proxyRunsFor("/_next/static/chunks/app.js")).toBe(false);
    expect(await proxyRunsFor("/_next/image")).toBe(false);
    expect(await proxyRunsFor("/favicon.ico")).toBe(false);
  });

  it("não usa condições de cabeçalho que permitam desligar a CSP", () => {
    for (const matcher of config.matcher) {
      expect(matcher).not.toHaveProperty("has");
      expect(matcher).not.toHaveProperty("missing");
    }
  });
});
