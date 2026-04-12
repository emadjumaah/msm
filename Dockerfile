FROM node:22-slim AS build
WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Install deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Copy source and build
COPY tsconfig.json ./
COPY src/ src/
COPY examples/ examples/
RUN pnpm build

# ─── Production image ────────────────────────────────────────
FROM node:22-slim
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

COPY --from=build /app/dist/ dist/
COPY examples/ examples/

ENV MSM_PORT=3000
EXPOSE 3000

# Default: dummy models. Override with --ollama for real models.
CMD ["node", "dist/server.js"]
