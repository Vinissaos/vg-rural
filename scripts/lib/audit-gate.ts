/**
 * Avaliação do resultado completo do `pnpm audit` contra exceções temporárias.
 *
 * Política (falha fechada: qualquer dúvida reprova):
 * - Relatório ilegível, incompleto, com erro ou com advisories silenciados reprova.
 * - Qualquer advisory em dependências de produção reprova (sem exceções).
 * - Pacote coberto por exceção presente na árvore de produção reprova.
 * - Advisory só é aceito se casar com uma exceção em TODOS os campos: GHSA,
 *   módulo, severidade, versões vulneráveis, versões encontradas e caminhos.
 * - Exceção expirada, com correção oficial publicada ou sem uso reprova.
 *
 * Mensagens contêm apenas metadados públicos de advisories, nunca segredos.
 */

export type Severity = "info" | "low" | "moderate" | "high" | "critical";

const SEVERITIES: ReadonlyArray<Severity> = [
  "info",
  "low",
  "moderate",
  "high",
  "critical",
];

// Valor usado pelo banco de advisories quando não existe versão corrigida.
export const NO_PATCH_AVAILABLE = "<0.0.0";

const GHSA_PATTERN = /^GHSA(?:-[23456789cfghjmpqrvwx]{4}){3}$/;

export type Advisory = {
  ghsa: string;
  module: string;
  severity: Severity;
  vulnerableVersions: string;
  patchedVersions: string;
  title: string;
  findings: Array<{ version: string; paths: string[] }>;
};

export type AuditReport = {
  advisories: Advisory[];
  totalDependencies: number;
};

export type AuditException = {
  ghsa: string;
  module: string;
  severity: Severity;
  vulnerableVersions: string;
  allowedVersions: string[];
  allowedPaths: string[];
  scope: "development";
  expiresAt: Date;
};

export type CommandResult = {
  status: number | null;
  stdout: string;
  error?: Error | undefined;
};

export type GateResult = {
  ok: boolean;
  errors: string[];
  acceptedRisks: string[];
};

class GateError extends Error {}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

function fail(message: string): never {
  throw new GateError(message);
}

/**
 * Interpreta a execução do `pnpm audit --json`. O pnpm usa o código 1 tanto para
 * "vulnerabilidades encontradas" quanto para erros (ex.: registro indisponível),
 * por isso o código de saída é sempre conferido contra o conteúdo do relatório.
 */
export function parseAuditRun(label: string, run: CommandResult): AuditReport {
  if (run.error !== undefined) {
    fail(`${label}: falha ao executar a auditoria (${run.error.message})`);
  }
  if (run.status !== 0 && run.status !== 1) {
    fail(`${label}: auditoria terminou com código inesperado ${run.status}`);
  }

  let data: unknown;
  try {
    data = JSON.parse(run.stdout);
  } catch {
    fail(`${label}: saída da auditoria não é JSON válido`);
  }
  if (!isObject(data)) fail(`${label}: relatório da auditoria inválido`);
  if ("error" in data) {
    const code = isObject(data.error)
      ? String(data.error.code)
      : "desconhecido";
    fail(`${label}: auditoria indisponível ou com erro (${code})`);
  }

  const { advisories, metadata, muted, actions } = data;
  if (!isObject(advisories) || !isObject(metadata) || !Array.isArray(actions)) {
    fail(`${label}: relatório da auditoria incompleto`);
  }
  if (!Array.isArray(muted) || muted.length > 0) {
    fail(`${label}: há advisories silenciados fora desta verificação`);
  }

  const counts = metadata.vulnerabilities;
  if (!isObject(counts))
    fail(`${label}: relatório sem contagem de severidades`);
  let total = 0;
  for (const severity of SEVERITIES) {
    const count = counts[severity];
    if (typeof count !== "number" || !Number.isInteger(count) || count < 0) {
      fail(`${label}: contagem de severidade "${severity}" inválida`);
    }
    total += count;
  }
  const totalDependencies = metadata.totalDependencies;
  if (typeof totalDependencies !== "number" || totalDependencies <= 0) {
    fail(`${label}: relatório sem dependências auditadas`);
  }

  const parsed = Object.values(advisories).map((raw) =>
    parseAdvisory(label, raw),
  );
  // O pnpm conta uma vulnerabilidade por versão afetada encontrada (cada item
  // de `findings`), não uma por advisory: um advisory com duas versões
  // vulneráveis instaladas soma 2 na contagem.
  const occurrences = parsed.reduce(
    (sum, advisory) => sum + advisory.findings.length,
    0,
  );
  if (occurrences !== total) {
    fail(
      `${label}: relatório inconsistente (${occurrences} ocorrências em ${parsed.length} advisories, ${total} na contagem)`,
    );
  }
  if ((run.status === 0) !== (parsed.length === 0)) {
    fail(`${label}: código de saída incompatível com o relatório`);
  }

  return { advisories: parsed, totalDependencies };
}

