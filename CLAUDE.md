# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

AI Knowledge Assistant: a RAG assistant with a knowledge graph. Users sign in with Google, upload documents,
and chat with an LLM that answers from those documents. Retrieval combines a Chroma vector search with a Neo4j
graph of entities extracted from the same documents (GraphRAG). Everything an operator would otherwise edit in
code (branding, prompt, model, retrieval knobs, features, who may sign in) is an admin setting, WordPress-style.

It is a copy of `slm-assistant-v3` with the Quran audio features removed, built out as a LangChain/LangGraph
showcase. See [README.md](./README.md) for the feature list and [HOW_TO_RUN.txt](./HOW_TO_RUN.txt) for setup.

## Commands

Turborepo / npm workspaces: `apps/api` (NestJS), `apps/web` (Next.js), `packages/shared-types`.

```bash
npm install                          # also runs `prisma generate` + the ESM marker (see gotchas)
docker compose up -d                 # Postgres, Redis, Chroma, Neo4j, Adminer
cd apps/api && npx prisma migrate deploy
npx turbo run dev                    # api (:4000) + web (:3000)

docker compose --profile app up -d --build   # the whole stack, api and web included

cd apps/api && npx tsc --noEmit      # type-check (never `nest build` while `nest start --watch` runs)
cd apps/web && npx tsc --noEmit
cd apps/api && npx jest              # unit suite, no Docker/network/API key needed
```

**Env:** exactly one `.env` at the repo root (gitignored), read by `docker-compose.yml` and `apps/api`.
`apps/web` reads `apps/web/.env.local` instead. Inside Docker the web container reaches the api at
`INTERNAL_API_URL`, the browser at `NEXT_PUBLIC_API_URL` (see `apps/web/src/lib/api.ts`).

**Migrations:** `prisma migrate dev` hung when run from a non-interactive shell. Run it in your own terminal
for schema changes. The initial migration was produced without it:
`prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script`, written into
`prisma/migrations/<timestamp>_init/migration.sql`, then applied with `prisma migrate deploy`.

## Gotchas

- **`apps/api/generated/package.json` must say `{"type":"module"}`.** Prisma's `prisma-client` generator emits
  ESM TypeScript; the api is CommonJS. Without that marker the server dies at startup with `exports is not
  defined in ES module scope`, while `tsc` and jest both still pass. `scripts/mark-generated-esm.cjs` writes it
  after every generate (`npm run prisma:generate`, the `postinstall` hook, the Dockerfile). The folder is
  gitignored, so never rely on a hand-made copy.
- **Never import a Prisma-backed service into a unit spec without stubbing it.** The generated client lives
  outside jest's `rootDir`, so ts-jest cannot transform it. Add
  `jest.mock('../prisma/prisma.service', () => ({ PrismaService: class {} }))` when a class is only needed as
  a Nest DI token.
- **Fake the model, not the chain.** `chat.service.spec.ts` uses `FakeListChatModel`, so the real prompt,
  LangGraph flow and output parser still run. Assert on prompt contents by spying on the model's `invoke` and
  casting the first argument to `ChatPromptValue`.
- Reasoning models (`openai/gpt-oss-120b` on Groq) spend `maxTokens` on thinking first. Anything that needs
  structured output must raise the limit (`ProviderFactory.build(provider, { maxTokens })`) or the visible reply
  is empty. Extraction and grading use 4096 / 2048.
- On Windows, `nest start --watch` sometimes crashes on its own restart (`taskkill ... failed`). Re-run it.

## Architecture

### Backend (`apps/api`)

Trace a request across modules instead of assuming one file owns a feature.

- **`chat/`** is the question-answering flow. `rag-graph.ts` is a LangGraph `StateGraph`:
  `START -> [retrieve, graph] -> generate -> END`. `retrieve` is the `KnowledgeBaseRetriever` (a real LangChain
  `BaseRetriever` over Chroma), `graph` is the Neo4j lookup, `generate` runs the LCEL chain
  `ChatPromptTemplate -> model -> StringOutputParser`. The two lookups run in parallel. `ChatService` wraps it
  with the answer cache, memory and background warming. `generateAnswer()` is public so evaluation can run the
  real pipeline. `ProviderFactory` (registered in `ProvidersModule`) builds `ChatGroq` / `AzureChatOpenAI` /
  `ChatAnthropic` behind `BaseChatModel`, taking model, temperature and length from admin settings.
