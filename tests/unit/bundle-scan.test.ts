import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { scanFiles } from "../../scripts/check-bundle-secrets";

import { fakeJwt, fakeSupabaseSecretKey } from "../helpers/fake-secrets";

describe("varredura de segredos no bundle", () => {
  let dir: string;
  const file = (name: string, content: string) => {
    const path = join(dir, name);
    writeFileSync(path, content);
    return path;
  };

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "vg-bundle-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("aprova bundle limpo", () => {
    expect(scanFiles([file("a.js", "console.log('ok')")], {})).toEqual([]);
  });

  it("reprova chave administrativa embutida", () => {
    const problems = scanFiles(
      [
        file("a.js", `const k="${fakeJwt({ role: "service_role" })}"`),
        file("b.js", `x="${fakeSupabaseSecretKey()}"`),
      ],
      {},
    );
    expect(problems).toHaveLength(2);
  });

  it("reprova valor de variável de servidor sensível presente no bundle", () => {
    const value = "valor-ficticio-de-servidor-123";
    const problems = scanFiles([file("a.js", `fetch("/x?t=${value}")`)], {
      JOB_API_TOKEN: value,
    });
    expect(problems).toEqual([
      expect.stringContaining("variável de servidor JOB_API_TOKEN"),
    ]);
    expect(problems.join()).not.toContain(value);
  });
});