function parseAdvisory(label: string, raw: unknown): Advisory {
  if (!isObject(raw)) fail(`${label}: advisory inválido`);
  const ghsa = raw.github_advisory_id;
  if (typeof ghsa !== "string" || !GHSA_PATTERN.test(ghsa)) {
    fail(`${label}: advisory sem identificador GHSA válido`);
  }
  const {
    module_name: module,
    severity,
    vulnerable_versions: vulnerableVersions,
    patched_versions: patchedVersions,
    title,
    findings,
  } = raw;
  if (
    typeof module !== "string" ||
    typeof vulnerableVersions !== "string" ||
    typeof patchedVersions !== "string" ||
    typeof title !== "string" ||
    !SEVERITIES.includes(severity as Severity)
  ) {
    fail(`${label}: advisory ${ghsa} com campos ausentes ou inválidos`);
  }
  if (!Array.isArray(findings) || findings.length === 0) {
    fail(`${label}: advisory ${ghsa} sem ocorrências`);
  }
  const parsedFindings = findings.map((finding) => {
    if (
      !isObject(finding) ||
      typeof finding.version !== "string" ||
      !isStringArray(finding.paths) ||
      finding.paths.length === 0
    ) {
      fail(`${label}: advisory ${ghsa} com ocorrência inválida`);
    }
    return { version: finding.version, paths: finding.paths };
  });

  return {
    ghsa,
    module,
    severity: severity as Severity,
    vulnerableVersions,
    patchedVersions,
    title,
    findings: parsedFindings,
  };
}

/**
 * Lista os nomes de todos os pacotes da árvore de produção
 * (saída de `pnpm list --prod --depth Infinity --json`).
 */
export function parseProductionTree(run: CommandResult): Set<string> {
  if (run.error !== undefined || run.status !== 0) {
    fail("árvore de produção: falha ao listar dependências");
  }
  let data: unknown;
  try {
    data = JSON.parse(run.stdout);
  } catch {
    fail("árvore de produção: saída não é JSON válido");
  }
  if (!Array.isArray(data) || data.length === 0 || !isObject(data[0])) {
    fail("árvore de produção: formato inválido");
  }

  const names = new Set<string>();
  const visit = (deps: unknown) => {
    if (deps === undefined) return;
    if (!isObject(deps)) fail("árvore de produção: formato inválido");
    for (const [name, info] of Object.entries(deps)) {
      names.add(name);
      if (isObject(info)) visit(info.dependencies);
    }
  };
  for (const project of data) {
    if (!isObject(project)) fail("árvore de produção: formato inválido");
    visit(project.dependencies);
  }
  if (names.size === 0) fail("árvore de produção vazia ou incompleta");
  return names;
}

/** Lê e valida o arquivo de exceções (security/audit-exceptions.json). */
export function parseExceptions(raw: string): AuditException[] {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    fail("arquivo de exceções não é JSON válido");
  }
  if (!isObject(data) || !Array.isArray(data.exceptions)) {
    fail("arquivo de exceções inválido");
  }
  return data.exceptions.map((item, index) => {
    const where = `exceção #${index + 1}`;
    if (!isObject(item)) fail(`${where}: formato inválido`);
    const expiresAt = new Date(String(item.expiresAt));
    if (
      typeof item.ghsa !== "string" ||
      !GHSA_PATTERN.test(item.ghsa) ||
      typeof item.module !== "string" ||
      !SEVERITIES.includes(item.severity as Severity) ||
      typeof item.vulnerableVersions !== "string" ||
      !isStringArray(item.allowedVersions) ||
      item.allowedVersions.length === 0 ||
      !isStringArray(item.allowedPaths) ||
      item.allowedPaths.length === 0 ||
      item.scope !== "development" ||
      typeof item.expiresAt !== "string" ||
      Number.isNaN(expiresAt.getTime())
    ) {
      fail(`${where}: campos ausentes ou inválidos`);
    }
    return {
      ghsa: item.ghsa,
      module: item.module,
      severity: item.severity as Severity,
      vulnerableVersions: item.vulnerableVersions,
      allowedVersions: item.allowedVersions,
      allowedPaths: item.allowedPaths,
      scope: "development",
      expiresAt,
    };
  });
}

