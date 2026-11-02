/**
 * Verificação bloqueante da auditoria de dependências com exceções temporárias.
 * Uso: pnpm audit:gate
 *
 * Executa o `pnpm audit` completo (todas as severidades, sem filtro), o
 * `pnpm audit --prod` e a listagem da árvore de produção; salva as saídas
 * brutas em audit-reports/ (artefato da CI) e aplica scripts/lib/audit-gate.ts.
 * Sai com código 1 em qualquer falha.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { runGate, type CommandResult } from "./lib/audit-gate.ts";

const REPORT_DIR = join(process.cwd(), "audit-reports");
const EXCEPTIONS_FILE = join(
  process.cwd(),
  "security",
  "audit-exceptions.json",
);

function run(file: string, args: string[]): CommandResult {
  const result = spawnSync("pnpm", args, {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  writeFileSync(join(REPORT_DIR, file), result.stdout ?? "");
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    error: result.error,
  };
}

mkdirSync(REPORT_DIR, { recursive: true });

const result = runGate({
  fullRun: run("audit-full.json", ["audit", "--json"]),
  prodRun: run("audit-prod.json", ["audit", "--prod", "--json"]),
  treeRun: run("prod-tree.json", [
    "list",
    "--prod",
    "--depth",
    "Infinity",
    "--json",
  ]),
  exceptionsRaw: readFileSync(EXCEPTIONS_FILE, "utf8"),
  now: new Date(),
});

writeFileSync(
  join(REPORT_DIR, "audit-gate-result.json"),
  `${JSON.stringify(result, null, 2)}\n`,
);

const annotate = process.env.GITHUB_ACTIONS === "true";
for (const risk of result.acceptedRisks) {
  console.log(`Risco conhecido aceito: ${risk}`);
  if (annotate) console.log(`::warning title=Risco conhecido::${risk}`);
}
if (!result.ok) {
  console.error("Auditoria de dependências reprovada:");
  for (const error of result.errors) {
    console.error(`  - ${error}`);
    if (annotate) console.log(`::error title=Auditoria::${error}`);
  }
  process.exit(1);
}
console.log(
  "Auditoria aprovada: nenhum advisory fora das exceções autorizadas.",
);
