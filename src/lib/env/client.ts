import { clientEnvSchema, parseEnv } from "./schema";

// O Next.js só embute no bundle as variáveis acessadas de forma literal
// (NEXT_PUBLIC_* e NODE_ENV); por isso cada uma é listada explicitamente.
export const clientEnv = parseEnv(
  clientEnvSchema,
  {
    NODE_ENV: process.env.NODE_ENV,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  },
  "cliente",
);