function matchException(
  advisory: Advisory,
  exception: AuditException,
  now: Date,
): string[] {
  const problems: string[] = [];
  const id = advisory.ghsa;
  if (advisory.module !== exception.module) {
    problems.push(`${id}: módulo "${advisory.module}" difere da exceção`);
  }
  if (advisory.severity !== exception.severity) {
    problems.push(
      `${id}: severidade mudou para "${advisory.severity}"; reavalie a exceção`,
    );
  }
  if (advisory.vulnerableVersions !== exception.vulnerableVersions) {
    problems.push(`${id}: faixa vulnerável mudou; reavalie a exceção`);
  }
  if (advisory.patchedVersions !== NO_PATCH_AVAILABLE) {
    problems.push(
      `${id}: correção oficial disponível (${advisory.patchedVersions}); ` +
        "atualize a dependência e remova a exceção",
    );
  }
  if (now.getTime() >= exception.expiresAt.getTime()) {
    problems.push(
      `${id}: exceção expirada em ${exception.expiresAt.toISOString()}`,
    );
  }
  for (const finding of advisory.findings) {
    if (!exception.allowedVersions.includes(finding.version)) {
      problems.push(`${id}: versão ${finding.version} não autorizada`);
    }
    for (const path of finding.paths) {
      if (!exception.allowedPaths.includes(path)) {
        problems.push(`${id}: caminho não autorizado (${path})`);
      }
    }
  }
  return problems;
}

export function evaluateAudit({
  fullAudit,
  prodAudit,
  prodTree,
  exceptions,
  now,
}: {
  fullAudit: AuditReport;
  prodAudit: AuditReport;
  prodTree: Set<string>;
  exceptions: AuditException[];
  now: Date;
}): GateResult {
  const errors: string[] = [];
  const acceptedRisks: string[] = [];

  for (const advisory of prodAudit.advisories) {
    errors.push(
      `produção: ${advisory.ghsa} (${advisory.severity}) em ${advisory.module}; ` +
        "exceções não se aplicam a dependências de produção",
    );
  }
  for (const exception of exceptions) {
    if (prodTree.has(exception.module)) {
      errors.push(
        `${exception.ghsa}: ${exception.module} está nas dependências de produção; ` +
          "a exceção só vale para desenvolvimento",
      );
    }
  }

  const used = new Set<AuditException>();
  for (const advisory of fullAudit.advisories) {
    const exception = exceptions.find((item) => item.ghsa === advisory.ghsa);
    if (exception === undefined) {
      errors.push(
        `${advisory.ghsa} (${advisory.severity}) em ${advisory.module}: sem exceção autorizada`,
      );
      continue;
    }
    used.add(exception);
    const problems = matchException(advisory, exception, now);
    if (problems.length > 0) errors.push(...problems);
    else {
      acceptedRisks.push(
        `${advisory.ghsa} (${advisory.severity}, ${advisory.module}), ` +
          `exceção válida até ${exception.expiresAt.toISOString()}`,
      );
    }
  }

  for (const exception of exceptions) {
    if (!used.has(exception)) {
      errors.push(
        `${exception.ghsa}: exceção sem uso (advisory não aparece mais); remova-a`,
      );
    }
  }

  return { ok: errors.length === 0, errors, acceptedRisks };
}

/**
 * Executa toda a avaliação a partir das saídas brutas dos comandos.
 * Erros de formato viram falhas da verificação, nunca aprovação.
 */
export function runGate(input: {
  fullRun: CommandResult;
  prodRun: CommandResult;
  treeRun: CommandResult;
  exceptionsRaw: string;
  now: Date;
}): GateResult {
  try {
    return evaluateAudit({
      fullAudit: parseAuditRun("auditoria completa", input.fullRun),
      prodAudit: parseAuditRun("auditoria de produção", input.prodRun),
      prodTree: parseProductionTree(input.treeRun),
      exceptions: parseExceptions(input.exceptionsRaw),
      now: input.now,
    });
  } catch (error) {
    if (error instanceof GateError) {
      return { ok: false, errors: [error.message], acceptedRisks: [] };
    }
    throw error;
  }
}
