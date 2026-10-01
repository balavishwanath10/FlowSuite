# FlowSuite Database Design & Migration Strategy

## Database Technology

FlowSuite uses **PostgreSQL 16** as its relational database management system, accessed via **Prisma ORM**.

## Current Schema State (Day 1)

The current `server/prisma/schema.prisma` file contains **only the foundational datasource and generator configuration** (`postgresql` provider and `prisma-client-js` generator). No application data models have been defined yet for Day 1.

## Schema Management & Migration Workflow

1. **Schema Source of Truth**: The database schema is defined in `server/prisma/schema.prisma`.
2. **Prisma Migrations (`prisma migrate dev`)**: All database schema changes will be tracked via formal Prisma migration files generated using `npx prisma migrate dev --name <migration_name>` once application models are introduced.
3. **Migration Files in Git**: Generated migration scripts inside `server/prisma/migrations/` will be committed to Git as models are created.
4. **Strict Policy**: Direct schema updates using `prisma db push` are strictly forbidden for production and migration tracking.

## Environment Connection Strings

- **Local Host Execution**:
  `DATABASE_URL="postgresql://postgres:postgres@localhost:5432/flowsuite?schema=public"`
- **Docker Compose Container Execution**:
  `DATABASE_URL="postgresql://postgres:postgres@postgres:5432/flowsuite?schema=public"`
