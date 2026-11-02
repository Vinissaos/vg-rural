import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Verificações estáticas dos arquivos SQL da Etapa 0.2b. Não substituem a
 * execução real (pgTAP com o Supabase local), mas impedem regressões óbvias
 * antes de o banco subir.
 */
const MIGRATIONS_DIR = "supabase/migrations";
const TESTS_DIR = "supabase/tests/database";

// Schemas administrados pelo Supabase que as migrações da aplicação não alteram.
const MANAGED_SCHEMAS = [
  "auth",
  "storage",
  "realtime",
  "graphql",
  "graphql_public",
  "extensions",
  "vault",
  "pgsodium",
  "net",
  "cron",
  "supabase_functions",
  "supabase_migrations",
];

function sqlFiles(dir: string): Array<{ name: string; sql: string }> {
  return readdirSync(dir)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => ({ name, sql: readFileSync(join(dir, name), "utf8") }));
}

// Remove comentários de linha para analisar só os comandos.
const withoutComments = (sql: string) =>
  sql
    .split(/\r?\n/)
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n");

describe("migrações", () => {
  const migrations = sqlFiles(MIGRATIONS_DIR);

  it("existem e seguem o padrão <timestamp>_<nome>.sql", () => {
    expect(migrations.length).toBeGreaterThan(0);
    for (const { name } of migrations) {
      expect(name).toMatch(/^\d{14}_[a-z0-9_]+\.sql$/);
    }
  });

  describe.each(migrations)("$name", ({ sql }) => {
    const code = withoutComments(sql).toLowerCase();

    it("não cria tabelas, views nem funções (sem tabelas de negócio na 0.2b)", () => {
      expect(code).not.toMatch(
        /\bcreate\s+(?:or\s+replace\s+)?(?:table|view|materialized|function|procedure)\b/,
      );
    });

    it("não concede privilégios nem cria SECURITY DEFINER", () => {
      expect(code).not.toMatch(/\bgrant\b/);
      expect(code).not.toMatch(/security\s+definer/);
    });

    it("não altera schemas administrados pelo Supabase", () => {
      for (const schema of MANAGED_SCHEMAS) {
        expect(code).not.toMatch(new RegExp(`\\bschema\\s+${schema}\\b`));
        expect(code).not.toMatch(new RegExp(`\\b${schema}\\.`));
      }
    });

    it("altera privilégios padrão apenas do papel postgres", () => {
      const statements =
        code.match(/alter\s+default\s+privileges[^;]*;/g) ?? [];
      expect(statements.length).toBeGreaterThan(0);
      for (const statement of statements) {
        expect(statement).toMatch(/for\s+role\s+postgres\b/);
        expect(statement).toMatch(/\brevoke\b/);
      }
    });

    it("revoga EXECUTE de PUBLIC na forma global (sem IN SCHEMA)", () => {
      expect(code).toMatch(
        /alter\s+default\s+privileges\s+for\s+role\s+postgres\s+revoke\s+execute\s+on\s+functions\s+from\s+public\s*;/,
      );
    });
  });
});

describe("testes pgTAP", () => {
  const tests = sqlFiles(TESTS_DIR);

  it("existem, incluindo o teste final de resíduos", () => {
    expect(tests.map((test) => test.name)).toContain(
      "999_sem_residuos_test.sql",
    );
    expect(tests.at(-1)?.name).toBe("999_sem_residuos_test.sql");
  });

  describe.each(tests)("$name", ({ sql }) => {
    const code = withoutComments(sql).trim().toLowerCase();

    it("roda inteiro numa transação desfeita (begin ... rollback)", () => {
      expect(code.startsWith("begin;")).toBe(true);
      expect(code.endsWith("rollback;")).toBe(true);
    });

    it("não confirma nada no banco", () => {
      expect(code).not.toMatch(/\bcommit\b/);
      expect(code).not.toMatch(/\bend\s*(?:transaction|work)?\s*;/);
      expect(code).not.toMatch(/\brelease\s+savepoint\b/);
    });

    it("declara o plano e finaliza", () => {
      expect(code).toMatch(/select\s+plan\(\d+\)/);
      expect(code).toMatch(/select\s+\*\s+from\s+finish\(\)/);
    });

    it("cria objetos de teste só com o prefixo vg_meta_ (ou temporários)", () => {
      const created = [
        ...code.matchAll(
          /\bcreate\s+(?:or\s+replace\s+)?(?:table|view|materialized\s+view|function|procedure|sequence|schema)\s+([a-z0-9_."]+)/g,
        ),
      ].map((match) => match[1] ?? "");
      for (const name of created) {
        expect(name).toMatch(/(?:^|\.)vg_meta_|^pg_temp\./);
      }
    });

    it("o número de asserções bate com o plano", () => {
      const planned = Number(/select\s+plan\((\d+)\)/.exec(code)?.[1]);
      const assertions = code.match(
        /\bselect\s+(?:ok|is|isnt|is_empty|results_eq|throws_ok|lives_ok)\(/g,
      );
      expect(assertions?.length).toBe(planned);
    });
  });
});
