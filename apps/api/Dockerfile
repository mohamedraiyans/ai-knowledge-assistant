# Build context is the repository root (npm workspaces need the lockfile and the shared
# types package), e.g.  docker build -f apps/api/Dockerfile .
#
# Debian rather than Alpine: the local embedding model runs on onnxruntime, which ships
# glibc binaries only.
FROM node:24-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared-types/package.json packages/shared-types/
# --ignore-scripts: the postinstall hook runs `prisma generate`, which needs the schema
# that is only copied in the next step.
RUN npm ci --workspace=@slm/api --include-workspace-root --ignore-scripts

COPY packages packages
COPY apps/api apps/api
RUN cd apps/api && npm run prisma:generate && npx nest build

# The runtime keeps the full dependency tree because the start command uses the Prisma
# CLI (a dev dependency) to apply migrations. Slimming this is a known follow-up.
FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app ./
WORKDIR /app/apps/api

# Uploaded documents and the cached embedding model live here; mount a volume on it.
VOLUME ["/app/apps/api/data"]
EXPOSE 4000

# Apply any pending migrations, then start. `migrate deploy` is the production-safe
# command: it only applies committed migrations and never prompts or resets data.
CMD ["sh", "-c", "npx prisma migrate deploy && node --enable-source-maps dist/src/main"]
