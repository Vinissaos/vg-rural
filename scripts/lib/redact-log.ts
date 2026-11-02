/**
 * Mascaramento de segredos em logs do Supabase local (CI e máquina local).
 *
 * A saída do `supabase start` e os logs de containers podem conter chaves locais
 * (publishable/secret), JWTs, URLs com senha e variáveis de ambiente sensíveis.
 * Este módulo nunca devolve esses valores: troca cada ocorrência por um marcador.
 * Mantém apenas sintaxe TypeScript "apagável" para rodar direto no Node.
 */

export const REDACTED = "[OCULTO]";

const PATTERNS: ReadonlyArray<{ name: string; pattern: RegExp }> = [
  // Chaves do Supabase (inclusive as publicáveis: não há motivo para exibi-las em log).
  {
    name: "supabase-key",
    pattern: /\bsb_(?:secret|publishable)_[A-Za-z0-9_-]+/g,
  },
  // Qualquer JWT, independentemente do papel.
  {
    name: "jwt",
    pattern: /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/g,
  },
  // Blocos de chave privada inteiros.
  {
    name: "private-key",
    pattern:
      /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----[\s\S]*?(?:-----END (?:[A-Z]+ )?PRIVATE KEY-----|$)/g,
  },
  { name: "aws-access-key-id", pattern: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g },
  { name: "github-token", pattern: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g },
];

// URLs pré-assinadas (ex.: download de camadas de imagens Docker em CDNs e
// registros): a query string carrega assinatura e credencial temporária.
const SIGNED_URL_QUERY =
  /\b(https?:\/\/[^\s?"'<>]+)\?[^\s"'<>]*(?:sig|signature|x-amz-|token|encoded|key-pair-id|hmac|credential)[^\s"'<>]*/gi;

// Credenciais embutidas em URLs: esquema://usuario:senha@host
const URL_CREDENTIALS = /\b([a-z][a-z0-9+.-]*:\/\/)[^\s/@:]+:[^\s/@]*@/gi;

// Atribuições com nome sensível: NOME_SECRET=valor, "password": "valor", TOKEN: valor
const SENSITIVE_ASSIGNMENT =
  /(["']?\b[A-Za-z0-9_.-]*(?:secret|password|passwd|token|api[_-]?key|private[_-]?key|service[_-]?role|_key)\b["']?\s*[=:]\s*)(["']?)[^\s"',}]+\2/gi;

/**
 * Devolve o texto com segredos conhecidos substituídos por um marcador.
 * `extraSecrets` permite mascarar valores exatos já conhecidos (ex.: chaves locais).
 */
export function redactLog(
  text: string,
  extraSecrets: readonly string[] = [],
): string {
  let result = text;

  for (const secret of extraSecrets) {
    if (secret.length >= 6) result = result.split(secret).join(REDACTED);
  }
  for (const { pattern } of PATTERNS) {
    result = result.replace(pattern, REDACTED);
  }
  result = result.replace(SIGNED_URL_QUERY, `$1?${REDACTED}`);
  result = result.replace(URL_CREDENTIALS, `$1${REDACTED}@`);
  result = result.replace(
    SENSITIVE_ASSIGNMENT,
    (_match, prefix: string, quote: string) =>
      `${prefix}${quote}${REDACTED}${quote}`,
  );
  return result;
}

/**
 * Últimas `count` linhas do texto, já mascaradas. O texto inteiro é mascarado
 * ANTES do corte: cortar primeiro poderia separar um bloco de várias linhas
 * (ex.: chave privada) do seu cabeçalho e deixar o conteúdo sem máscara.
 */
export function redactedTail(
  text: string,
  count: number,
  extraSecrets: readonly string[] = [],
): string {
  const lines = redactLog(text, extraSecrets)
    .replace(/(?:\r?\n)+$/, "")
    .split(/\r?\n/);
  return lines.slice(Math.max(0, lines.length - count)).join("\n");
}
