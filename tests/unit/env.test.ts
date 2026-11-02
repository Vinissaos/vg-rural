import { describe, expect, it, vi } from "vitest";

import { validateEnv } from "@/lib/env/schema";

const PROD_OK = {
  NODE_ENV: "production",
  APP_ENV: "production",
  NEXT_PUBLIC_SITE_URL: "https://app.vgrural.example",
};

describe("validateEnv: desenvolvimento e testes", () => {
  it("aplica padrões locais em desenvolvimento", () => {
    expect(validateEnv({ NODE_ENV: "development" })).toEqual({
      server: { NODE_ENV: "development", APP_ENV: "local" },
      client: { NEXT_PUBLIC_SITE_URL: "http://localhost:3000" },
    });
  });

  it("usa APP_ENV=test no ambiente de testes", () => {
    expect(validateEnv({ NODE_ENV: "test" }).server.APP_ENV).toBe("test");
  });

  it("rejeita APP_ENV desconhecido mesmo fora de produção", () => {
    expect(() =>
      validateEnv({ NODE_ENV: "development", APP_ENV: "producao" }),
    ).toThrow("Variáveis de ambiente inválidas (ambiente): APP_ENV");
  });

  it("aceita apenas URL http(s) para o site", () => {
    expect(() =>
      validateEnv({ NEXT_PUBLIC_SITE_URL: "javascript:alert(1)" }),
    ).toThrow("NEXT_PUBLIC_SITE_URL");
  });
});

describe("validateEnv: produção (NODE_ENV=production)", () => {
  it("exige APP_ENV e NEXT_PUBLIC_SITE_URL explícitos, sem fallback", () => {
    expect(() => validateEnv({ NODE_ENV: "production" })).toThrow(
      "Variáveis de ambiente inválidas (ambiente): APP_ENV, NEXT_PUBLIC_SITE_URL",
    );
    expect(() =>
      validateEnv({ NODE_ENV: "production", APP_ENV: "production" }),
    ).toThrow("NEXT_PUBLIC_SITE_URL");
    expect(() =>
      validateEnv({
        NODE_ENV: "production",
        NEXT_PUBLIC_SITE_URL: PROD_OK.NEXT_PUBLIC_SITE_URL,
      }),
    ).toThrow("APP_ENV");
  });

  it("aceita configuração explícita de produção com HTTPS público", () => {
    expect(validateEnv(PROD_OK)).toEqual({
      server: { NODE_ENV: "production", APP_ENV: "production" },
      client: { NEXT_PUBLIC_SITE_URL: "https://app.vgrural.example" },
    });
  });

  it.each(["production", "staging"])(
    "APP_ENV=%s exige URL pública HTTPS",
    (appEnv) => {
      for (const url of [
        "http://app.vgrural.example",
        "https://localhost",
        "https://127.0.0.1:3000",
        "http://localhost:3000",
      ]) {
        expect(() =>
          validateEnv({
            ...PROD_OK,
            APP_ENV: appEnv,
            NEXT_PUBLIC_SITE_URL: url,
          }),
        ).toThrow("deve ser uma URL pública HTTPS");
      }
    },
  );

  it("permite build de produção local/teste com URL local explícita", () => {
    for (const appEnv of ["local", "test"]) {
      expect(
        validateEnv({
          NODE_ENV: "production",
          APP_ENV: appEnv,
          NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
        }).server.APP_ENV,
      ).toBe(appEnv);
    }
  });

  it("não inclui valores na mensagem de erro", () => {
    const valor = "valor-confidencial-ficticio";
    let message = "";
    try {
      validateEnv({ NODE_ENV: "production", APP_ENV: valor });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain("APP_ENV");
    expect(message).not.toContain(valor);
  });
});

describe("pontos de validação na inicialização", () => {
  async function importFresh<T>(path: string): Promise<T> {
    vi.resetModules();
    return (await import(/* @vite-ignore */ path)) as T;
  }

  it("next.config.ts (build/dev/start) falha com ambiente inválido", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_ENV", "");
    await expect(importFresh("../../next.config")).rejects.toThrow("APP_ENV");
  });

  it("next.config.ts carrega com ambiente de produção válido", async () => {
    for (const [key, value] of Object.entries(PROD_OK)) vi.stubEnv(key, value);
    await expect(importFresh("../../next.config")).resolves.toBeDefined();
  });

  it("instrumentation register() impede a inicialização do servidor", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_ENV", "staging");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://vgrural.example");
    const { register } = await importFresh<{ register: () => void }>(
      "@/instrumentation",
    );
    expect(() => register()).toThrow("deve ser uma URL pública HTTPS");
  });

  it("módulo de servidor valida process.env ao ser carregado", async () => {
    vi.stubEnv("APP_ENV", "staging");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://homolog.vgrural.example");
    const { serverEnv } =
      await importFresh<typeof import("@/lib/env/server")>("@/lib/env/server");
    expect(serverEnv.APP_ENV).toBe("staging");
  });

  it("módulo de servidor falha com APP_ENV inválido", async () => {
    vi.stubEnv("APP_ENV", "invalido");
    await expect(importFresh("@/lib/env/server")).rejects.toThrow("APP_ENV");
  });

  it("módulo público falha em produção sem NEXT_PUBLIC_SITE_URL", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    await expect(importFresh("@/lib/env/client")).rejects.toThrow(
      "NEXT_PUBLIC_SITE_URL",
    );
  });
});
