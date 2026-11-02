<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Regras do VG Rural para agentes de IA

Estas regras valem para qualquer agente que trabalhe neste repositório. Detalhes
em `docs/seguranca/procedimento-de-integracao.md` e `SECURITY.md`.

- Nunca enviar alterações para a `main`, nunca fazer merge, nunca aprovar Pull
  Requests e nunca ativar merge automático. O merge é sempre manual, feito pelo
  responsável.
- Trabalhar somente na branch de desenvolvimento autorizada e só fazer push com
  autorização explícita do responsável.
- Não desativar, pular ou enfraquecer testes e verificações de segurança para
  obter CI verde. Relatar falhas como elas são.
- Usar somente dados fictícios. Nunca incluir segredos, credenciais, documentos
  ou dados pessoais reais.
- Destacar no resumo qualquer alteração em arquivos listados em `.github/CODEOWNERS`.
