/**
 * Arquivo de log temporário para a saída do Supabase CLI, que contém chaves locais.
 *
 * Cada execução cria um diretório exclusivo (mkdtemp, permissão 700) com o
 * arquivo de log (permissão 600) e remove tudo ao final. Um diretório novo e
 * imprevisível evita que outro usuário da máquina prepare antes um link
 * simbólico no caminho do log.
 */
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const LOG_DIR_PREFIX = "vg-rural-supabase-";
export const LOG_FILE_NAME = "cli.log";

export type SecureLog = {
  readonly dir: string;
  readonly file: string;
  /** Substitui o conteúdo do log (nunca o imprime). */
  write(text: string): void;
  /** Remove o arquivo e o diretório. Pode ser chamado mais de uma vez. */
  dispose(): void;
};

export function createSecureLog(baseDir: string = tmpdir()): SecureLog {
  const dir = mkdtempSync(join(baseDir, LOG_DIR_PREFIX));
  chmodSync(dir, 0o700);
  const file = join(dir, LOG_FILE_NAME);
  return {
    dir,
    file,
    write(text: string): void {
      writeFileSync(file, text, { mode: 0o600 });
      chmodSync(file, 0o600);
    },
    dispose(): void {
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
