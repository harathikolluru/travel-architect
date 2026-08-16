# Travel Architect deployment image — workspace variant.
#
# Deliberately single-stage / full node_modules (not Next standalone output):
# the workspace layout (packages/db with a generated Prisma client) makes
# standalone tracing fragile, and the standalone runner drops `effect`, a
# transitive dep the Prisma CLI needs for migrate-on-start. Reliability beats
# image size here — this mirrors the SkilletFresh reference image.
#
# Debian, not Alpine: the PDF route drives headless Chromium via Playwright, and
# Chromium needs glibc. On musl it fails to start at all.
#
# Entrypoint runs `prisma migrate deploy` BEFORE the server starts — the
# Day 4 rule ("always migrate before deploying new code") encoded in the image.

FROM node:22-slim
WORKDIR /app

# --include=dev: the build needs devDependencies (typescript, prisma CLI), and
# the runtime keeps the prisma CLI for migrate-on-start. NODE_ENV is set only
# after install so npm ci doesn't silently skip them.
COPY . .
RUN npm ci --include=dev && npx prisma generate && npm run build

# Chromium + its shared libraries, installed where any user can read them.
# `--with-deps` pulls the system packages Playwright knows Chromium needs, which
# is more reliable than hand-listing them.
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
RUN npx playwright install --with-deps chromium \
 && chmod -R a+rx /ms-playwright

ENV NODE_ENV=production

# The planner runs the Claude Agent SDK with permissionMode 'bypassPermissions',
# which the CLI refuses under root ("--dangerously-skip-permissions cannot be
# used with root/sudo privileges"). Containers run as root by default, so the
# agent worked locally and failed in production until this user existed.
RUN groupadd -g 1001 nodejs \
 && useradd -u 1001 -g nodejs -m -d /home/nextjs nextjs \
 && chown -R nextjs:nodejs /app /home/nextjs
USER nextjs
# The SDK writes config under $HOME; without this it resolves to / and fails.
ENV HOME=/home/nextjs

ENV PORT=3000
EXPOSE 3000
CMD ["sh", "-c", "npx prisma migrate deploy && npm start -- -H 0.0.0.0"]
