import { describe, expect, it } from "vitest";

import {
  HOST_BINDING_OPTION,
  NETWORK_NAME,
} from "../../scripts/lib/local-network";
import {
  CLEANUP_ARGS,
  LocalSupabaseError,
  cleanupAfterFailure,
  describeError,
  startSupabase,
  verifyNetwork,
  type CommandResult,
  type LifecycleDeps,
} from "../../scripts/lib/supabase-lifecycle";

// Valores FICTÍCIOS montados em tempo de execução.
const fakeKey = ["sb", "secret", "x".repeat(24)].join("_");
const fakeSignedUrl =
  "https://cdn.exemplo.invalid/camada?X-Amz-Signature=assinatura-ficticia";

const ok = (stdout = ""): CommandResult => ({ status: 0, stdout, stderr: "" });
const failed = (stdout = ""): CommandResult => ({
  status: 1,
  stdout,
  stderr: "",
});

const networkJson = JSON.stringify([
  {
    Name: NETWORK_NAME,
    Driver: "bridge",
    Options: { [HOST_BINDING_OPTION]: "127.0.0.1" },
  },
]);

const containersJson = (hostIp = "127.0.0.1") =>
  JSON.stringify([
    {
      Name: "/supabase_db_vg-rural",
      NetworkSettings: {
        Ports: { "5432/tcp": [{ HostIp: hostIp, HostPort: "54322" }] },
      },
    },
  ]);

type Overrides = Partial<{
  start: CommandResult;
  stop: CommandResult | Error;
  inspect: CommandResult;
  ps: CommandResult;
  networkInspect: CommandResult;
}>;

/** Ambiente simulado: registra cada comando e responde conforme o cenário. */
function fakeEnv(overrides: Overrides = {}) {
  const calls: string[][] = [];
  const warnings: string[] = [];
  const logs: string[] = [];
  const deps: LifecycleDeps = {
    run: (command, args) => {
      calls.push([command, ...args]);
      const key = [command, ...args].join(" ");
      if (key === `docker network inspect ${NETWORK_NAME}`)
        return overrides.networkInspect ?? ok(networkJson);
      if (key.startsWith("pnpm exec supabase start"))
        return overrides.start ?? ok(`Secret │ ${fakeKey}`);
      if (key === `pnpm ${CLEANUP_ARGS.join(" ")}`) {
        if (overrides.stop instanceof Error) throw overrides.stop;
        return overrides.stop ?? ok();
      }
      if (key.startsWith("docker ps"))
        return overrides.ps ?? ok("supabase_db_vg-rural\noutro_projeto_db");
      if (key.startsWith("docker inspect"))
        return overrides.inspect ?? ok(containersJson());
      if (command === "ss")
        return ok("LISTEN 0 4096 127.0.0.1:54322 0.0.0.0:*");
      return failed();
    },
    writeLog: (text) => logs.push(text),
    warn: (message) => warnings.push(message),
    probe: async () => false,
    interfaces: () => ({
      eth0: [{ address: "10.9.8.7", internal: false, family: "IPv4" }],
    }),
  };
  const stopCalls = () =>
    calls.filter((call) => call.join(" ") === `pnpm ${CLEANUP_ARGS.join(" ")}`);
  return { deps, calls, warnings, logs, stopCalls };
}

describe("startSupabase: sucesso", () => {
  it("inicia, verifica e não executa limpeza", async () => {
    const env = fakeEnv();
    await expect(startSupabase(env.deps)).resolves.toBeUndefined();
    expect(env.stopCalls()).toHaveLength(0);
  });
});

describe("startSupabase: falha antes de iniciar", () => {
  it("rede sem a opção de loopback reprova sem iniciar nem limpar", async () => {
    const env = fakeEnv({
      networkInspect: ok(
        JSON.stringify([{ Name: NETWORK_NAME, Driver: "bridge", Options: {} }]),
      ),
    });
    await expect(startSupabase(env.deps)).rejects.toThrow(LocalSupabaseError);
    expect(env.calls.some((call) => call.includes("start"))).toBe(false);
    expect(env.stopCalls()).toHaveLength(0);
  });
});

