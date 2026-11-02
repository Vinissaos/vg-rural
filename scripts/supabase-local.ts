/**
 * Ciclo de vida seguro do Supabase LOCAL (máquina do desenvolvedor e CI).
 * Uso: node scripts/supabase-local.ts <start|verify|test|stop>
 *
 * - start:  garante a rede Docker presa a 127.0.0.1 (docs do Supabase, "Local
 *           Development"), inicia o Supabase com --network-id e verifica as portas.
 *           Qualquer falha depois de tentar iniciar dispara `supabase stop` deste
 *           projeto (scripts/lib/supabase-lifecycle.ts).
 * - verify: falha se alguma porta do Supabase local estiver acessível fora do
 *           localhost (inspeção do Docker, sockets em escuta e conexão ativa).
 * - test:   roda os testes pgTAP (`supabase test db --local`).
 * - stop:   para o Supabase local sem guardar backup.
 *
 * A saída do CLI (que contém chaves locais) vai só para um log num diretório
 * temporário exclusivo (700/600), removido ao final; em falha, só trechos
 * mascarados são impressos. Nunca conecta a projeto hospedado e nunca executa
 * `supabase status`.
 */
import { spawnSync } from "node:child_process";
import { createConnection } from "node:net";
import { networkInterfaces } from "node:os";

import { NETWORK_NAME } from "./lib/local-network.ts";
import { redactLog } from "./lib/redact-log.ts";
import { createSecureLog } from "./lib/secure-log.ts";
import {
  LocalSupabaseError,
  describeError,
  runSupabaseQuiet,
  startSupabase,
  verifyNetwork,
  type CommandResult,
  type LifecycleDeps,
} from "./lib/supabase-lifecycle.ts";

// Telemetria do CLI desligada (opt-out documentado pelo Supabase).
const CHILD_ENV: NodeJS.ProcessEnv = {
  ...process.env,
  SUPABASE_TELEMETRY_DISABLED: "1",
  DO_NOT_TRACK: "1",
};

function run(command: string, args: readonly string[]): CommandResult {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    env: CHILD_ENV,
    maxBuffer: 64 * 1024 * 1024,
  });
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function probe(host: string, port: number, timeoutMs = 2000): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host, port });
    const done = (connected: boolean) => {
      socket.destroy();
      resolve(connected);
    };
    socket.setTimeout(timeoutMs, () => done(false));
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
  });
}

function assertSafeEnvironment(): void {
  // Essa variável troca o binário executado pelo pacote npm do CLI.
  if (process.env.SUPABASE_CLI_BINARY_OVERRIDE !== undefined) {
    throw new LocalSupabaseError(
      "SUPABASE_CLI_BINARY_OVERRIDE não pode estar definida",
    );
  }
}

async function main(command: string | undefined): Promise<number> {
  const log = createSecureLog(process.env.RUNNER_TEMP);
  const deps: LifecycleDeps = {
    run,
    writeLog: (text) => log.write(text),
    warn: (message) => console.warn(message),
    probe,
    interfaces: networkInterfaces,
  };

  try {
    assertSafeEnvironment();
    switch (command) {
      case "start":
        await startSupabase(deps);
        console.log(
          "Supabase local iniciado; portas acessíveis somente pelo localhost.",
        );
        return 0;
      case "verify": {
        const violations = await verifyNetwork(deps);
        if (violations.length > 0) {
          throw new LocalSupabaseError(
            `verificação de rede falhou.\n- ${violations.join("\n- ")}`,
          );
        }
        console.log(
          "Verificação de rede aprovada: portas somente no localhost.",
        );
        return 0;
      }
      case "test": {
        // --local impede rodar contra projeto vinculado; --network-id coloca o
        // container do pg_prove na mesma rede presa a 127.0.0.1 do `start`.
        // A saída inteira passa pelo mascaramento antes de ser impressa (o
        // download de imagens pode imprimir URLs pré-assinadas).
        const result = run("pnpm", [
          "exec",
          "supabase",
          "test",
          "db",
          "--local",
          "--network-id",
          NETWORK_NAME,
        ]);
        console.log(redactLog(`${result.stdout}\n${result.stderr}`));
        return result.status === 0 ? 0 : 1;
      }
      case "stop":
        runSupabaseQuiet(deps, ["stop", "--no-backup"]);
        console.log("Supabase local parado.");
        return 0;
      default:
        throw new LocalSupabaseError(
          "uso: node scripts/supabase-local.ts <start|verify|test|stop>",
        );
    }
  } catch (error) {
    console.error(`Supabase local: ${describeError(error)}`);
    return 1;
  } finally {
    log.dispose();
  }
}

// Sem process.exit antecipado: a limpeza e a remoção do log sempre terminam.
process.exitCode = await main(process.argv[2]);
