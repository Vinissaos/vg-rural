import { describe, expect, it } from "vitest";

import { securityHeaders } from "@/lib/security/headers";

import { checkResponse } from "../../scripts/lib/response-checks";
import { fakeJwt, fakeSupabaseSecretKey } from "../helpers/fake-secrets";

const NONCE = "bm9uY2UtZGUtdGVzdGU=";

function makeResponse(
  body: string,
  {
    contentType = "text/html; charset=utf-8",
    status = 200,
    omit = [] as string[],
  } = {},
): Response {
  const headers = new Headers([
    ...securityHeaders.map(({ key, value }): [string, string] => [key, value]),
    [
      "Content-Security-Policy",
      `default-src 'self'; script-src 'self' 'nonce-${NONCE}' 'strict-dynamic'; frame-ancestors 'none'`,
    ],
    [
      "Cache-Control",
      "private, no-cache, no-store, max-age=0, must-revalidate",
    ],
    ["Content-Type", contentType],
  ]);
  for (const name of omit) headers.delete(name);
  return new Response(body, { status, headers });
}

const cleanHtml = `<html><body><h1>VG Rural</h1><script nonce="${NONCE}" src="/_next/a.js"></script></body></html>`;

describe("verificação de respostas HTTP (teste de fumaça)", () => {
  it("aprova resposta segura", async () => {
    expect(await checkResponse("/", makeResponse(cleanHtml), {})).toEqual([]);
  });

  it("reprova segredo conhecido embutido no HTML, sem expor o valor", async () => {
    const secret = fakeSupabaseSecretKey();
    const html = cleanHtml.replace(
      "</body>",
      `<script nonce="${NONCE}">self.k="${secret}"</script></body>`,
    );
    const errors = await checkResponse("/", makeResponse(html), {});
    expect(errors).toEqual([
      expect.stringContaining('regra "supabase-secret-key"'),
    ]);
    expect(errors.join()).not.toContain(secret);
  });

  it("reprova JWT administrativo em resposta JSON", async () => {
    const body = JSON.stringify({ token: fakeJwt({ role: "service_role" }) });
    const errors = await checkResponse(
      "/api/x",
      makeResponse(body, { contentType: "application/json" }),
      {},
    );
    expect(errors).toEqual([expect.stringContaining('regra "admin-jwt"')]);
  });

  it("reprova valor de variável de servidor sensível no HTML", async () => {
    const value = "ficticio-".repeat(3);
    const html = cleanHtml.replace("VG Rural", value);
    const errors = await checkResponse("/", makeResponse(html), {
      SMOKE_CANARY_SECRET: value,
    });
    expect(errors).toEqual([
      "/: corpo da resposta: contém o valor da variável de servidor SMOKE_CANARY_SECRET",
    ]);
  });

  it("reprova ausência de X-Robots-Tag e de outros cabeçalhos", async () => {
    const errors = await checkResponse(
      "/",
      makeResponse(cleanHtml, { omit: ["X-Robots-Tag", "X-Frame-Options"] }),
      {},
    );
    expect(errors).toEqual([
      "/: cabeçalho x-frame-options ausente ou inválido",
      "/: cabeçalho x-robots-tag ausente ou inválido",
    ]);
  });

  it("reprova <script> sem o nonce da requisição", async () => {
    const html = cleanHtml.replace(
      "</body>",
      "<script>alert(1)</script></body>",
    );
    expect(await checkResponse("/", makeResponse(html), {})).toEqual([
      "/: 1 <script> sem o nonce da requisição",
    ]);
  });

  it("confere o status esperado (ex.: 404)", async () => {
    const response = makeResponse(cleanHtml, { status: 404 });
    expect(await checkResponse("/x", response, {}, 404)).toEqual([]);
    expect(
      await checkResponse("/x", makeResponse(cleanHtml, { status: 404 }), {}),
    ).toEqual(["/x: status 404 (esperado 200)"]);
  });
});

describe("atributo nonce dos <script> (teste de fumaça)", () => {
  const check = (script: string) =>
    checkResponse("/", makeResponse(`<html><body>${script}</body></html>`), {});

  // Só vale um atributo chamado exatamente "nonce" com o valor da CSP; como no
  // navegador, a primeira ocorrência prevalece.
  it.each([
    ["aspas simples", `<script nonce='${NONCE}' src="/a.js"></script>`],
    ["sem aspas", `<script nonce=${NONCE} src="/a.js"></script>`],
    ["nome do atributo em maiúsculas", `<script NONCE="${NONCE}"></script>`],
    ["tag SCRIPT maiúscula com nonce", `<SCRIPT nonce="${NONCE}"></SCRIPT>`],
    [
      "sinal > dentro de outro atributo",
      `<script data-a=">" nonce="${NONCE}" src="/a.js"></script>`,
    ],
    [
      "nonce duplicado, primeiro correto",
      `<script nonce="${NONCE}" nonce="outro"></script>`,
    ],
  ])("aprova nonce válido: %s", async (_name, script) => {
    expect(await check(script)).toEqual([]);
  });

  it.each([
    ["só data-nonce", `<script data-nonce="${NONCE}" src="/a.js"></script>`],
    [
      "nonce dentro de outro atributo",
      `<script data-x='y nonce="${NONCE}"' src="/a.js"></script>`,
    ],
    ["tag SCRIPT maiúscula sem nonce", `<SCRIPT src="/a.js"></SCRIPT>`],
    [
      "nonce vazio com data-nonce correto",
      `<script nonce="" data-nonce="${NONCE}"></script>`,
    ],
    [
      "nonce duplicado, primeiro errado",
      `<script nonce="outro" nonce="${NONCE}"></script>`,
    ],
    [
      "malformado: aspas no meio de valor sem aspas",
      `<script data-x=a"nonce="${NONCE}"></script>`,
    ],
    [
      "malformado: aspas sem fechamento",
      `<script data-x="abc nonce="${NONCE}"></script>`,
    ],
    ["malformado: nonce sem valor", `<script nonce= src="/a.js"></script>`],
  ])("reprova script sem nonce válido: %s", async (_name, script) => {
    expect(await check(script)).toEqual([
      "/: 1 <script> sem o nonce da requisição",
    ]);
  });
});
