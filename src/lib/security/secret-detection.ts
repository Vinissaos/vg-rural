/**
 * Detecção de segredos conhecidos em texto (bundles, HTML, variáveis públicas).
 *
 * Usado pelo build (next.config.ts), pelo script de varredura do bundle e pelos
 * testes. Mantém apenas sintaxe TypeScript "apagável" para rodar direto no Node.
 * Os resultados nunca incluem o valor encontrado, para não vazar segredos em logs.
 */

export type SecretFinding = {
  rule: string;
  index: number;
};

const ADMIN_JWT_ROLES = new Set(["service_role", "supabase_admin"]);

const PATTERN_RULES: ReadonlyArray<{ rule: string; pattern: RegExp }> = [
  { rule: "supabase-secret-key", pattern: /sb_secret_[A-Za-z0-9_-]{10,}/g },
  {
    rule: "private-key-block",
    pattern: /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/g,
  },
  { rule: "aws-access-key-id", pattern: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g },
  { rule: "github-token", pattern: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/g },
];

const JWT_PATTERN =
  /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g;

function decodeJwtRole(token: string): string | undefined {
  const payload = token.split(".")[1];
  if (payload === undefined) return undefined;
  try {
    const json = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as unknown;
    if (typeof json === "object" && json !== null && "role" in json) {
      const role = (json as { role: unknown }).role;
      return typeof role === "string" ? role : undefined;
    }
  } catch {
    // Não é um JWT válido; ignora.
  }
  return undefined;
}

export function findSecrets(text: string): SecretFinding[] {
  const findings: SecretFinding[] = [];

  for (const { rule, pattern } of PATTERN_RULES) {
    for (const match of text.matchAll(pattern)) {
      findings.push({ rule, index: match.index });
    }
  }

  for (const match of text.matchAll(JWT_PATTERN)) {
    const role = decodeJwtRole(match[0]);
    if (role !== undefined && ADMIN_JWT_ROLES.has(role)) {
      findings.push({ rule: "admin-jwt", index: match.index });
    }
  }

  return findings;
}

const SENSITIVE_NAME =
  /SECRET|SERVICE_ROLE|PRIVATE|PASSWORD|PASSWD|TOKEN|CREDENTIAL|_KEY$/i;

// Chaves que o Supabase projeta para uso no navegador (protegidas por RLS).
const PUBLIC_KEY_SUFFIXES = ["_ANON_KEY", "_PUBLISHABLE_KEY"];

export const PUBLIC_ENV_PREFIX = "NEXT_PUBLIC_";

function isSensitiveName(name: string): boolean {
  if (PUBLIC_KEY_SUFFIXES.some((suffix) => name.endsWith(suffix))) {
    return /SECRET|SERVICE_ROLE|PRIVATE/i.test(name);
  }
  return SENSITIVE_NAME.test(name);
}

/**
 * Retorna os nomes das variáveis NEXT_PUBLIC_* que parecem segredos, pelo nome
 * ou pelo valor. Tudo com esse prefixo é embutido no bundle do navegador.
 */
export function findSensitivePublicEnv(
  env: Readonly<Record<string, string | undefined>>,
): string[] {
  return Object.entries(env)
    .filter(([name]) => name.startsWith(PUBLIC_ENV_PREFIX))
    .filter(
      ([name, value]) =>
        isSensitiveName(name) ||
        (value !== undefined && findSecrets(value).length > 0),
    )
    .map(([name]) => name)
    .sort();
}

/**
 * Valores de variáveis de servidor com nome sensível (ex.: *_SECRET, *_TOKEN).
 * O script de varredura confirma que nenhum deles foi parar no bundle.
 */
export function sensitiveServerEnvValues(
  env: Readonly<Record<string, string | undefined>>,
  minLength = 12,
): Array<{ name: string; value: string }> {
  return Object.entries(env)
    .filter(([name]) => !name.startsWith(PUBLIC_ENV_PREFIX))
    .filter(([name]) => SENSITIVE_NAME.test(name))
    .filter((entry): entry is [string, string] => {
      const value = entry[1];
      return value !== undefined && value.length >= minLength;
    })
    .map(([name, value]) => ({ name, value }));
}

/**
 * Procura segredos num conteúdo qualquer (arquivo do bundle, HTML de resposta):
 * padrões conhecidos e valores de variáveis de servidor sensíveis presentes em
 * `env`. Retorna descrições sem o valor encontrado, seguras para logs.
 */
export function scanForSecrets(
  label: string,
  content: string,
  env: Readonly<Record<string, string | undefined>>,
): string[] {
  const problems = findSecrets(content).map(
    (finding) =>
      `${label}: regra "${finding.rule}" na posição ${finding.index}`,
  );
  for (const { name, value } of sensitiveServerEnvValues(env)) {
    if (content.includes(value)) {
      problems.push(`${label}: contém o valor da variável de servidor ${name}`);
    }
  }
  return problems;
}
