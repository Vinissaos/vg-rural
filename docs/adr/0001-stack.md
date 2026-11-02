# ADR 0001: Stack base

- **Status:** Aceito (Etapa 0.1)
- **Data:** 2026-10-23

## Contexto

O VG Rural é um SaaS web responsivo (futuramente instalável como PWA) que vai
armazenar documentos patrimoniais e dados financeiros e societários. A prioridade
é segurança e integridade, com desenvolvimento lento e revisado por módulo.

## Decisão

- **Next.js 16 (App Router) + React 19 + TypeScript estrito.** Renderização no
  servidor permite manter autorização, segredos e acesso a dados fora do navegador.
- **TypeScript 6.0**, não 7.x: o `typescript-eslint` (usado pela configuração do
  Next) ainda exige `<6.1`.
- **ESLint 9**, não 10: a configuração oficial do Next 16.4 e os plugins
  `eslint-plugin-react`/`import`/`jsx-a11y` ainda declaram suporte só até a v9.
  A v9 está fora de suporte. Reavaliar assim que os plugins suportarem a v10.
- **Tailwind CSS 4**, sem fontes externas (pilha de fontes do sistema), para não
  depender de terceiros nem afrouxar a CSP.
- **Zod 4** para validação de variáveis de ambiente e, nas próximas etapas, de
  todas as entradas.
- **Vitest** em ambiente Node para testes unitários e de integração.
- **pnpm 10** com versões exatas, `minimumReleaseAge` de 24 h e scripts de
  instalação bloqueados por padrão (`onlyBuiltDependencies`).

## Consequências

- Atualizações de dependências passam por PR (Dependabot), CI e revisão.
- As versões fixadas devem ser revistas a cada etapa (segurança e compatibilidade).
