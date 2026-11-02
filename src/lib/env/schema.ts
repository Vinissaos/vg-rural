import { z } from "zod";

type EnvSource = Readonly<Record<string, string | undefined>>;

const nodeEnv = z
  .enum(["development", "test", "production"])
  .default("development");

const appEnv = z.enum(["local", "test", "staging", "production"]);

// Ambientes acessados por pessoas reais: exigem URL pública HTTPS.
const PUBLIC_APP_ENVS: ReadonlySet<string> = new Set(["staging", "production"]);

const LOCAL_HOSTNAMES: ReadonlySet<string> = new Set([
  "localhost",
  "127.0.0.1",
  "[::1]",
  "0.0.0.0",
]);

const LOCAL_SITE_URL = "http://localhost:3000";

/**
 * Variáveis disponíveis somente no servidor. Segredos futuros (ex.: chaves de
 * jobs administrativos) entram aqui, nunca no esquema público.
 *
 * Em produção (NODE_ENV=production, isto é, `next build`/`next start`) APP_ENV
 * é obrigatório: não há valor padrão silencioso.
 */
export const serverEnvSchema = z
  .object({
    NODE_ENV: nodeEnv,
    APP_ENV: appEnv.optional(),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === "production" && env.APP_ENV === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["APP_ENV"],
        message: "obrigatória em produção",
      });
    }
  })
  .transform((env) => ({
    NODE_ENV: env.NODE_ENV,
    APP_ENV: env.APP_ENV ?? (env.NODE_ENV === "test" ? "test" : "local"),
  }));

/**
 * Variáveis expostas ao navegador (prefixo NEXT_PUBLIC_). Nunca coloque segredos aqui.
 * Em produção NEXT_PUBLIC_SITE_URL é obrigatória: não há fallback para localhost.
 */
export const clientEnvSchema = z
  .object({
    NODE_ENV: nodeEnv,
    NEXT_PUBLIC_SITE_URL: z.url({ protocol: /^https?$/ }).optional(),
  })
  .superRefine((env, ctx) => {
    if (
      env.NODE_ENV === "production" &&
      env.NEXT_PUBLIC_SITE_URL === undefined
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["NEXT_PUBLIC_SITE_URL"],
        message: "obrigatória em produção",
      });
    }
  })
  .transform((env) => ({
    NEXT_PUBLIC_SITE_URL: env.NEXT_PUBLIC_SITE_URL ?? LOCAL_SITE_URL,
  }));

export type ServerEnv = z.output<typeof serverEnvSchema>;
export type ClientEnv = z.output<typeof clientEnvSchema>;

function invalidNames(error: z.ZodError): string[] {
  return error.issues.map((issue) => issue.path.join("."));
}

function envError(label: string, names: string[]): Error {
  return new Error(
    `Variáveis de ambiente inválidas (${label}): ${[...new Set(names)].join(", ")}`,
  );
}

/**
 * Valida e retorna as variáveis. A mensagem de erro cita apenas os nomes das
 * variáveis inválidas, nunca os valores.
 */
export function parseEnv<T extends z.ZodType>(
  schema: T,
  source: EnvSource,
  label: string,
): z.output<T> {
  const result = schema.safeParse(source);
  if (!result.success) throw envError(label, invalidNames(result.error));
  return result.data;
}

/**
 * Validação completa do ambiente (servidor + público + regras cruzadas).
 * Chamada no build/dev/start (next.config.ts) e na inicialização do servidor
 * (src/instrumentation.ts), para falhar antes de atender qualquer requisição.
 * Lista todas as variáveis com problema de uma vez, sem expor valores.
 */
export function validateEnv(source: EnvSource): {
  server: ServerEnv;
  client: ClientEnv;
} {
  const server = serverEnvSchema.safeParse(source);
  const client = clientEnvSchema.safeParse(source);
  if (!server.success || !client.success) {
    throw envError("ambiente", [
      ...(server.success ? [] : invalidNames(server.error)),
      ...(client.success ? [] : invalidNames(client.error)),
    ]);
  }

  if (PUBLIC_APP_ENVS.has(server.data.APP_ENV)) {
    const url = new URL(client.data.NEXT_PUBLIC_SITE_URL);
    if (url.protocol !== "https:" || LOCAL_HOSTNAMES.has(url.hostname)) {
      throw new Error(
        `Variáveis de ambiente inválidas (${server.data.APP_ENV}): ` +
          "NEXT_PUBLIC_SITE_URL deve ser uma URL pública HTTPS",
      );
    }
  }

  return { server: server.data, client: client.data };
}
