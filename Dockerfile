# check=skip=SecretsUsedInArgOrEnv
# (The only build arg is Stripe's publishable key, which is public by design
# and ends up in the browser bundle anyway.)

# One image serving the API and the React build (NODE_ENV=production makes
# Express serve client/build). Works on any container host: Render, Fly.io,
# Railway, Azure Container Apps...

FROM node:20-alpine AS server-build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY *.ts ./
COPY config ./config
COPY middleware ./middleware
COPY models ./models
COPY routes ./routes
COPY seed ./seed
COPY services ./services
COPY types ./types
RUN npm run build

FROM node:20-alpine AS client-build
WORKDIR /app/client
COPY client/package.json client/package-lock.json ./
RUN npm ci
COPY client/ ./
# Publishable key only (safe to embed); pass with --build-arg.
ARG REACT_APP_STRIPE_PUBLISHABLE_KEY=""
ENV REACT_APP_STRIPE_PUBLISHABLE_KEY=$REACT_APP_STRIPE_PUBLISHABLE_KEY
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=5000
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=server-build /app/dist ./dist
COPY --from=client-build /app/client/build ./client/build
RUN mkdir -p uploads private-uploads && chown -R node:node uploads private-uploads
USER node
EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD wget -qO- http://localhost:${PORT}/api/health || exit 1
CMD ["node", "dist/server.js"]
