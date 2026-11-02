/**
 * Segredos FALSOS para testes. São montados em tempo de execução, por partes,
 * para que nenhum valor com formato de segredo exista literalmente no repositório
 * (e para que o gitleaks não precise de exceções).
 */
const b64url = (value: unknown) =>
  Buffer.from(JSON.stringify(value)).toString("base64url");

export function fakeJwt(payload: Record<string, unknown>): string {
  return [
    b64url({ alg: "HS256", typ: "JWT" }),
    b64url(payload),
    "assinatura-falsa-de-teste",
  ].join(".");
}

export const fakeSupabaseSecretKey = () =>
  ["sb", "secret", "FICTICIO".repeat(4)].join("_");

export const fakePrivateKeyHeader = () =>
  ["-----BEGIN", "PRIVATE", "KEY-----"].join(" ");

export const fakeAwsKeyId = () => ["AK", "IA", "TESTEFICTICIO123"].join("");