describe("startSupabase: falha durante a inicialização", () => {
  it("inicialização parcial dispara a limpeza e preserva a falha original", async () => {
    const env = fakeEnv({
      start: failed(
        `linha 1\nSecret │ ${fakeKey}\n${fakeSignedUrl}\nerro ao iniciar`,
      ),
    });
    const error = await startSupabase(env.deps).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(LocalSupabaseError);
    expect((error as Error).message).toContain('falha em "supabase start"');
    expect(env.stopCalls()).toHaveLength(1);
    // A mensagem de erro nunca leva chave nem URL assinada.
    expect((error as Error).message).not.toContain(fakeKey);
    expect((error as Error).message).not.toContain("assinatura-ficticia");
  });
});

describe("startSupabase: falha durante a verificação", () => {
  it.each([
    [
      "saída inválida do docker inspect",
      { inspect: ok("<não é json>") },
      "saída inválida",
    ],
    [
      "docker inspect falha",
      { inspect: failed() },
      "não foi possível inspecionar",
    ],
    ["docker ps falha", { ps: failed() }, "não foi possível listar"],
    [
      "porta exposta",
      { inspect: ok(containersJson("0.0.0.0")) },
      "exposição de rede",
    ],
  ] as const)(
    "%s: limpa e relança a falha original",
    async (_n, overrides, msg) => {
      const env = fakeEnv(overrides);
      const error = await startSupabase(env.deps).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(LocalSupabaseError);
      expect((error as Error).message).toContain(msg);
      expect(env.stopCalls()).toHaveLength(1);
    },
  );

  it("porta aceita por endereço externo também dispara a limpeza", async () => {
    const env = fakeEnv();
    env.deps.probe = async () => true;
    const error = await startSupabase(env.deps).catch((e: unknown) => e);
    expect((error as Error).message).toContain(
      "aceita conexão pelo endereço externo",
    );
    expect(env.stopCalls()).toHaveLength(1);
  });
});

describe("falha da própria limpeza", () => {
  it.each([
    ["stop com código de erro", failed("stop falhou")],
    ["stop lança exceção", new Error("spawn pnpm ENOENT")],
  ] as const)(
    "%s: registra o problema e mantém a falha original",
    async (_n, stop) => {
      const env = fakeEnv({ start: failed("erro ao iniciar"), stop });
      const error = await startSupabase(env.deps).catch((e: unknown) => e);
      expect((error as Error).message).toContain('falha em "supabase start"');
      expect(env.warnings.join("\n")).toContain("A limpeza também falhou");
      expect(env.warnings.join("\n")).toContain(
        "A falha original segue abaixo",
      );
    },
  );

  it("cleanupAfterFailure nunca lança", () => {
    const env = fakeEnv({ stop: new Error("falha inesperada") });
    expect(() => cleanupAfterFailure(env.deps)).not.toThrow();
    expect(cleanupAfterFailure(env.deps)).toBe(false);
  });
});

describe("escopo da limpeza", () => {
  it("só executa `supabase stop --no-backup` deste projeto, sem remover redes ou containers", async () => {
    const env = fakeEnv({ start: failed("erro") });
    await startSupabase(env.deps).catch(() => undefined);
    const destructive = env.calls.filter(
      (call) =>
        (call[0] === "docker" &&
          ["rm", "kill", "stop", "prune"].some((verb) =>
            call.includes(verb),
          )) ||
        (call.includes("network") && call.includes("rm")),
    );
    expect(destructive).toEqual([]);
    expect(env.stopCalls()).toEqual([["pnpm", ...CLEANUP_ARGS]]);
  });

  it("nenhum comando executado aponta para projeto remoto", async () => {
    const env = fakeEnv({ start: failed("erro") });
    await startSupabase(env.deps).catch(() => undefined);
    const remote = env.calls.filter((call) =>
      call.some((arg) =>
        ["link", "--linked", "--db-url", "--project-ref", "push"].includes(arg),
      ),
    );
    expect(remote).toEqual([]);
  });
});

describe("verifyNetwork", () => {
  it("ignora containers de outros projetos na listagem", async () => {
    const env = fakeEnv();
    await verifyNetwork(env.deps);
    const inspect = env.calls.find((call) => call[1] === "inspect");
    expect(inspect).toEqual(["docker", "inspect", "supabase_db_vg-rural"]);
  });
});

describe("describeError", () => {
  it("mascara a mensagem de erros inesperados", () => {
    const text = describeError(new Error(`falhou com ${fakeKey}`));
    expect(text).toContain("erro inesperado");
    expect(text).not.toContain(fakeKey);
  });

  it("mantém a mensagem de falhas conhecidas", () => {
    expect(describeError(new LocalSupabaseError("mensagem segura"))).toBe(
      "mensagem segura",
    );
  });
});
