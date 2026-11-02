import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  parseExceptions,
  runGate,
  type CommandResult,
} from "../../scripts/lib/audit-gate";

// Todos os relatórios e exceções abaixo são FICTÍCIOS, no formato do
// `pnpm audit --json` e de security/audit-exceptions.json.
const DEV_PATH =
  ".>ferramenta-ficticia>dependencia-ficticia>pacote-dev-ficticio";

type Adv = Record<string, unknown>;

// Exceção fictícia de desenvolvimento, nos mesmos moldes de uma exceção real.
const FAKE_EXCEPTIONS = JSON.stringify({
  exceptions: [
    {
      ghsa: "GHSA-c2c2-f3f3-g4g4",
      module: "pacote-dev-ficticio",
      severity: "high",
      vulnerableVersions: "<=2.0.0",
      allowedVersions: ["2.0.0"],
      allowedPaths: [DEV_PATH],
      scope: "development",
      approvedOn: "2026-10-23",
      expiresAt: "2026-11-22T03:00:00Z",
    },
  ],
});

function devAdvisory(overrides: Adv = {}): Adv {
  return {
    id: 999100,
    github_advisory_id: "GHSA-c2c2-f3f3-g4g4",
    module_name: "pacote-dev-ficticio",
    severity: "high",
    title: "Advisory fictício coberto pela exceção de teste",
    vulnerable_versions: "<=2.0.0",
    patched_versions: "<0.0.0",
    findings: [{ version: "2.0.0", paths: [DEV_PATH] }],
    ...overrides,
  };
}

const fakeAdvisory: Adv = {
  id: 999001,
  github_advisory_id: "GHSA-2222-3333-4444",
  module_name: "pacote-ficticio",
  severity: "low",
  title: "Advisory fictício para teste",
  vulnerable_versions: "<1.0.1",
  patched_versions: ">=1.0.1",
  findings: [{ version: "1.0.0", paths: [".>vitest>pacote-ficticio"] }],
};

function report(advisories: Adv[], totalDependencies = 485): string {
  const counts = { info: 0, low: 0, moderate: 0, high: 0, critical: 0 };
  for (const advisory of advisories) {
    counts[advisory.severity as keyof typeof counts] += 1;
  }
  return JSON.stringify({
    actions: [],
    advisories: Object.fromEntries(
      advisories.map((advisory) => [String(advisory.id), advisory]),
    ),
    muted: [],
    metadata: {
      vulnerabilities: counts,
      dependencies: totalDependencies,
      devDependencies: 0,
      optionalDependencies: 0,
      totalDependencies,
    },
  });
}

const auditRun = (advisories: Adv[]): CommandResult => ({
  status: advisories.length > 0 ? 1 : 0,
  stdout: report(advisories),
});

const prodTree = (extra: Record<string, unknown> = {}): CommandResult => ({
  status: 0,
  stdout: JSON.stringify([
    {
      name: "vg-rural",
      dependencies: {
        next: {
          version: "16.4.2",
          dependencies: { "@next/env": {}, ...extra },
        },
        zod: { version: "4.6.7" },
      },
    },
  ]),
});

// Arquivo real versionado no repositório.
const COMMITTED_EXCEPTIONS = readFileSync(
  "security/audit-exceptions.json",
  "utf8",
);
const BEFORE_EXPIRY = new Date("2026-10-23T12:00:00Z");

function gate(
  overrides: Partial<Parameters<typeof runGate>[0]> = {},
): ReturnType<typeof runGate> {
  return runGate({
    fullRun: auditRun([devAdvisory()]),
    prodRun: auditRun([]),
    treeRun: prodTree(),
    exceptionsRaw: FAKE_EXCEPTIONS,
    now: BEFORE_EXPIRY,
    ...overrides,
  });
}

describe("exceção de auditoria: caso autorizado", () => {
  it("aceita apenas o advisory autorizado e o identifica como risco conhecido", () => {
    expect(gate()).toEqual({
      ok: true,
      errors: [],
      acceptedRisks: [
        "GHSA-c2c2-f3f3-g4g4 (high, pacote-dev-ficticio), exceção válida até 2026-11-22T03:00:00.000Z",
      ],
    });
  });

  it("vale até o fim do prazo no horário de Brasília e expira em seguida", () => {
    expect(gate({ now: new Date("2026-11-21T23:59:59-03:00") }).ok).toBe(true);
    expect(gate({ now: new Date("2026-11-22T00:00:00-03:00") }).ok).toBe(false);
  });
});

