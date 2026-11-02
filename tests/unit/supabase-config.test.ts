import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Verificações de segurança do supabase/config.toml (Etapa 0.2b), sem dependência
 * nova: lê apenas o subconjunto de TOML usado no arquivo (seções, strings,
 * números, booleanos e listas de strings). Qualquer linha fora desse formato
 * reprova, para o teste não aceitar silenciosamente algo que não entende.
 */
type Value = string | number | boolean | string[];

function parseTomlSubset(text: string): Map<string, Value> {
  const values = new Map<string, Value>();
  let section = "";
  for (const [index, rawLine] of text.split(/\r?\n/).entries()) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) continue;
    const header = /^\[([a-z0-9_.]+)\]$/.exec(line);
    if (header) {
      section = header[1] ?? "";
      continue;
    }
    const pair = /^([a-z0-9_]+)\s*=\s*(.+?)\s*(?:#.*)?$/.exec(line);
    if (!pair) throw new Error(`linha ${index + 1} fora do formato suportado`);
    const [, key = "", raw = ""] = pair;
    let value: Value;
    if (/^"[^"]*"$/.test(raw)) value = raw.slice(1, -1);
    else if (raw === "true" || raw === "false") value = raw === "true";
    else if (/^\d+$/.test(raw)) value = Number(raw);
    else if (/^\[(?:\s*"[^"]*"\s*,?)*\s*\]$/.test(raw))
      value = [...raw.matchAll(/"([^"]*)"/g)].map((match) => match[1] ?? "");
    else
      throw new Error(`valor da linha ${index + 1} fora do formato suportado`);
    values.set(section ? `${section}.${key}` : key, value);
  }
  return values;
}

const config = parseTomlSubset(readFileSync("supabase/config.toml", "utf8"));

describe("supabase/config.toml", () => {
  it.each([
    ["project_id", "vg-rural"],
    // Cadastro público e entradas alternativas desligados.
    ["auth.enable_signup", false],
    ["auth.email.enable_signup", false],
    ["auth.sms.enable_signup", false],
    ["auth.enable_anonymous_sign_ins", false],
    ["auth.enable_manual_linking", false],
    // Sessão e senha (ADR 0004, proposto).
    ["auth.jwt_expiry", 900],
    ["auth.enable_refresh_token_rotation", true],
    ["auth.minimum_password_length", 12],
    ["auth.email.enable_confirmations", true],
    ["auth.email.secure_password_change", true],
    // MFA: TOTP planejado, sem SMS.
    ["auth.mfa.totp.enroll_enabled", true],
    ["auth.mfa.totp.verify_enabled", true],
    ["auth.mfa.phone.enroll_enabled", false],
    ["auth.mfa.phone.verify_enabled", false],
    // Serviços desnecessários desligados.
    ["studio.enabled", false],
    ["realtime.enabled", false],
    ["storage.enabled", false],
    ["edge_runtime.enabled", false],
    ["analytics.enabled", false],
    ["local_smtp.enabled", false],
    ["db.pooler.enabled", false],
    ["auth.web3.solana.enabled", false],
    ["auth.oauth_server.enabled", false],
    // Sem seeds nesta etapa.
    ["db.seed.enabled", false],
  ])("%s = %j", (key, expected) => {
    expect(config.get(key)).toEqual(expected);
  });

  it("expõe somente o schema public pela API (sem graphql_public)", () => {
    expect(config.get("api.schemas")).toEqual(["public"]);
  });

  it("não define auto_expose_new_tables (padrão: não expor tabelas novas)", () => {
    expect(config.has("api.auto_expose_new_tables")).toBe(false);
  });

  it("não tem redirecionamentos extras nem provedores externos ligados", () => {
    expect(config.get("auth.additional_redirect_urls")).toEqual([]);
    const enabledExternal = [...config.entries()].filter(
      ([key, value]) =>
        /^auth\.(?:external|third_party)\./.test(key) &&
        key.endsWith(".enabled") &&
        value === true,
    );
    expect(enabledExternal).toEqual([]);
  });

  it("não contém segredos literais (só env(...))", () => {
    const sensitive = [...config.entries()].filter(
      ([key, value]) =>
        typeof value === "string" &&
        /(?:secret|password|passwd|token|_key|pass)$/i.test(key) &&
        !/^env\([A-Z0-9_]+\)$/.test(value),
    );
    expect(sensitive).toEqual([]);
  });

  it("aponta apenas para endereços locais", () => {
    expect(config.get("auth.site_url")).toBe("http://127.0.0.1:3000");
  });
});
