/**
 * Teste de fumaça contra o servidor rodando (`pnpm build && pnpm start`).
 * Confere cabeçalhos de segurança, CSP com nonce, ausência de cache e de
 * segredos no corpo das respostas reais (HTML e JSON).
 * Uso: pnpm smoke   (BASE_URL opcional, padrão http://localhost:3000)
 */
import { checkResponse } from "./lib/response-checks.ts";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";

type Route = {
  path: string;
  status: number;
  headers?: Record<string, string>;
};

// Rotas com o status esperado. A página 404 também é verificada: erros não
// podem vazar dados nem sair sem os cabeçalhos de segurança. Cabeçalhos de
// prefetch são controlados pelo cliente e não podem desligar a CSP.
const ROUTES: ReadonlyArray<Route> = [
  { path: "/", status: 200 },
  { path: "/api/health", status: 200 },
  { path: "/rota-inexistente-smoke", status: 404 },
  { path: "/", status: 200, headers: { Purpose: "prefetch" } },
  { path: "/", status: 200, headers: { "Next-Router-Prefetch": "1" } },
];

const label = ({ path, headers }: Route) =>
  headers === undefined
    ? path
    : `${path} [${Object.entries(headers)
        .map(([name, value]) => `${name}: ${value}`)
        .join(", ")}]`;

const errors = (
  await Promise.all(
    ROUTES.map(async (route) =>
      checkResponse(
        label(route),
        await fetch(new URL(route.path, BASE_URL), {
          redirect: "manual",
          ...(route.headers !== undefined && { headers: route.headers }),
        }),
        process.env,
        route.status,
      ),
    ),
  )
).flat();

if (errors.length > 0) {
  console.error("Falhas no teste de fumaça:");
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}
console.log(
  `Cabeçalhos e corpo das respostas OK em ${ROUTES.map(label).join(", ")}.`,
);
