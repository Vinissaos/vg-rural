import "server-only";

import { validateEnv } from "./schema";

export const serverEnv = validateEnv(process.env).server;
