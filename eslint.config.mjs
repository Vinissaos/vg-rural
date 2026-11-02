import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([".next/**", "out/**", "coverage/**", "next-env.d.ts"]),
  {
    rules: {
      eqeqeq: ["error", "always"],
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-func": "error",
      "react/no-danger": "error",
    },
  },
  {
    // Variáveis de ambiente só podem ser lidas pelos módulos validados em src/lib/env.
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/lib/env/**"],
    rules: {
      "no-restricted-properties": [
        "error",
        {
          object: "process",
          property: "env",
          message:
            "Leia variáveis de ambiente apenas por src/lib/env (validadas com Zod).",
        },
      ],
    },
  },
  {
    // Chaves administrativas (ex.: service_role do Supabase) nunca podem aparecer no código da aplicação.
    // Única exceção: o detector de segredos, que precisa conhecer esses padrões para bloqueá-los.
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/lib/security/secret-detection.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "Literal[value=/service_role|SERVICE_ROLE|sb_secret_/]",
          message:
            "Chaves administrativas não podem ser referenciadas no código da aplicação.",
        },
        {
          selector:
            "TemplateElement[value.raw=/service_role|SERVICE_ROLE|sb_secret_/]",
          message:
            "Chaves administrativas não podem ser referenciadas no código da aplicação.",
        },
      ],
    },
  },
]);
