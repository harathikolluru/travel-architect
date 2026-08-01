import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// The datasource URL comes from `env("DATABASE_URL")` in schema.prisma, so
// it is deliberately not repeated here.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'npx tsx prisma/seed.ts',
  },
});