describe("exceção de auditoria: falhas obrigatórias", () => {
  it("reprova advisory adicional (inclusive transitivo e de baixa severidade)", () => {
    const result = gate({
      fullRun: auditRun([devAdvisory(), fakeAdvisory]),
    });
    expect(result.ok).toBe(false);
    expect(result.errors).toEqual([
      "GHSA-2222-3333-4444 (low) em pacote-ficticio: sem exceção autorizada",
    ]);
  });

  it("reprova exceção expirada", () => {
    const result = gate({ now: new Date("2026-12-01T00:00:00Z") });
    expect(result.ok).toBe(false);
    expect(result.errors).toEqual([
      "GHSA-c2c2-f3f3-g4g4: exceção expirada em 2026-11-22T03:00:00.000Z",
    ]);
  });

  it("reprova pacote da exceção presente na árvore de produção", () => {
    const result = gate({
      treeRun: prodTree({ "pacote-dev-ficticio": { version: "2.0.0" } }),
    });
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain("está nas dependências de produção");
  });

  it("reprova qualquer advisory na auditoria de produção, inclusive o autorizado", () => {
    const result = gate({ prodRun: auditRun([devAdvisory()]) });
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain(
      "exceções não se aplicam a dependências de produção",
    );
  });

  it.each([
    ["saída não JSON", { status: 1, stdout: "<html>erro</html>" }],
    ["saída vazia", { status: 1, stdout: "" }],
    [
      "sem metadata",
      {
        status: 1,
        stdout: JSON.stringify({ advisories: {}, muted: [], actions: [] }),
      },
    ],
    [
      "contagem inconsistente",
      {
        status: 1,
        stdout: report([devAdvisory()]).replace('"high":1', '"high":0'),
      },
    ],
    [
      "advisory sem GHSA",
      {
        status: 1,
        stdout: report([devAdvisory({ github_advisory_id: null })]),
      },
    ],
    [
      "advisory sem ocorrências",
      { status: 1, stdout: report([devAdvisory({ findings: [] })]) },
    ],
    [
      "sem dependências auditadas",
      { status: 1, stdout: report([devAdvisory()], 0) },
    ],
    [
      "advisories silenciados",
      {
        status: 1,
        stdout: report([devAdvisory()]).replace(
          '"muted":[]',
          '"muted":[{"id":1}]',
        ),
      },
    ],
    ["código 0 com advisory", { status: 0, stdout: report([devAdvisory()]) }],
  ])("reprova relatório inválido ou incompleto: %s", (_name, run) => {
    const result = gate({ fullRun: run as CommandResult });
    expect(result.ok).toBe(false);
    expect(result.acceptedRisks).toEqual([]);
  });

  it.each([
    [
      "registro indisponível (JSON de erro)",
      {
        status: 1,
        stdout: JSON.stringify({
          error: { code: "ECONNREFUSED", message: "x" },
        }),
      },
      "auditoria indisponível ou com erro (ECONNREFUSED)",
    ],
    [
      "falha ao executar o comando",
      { status: null, stdout: "", error: new Error("spawn pnpm ENOENT") },
      "falha ao executar a auditoria",
    ],
    [
      "código de saída inesperado",
      { status: 2, stdout: "" },
      "código inesperado 2",
    ],
  ])(
    "reprova auditoria indisponível ou com erro: %s",
    (_name, run, message) => {
      const result = gate({ fullRun: run as CommandResult });
      expect(result.ok).toBe(false);
      expect(result.errors[0]).toContain(message);
    },
  );

  it("reprova falha na auditoria de produção ou na listagem da árvore", () => {
    expect(gate({ prodRun: { status: 1, stdout: "{}" } }).ok).toBe(false);
    expect(gate({ treeRun: { status: 1, stdout: "[]" } }).ok).toBe(false);
    expect(gate({ treeRun: { status: 0, stdout: "[]" } }).ok).toBe(false);
  });

  it("exige remoção da exceção quando há correção oficial", () => {
    const result = gate({
      fullRun: auditRun([devAdvisory({ patched_versions: ">=2.0.1" })]),
    });
    expect(result.ok).toBe(false);
    expect(result.errors).toEqual([
      "GHSA-c2c2-f3f3-g4g4: correção oficial disponível (>=2.0.1); atualize a dependência e remova a exceção",
    ]);
  });

  it("exige remoção da exceção quando o advisory deixa de aparecer (ex.: advisory retirado)", () => {
    const result = gate({ fullRun: auditRun([]) });
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain("exceção sem uso");
  });

  it.each([
    [
      "novo caminho de dependência",
      {
        findings: [
          {
            version: "2.0.0",
            paths: [DEV_PATH, ".>outro>pacote-dev-ficticio"],
          },
        ],
      },
      "caminho não autorizado",
    ],
    [
      "outra versão",
      { findings: [{ version: "1.9.0", paths: [DEV_PATH] }] },
      "versão 1.9.0 não autorizada",
    ],
    ["severidade elevada", { severity: "critical" }, "severidade mudou"],
    [
      "faixa vulnerável alterada",
      { vulnerable_versions: "<=2.0.5" },
      "faixa vulnerável mudou",
    ],
  ])(
    "reprova mudança nas condições verificáveis: %s",
    (_name, overrides, message) => {
      const advisory = devAdvisory(overrides);
      const result = gate({ fullRun: auditRun([advisory]) });
      expect(result.ok).toBe(false);
      expect(result.errors.join("\n")).toContain(message);
    },
  );
});

describe("arquivo de exceções versionado", () => {
  it("não contém nenhuma exceção ativa", () => {
    expect(parseExceptions(COMMITTED_EXCEPTIONS)).toEqual([]);
  });

  it("sem exceções, aprova auditoria limpa sem riscos aceitos", () => {
    expect(
      gate({ fullRun: auditRun([]), exceptionsRaw: COMMITTED_EXCEPTIONS }),
    ).toEqual({ ok: true, errors: [], acceptedRisks: [] });
  });

  it("sem exceções, reprova qualquer advisory novo, de qualquer severidade", () => {
    for (const advisory of [devAdvisory(), fakeAdvisory]) {
      const result = gate({
        fullRun: auditRun([advisory]),
        exceptionsRaw: COMMITTED_EXCEPTIONS,
      });
      expect(result.ok).toBe(false);
      expect(result.errors[0]).toContain("sem exceção autorizada");
    }
  });

  it("rejeita exceção malformada ou de escopo de produção", () => {
    const base = JSON.parse(FAKE_EXCEPTIONS) as { exceptions: Adv[] };
    const bad = (patch: Adv) =>
      JSON.stringify({ exceptions: [{ ...base.exceptions[0], ...patch }] });
    expect(() => parseExceptions(bad({ scope: "production" }))).toThrow();
    expect(() => parseExceptions(bad({ expiresAt: "amanhã" }))).toThrow();
    expect(() => parseExceptions(bad({ ghsa: "CVE-2026-1" }))).toThrow();
    expect(() => parseExceptions("não é json")).toThrow();
  });
});
