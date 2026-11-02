/**
 * Mostra as últimas linhas de um log com segredos mascarados.
 * Uso: node scripts/redact-log.ts <arquivo> [linhas]
 *
 * Nunca imprime o arquivo bruto. Usado quando o Supabase local falha, para
 * diagnosticar sem expor chaves locais em logs da CI.
 */
import { existsSync, readFileSync } from "node:fs";

import { redactedTail } from "./lib/redact-log.ts";

const DEFAULT_LINES = 40;

function main(): void {
  const [file, linesArg] = process.argv.slice(2);
  if (file === undefined) {
    console.error("Uso: node scripts/redact-log.ts <arquivo> [linhas]");
    process.exit(2);
  }
  if (!existsSync(file)) {
    console.error(`Arquivo de log não encontrado: ${file}`);
    process.exit(2);
  }
  const lines = Number.parseInt(linesArg ?? "", 10);
  const count = Number.isInteger(lines) && lines > 0 ? lines : DEFAULT_LINES;
  console.log(redactedTail(readFileSync(file, "utf8"), count));
}

main();
