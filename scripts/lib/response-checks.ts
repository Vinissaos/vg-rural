/**
 * Verificações de segurança aplicadas a respostas HTTP reais da aplicação:
 * cabeçalhos, CSP com nonce e ausência de segredos no corpo (HTML/JSON).
 * Usado pelo teste de fumaça (scripts/smoke-headers.ts) e pelos testes unitários.
 * As mensagens nunca incluem valores de segredos encontrados.
 */
import { scanForSecrets } from "../../src/lib/security/secret-detection.ts";

type Env = Readonly<Record<string, string | undefined>>;

export const REQUIRED_HEADERS: Readonly<Record<string, RegExp>> = {
  "strict-transport-security": /max-age=\d{8,}/,
  "x-content-type-options": /^nosniff$/,
  "x-frame-options": /^DENY$/,
  "referrer-policy": /^no-referrer$/,
  "permissions-policy": /camera=\(\)/,
  "cross-origin-opener-policy": /^same-origin$/,
  "cross-origin-resource-policy": /^same-origin$/,
  "x-robots-tag": /noindex/,
  "content-security-policy": /frame-ancestors 'none'/,
  "cache-control": /no-store/,
};

// Início de cada tag <script>, sem diferenciar maiúsculas.
const SCRIPT_OPEN = /<script\b/gi;
// Tag completa a partir do início, respeitando aspas: um ">" dentro de um
// atributo não encerra a tag.
const SCRIPT_TAG = /<script\b(?:[^>"']|"[^"]*"|'[^']*')*>/iy;
// Um atributo por vez, sem pular caracteres; aceita aspas duplas, simples ou nenhuma.
const ATTRIBUTE =
  /[\s/]*([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'<>`]+)))?/y;

/** Tags <script> do HTML; uma tag sem fim reconhecível vira `null`. */
function scriptTags(html: string): Array<string | null> {
  return [...html.matchAll(SCRIPT_OPEN)].map((open) => {
    SCRIPT_TAG.lastIndex = open.index;
    return SCRIPT_TAG.exec(html)?.[0] ?? null;
  });
}

/**
 * Exige um atributo chamado exatamente "nonce" (sem diferenciar maiúsculas) com
 * o valor da CSP; como no navegador, vale a primeira ocorrência. Tag ou
 * atributos malformados contam como sem nonce.
 */
function hasNonce(tag: string | null, nonce: string): boolean {
  if (tag === null) return false;
  const attributes = tag.slice("<script".length, -1);
  let position = 0;
  while (!/^[\s/]*$/.test(attributes.slice(position))) {
    ATTRIBUTE.lastIndex = position;
    const match = ATTRIBUTE.exec(attributes);
    if (match === null) return false;
    if (match[1]!.toLowerCase() === "nonce") {
      return (match[2] ?? match[3] ?? match[4]) === nonce;
    }
    position = ATTRIBUTE.lastIndex;
  }
  return false;
}

export async function checkResponse(
  path: string,
  response: Response,
  env: Env,
  expectedStatus = 200,
): Promise<string[]> {
  const errors: string[] = [];

  if (response.status !== expectedStatus) {
    errors.push(`status ${response.status} (esperado ${expectedStatus})`);
  }
  for (const [name, pattern] of Object.entries(REQUIRED_HEADERS)) {
    const value = response.headers.get(name);
    if (value === null || !pattern.test(value)) {
      errors.push(`cabeçalho ${name} ausente ou inválido`);
    }
  }
  if (response.headers.has("x-powered-by"))
    errors.push("x-powered-by presente");

  const csp = response.headers.get("content-security-policy") ?? "";
  if (/script-src[^;]*'unsafe-(?:inline|eval)'/.test(csp)) {
    errors.push("script-src permite unsafe-inline/unsafe-eval");
  }

  const body = await response.text();
  errors.push(...scanForSecrets("corpo da resposta", body, env));

  if (response.headers.get("content-type")?.includes("text/html")) {
    const nonce = /'nonce-([^']+)'/.exec(csp)?.[1];
    const scripts = scriptTags(body);
    if (nonce === undefined) errors.push("CSP sem nonce");
    else {
      const withoutNonce = scripts.filter((tag) => !hasNonce(tag, nonce));
      if (withoutNonce.length > 0) {
        errors.push(
          `${withoutNonce.length} <script> sem o nonce da requisição`,
        );
      }
    }
  }

  return errors.map((error) => `${path}: ${error}`);
}
