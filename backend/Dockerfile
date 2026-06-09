# syntax=docker/dockerfile:1

# Imagem do SaaSIntegrationDispatcher (ARCH §8), que roda em ECS Fargate.
# Node 24 (bookworm-slim) casa com o ambiente de desenvolvimento/teste do projeto.
# Observação: as Lambdas (Serverless) seguem em nodejs20.x — runtime gerenciado da
# AWS, independente desta imagem; o container não tem essa limitação.

# ---- Estágio de build ----
# Compila o TypeScript para dist/ usando TODAS as dependências (inclui devDeps).
FROM node:24-bookworm-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---- Estágio de runtime ----
# Imagem final enxuta: apenas o artefato compilado + dependências de produção.
FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Só dependências de produção (sem typescript/jest/eslint/etc.).
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Artefato compilado vindo do estágio de build.
COPY --from=builder /app/dist ./dist

# Usuário sem privilégios (o usuário `node` já existe na imagem base).
USER node

# Entrypoint fino do worker (ARCH §8). Ao parar a task, o ECS envia SIGTERM:
# o Node encerra e as mensagens in-flight sem ACK retornam à fila pelo
# visibility timeout (§15) — nenhuma é perdida nem queima maxReceiveCount injusto.
CMD ["node", "dist/workers/dispatcher/main.js"]
