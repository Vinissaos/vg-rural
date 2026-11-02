/**
 * Varre a saída do build enviada ao navegador em busca de segredos.
 * Uso: pnpm build && pnpm check:bundle
 *
 * Falha (exit 1) se encontrar um padrão de segredo conhecido ou o valor de
 * alguma variável de servidor com nome sensível presente no ambiente.
 * Nunca imprime o valor encontrado, apenas arquivo, regra e posição.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { scanForSecrets } from "../src/lib/security/secret-detection.ts";

const ROOT = process.cwd();
const NEXT_DIR = join(ROOT, ".next");
const SCANNED_EXTENSIONS = /\.(?:js|mjs|cjs|css|html|rsc|json|map|txt|body)$/;

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) yield* walk(path);
    else if (SCANNED_EXTENSIONS.test(path)) yield path;
  }
}

export function scanFiles(
  files: Iterable<string>,
  env: Readonly<Record<string, string | undefined>>,
): string[] {
  return [...files].flatMap((file) =>
    scanForSecrets(relative(ROOT, file), readFileSync(file, "utf8"), env),
  );
}

function main(): void {
  const staticDir = join(NEXT_DIR, "static");
  if (!existsSync(staticDir)) {
    console.error(
      "Build não encontrado em .next/static. Rode `pnpm build` antes.",
    );
    process.exit(1);
  }

  // Bundle do navegador + HTML/RSC pré-renderados que também chegam ao cliente.
  const files = [...walk(staticDir)];
  const serverAppDir = join(NEXT_DIR, "server", "app");
  if (existsSync(serverAppDir)) {
    files.push(
      ...[...walk(serverAppDir)].filter((f) => /\.(?:html|rsc|body)$/.test(f)),
    );
  }

  const problems = scanFiles(files, process.env);
  if (problems.length > 0) {
    console.error("Possíveis segredos encontrados no bundle:");
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exit(1);
  }
  console.log(
    `Nenhum segredo encontrado (${files.length} arquivos verificados).`,
  );
}

if (import.meta.main) main();
