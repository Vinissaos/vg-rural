import { describe, expect, it } from "vitest";

import { findSecrets } from "../../src/lib/security/secret-detection";
import {
  REDACTED,
  redactLog,
  redactedTail,
} from "../../scripts/lib/redact-log";

// Valores FICTÍCIOS e de baixa entropia, montados em tempo de execução para não
// parecerem segredos reais no repositório.
const fakeSecretKey = ["sb", "secret", "a".repeat(24)].join("_");
const fakePublishableKey = ["sb", "publishable", "b".repeat(24)].join("_");
const b64 = (value: object) =>
  Buffer.from(JSON.stringify(value)).toString("base64url");
const fakeAdminJwt = [
  b64({ alg: "HS256", typ: "JWT" }),
  b64({ role: "service_role", iss: "teste-ficticio" }),
  "c".repeat(16),
].join(".");
// Marcadores de chave privada montados em tempo de execução (fictícios).
const keyBegin = ["-----BEGIN", "PRIVATE", "KEY-----"].join(" ");
const keyEnd = ["-----END", "PRIVATE", "KEY-----"].join(" ");
const jwtSecretName = ["JWT", "SECRET"].join("_");

const fakeUserJwt = [
  b64({ alg: "HS256", typ: "JWT" }),
  b64({ role: "authenticated" }),
  "d".repeat(16),
].join(".");

describe("redactLog", () => {
  it("mascara as chaves locais do Supabase", () => {
    const out = redactLog(
      `Publishable │ ${fakePublishableKey}\nSecret │ ${fakeSecretKey}`,
    );
    expect(out).not.toContain(fakeSecretKey);
    expect(out).not.toContain(fakePublishableKey);
    expect(out).toContain(REDACTED);
  });

  it("mascara qualquer JWT, de serviço ou de usuário", () => {
    const out = redactLog(`a ${fakeAdminJwt} b ${fakeUserJwt}`);
    expect(out).not.toContain(fakeAdminJwt);
    expect(out).not.toContain(fakeUserJwt);
  });

  it("mascara credenciais em URLs, mantendo o resto legível", () => {
    const out = redactLog(
      "DB URL: postgresql://postgres:postgres@127.0.0.1:54322/postgres",
    );
    expect(out).toBe(
      `DB URL: postgresql://${REDACTED}@127.0.0.1:54322/postgres`,
    );
  });

  it("mascara atribuições com nome sensível em vários formatos", () => {
    const out = redactLog(
      [
        `${jwtSecretName}=valor-ficticio-123`,
        '"password": "senha-ficticia"',
        "SERVICE_ROLE_KEY: chave-ficticia",
        "api_key='outra-ficticia'",
      ].join("\n"),
    );
    for (const value of [
      "valor-ficticio-123",
      "senha-ficticia",
      "chave-ficticia",
      "outra-ficticia",
    ]) {
      expect(out).not.toContain(value);
    }
    expect(out).toContain(`${jwtSecretName}=`);
  });

  it("mascara blocos de chave privada inteiros", () => {
    const block = [keyBegin, "conteudo-ficticio", keyEnd].join("\n");
    const out = redactLog(`antes\n${block}\ndepois`);
    expect(out).not.toContain("conteudo-ficticio");
    expect(out).toContain("antes");
    expect(out).toContain("depois");
  });

  it("mascara a query string de URLs pré-assinadas, mantendo o host", () => {
    const signed = [
      "https://cdn.exemplo.invalid/v2/camada?Encoded=abc&X-Amz-Signature=def",
      "https://blob.exemplo.invalid/b/sha256:1?se=2026&sig=ghi&hmac=jkl",
      "https://cdn.exemplo.invalid/x?Expires=1&Signature=mno&Key-Pair-Id=pqr",
    ];
    const out = redactLog(signed.join("\n"));
    for (const fragment of ["abc", "def", "ghi", "jkl", "mno", "pqr"]) {
      expect(out).not.toContain(`=${fragment}`);
    }
    expect(out).toContain(`https://cdn.exemplo.invalid/v2/camada?${REDACTED}`);
  });

  it("não altera URLs comuns sem assinatura", () => {
    const text =
      "Pulling from public.ecr.aws/supabase/pg_prove:3.36 (https://exemplo.invalid/a?pagina=2)";
    expect(redactLog(text)).toBe(text);
  });

  it("mascara valores exatos informados", () => {
    expect(redactLog("token local: valor-exato-1", ["valor-exato-1"])).toBe(
      `token local: ${REDACTED}`,
    );
  });

  it("depois do mascaramento, o detector de segredos não encontra nada", () => {
    const raw = `${fakeSecretKey} ${fakeAdminJwt} ${keyBegin} x`;
    expect(findSecrets(raw).length).toBeGreaterThan(0);
    expect(findSecrets(redactLog(raw))).toEqual([]);
  });

  it("preserva texto comum", () => {
    const text = "Started supabase local development setup.";
    expect(redactLog(text)).toBe(text);
  });
});

describe("redactedTail", () => {
  it("devolve só as últimas linhas, já mascaradas", () => {
    const text = ["linha 1", `segredo ${fakeSecretKey}`, "linha 3"].join("\n");
    expect(redactedTail(text, 2)).toBe(`segredo ${REDACTED}\nlinha 3`);
  });

  it("ignora quebras de linha finais", () => {
    expect(redactedTail("a\nb\n\n", 1)).toBe("b");
  });

  it("não expõe o conteúdo de um bloco cortado pelo limite de linhas", () => {
    const text = [
      keyBegin,
      "conteudo-ficticio-1",
      "conteudo-ficticio-2",
      keyEnd,
      "fim",
    ].join("\n");
    const tail = redactedTail(text, 3);
    expect(tail).not.toContain("conteudo-ficticio");
  });
});
