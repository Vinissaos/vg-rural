# VG Rural

### Plataforma SaaS para Gestão de Holdings Rurais

**Next.js • React • TypeScript • Supabase • PostgreSQL • Segurança • Automação de Testes**

O **VG Rural** é um projeto de software desenvolvido para centralizar e digitalizar a gestão administrativa de holdings rurais, reunindo informações patrimoniais, documentais, financeiras e societárias em uma única plataforma.

O projeto está sendo desenvolvido com foco em **segurança da informação, arquitetura escalável, proteção de dados e qualidade de software**.

**Status:** Em desenvolvimento — fundação técnica implementada, funcionalidades de negócio planejadas.

---

## Visão geral

O objetivo do VG Rural é facilitar a administração de patrimônios e operações rurais por meio de uma plataforma web organizada, segura e acessível.

A solução pretende oferecer:

- Gestão de holdings e propriedades rurais.
- Organização de documentos e contratos.
- Controle de informações financeiras.
- Gestão de informações societárias.
- Permissões de acesso por perfil.
- Isolamento de dados entre organizações.
- Autenticação e proteção de informações sensíveis.

**Importante:** As funcionalidades acima representam a visão futura do produto. Os módulos de negócio ainda não foram implementados.

## O que já foi desenvolvido

A primeira fase priorizou a estrutura técnica e a segurança da aplicação.

**Aplicação web**

- Estrutura inicial utilizando Next.js, React e TypeScript.
- Página inicial institucional.
- Endpoint de verificação de disponibilidade.
- Validação de variáveis de ambiente com Zod.

**Segurança da informação**

- Configuração de Content Security Policy (CSP).
- Implementação de cabeçalhos HTTP de segurança.
- Verificações de exposição acidental de segredos.
- Configuração inicial de privilégios no PostgreSQL.
- Documentação de arquitetura de segurança e modelo de ameaças.

**Testes e automação**

- Testes unitários com Vitest.
- Testes de banco de dados com pgTAP.
- Configuração de pipelines no GitHub Actions.
- Auditoria automatizada de dependências.
- Verificação de segredos com gitleaks.
- Dependabot para manutenção de dependências.

**Resultados reportados em testes locais:**

- 215 testes unitários aprovados.
- 35 asserções pgTAP aprovadas.

A execução da versão final dos testes na CI do GitHub ainda precisa ser confirmada.

## Tecnologias utilizadas

| Categoria            | Tecnologias                             |
| -------------------- | --------------------------------------- |
| Front-end            | Next.js 16, React 19, Tailwind CSS 4    |
| Linguagem            | TypeScript 6                            |
| Banco de dados local | PostgreSQL 17, Supabase                 |
| Validação            | Zod 4                                   |
| Testes               | Vitest, pgTAP                           |
| Segurança            | CSP, gitleaks, controles de privilégios |
| Automação e CI       | GitHub Actions, Dependabot              |
| Qualidade de código  | ESLint, Prettier                        |
| Ferramentas          | pnpm, Node.js, Docker                   |

## Próximas etapas

- Implementar as tabelas de negócio e regras de isolamento de dados.
- Desenvolver autenticação e autenticação multifator.
- Criar o cadastro e a gestão de holdings e fazendas.
- Implementar a gestão documental.
- Desenvolver módulos financeiros e societários.
- Criar interfaces para as operações do sistema.

## Demonstração

A interface atual é provisória. As telas de gestão ainda estão em planejamento.

Capturas de tela e demonstrações serão adicionadas conforme as funcionalidades forem implementadas.

---

**Desenvolvido por Vinicius Gabriel Miranda Neves**

Este projeto integra meu portfólio de desenvolvimento de software, arquitetura de aplicações, segurança e automação de processos.
