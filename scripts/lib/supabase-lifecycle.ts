/**
 * Ciclo de vida do Supabase LOCAL com limpeza segura em caso de falha.
 *
 * As dependências (execução de comandos, log, sondagem de portas) são injetadas
 * para que tests/unit/supabase-lifecycle.test.ts cubra os caminhos de falha sem
 * Docker. Regras:
 *   - a limpeza só executa `supabase stop --no-backup`, que atua apenas nos
 *     containers do project_id deste repositório; nunca remove containers ou
 *     redes por nome ou filtro, nunca toca outros projetos e nunca é remota;
 *   - uma falha na limpeza é registrada, mas não substitui a falha original;
 *   - mensagens de erro nunca levam a saída crua do CLI, só trechos mascarados.
 */
import {
  CONTAINER_NAME,
  HOST_BINDING_IP,
  HOST_BINDING_OPTION,
  NETWORK_NAME,
  analyzeContainers,
  checkNetwork,
  exposedListeningSockets,
  externalAddresses,
} from "./local-network.ts";
import { redactLog, redactedTail } from "./redact-log.ts";

export type CommandResult = {
  status: number | null;
  stdout: string;
  stderr: string;
};

export type Runner = (
  command: string,
  args: readonly string[],
) => CommandResult;

type Interfaces = Record<
  string,
  | Array<{ address: string; internal: boolean; family: string | number }>
  | undefined
>;

export type LifecycleDeps = {
  run: Runner;
  writeLog: (text: string) => void;
  warn: (message: string) => void;
  probe: (host: string, port: number) => Promise<boolean>;
  interfaces: () => Interfaces;
};

/** Falha conhecida, com mensagem já segura para log. */
export class LocalSupabaseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LocalSupabaseError";
  }
}

/** Argumentos exatos da limpeza: só para o Supabase deste projeto. */
export const CLEANUP_ARGS = [
  "exec",
  "supabase",
  "stop",
  "--no-backup",
] as const;

/** Descreve qualquer erro sem expor dados sensíveis. */
export function describeError(error: unknown): string {
  if (error instanceof LocalSupabaseError) return error.message;
  const text = error instanceof Error ? error.message : String(error);
  return `erro inesperado: ${redactLog(text)}`;
}

function parseJson(text: string, what: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new LocalSupabaseError(`saída inválida de ${what}`);
  }
}

/** Roda o CLI guardando a saída só no log; em falha, lança com trecho mascarado. */
export function runSupabaseQuiet(
  deps: LifecycleDeps,
  args: readonly string[],
): void {
  const result = deps.run("pnpm", ["exec", "supabase", ...args]);
  const output = `${result.stdout}\n${result.stderr}`;
  deps.writeLog(output);
  if (result.status !== 0) {
    throw new LocalSupabaseError(
      `falha em "supabase ${args[0]}". Últimas linhas (mascaradas):\n${redactedTail(output, 40)}`,
    );
  }
}

/** Garante a rede presa a 127.0.0.1. Nada é iniciado antes desta verificação. */
export function ensureNetwork(deps: LifecycleDeps): void {
  let inspect = deps.run("docker", ["network", "inspect", NETWORK_NAME]);
  if (inspect.status !== 0) {
    const created = deps.run("docker", [
      "network",
      "create",
      "--driver",
      "bridge",
      "-o",
      `${HOST_BINDING_OPTION}=${HOST_BINDING_IP}`,
      NETWORK_NAME,
    ]);
    if (created.status !== 0) {
      throw new LocalSupabaseError(
        `não foi possível criar a rede ${NETWORK_NAME}`,
      );
    }
    inspect = deps.run("docker", ["network", "inspect", NETWORK_NAME]);
  }
  const check = checkNetwork(
    parseJson(inspect.stdout, "docker network inspect"),
  );
  if (!check.ok) throw new LocalSupabaseError(check.error);
}

/**
 * Verifica que nenhuma porta do Supabase local está acessível fora do
 * localhost. Devolve as violações; lança se não conseguir inspecionar.
 */
export async function verifyNetwork(deps: LifecycleDeps): Promise<string[]> {
  const ps = deps.run("docker", ["ps", "--format", "{{.Names}}"]);
  if (ps.status !== 0) {
    throw new LocalSupabaseError(
      "não foi possível listar os containers do Docker",
    );
  }
  const names = ps.stdout
    .split(/\r?\n/)
    .map((name) => name.trim())
    .filter((name) => CONTAINER_NAME.test(name));
  if (names.length === 0) {
    return ["nenhum container do Supabase local em execução"];
  }

  const inspect = deps.run("docker", ["inspect", ...names]);
  if (inspect.status !== 0) {
    throw new LocalSupabaseError("não foi possível inspecionar os containers");
  }
  const { published, violations } = analyzeContainers(
    parseJson(inspect.stdout, "docker inspect"),
  );

  // Confirmação pelos sockets em escuta (quando o comando existir).
  const ss = deps.run("ss", ["-H", "-ltn"]);
  if (ss.status === 0) {
    for (const socket of exposedListeningSockets(ss.stdout)) {
      violations.push(`socket em escuta fora do loopback: ${socket}`);
    }
  } else {
    deps.warn(
      "Aviso: `ss` indisponível; verificação de sockets não executada.",
    );
  }

  // Tentativa ativa: nenhuma porta pode aceitar conexão por endereço externo.
  const addresses = externalAddresses(deps.interfaces());
  if (addresses.length === 0) {
    deps.warn(
      "Aviso: nenhum endereço externo para a tentativa ativa de conexão.",
    );
  }
  const ports = [...new Set(published.map((entry) => Number(entry.hostPort)))];
  for (const address of addresses) {
    for (const port of ports) {
      if (await deps.probe(address, port)) {
        violations.push(
          `porta ${port} aceita conexão pelo endereço externo ${address}`,
        );
      }
    }
  }
  return violations;
}

/**
 * Tenta parar o Supabase deste projeto depois de uma falha. Nunca lança: se a
 * limpeza falhar, registra o problema e deixa a falha original seguir.
 */
export function cleanupAfterFailure(deps: LifecycleDeps): boolean {
  try {
    const result = deps.run("pnpm", CLEANUP_ARGS);
    deps.writeLog(`${result.stdout}\n${result.stderr}`);
    if (result.status !== 0) {
      deps.warn(
        "A limpeza também falhou (`supabase stop`); pare os serviços com `pnpm db:stop`. A falha original segue abaixo.",
      );
      return false;
    }
    deps.warn("Serviços locais parados após a falha.");
    return true;
  } catch (error) {
    deps.warn(
      `A limpeza também falhou (${describeError(error)}); pare os serviços com \`pnpm db:stop\`. A falha original segue abaixo.`,
    );
    return false;
  }
}

/**
 * Inicia o Supabase local e verifica a rede. Qualquer falha depois de tentar
 * iniciar (inclusive inicialização parcial, erro de inspeção, de parsing ou
 * exposição de porta) dispara a limpeza; a falha original é relançada.
 */
export async function startSupabase(deps: LifecycleDeps): Promise<void> {
  // Antes de iniciar: falha aqui não deixa nada em execução.
  ensureNetwork(deps);

  let succeeded = false;
  try {
    runSupabaseQuiet(deps, ["start", "--network-id", NETWORK_NAME]);
    const violations = await verifyNetwork(deps);
    if (violations.length > 0) {
      throw new LocalSupabaseError(
        `exposição de rede detectada.\n- ${violations.join("\n- ")}`,
      );
    }
    succeeded = true;
  } finally {
    if (!succeeded) cleanupAfterFailure(deps);
  }
}