- **`graph/`** is GraphRAG. `GraphExtractorService` runs after an upload returns (fire-and-forget), asks the first
  active provider for triples using LangChain structured output (`withStructuredOutput` with a zod schema, with a
  raw-JSON fallback), and `GraphService` stores them in Neo4j. Every relationship carries its `source` file, so
  deleting a document removes exactly its facts. Relationship types are sanitised before they go into Cypher
  (`toRelType`). `factsFor()` finds entities named in the question and walks N hops. Optional: with `NEO4J_URI`
  unset or Neo4j down, every call returns nothing and the assistant is plain RAG.
- **`settings/`** holds admin-editable values. `settings-registry.ts` is the single definition of every setting
  (key, group, label, type, range, default); the database stores only overrides. The admin form is generated
  from these definitions, so adding a setting is one registry entry plus reading it where needed. Settings that
  change what an answer says (`chat.`, `retrieval.`, `graph.`) clear the answer cache when changed.
- **`features/`** are on/off switches (`feature-registry.ts`, stored as overrides). Gate a controller with
  `@UseGuards(JwtAuthGuard, FeatureGuard)` + `@RequireFeature('key')`. The web hides the matching UI too, but the
  guard is the real switch.
- **`tracing/`** attaches a LangChain callback handler (`LlmTraceHandler`) to every model call and records
  latency, tokens and errors to the `LlmCall` table. Pass `tracing.callbacks(provider, purpose)` in the `callbacks`
  option of an `invoke`.
- **`eval/`** stores test questions with expected answers, runs them through the real pipeline, and has the model
  grade each reply for correctness and groundedness (structured output). Runs are stored for comparison.
- **`faq/`** is Redis: question ranking (`faq:counts`, never expires), recent list (`faq:recent`), and the answer
  cache. Cache keys are versioned (`faq:answer:v{version}:{provider}:{question}`); a document change, an
  answer-affecting setting change or a provider/model change bumps the version with one `INCR`. A blank LLM
  reply is never cached.
- **`providers/`** is the encrypted (AES-256-GCM) key vault plus `ProviderUsageService`, which reads rate-limit
  response headers captured by a custom `fetch` wrapper in `ProviderFactory`. `extraConfig` accepts an allow-list
  of non-secret fields only (`model`, `instanceName`, `deploymentName`, `apiVersion`).
- **`documents/`** upload -> `document-extractor.ts` -> `document-chunker.ts` (heading-aware, size and overlap
  from settings) -> Chroma with local embeddings. `VectorStoreService.query` over-fetches then caps chunks per
  file (`spreadAcrossFiles`).
- **`auth/`** Google OAuth -> httpOnly-cookie JWT (60 min) + rotating refresh token. A new Google account is
  admitted if: it is in `ADMIN_EMAILS`, or it is the first account ever (becomes admin), or an admin invited it,
  or the `auth.registration` setting is `open`. Otherwise the callback redirects to `/login?error=not_invited`.
- **`users/`** admin-only: list, delete, change role (the last admin cannot be demoted), invites.

### Frontend (`apps/web`, Next.js App Router)

- `/` is the chat dashboard; `/admin` is the admin area (General, Models & prompt, Knowledge, Features, Users,
  Usage & quality). The tab lives in the URL hash. `components/admin/settings-form.tsx` renders any group of
  settings from the api's definitions.
- Branding is read server-side in `layout.tsx` (`lib/branding.ts`): the name becomes the tab title and the accent
  colour is applied as inline CSS custom properties on `<html>`, so every `bg-primary` / `ring` follows it.
- Use semantic Tailwind tokens (`bg-background`, `border-border`, `text-muted-foreground`, `bg-primary`), not raw
  colours, so the theme stays swappable from one place.
- Client components self-fetch with `credentials: "include"` through `lib/client.ts` (`apiCall`), which turns a
  failed response into an Error carrying the server's own message.
- This Next.js version (16) has breaking changes versus older training data; check
  `node_modules/next/dist/docs/` before assuming an API works as remembered.

### Shared types (`packages/shared-types`)

No build step: `main`/`types` point at `src/index.ts`. Edit it directly; both apps see it immediately.
