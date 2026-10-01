# FlowSuite Architecture

This document describes the foundational architecture and system design principles for FlowSuite.

## 1. Current Day 1 Foundation

The initial Day 1 system operates with the following runtime setup:

- **Frontend (Host)**: React + Vite + TypeScript single-page application (SPA) running locally on host port `5173`.
- **Backend (Host)**: Express.js + TypeScript API server running locally on host port `5000`.
- **Infrastructure Containers (Docker)**: PostgreSQL 16 and Redis 7 services running via Docker Compose.

```
+------------------------------------+
|   Client (Host: React + Vite)      |
+------------------------------------+
                  |
                  | HTTP REST APIs
                  v
+------------------------------------+
|   Server (Host: Express + TS)      |
+------------------------------------+
         |                  |
         | Prisma ORM       | ioredis
         v                  v
+----------------+  +----------------+
| PostgreSQL 16  |  | Redis 7        |
| (Docker: 5432) |  | (Docker: 6379) |
+----------------+  +----------------+
```

## 2. Infrastructure & Networking

- **Docker Compose Bridge Network**: Containers communicate on an isolated Docker bridge network (`flowsuite`).
  - **PostgreSQL**: Accessible via host at `localhost:5432` or via container network at `postgres:5432`.
  - **Redis**: Accessible via host at `localhost:6379` or via container network at `redis:6379`.

## 3. Directory Layout Principles

- **`client/`**: Single-page application (SPA) built with React, Vite, and Tailwind CSS.
- **`server/`**: RESTful API server built with Express.js and TypeScript, using Prisma for database connectivity and ioredis for caching.

## 4. Planned Application Architecture (Future Work)

According to the FlowSuite PRD, future development iterations will introduce:
- Multi-tenant data isolation and organization workspace scoping.
- Authentication mechanisms (JWT), role-based access control (RBAC), and middleware guards.
- Domain feature services (Organizations, Projects, Tasks, Customers, Entitlements/Billing, Audit Logs).

> [!NOTE]
> Planned architecture components represent future implementation milestones and do not exist in the current Day 1 baseline.
