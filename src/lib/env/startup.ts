import { validateEnv } from "./schema";

/**
 * Validação na inicialização do servidor. Sem `server-only`, porque roda em
 * src/instrumentation.ts, fora da camada de Server Components.
 */
export function validateStartupEnv(): void {
  validateEnv(process.env);
}
