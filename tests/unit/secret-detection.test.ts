import { describe, expect, it } from "vitest";

import {
  findSecrets,
  findSensitivePublicEnv,
  sensitiveServerEnvValues,
} from "@/lib/security/secret-detection";

import {
  fakeAwsKeyId,
  fakeJwt,
  fakePrivateKeyHeader,
  fakeSupabaseSecretKey,
} from "../helpers/fake-secrets";

describe("findSecrets", () => {
  it("detecta chave secreta do Supabase, chave privada e chave AWS", () => {
    const text = `a=${fakeSupabaseSecretKey()};b="${fakePrivateKeyHeader()}";c=${fakeAwsKeyId()}`;
    const rules = findSecrets(text).map((f) => f.rule);
    expect(rules).toEqual(
      expect.arrayContaining([
        "supabase-secret-key",
        "private-key-block",
        "aws-access-key-id",
      ]),
    );
  });

  it("detecta JWT com papel administrativo (service_role)", () => {
    const token = fakeJwt({ role: "service_role", iss: "teste" });
    expect(findSecrets(`const k = "${token}"`)).toEqual([
      { rule: "admin-jwt", index: 11 },
    ]);
  });

  it("não acusa JWT de papel público (anon)", () => {
    expect(findSecrets(fakeJwt({ role: "anon" }))).toEqual([]);
  });

  it("não acusa texto comum", () => {
    expect(findSecrets("Fazenda Boa Vista — matrícula fictícia 0000")).toEqual(
      [],
    );
  });

  it("nunca devolve o valor do segredo encontrado", () => {
    const secret = fakeSupabaseSecretKey();
    const serialized = JSON.stringify(findSecrets(secret));
    expect(serialized).not.toContain(secret);
  });
});

describe("findSensitivePublicEnv", () => {
  it("bloqueia NEXT_PUBLIC_ com nome de segredo", () => {
    expect(
      findSensitivePublicEnv({
        NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY: "x",
        NEXT_PUBLIC_API_SECRET: "x",
        NEXT_PUBLIC_DB_PASSWORD: "x",
        NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
      }),
    ).toEqual([
      "NEXT_PUBLIC_API_SECRET",
      "NEXT_PUBLIC_DB_PASSWORD",
      "NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY",
    ]);
  });

  it("permite chaves públicas previstas (anon/publishable)", () => {
    expect(
      findSensitivePublicEnv({
        NEXT_PUBLIC_SUPABASE_ANON_KEY: fakeJwt({ role: "anon" }),
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_ficticio",
      }),
    ).toEqual([]);
  });

  it("bloqueia pelo valor mesmo com nome inofensivo", () => {
    expect(
      findSensitivePublicEnv({
        NEXT_PUBLIC_SUPABASE_ANON_KEY: fakeJwt({ role: "service_role" }),
        NEXT_PUBLIC_CONFIG: fakeSupabaseSecretKey(),
      }),
    ).toEqual(["NEXT_PUBLIC_CONFIG", "NEXT_PUBLIC_SUPABASE_ANON_KEY"]);
  });

  it("ignora variáveis de servidor", () => {
    expect(
      findSensitivePublicEnv({ SUPABASE_SECRET_KEY: fakeSupabaseSecretKey() }),
    ).toEqual([]);
  });
});

describe("sensitiveServerEnvValues", () => {
  it("lista só variáveis de servidor com nome sensível e valor longo", () => {
    expect(
      sensitiveServerEnvValues({
        JOB_API_TOKEN: "ficticio-".repeat(3),
        SHORT_SECRET: "curto",
        APP_ENV: "production",
        NEXT_PUBLIC_X_TOKEN: "ficticio-".repeat(3),
      }).map((entry) => entry.name),
    ).toEqual(["JOB_API_TOKEN"]);
  });
});
