/**
 * Regras de rede do Supabase local: as portas publicadas pelo Docker só podem
 * ficar acessíveis pelo localhost. Funções puras, testadas em
 * tests/unit/local-network.test.ts. Falha fechada: dado ausente ou inesperado
 * conta como violação.
 */

export const NETWORK_NAME = "vg-rural-local";
export const HOST_BINDING_OPTION =
  "com.docker.network.bridge.host_binding_ipv4";
export const HOST_BINDING_IP = "127.0.0.1";

// Faixa de portas usada pelo supabase/config.toml (54320 a 54329).
export const LOCAL_PORT_RANGE = { first: 54320, last: 54329 } as const;

// Nomes dos containers criados pelo CLI para o project_id "vg-rural".
export const CONTAINER_NAME = /^\/?supabase_[a-z0-9_]+_vg-rural$/;

const LOOPBACK = new Set(["127.0.0.1", "::1", "localhost"]);

export function isLoopback(ip: string): boolean {
  const normalized = ip.trim().replace(/^\[|\]$/g, "");
  return LOOPBACK.has(normalized) || /^127\./.test(normalized);
}

type CheckResult = { ok: true } | { ok: false; error: string };

/** Confere a saída de `docker network inspect <rede>` (JSON). */
export function checkNetwork(inspect: unknown): CheckResult {
  if (!Array.isArray(inspect) || inspect.length !== 1) {
    return { ok: false, error: "inspeção da rede ausente ou ambígua" };
  }
  const network = inspect[0] as {
    Name?: unknown;
    Driver?: unknown;
    Options?: Record<string, unknown> | null;
  };
  if (network.Name !== NETWORK_NAME) {
    return { ok: false, error: `rede inesperada: ${String(network.Name)}` };
  }
  if (network.Driver !== "bridge") {
    return { ok: false, error: `driver inesperado: ${String(network.Driver)}` };
  }
  const binding = network.Options?.[HOST_BINDING_OPTION];
  if (binding !== HOST_BINDING_IP) {
    return {
      ok: false,
      error: `a rede ${NETWORK_NAME} existe sem ${HOST_BINDING_OPTION}=${HOST_BINDING_IP}; remova-a e rode de novo`,
    };
  }
  return { ok: true };
}

export type PublishedPort = {
  container: string;
  port: string;
  hostIp: string;
  hostPort: string;
};

type PortBinding = { HostIp?: unknown; HostPort?: unknown };

function bindingsOf(
  map: Record<string, PortBinding[] | null> | null | undefined,
): Array<{ port: string; binding: PortBinding }> {
  if (map === null || map === undefined) return [];
  return Object.entries(map).flatMap(([port, list]) =>
    (list ?? []).map((binding) => ({ port, binding })),
  );
}

/**
 * Lê a saída de `docker inspect <containers>` (JSON) e devolve as portas
 * publicadas e as violações (porta publicada fora do loopback, inclusive
 * HostIp vazio, que significa todas as interfaces).
 *
 * Usa NetworkSettings.Ports, que mostra os endereços efetivamente publicados.
 * HostConfig.PortBindings é só o pedido: com a rede presa a 127.0.0.1, o pedido
 * pode vir sem HostIp e mesmo assim a publicação real ficar no loopback.
 */
export function analyzeContainers(inspect: unknown): {
  published: PublishedPort[];
  violations: string[];
} {
  const violations: string[] = [];
  const published: PublishedPort[] = [];

  if (!Array.isArray(inspect) || inspect.length === 0) {
    return {
      published,
      violations: ["nenhum container do Supabase local encontrado"],
    };
  }

  for (const raw of inspect) {
    const container = raw as {
      Name?: unknown;
      NetworkSettings?: { Ports?: Record<string, PortBinding[] | null> | null };
    };
    const name = String(container.Name ?? "?").replace(/^\//, "");
    if (!CONTAINER_NAME.test(name)) {
      violations.push(`container fora do projeto vg-rural: ${name}`);
      continue;
    }

    for (const { port, binding } of bindingsOf(
      container.NetworkSettings?.Ports,
    )) {
      const hostIp = typeof binding.HostIp === "string" ? binding.HostIp : "";
      const hostPort =
        typeof binding.HostPort === "string" ? binding.HostPort : "";
      if (!isLoopback(hostIp)) {
        violations.push(
          `${name}: porta ${port} publicada em "${hostIp || "todas as interfaces"}"`,
        );
      } else if (hostPort !== "") {
        published.push({ container: name, port, hostIp, hostPort });
      }
    }
  }

  if (violations.length === 0 && published.length === 0) {
    violations.push(
      "nenhuma porta publicada encontrada; verificação inconclusiva",
    );
  }
  return { published, violations };
}

/**
 * Lê a saída de `ss -H -ltn` e devolve sockets em escuta, na faixa local do
 * Supabase, ligados a endereços que não são loopback.
 */
export function exposedListeningSockets(
  ssOutput: string,
  range: { first: number; last: number } = LOCAL_PORT_RANGE,
): string[] {
  const exposed: string[] = [];
  for (const line of ssOutput.split(/\r?\n/)) {
    const columns = line.trim().split(/\s+/);
    // Formato: State Recv-Q Send-Q Local:Porta Peer:Porta
    const local = columns[3];
    if (local === undefined) continue;
    const separator = local.lastIndexOf(":");
    if (separator <= 0) continue;
    const address = local.slice(0, separator);
    const port = Number.parseInt(local.slice(separator + 1), 10);
    if (!Number.isInteger(port) || port < range.first || port > range.last)
      continue;
    if (!isLoopback(address.replace(/%.*$/, ""))) exposed.push(local);
  }
  return exposed;
}

/** Endereços não-loopback da máquina, para a tentativa ativa de conexão. */
export function externalAddresses(
  interfaces: Record<
    string,
    | Array<{ address: string; internal: boolean; family: string | number }>
    | undefined
  >,
): string[] {
  return Object.values(interfaces)
    .flatMap((list) => list ?? [])
    .filter((entry) => !entry.internal && !isLoopback(entry.address))
    .filter((entry) => !entry.address.toLowerCase().startsWith("fe80:"))
    .map((entry) => entry.address);
}
