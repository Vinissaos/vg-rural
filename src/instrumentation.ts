import { validateStartupEnv } from "@/lib/env/startup";

// O Next.js executa register() uma vez por instância do servidor, antes de
// atender requisições. Ambiente inválido impede a inicialização.
export function register() {
  validateStartupEnv();
}
