import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  LOG_DIR_PREFIX,
  LOG_FILE_NAME,
  createSecureLog,
} from "../../scripts/lib/secure-log";

const mode = (path: string) => statSync(path).mode & 0o777;

let base: string;

beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), "vg-rural-teste-log-"));
});

afterEach(() => {
  rmSync(base, { recursive: true, force: true });
});

describe("createSecureLog", () => {
  it("cria um diretório exclusivo 700 dentro da base indicada", () => {
    const log = createSecureLog(base);
    expect(dirname(log.dir)).toBe(base);
    expect(basename(log.dir).startsWith(LOG_DIR_PREFIX)).toBe(true);
    expect(mode(log.dir)).toBe(0o700);
    expect(log.file).toBe(join(log.dir, LOG_FILE_NAME));
    log.dispose();
  });

  it("cada execução usa um diretório diferente", () => {
    const a = createSecureLog(base);
    const b = createSecureLog(base);
    expect(a.dir).not.toBe(b.dir);
    a.dispose();
    b.dispose();
  });

  it("grava o log com permissão 600 e substitui o conteúdo anterior", () => {
    const log = createSecureLog(base);
    log.write("primeira saída fictícia");
    log.write("segunda saída fictícia");
    expect(mode(log.file)).toBe(0o600);
    expect(readFileSync(log.file, "utf8")).toBe("segunda saída fictícia");
    log.dispose();
  });

  it("não segue um link simbólico preparado no caminho antigo e fixo", () => {
    // O caminho fixo da versão anterior era <tmp>/vg-rural-supabase.log.
    const victim = join(base, "arquivo-da-vitima.txt");
    writeFileSync(victim, "conteúdo original");
    symlinkSync(victim, join(base, "vg-rural-supabase.log"));

    const log = createSecureLog(base);
    log.write("saída fictícia do CLI");
    expect(readFileSync(victim, "utf8")).toBe("conteúdo original");
    log.dispose();
  });

  it("remove arquivo e diretório ao final e tolera remoção repetida", () => {
    const log = createSecureLog(base);
    log.write("saída fictícia");
    log.dispose();
    expect(existsSync(log.file)).toBe(false);
    expect(existsSync(log.dir)).toBe(false);
    expect(() => log.dispose()).not.toThrow();
  });
});
