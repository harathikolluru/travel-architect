# Capstone deployment image — Next.js standalone.
#
# Requires next.config.ts to include:  output: 'standalone'

# ---- build stage ----
FROM node:22-alpine AS build
WORKDIR /src
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- runtime stage ----
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0

# Next standalone output + static assets
COPY --from=build /src/.next/standalone ./
COPY --from=build /src/.next/static ./.next/static
COPY --from=build /src/public ./public

EXPOSE 3000
CMD ["node", "server.js"]
