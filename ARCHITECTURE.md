# FlowSuite Architecture

This document describes the foundational architecture, multi-tenant isolation, role-based authorization model, and system design principles for FlowSuite.

## 1. System Overview & Runtime Setup

FlowSuite operates with the following runtime architecture:

- **Frontend (Host)**: React + Vite + TypeScript single-page application (SPA) running locally on host port `5173`.
- **Backend (Host)**: Express.js + TypeScript API server running locally on host port `5000`.
- **Infrastructure Containers (Docker)**: PostgreSQL 16 and Redis 7 services running via Docker Compose.

```text
+------------------------------------+
|   Client (Host: React + Vite)      |
+------------------------------------+
                  |
                  | HTTP REST APIs (/api/v1)
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

## 2. Request Processing Pipeline

All protected API requests follow a layered, security-first pipeline:

```text
Authenticated Request → JWT Middleware → RBAC Middleware → Route Handler → Service Layer → Prisma / PostgreSQL
```

1. **JWT Authentication Middleware (`authenticate`)**:
   - Verifies the `Authorization: Bearer <token>` header.
   - Extracts and decodes the JWT payload.
   - Attaches `req.user = { userId, organizationId }` to the request object.

2. **RBAC Authorization Middleware (`requireRole(...)`)**:
   - Queries the database (`Membership`) using `organizationId` and `userId`.
   - Validates that the user holds an active membership and one of the required roles.
   - Attaches `req.userRole` to the request object for downstream consumption.

3. **Service Layer Execution**:
   - Receives validated inputs, `organizationId`, `userId`, and `userRole`.
   - Executes business operations inside atomic database transactions (`prisma.$transaction`).
   - Writes transactional audit log records corresponding to entity mutations.

## 3. Domain Feature Processing Flows

### Task Management Flow

Task operations follow the standard processing pipeline:

```text
Authenticated Request → JWT Middleware → RBAC Middleware → Task Route → Task Service → Prisma / PostgreSQL
```

Task operations resolve tenant ownership through the parent project's `organizationId` field (`task.project.organizationId = organizationId`).

### Customer Management Flow

Customer operations follow the standard processing pipeline:

```text
Authenticated Request → JWT Middleware → RBAC Middleware → Customer Route → Customer Service → Prisma / PostgreSQL
```

Customer operations resolve tenant ownership directly via `customer.organizationId = req.user.organizationId`. Customer records use the existing Day 2 Prisma `Customer` model and retain relationships with `Organization` and `Project` without requiring schema modifications.

### Customer ↔ Project Association Flow

Customer-Project association operations follow the standard processing pipeline:

```text
Authenticated Request → JWT Middleware → RBAC Middleware → Customer Route → Customer Service → Prisma / PostgreSQL
```

Association request handlers validate that both the target `Customer` and `Project` records belong to the authenticated user's `organizationId` (`customer.organizationId = organizationId AND project.organizationId = organizationId`). Mutations execute inside `prisma.$transaction` atomically alongside `CUSTOMER_PROJECT_LINKED` or `CUSTOMER_PROJECT_UNLINKED` audit log entries. Uses the existing Day 2 implicit many-to-many relationship (`Customer.projects <-> Project.customers`) without schema modifications.

### Audit Log Retrieval Flow

Audit log query operations follow a read-only processing pipeline:

```text
Authenticated Request → JWT Middleware → RBAC Middleware (OWNER/ADMIN) → Audit Log Route → Audit Log Service → Prisma / PostgreSQL
```

Audit log retrieval derives tenant scoping exclusively from `req.user.organizationId`. Queries compute total count and paginated result set (`createdAt DESC`) in parallel, applying optional `action` and `actorId` filters while selecting explicit actor fields (`id`, `name`, `email`).

### Subscription Entitlement Flow

Subscription retrieval operations follow a read-only entitlement pipeline:

```text
Authenticated Request → JWT Middleware → RBAC Middleware (OWNER/ADMIN) → Subscription Route → Subscription Service → Prisma / PostgreSQL
```

Retrieves the organization subscription and associated plan record (`Plan`). Multi-tenant isolation is strictly enforced via `req.user.organizationId`. Returns plan entitlements (seat limits, project limits, API request limits, advanced analytics) without exposing internal Stripe customer/subscription identifiers.

### API Usage Tracking & Limit Enforcement Flow

API request counting and usage enforcement follow an inline pipeline on protected business API routes:

```text
Authenticated Request → JWT Middleware → API Usage Enforcement Middleware → RBAC Middleware → Route Handler → Service Layer → Prisma / PostgreSQL
```

The `enforceApiUsageLimit` middleware checks whether the authenticated organization's API usage for the current billing period (`UsageCounter.apiRequests`) is within the plan limit (`Plan.apiRequestLimit`). Expired usage periods are lazily initialized/rolled over. Atomic conditional database updates (`apiRequests < apiRequestLimit`) guarantee limit enforcement under concurrent requests. If the organization limit is exhausted, requests return HTTP 429 (`API_USAGE_LIMIT_EXCEEDED`). Excluded routes: `/health`, `/api/v1/auth/*`, `POST /api/v1/memberships/accept-invite`, `GET /api/v1/usage`, and `POST /api/v1/billing/webhook`.

### Stripe Test-Mode Billing Flows

#### 1. Checkout Session Flow
```text
Authenticated Request → JWT Middleware → API Usage Middleware → RBAC Middleware (OWNER) → Billing Route → Stripe Service → Stripe API (Test Mode)
```
Checkout creation strictly uses `req.user.organizationId` for tenant identification. Plan details and pricing are resolved from server-side `Plan` table and environment configuration. Free plans are blocked from checkout.

#### 2. Webhook Processing Flow
```text
Unauthenticated Request (Stripe Signature Header) → Express Raw Body Middleware → Billing Route → Stripe Service (Signature Construct Verification) → Prisma / PostgreSQL + AuditLog
```
Stripe webhook requests bypass JWT authentication and API request usage limits. The raw request body buffer is verified against `STRIPE_WEBHOOK_SECRET`. Updates `Subscription` status and plan, creating `SUBSCRIPTION_PLAN_CHANGED` audit entries with `actorId: null`. Idempotent checks prevent duplicate state updates.

### Security Hardening & Rate-Limiting Flow (Day 13)

```text
Login Request → Input Validation → Redis Rate-Limit Check → Authentication Service → JWT Token Generation → Response
```

Failed login attempts are rate-limited via Redis (`login-rate-limit.service.ts`). Requests check the failed-login counter (`failed_login:<email>`) before attempting authentication. If count $\ge 5$ within 15 minutes (900s), HTTP 429 (`TOO_MANY_FAILED_LOGINS`) is returned. On successful login, the counter is deleted. Unexpected backend exceptions are caught by route try/catch blocks or routed to the global Express error middleware in `index.ts` returning safe JSON (`INTERNAL_SERVER_ERROR`, 500) without exposing internal error tracebacks.

### Coverage & Test Architecture (Day 14)

Backend code coverage is instrumented using `@vitest/coverage-v8`. Dedicated authentication middleware coverage was added in `auth.middleware.test.ts` for missing Authorization headers, non-Bearer authorization, valid Bearer tokens, invalid tokens, and expired tokens, ensuring overall statement/line coverage exceeds 89.30% (satisfying the PRD requirement of $\ge 70\%$).

### Continuous Integration & Integration Testing Flow (Day 15)

```text
Git Push / Pull Request (main) → GitHub Actions Runner (Ubuntu) → PostgreSQL 16 Service Container → Prisma Migration Deploy → Vitest Suite → TypeScript Build
```

Continuous integration is enforced via `.github/workflows/ci.yml`. The job spins up a PostgreSQL 16 service container (`postgres:16-alpine`), deploys database migrations via `npx prisma migrate deploy`, executes all 20 test files via `npm test -- --run` (including the database tenant-isolation integration test `project.tenant-isolation.integration.test.ts`), and verifies production TypeScript compilation via `npm run build`.

## 4. Multi-Tenant Data Isolation

FlowSuite enforces strict organization-level data isolation at the backend service layer:

- **Organization Scoping**: Every database query for tenant-owned entities (Projects, Tasks, Customers, Memberships, AuditLogs) is explicitly scoped by `req.user.organizationId`.
- **Untrusted Client Inputs**: Organization IDs provided in request bodies, URL params, or query strings are strictly ignored in favor of the authenticated token context.
- **Cross-Tenant Handling**: Attempts to access or modify resources belonging to another organization reject with generic 404 (`PROJECT_NOT_FOUND`, `TASK_NOT_FOUND`, `CUSTOMER_NOT_FOUND`) responses to prevent resource enumeration.
- **Member Visibility Scoping**:
  - **Member Project Visibility**: `MEMBER → only projects containing tasks assigned to authenticated user` (`tasks.some.assigneeId = userId`).
  - **Member Task Visibility**: `MEMBER → only tasks where assigneeId = authenticated userId` (`assigneeId = userId`).
  - **Customer Access Denial**: `MEMBER → no customer operations permitted` (returns HTTP 403 `INSUFFICIENT_ROLE`).
  - **Audit Log Access Denial**: `MANAGER` and `MEMBER → no audit log access permitted` (returns HTTP 403 `INSUFFICIENT_ROLE`).

## 5. Server-Side Role-Based Access Control (RBAC)

FlowSuite implements a four-tier server-side RBAC authorization model (`OWNER`, `ADMIN`, `MANAGER`, `MEMBER`):

### Customer Management Permissions

| Operation | OWNER | ADMIN | MANAGER | MEMBER |
| :--- | :---: | :---: | :---: | :---: |
| **List Customers** | Yes | Yes | Yes | No |
| **Get Customer** | Yes | Yes | Yes | No |
| **Create Customer** | Yes | Yes | Yes | No |
| **Update Customer** | Yes | Yes | Yes | No |
| **Delete Customer** | Yes | Yes | Yes | No |

### Customer ↔ Project Association Permissions

| Operation | OWNER | ADMIN | MANAGER | MEMBER |
| :--- | :---: | :---: | :---: | :---: |
| **Link Customer to Project** | Yes | Yes | Yes | No |
| **Unlink Customer from Project** | Yes | Yes | Yes | No |
| **List Customer Projects** | Yes | Yes | Yes | No |

### Audit Log Retrieval Permissions

| Operation | OWNER | ADMIN | MANAGER | MEMBER |
| :--- | :---: | :---: | :---: | :---: |
| **List Audit Logs** | Yes | Yes | No | No |

### Task Management Permissions

| Operation | OWNER | ADMIN | MANAGER | MEMBER |
| :--- | :---: | :---: | :---: | :---: |
| **Create Task** | Yes | Yes | Yes | No |
| **Update Task Fields** | Yes | Yes | No | No |
| **Update Task Status** | Yes | Yes | Yes | Assigned Tasks Only |
| **Assign / Reassign Task** | Yes | Yes | Yes | No |
| **View Tasks** | Yes | Yes | Yes | Assigned Tasks Only |

### Project Management & Visibility Permissions

| Operation | OWNER | ADMIN | MANAGER | MEMBER |
| :--- | :---: | :---: | :---: | :---: |
| **Create Project** | Yes | Yes | Yes | No |
| **Update Project** | Yes | Yes | Yes | No |
| **Archive Project** | Yes | Yes | Yes | No |
| **View Organization Projects** | Yes | Yes | Yes | Assigned-Task Projects Only |

### Subscription & Entitlement Permissions

| Operation | OWNER | ADMIN | MANAGER | MEMBER |
| :--- | :---: | :---: | :---: | :---: |
| **Get Subscription & Plan Entitlements** | Yes | Yes | No | No |
| **Get API Request Usage Status** | Yes | Yes | No | No |
| **Create Stripe Checkout Session** | Yes | No | No | No |

Permissions are strictly enforced on the server side via `requireRole` middleware and service-level role verification.

## 6. Audit Logging

Key system and domain mutations execute within atomic database transactions (`prisma.$transaction`) or verified webhook event handlers alongside an `AuditLog` creation step. This guarantees that an audit log entry is persisted whenever a mutation succeeds, and rolled back if the mutation fails.

Implemented audit actions:
- **Subscriptions / Billing**: `SUBSCRIPTION_PLAN_CHANGED`.
- **Customers**: `CUSTOMER_CREATED`, `CUSTOMER_UPDATED`, `CUSTOMER_DELETED`.
- **Customer Associations**: `CUSTOMER_PROJECT_LINKED`, `CUSTOMER_PROJECT_UNLINKED`.
- **Tasks**: `TASK_CREATED`, `TASK_UPDATED`, `TASK_ASSIGNED`, `TASK_STATUS_UPDATED`.
- **Memberships**: `MEMBER_INVITED`, `INVITATION_ACCEPTED`, `MEMBER_ROLE_UPDATED`, `MEMBER_REMOVED`.
- **Projects**: `PROJECT_CREATED`, `PROJECT_UPDATED`, `PROJECT_ARCHIVED`.

## 7. Testing & Verification Architecture

The backend test suite is built with Vitest and focuses on service-level unit tests, middleware validation, route handler testing, and database tenant-isolation integration testing:

- **195 automated tests passing across 20 test files.**
- **Service Unit Tests**: Cover authentication, registration, login, refresh, password reset, membership/invitations, project CRUD, task CRUD, assignment validation, customer CRUD, customer-project associations, audit log retrieval, subscription entitlements, API usage tracking, failed-login rate limiting, and Stripe test-mode billing service (`stripe.service.ts`).
- **Middleware Unit Tests**: Validate authentication (`auth.middleware.test.ts`), RBAC (`rbac.middleware.test.ts`), and API usage limit enforcement (`usage.middleware.test.ts`).
- **RBAC & Visibility Tests**: Test exact role permission boundaries for `OWNER`, `ADMIN`, `MANAGER`, and `MEMBER`, including Member project and task visibility scoping, total Member denial on Customer routes, `OWNER`/`ADMIN`-only access on Audit Log/Subscription/Usage endpoints, and `OWNER`-only access on Billing checkout endpoints.
- **Tenant Isolation Integration Tests**: Explicit PostgreSQL integration test (`project.tenant-isolation.integration.test.ts`) asserting that queries attempting to access Organization A project resources using Organization B's context reject with `Project not found`.
- **Coverage Instrumentation**: Instrumentated via `@vitest/coverage-v8` achieving 89.30% backend statement/line coverage.
- **Continuous Integration Pipeline**: Validated on GitHub Actions (`.github/workflows/ci.yml`) using a PostgreSQL 16 service container to run migrations (`npx prisma migrate deploy`), execute all 20 test files, and verify production compilation (`npm run build`).
- **Build Status**: Verified clean compilation via `npm run build` (`tsc`).

Note: Tests consist of service-level unit tests, middleware tests, and route tests (with mocked Prisma, Redis, and Stripe SDKs), alongside an isolated PostgreSQL tenant-isolation integration test (`project.tenant-isolation.integration.test.ts`). No browser end-to-end testing or live Stripe integration tests are included in the test suite.
