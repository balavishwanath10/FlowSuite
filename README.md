# FlowSuite

## Product Vision

FlowSuite is a production-style B2B SaaS platform designed to provide organizations with isolated workspaces for managing teams, customers, projects, and tasks — backed by role-based access control (RBAC), subscription billing, a flexible feature-entitlement engine, usage limits, and audit logging.

## Current Status — Day 21 Documentation Completion & PRD Gap Audit

The repository currently contains completed **Day 1 foundation, Day 2 database schema, Day 3 authentication, Day 4 organization membership & RBAC, Day 5 project management, Day 6 task management, Day 7 customer management, Day 8 customer ↔ project association, Day 9 organization audit log retrieval, Day 10 subscription & plan entitlement foundation, Day 11 API usage tracking & limits, Day 12 Stripe test-mode billing foundation, Day 13 security hardening, Day 14 backend coverage hardening, Day 15 final testing & CI foundation, Day 16 frontend authentication & dashboard, Day 17 frontend projects & tasks, Day 18 frontend customers & customer-project associations, Day 19 frontend audit logs, Day 20 frontend subscription & billing UI, and Day 21 documentation completion & PRD gap audit**.

### System Verification & Capabilities

The repository contains fully implemented and verified capabilities for:
- Authentication & JWT/session persistence
- Organization membership & multi-tier RBAC (`OWNER`, `ADMIN`, `MANAGER`, `MEMBER`)
- Project management & archiving
- Task management, assignment, status tracking & Member visibility scoping
- Customer management & Customer–Project associations
- Subscription entitlement engine & API request usage tracking/limits
- Stripe test-mode billing foundation, checkout session generation & webhook processing
- Security hardening & Redis failed-login rate limiting
- Backend test coverage instrumentation & PostgreSQL tenant-isolation integration testing
- GitHub Actions CI pipeline
- Frontend authentication UI (`/login`, `/register`) & AuthContext session management
- Frontend Organization Dashboard UI (`/`)
- Frontend Projects UI (`/projects`) & Tasks UI (`/tasks`)
- Frontend Customers UI (`/customers`) & Customer–Project association management
- Frontend Audit Logs UI (`/audit-logs`) with pagination, action/actor filters & OWNER/ADMIN access
- Frontend Subscription & Billing UI (`/billing`) with plan catalog (`GET /api/v1/subscription/plans`), OWNER checkout redirect, neutral return notice & subscription refresh
- Synchronized documentation & PRD gap audit (Day 21)

Current verification state:
- **47 automated frontend tests passing across 9 test files.**
- **203 automated backend tests passing across 21 test files.**
- **Frontend production build (`tsc && vite build`) passing.**
- **Backend production build (`tsc`) passing.**
- **CI workflow configured for test and build verification.**

Remaining Work and Requirements to Confirm:
- Cloud deployment and deployed URL verification
- OpenAPI / Swagger formal specification document generation (formal API-specification gap whose requirement status needs confirmation against the authoritative PRD)
- Final PRD acceptance review / walkthrough

### Day 1 — Foundation

* Docker Compose infrastructure with PostgreSQL 16 and Redis 7.
* Express.js + TypeScript backend.
* React + Vite + TypeScript + Tailwind CSS frontend.
* Health check endpoint at `/api/v1/health`.
* Initial architecture and database documentation.

### Day 2 — Database Schema

* Complete Prisma schema for the 10 core FlowSuite entities.
* PostgreSQL migrations configured and applied.
* Seeded Free, Starter, and Professional subscription plans.
* Tenant-aware organization relationships and indexes.

### Day 3 — Authentication & JWT

* User registration with bcrypt password hashing.
* Automatic organization creation and Owner membership during registration.
* Free-plan subscription creation during registration.
* Login with credential validation.
* JWT access and refresh token generation.
* Protected authentication middleware.
* Authenticated user/organization endpoint (`/api/v1/auth/me`).
* Refresh-token endpoint.
* Logout endpoint.
* Password-reset request and password-reset flow.
* Zod validation for authentication inputs.

### Day 4 — Organization Membership & RBAC

* Organization member listing endpoint (`/api/v1/memberships`).
* Single-use 24-hour invitation token generation (`/api/v1/memberships/invite`).
* Invitation acceptance flow with account registration (`/api/v1/memberships/accept-invite`).
* Role update endpoint (`/api/v1/memberships/role`).
* Member removal endpoint (`/api/v1/memberships/:membershipId`).
* Four-tier server-side RBAC (`OWNER`, `ADMIN`, `MANAGER`, `MEMBER`).
* Transactional audit logging (`MEMBER_INVITED`, `INVITATION_ACCEPTED`, `MEMBER_ROLE_UPDATED`, `MEMBER_REMOVED`).

### Day 5 — Project Management Backend Foundation

* Full Project CRUD operations (Create, Read/List, Get by ID, Update, Archive).
* `/api/v1/projects` endpoint architecture.
* Organization/tenant isolation: Every operation strictly filtered by authenticated `organizationId`. Cross-tenant queries return 404 (`PROJECT_NOT_FOUND`).
* Server-side RBAC enforcement:
  * `OWNER`, `ADMIN`, `MANAGER`: Full project CRUD & archive access.
  * `MEMBER`: Read-only access (list and view project by ID). Mutations return 403 (`INSUFFICIENT_ROLE`).
* Archive behavior: Sets project status to `ARCHIVED`.
* Zod validation for UUID path params, name lengths, descriptions, and statuses.
* Transactional audit log actions (`PROJECT_CREATED`, `PROJECT_UPDATED`, `PROJECT_ARCHIVED`) via `prisma.$transaction`.

### Day 6 — Task Management & Member Visibility

* Task creation, listing, retrieval by ID, general updates, status updates, and assignment/reassignment.
* `/api/v1/tasks` endpoint architecture.
* Organization/tenant isolation: All task operations resolved through the authenticated user's `organizationId` via the parent project relationship (`task.project.organizationId = req.user.organizationId`). Cross-tenant resources return 404 (`TASK_NOT_FOUND` / `PROJECT_NOT_FOUND`).
* Server-side RBAC enforcement:
  * `OWNER`, `ADMIN`, `MANAGER`: Task creation (`POST /api/v1/tasks`) and task assignment (`PATCH /api/v1/tasks/:taskId/assign`).
  * `OWNER`, `ADMIN`: Arbitrary task updates (`PATCH /api/v1/tasks/:taskId`).
  * All authenticated roles (`OWNER`, `ADMIN`, `MANAGER`, `MEMBER`) may update task status (`PATCH /api/v1/tasks/:taskId/status`), but `MEMBER` users may update status only for tasks assigned to themselves.
* Member-specific task visibility: `MEMBER` users can only view tasks assigned to themselves (`assigneeId = userId`), enforced directly at the Prisma query layer.
* Member-specific project visibility: `MEMBER` users can only view projects containing tasks assigned to themselves (`tasks.some.assigneeId = userId`).
* Assignee organization validation: Validates that assignee users belong to the authenticated organization.
* Zod input validation for UUIDs, titles, descriptions, statuses, and query parameters.
* Transactional audit log actions (`TASK_CREATED`, `TASK_UPDATED`, `TASK_ASSIGNED`, `TASK_STATUS_UPDATED`) via `prisma.$transaction`.

### Day 7 — Customer Management Backend Foundation

* Full Customer CRUD operations (Create, List, Get by ID, Update, Delete).
* `/api/v1/customers` endpoint architecture using the existing Day 2 Prisma `Customer` model (`id`, `organizationId`, `name`, `email`, `phone`, `createdAt`, `updatedAt`).
* Customer relationships: Customer belongs to Organization; Customer ↔ Project relationship via existing `Project.customers` relation.
* Organization/tenant isolation: Every operation strictly scoped by `req.user.organizationId`. Cross-tenant requests return 404 (`CUSTOMER_NOT_FOUND`).
* Server-side RBAC enforcement:
  * `OWNER`, `ADMIN`, `MANAGER`: Full Customer CRUD access.
  * `MEMBER`: No access to customer endpoints (all customer requests return 403 `INSUFFICIENT_ROLE`).
* Zod validation for body data (name length, email format, phone format) and UUID URL parameters.
* Transactional audit log actions (`CUSTOMER_CREATED`, `CUSTOMER_UPDATED`, `CUSTOMER_DELETED`) via `prisma.$transaction`.
* **98 automated Vitest unit tests passing across 10 test suites.**
* TypeScript backend build verified successfully (`npm run build`).
* No Prisma schema modifications or migrations were required.

### Day 8 — Customer ↔ Project Association

* Customer ↔ Project association endpoints (`POST /api/v1/customers/:customerId/projects/:projectId`, `DELETE /api/v1/customers/:customerId/projects/:projectId`, `GET /api/v1/customers/:customerId/projects`).
* Uses existing Prisma implicit many-to-many relationship (`Customer.projects Project[]` / `Project.customers Customer[]`).
* Organization/tenant isolation: Both customer and project validated against `req.user.organizationId`. Cross-tenant requests return generic 404 (`CUSTOMER_NOT_FOUND` / `PROJECT_NOT_FOUND`).
* Server-side RBAC enforcement:
  * `OWNER`, `ADMIN`, `MANAGER`: Can link/unlink projects and customers and list customer project associations.
  * `MEMBER`: Denied access to customer-project operations (returns HTTP 403 `INSUFFICIENT_ROLE`).
* Transactional audit log actions (`CUSTOMER_PROJECT_LINKED`, `CUSTOMER_PROJECT_UNLINKED`) via `prisma.$transaction`.
* No database migration or Prisma schema change was required.

### Day 9 — Organization Audit Log Retrieval

* Read-only organization audit log retrieval endpoint (`GET /api/v1/audit-logs`).
* Server-side RBAC enforcement:
  * `OWNER`, `ADMIN`: Permitted to retrieve organization audit logs.
  * `MANAGER`, `MEMBER`: Denied access (returns HTTP 403 `INSUFFICIENT_ROLE`).
* Multi-tenant data isolation: All queries strictly scoped by `req.user.organizationId`. Client-supplied organization IDs are not accepted or used for tenant selection.
* Bounded server-side pagination: Default `page = 1`, default `limit = 20`, maximum `limit = 100`. Returns pagination metadata (`page`, `limit`, `total`, `totalPages`).
* Filtering & Ordering: Ordered newest first by `createdAt` (`createdAt DESC`). Supports optional filtering by `action` and `actorId` (combinable).
* Actor payload selection: Returns limited actor profile data (`id`, `name`, `email`).
* Input validation: Zod schema query validation returning HTTP 400 `VALIDATION_ERROR` for invalid parameters (e.g. non-positive page numbers, out-of-bound limits, non-UUID actor IDs).
* Codebase additions: `audit-log.service.ts`, `audit-log.routes.ts`, `audit-log.service.test.ts`, expanded RBAC test coverage, and router registration in `src/index.ts`.

### Day 10 — Subscription & Plan Entitlement Foundation

* Organization subscription retrieval endpoint (`GET /api/v1/subscription`).
* Server-side RBAC enforcement:
  * `OWNER`, `ADMIN`: Permitted to view organization subscription details and plan entitlements.
  * `MANAGER`, `MEMBER`: Denied access (returns HTTP 403 `INSUFFICIENT_ROLE`).
* Tenant isolation: Scoped strictly by `req.user.organizationId`. Client-supplied tenant IDs are not accepted or used for tenant selection.
* Plan entitlements (Free, Starter, Professional):
  * **Free** (₹0 / 0 paise): 3 seats, 2 projects, 1,000 API requests, Advanced Analytics: No.
  * **Starter** (₹499 / 49,900 paise): 10 seats, 20 projects, 10,000 API requests, Advanced Analytics: No.
  * **Professional** (₹999 / 99,900 paise): 50 seats, Unlimited projects (`null`), 100,000 API requests, Advanced Analytics: Yes.
* Safe subscription payload: Returns plan entitlement limits without exposing internal Stripe identifiers.
* **132 automated Vitest tests passing across 12 test suites.**
* TypeScript backend build verified cleanly (`npm run build`). No database schema changes or migrations required.

### Day 11 — API Usage Tracking & Limits

* Organization API usage retrieval endpoint (`GET /api/v1/usage`).
* Server-side RBAC enforcement: `OWNER` and `ADMIN` permitted; `MANAGER` and `MEMBER` denied (HTTP 403 `INSUFFICIENT_ROLE`).
* Tenant isolation: Derived strictly from `req.user.organizationId`. Client-supplied organization IDs are not accepted or used for tenant selection.
* Route middleware ordering: `authenticate → enforceApiUsageLimit → requireRole → handler`.
* Exclusions: `/health`, `/api/v1/auth/*`, `POST /api/v1/memberships/accept-invite`, and `GET /api/v1/usage` are excluded from API request counting.
* Usage tracking & limit enforcement: Tracked per organization using `UsageCounter`. Usage periods automatically roll over when `periodEnd` expires. Atomic conditional database updates (`apiRequests < apiRequestLimit`) enforce limit boundaries. Requests exceeding the limit return HTTP 429 (`API_USAGE_LIMIT_EXCEEDED`).
* **148 automated Vitest tests passing across 14 test suites.**
* Backend build (`npm run build`) and `git diff --check` verified cleanly. No database schema changes or migrations required.

### Day 12 — Stripe Test-Mode Billing Foundation

* **Stripe Test-Mode Integration**: Integrated official Stripe Node SDK (`stripe`) for test-mode checkout sessions and webhook processing.
* **Checkout Session Endpoint (`POST /api/v1/billing/checkout`)**:
  * Allows authenticated `OWNER` users to initiate test-mode Stripe Checkout sessions for paid plans (`Starter`, `Professional`). Pipeline: `authenticate → enforceApiUsageLimit → requireRole('OWNER')`.
  * Server resolves requested plan from `Plan` DB table and maps to configured Stripe price IDs (`STRIPE_STARTER_PRICE_ID`, `STRIPE_PROFESSIONAL_PRICE_ID`). Client-supplied prices/amounts are strictly ignored.
  * Free plan cannot be purchased via checkout (returns HTTP 400 `FREE_PLAN_CANNOT_BE_PURCHASED`).
  * Tenant isolation: `req.user.organizationId` used exclusively. Client-supplied organization IDs are not accepted or used for tenant selection.
  * Generates/reuses Stripe customer ID (`Subscription.stripeCustomerId`) stored on subscription record.
  * Attaches server metadata (`organizationId`, `planId`) to Checkout Session and subscription data.
* **Webhook Processing Endpoint (`POST /api/v1/billing/webhook`)**:
  * Unauthenticated endpoint using route-specific raw body parsing (`express.raw({ type: 'application/json' })`) for signature verification with `STRIPE_WEBHOOK_SECRET`. Excluded from JWT auth and API usage limits.
  * Handles events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`.
  * Maps Stripe statuses (`trialing`, `active`, `past_due`, `canceled`, `unpaid`, `incomplete`, `incomplete_expired`, `paused`) to Prisma `SubscriptionStatus` enum (`TRIALING`, `ACTIVE`, `PAST_DUE`, `CANCELLED`, `EXPIRED`). Unknown statuses fall back to `ACTIVE`.
  * Webhook updates FlowSuite `Subscription` fields (`planId`, `status`, `stripeCustomerId`, `stripeSubscriptionId`, `currentPeriodStart`, `currentPeriodEnd`). Validates metadata plan ID against `Plan` table during `customer.subscription.updated`, falling back to price ID mapping.
  * Webhook handling updates persisted subscription state and creates a `SUBSCRIPTION_PLAN_CHANGED` audit entry only when the persisted subscription plan actually changes.
  * Audit logging: Creates `SUBSCRIPTION_PLAN_CHANGED` audit records with `actorId: null` on subscription plan updates.
* **Environment Configuration**: Extended `server/src/config/env.ts` and `.env.example` with `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_STARTER_PRICE_ID`, and `STRIPE_PROFESSIONAL_PRICE_ID`.
* **Vitest Coverage**: Comprehensive unit tests added in `stripe.service.test.ts` and `billing.routes.test.ts`. **176 automated Vitest tests passing across 16 test suites.**
* **Build status**: Verified clean TypeScript compilation (`npm run build`). Pushed to `origin/main` (commit `321afea`). No Prisma schema changes or migrations required.

### Day 13 — Security Hardening

* **Failed-Login Rate Limiting**: Implemented Redis-backed failed-login tracking in `login-rate-limit.service.ts` integrated into `POST /api/v1/auth/login`. Failed login attempts are tracked per normalized email address with `MAX_FAILED_LOGIN_ATTEMPTS = 5` and a window of `FAILED_LOGIN_WINDOW_SECONDS = 900` (15 minutes). Requests exceeding the limit return HTTP 429 (`TOO_MANY_FAILED_LOGINS`). Successful login clears the counter. Redis connection failures fail open for availability and emit warnings.
* **Authentication Input Validation**: Login input is validated with Zod (`loginSchema`) prior to authentication processing, returning HTTP 400 `VALIDATION_ERROR` for malformed input.
* **Safe JSON Error Handling**: Authentication and billing route errors are handled with safe JSON responses, and the global Express error middleware provides a final safe fallback for unexpected errors without exposing internal error details (`{ "code": "INTERNAL_SERVER_ERROR", "message": "An unexpected error occurred" }`, HTTP 500). Validation errors in billing checkout return HTTP 400 `VALIDATION_ERROR` with structured `errors`.
* **Day 13 Milestone**: Verified with 190 tests passing across 18 test suites.

### Day 14 — Coverage Hardening

* **Coverage Instrumentation**: Configured `@vitest/coverage-v8` for backend coverage tracking (`coverage/` ignored in `.gitignore`).
* **Authentication Middleware Coverage**: Added dedicated unit test suite in `server/src/middleware/__tests__/auth.middleware.test.ts` covering missing Authorization header, non-Bearer headers, valid Bearer tokens, invalid tokens, and expired tokens.
* **Coverage Results**: Reached 89.30% Statements, 75.57% Branches, 93.97% Functions, and 89.30% Lines across the backend codebase, exceeding the PRD requirement of >=70%.
* **Day 14 Milestone**: Verified with 194 tests passing across 19 test suites.

### Day 15 — Final Testing, Tenant Isolation & Continuous Integration

* **Tenant-Isolation Integration Test**: Implemented `server/src/services/__tests__/integration/project.tenant-isolation.integration.test.ts`. Creates two separate organizations in PostgreSQL, creates a project under Organization A, queries `getProjectById` using Organization B's ID, asserts rejection with `Project not found`, and cleans up test data in `afterAll`.
* **GitHub Actions CI Pipeline**: Configured `.github/workflows/ci.yml` running on `push` and `pull_request` targeting `main`. Runs on `ubuntu-latest` with Node.js 20 and a PostgreSQL 16 service container (`postgres:16-alpine`), executing `npm ci`, `npx prisma migrate deploy`, `npm test -- --run`, and `npm run build`. (Redis is not provisioned as a service container in CI; Redis-dependent tests mock Redis interactions).
* **Current Result**: **195 automated tests passing across 20 test files.** TypeScript production build (`npm run build`) passing cleanly.

> [!IMPORTANT]
> **Planned vs. Implemented Functionality:** Authentication, JWT, RBAC, organization membership, Project Management, Task Management, Customer Management, Customer-Project associations, Organization Audit Log retrieval, Subscription Entitlements, Usage Tracking/Limits, Stripe Test-Mode Billing Foundation, Security Hardening, Coverage Hardening, Tenant Isolation Integration Testing, and Continuous Integration are implemented and tested. Live Stripe payments, frontend billing UI, and final production deployment remain pending according to project scope.

## Tech Stack

* **Frontend**: React + Vite + TypeScript + Tailwind CSS
* **Backend**: Node.js + Express.js + TypeScript
* **Database & ORM**: PostgreSQL 16 + Prisma ORM
* **Cache**: Redis 7
* **Authentication**: JWT + bcrypt
* **Validation**: Zod
* **Testing**: Vitest
* **Infrastructure**: Docker & Docker Compose

## Repository Layout

```text
FlowSuite/

├── client/               # React + Vite + TypeScript + Tailwind CSS frontend
├── server/               # Node.js + Express + TypeScript + Prisma backend
├── docker-compose.yml    # Infrastructure containers (PostgreSQL & Redis)
├── .env.example          # Environment configuration template
├── ARCHITECTURE.md       # System architecture documentation
└── DATABASE.md           # Database strategy & migration guidelines
```

## Getting Started

### Prerequisites

* Node.js (v18+ or v20+)
* npm
* Docker & Docker Compose

### 1. Start Infrastructure

Start PostgreSQL and Redis services:

```bash
docker compose up -d
```

### 2. Configure Environment Variables

Copy `.env.example` to `server/.env`:

```bash
cp .env.example server/.env
```

### 3. Start Backend Server

```bash
cd server
npm install
npm run dev
```

The backend API will run on `http://localhost:5000`.

Test the health status at:

```text
http://localhost:5000/api/v1/health
```

### 4. Start Frontend Client

```bash
cd client
npm install
npm run dev
```

The client app will run on:

```text
http://localhost:5173
```

## API Endpoints

### Authentication

| Method | Endpoint                              | Purpose                                    |
| ------ | ------------------------------------- | ------------------------------------------ |
| POST   | `/api/v1/auth/register`               | Register a user and create an organization |
| POST   | `/api/v1/auth/login`                  | Authenticate an existing user              |
| GET    | `/api/v1/auth/me`                     | Retrieve the authenticated user context    |
| POST   | `/api/v1/auth/refresh`                | Generate a new access token                |
| POST   | `/api/v1/auth/logout`                 | End the authenticated session flow         |
| POST   | `/api/v1/auth/password-reset/request` | Request a password reset                   |
| POST   | `/api/v1/auth/password-reset`         | Reset the account password                 |

### Organization & Memberships

| Method | Endpoint                            | Permitted Roles             | Purpose                                      |
| ------ | ----------------------------------- | --------------------------- | -------------------------------------------- |
| GET    | `/api/v1/memberships`               | OWNER, ADMIN, MANAGER, MEMBER | List organization members                    |
| POST   | `/api/v1/memberships/invite`        | OWNER, ADMIN                | Generate member invitation token             |
| POST   | `/api/v1/memberships/accept-invite` | Public (Token-based)        | Accept invitation & create account/membership|
| PATCH  | `/api/v1/memberships/role`          | OWNER                       | Update member role                           |
| DELETE | `/api/v1/memberships/:membershipId` | OWNER                       | Remove member from organization              |

### Project Management

| Method | Endpoint                         | Permitted Roles             | Purpose                                      |
| ------ | -------------------------------- | --------------------------- | -------------------------------------------- |
| GET    | `/api/v1/projects`               | OWNER, ADMIN, MANAGER, MEMBER | List organization projects (MEMBER: Assigned-task projects only) |
| GET    | `/api/v1/projects/:projectId`    | OWNER, ADMIN, MANAGER, MEMBER | Get project details by ID (MEMBER: Assigned-task project only)   |
| POST   | `/api/v1/projects`               | OWNER, ADMIN, MANAGER       | Create a new project                         |
| PATCH  | `/api/v1/projects/:projectId`    | OWNER, ADMIN, MANAGER       | Update project name/description/status       |
| POST   | `/api/v1/projects/:projectId/archive` | OWNER, ADMIN, MANAGER | Archive a project                            |

### Task Management

| Method | Endpoint | Permitted Roles | Purpose |
| ------ | -------- | --------------- | ------- |
| GET | `/api/v1/tasks` | OWNER, ADMIN, MANAGER, MEMBER | List tasks (MEMBER: Assigned tasks only) |
| GET | `/api/v1/tasks/:taskId` | OWNER, ADMIN, MANAGER, MEMBER | Get task by ID (MEMBER: Assigned task only) |
| POST | `/api/v1/tasks` | OWNER, ADMIN, MANAGER | Create a new task |
| PATCH | `/api/v1/tasks/:taskId` | OWNER, ADMIN | Update arbitrary task fields |
| PATCH | `/api/v1/tasks/:taskId/status` | OWNER, ADMIN, MANAGER, MEMBER | Update task status (MEMBER: Assigned task only) |
| PATCH | `/api/v1/tasks/:taskId/assign` | OWNER, ADMIN, MANAGER | Assign or unassign task |

### Customer Management

| Method | Endpoint | Permitted Roles | Purpose |
| ------ | -------- | --------------- | ------- |
| GET | `/api/v1/customers` | OWNER, ADMIN, MANAGER | List organization customers |
| GET | `/api/v1/customers/:customerId` | OWNER, ADMIN, MANAGER | Get customer details by ID |
| POST | `/api/v1/customers` | OWNER, ADMIN, MANAGER | Create a new customer |
| PATCH | `/api/v1/customers/:customerId` | OWNER, ADMIN, MANAGER | Update customer details |
| DELETE | `/api/v1/customers/:customerId` | OWNER, ADMIN, MANAGER | Delete a customer |
| POST | `/api/v1/customers/:customerId/projects/:projectId` | OWNER, ADMIN, MANAGER | Link a project to a customer |
| DELETE | `/api/v1/customers/:customerId/projects/:projectId` | OWNER, ADMIN, MANAGER | Unlink a project from a customer |
| GET | `/api/v1/customers/:customerId/projects` | OWNER, ADMIN, MANAGER | List projects associated with a customer |

### Audit Log Management

| Method | Endpoint | Permitted Roles | Purpose |
| ------ | -------- | --------------- | ------- |
| GET | `/api/v1/audit-logs` | OWNER, ADMIN | Retrieve organization audit logs with pagination & filtering |

### Billing & Subscriptions

| Method | Endpoint | Permitted Roles | Purpose |
| ------ | -------- | --------------- | ------- |
| GET | `/api/v1/subscription` | OWNER, ADMIN | Retrieve organization subscription details & plan entitlements |
| GET | `/api/v1/subscription/plans` | OWNER, ADMIN | Retrieve available subscription plans catalog |
| GET | `/api/v1/usage` | OWNER, ADMIN | Retrieve organization API request usage and limit status |
| POST | `/api/v1/billing/checkout` | OWNER | Create Stripe test-mode Checkout Session for plan upgrade |
| POST | `/api/v1/billing/webhook` | Public (Stripe Signature) | Receive and process Stripe test-mode webhook events |

## Testing

The backend uses Vitest for automated service-level testing.

Run the complete test suite:

```bash
npm test
```

Build the backend:

```bash
npm run build
```

Current test coverage includes:

* Access-token generation and verification.
* Refresh-token generation and verification.
* Registration & organization creation.
* Login & password reset.
* Organization membership & single-use invitation token flows.
* Server-side RBAC middleware permission enforcement across roles (`OWNER`, `ADMIN`, `MANAGER`, `MEMBER`).
* Project CRUD operations (create, read/list, get by ID, update, archive).
* Project RBAC permissions & Member project visibility scoping.
* Task CRUD operations (create, read/list, get by ID, update, assign, update status).
* Task RBAC permissions & Member task visibility scoping directly in Prisma queries.
* Customer CRUD operations (create, read/list, get by ID, update, delete).
* Customer RBAC permissions (`OWNER`/`ADMIN`/`MANAGER` full CRUD; `MEMBER` total denial).
* Customer ↔ Project association (linking, unlinking, and listing customer projects).
* Organization audit log retrieval (pagination, action/actor filtering, and RBAC guards).
* Subscription entitlement retrieval & limit checking (seats, projects, API request limits, analytics).
* Subscription plans catalog retrieval (`GET /api/v1/subscription/plans`) and subscription route middleware chain testing (`subscription.routes.test.ts`).
* API usage tracking, billing period rollover, and API request limit enforcement.
* Stripe test-mode customer creation, checkout session generation, webhook handling, and audit logging.
* Redis-backed failed-login rate limiting and authentication input validation.
* Authentication middleware coverage (`auth.middleware.test.ts`) covering all header and token states.
* Database tenant-isolation integration coverage (`project.tenant-isolation.integration.test.ts`) asserting cross-tenant project query rejection.
* Multi-tenant isolation enforced across membership, project, task, customer, audit log, subscription, usage, and billing flows.

Note: The test suite consists of service-level unit tests, middleware tests, and route tests (with mocked Prisma, Redis, and Stripe SDKs), alongside an isolated PostgreSQL tenant-isolation integration test (`project.tenant-isolation.integration.test.ts`).

**Current result: 203 automated tests passing across 21 test files.**
**Build status: `npm run build` passing cleanly.**

## Database

FlowSuite uses PostgreSQL with Prisma ORM.

The database contains the following core entities:

* User
* Organization
* Membership
* Plan
* Subscription
* Project
* Task
* Customer
* UsageCounter
* AuditLog

Database migrations are managed through Prisma.

To check migration status:

```bash
npx prisma migrate status
```

To open Prisma Studio:

```bash
npx prisma studio
```

## Development Progress

### Week 1

#### Day 1 — Foundation

* Project repository initialized.
* Docker infrastructure configured.
* PostgreSQL and Redis connected.
* Backend and frontend foundations created.
* Health endpoint implemented.

#### Day 2 — Database

* Complete Prisma database schema implemented.
* Initial migration created and applied.
* Subscription plans seeded.

#### Day 3 — Authentication

* Registration & login implemented.
* JWT access and refresh tokens implemented.
* Password-reset flow implemented.
* 17 authentication tests passing.

#### Day 4 — Organization & RBAC

* Membership management implemented.
* Invitation & single-use token acceptance flow implemented.
* Server-side RBAC middleware implemented.
* Transactional audit logging implemented.
* 39 tests passing.

### Week 2

#### Day 5 — Project Management Foundation

* Project CRUD services & routes implemented.
* Project archive status management.
* Strict tenant isolation on project operations.
* RBAC guards: `OWNER`, `ADMIN`, `MANAGER` write/archive, `MEMBER` read-only.
* Transactional audit logs (`PROJECT_CREATED`, `PROJECT_UPDATED`, `PROJECT_ARCHIVED`).
* Zod schema validation for inputs and UUID path parameters.
* 55 automated tests passing.
* Backend build verified.

#### Day 6 — Task Management

* Task CRUD, status update, and task assignment services & routes implemented.
* Task and project multi-tenant isolation via `req.user.organizationId`.
* Member-specific task visibility (`assigneeId = userId`) enforced directly in Prisma queries.
* Member-specific project visibility based on assigned tasks (`tasks.some.assigneeId = userId`).
* Server-side RBAC enforcement (OWNER/ADMIN full update, MANAGER create/assign/status, MEMBER status-only on assigned tasks).
* Transactional audit logs (`TASK_CREATED`, `TASK_UPDATED`, `TASK_ASSIGNED`, `TASK_STATUS_UPDATED`).
* Comprehensive task service, RBAC middleware, and Member project visibility unit tests.
* 84 automated tests passing across 9 test suites.
* Backend build verified (`npm run build`).

#### Day 7 — Customer Management

* Customer CRUD services and endpoints (`/api/v1/customers`) implemented using the existing Day 2 `Customer` Prisma model.
* Customer tenant isolation enforced via `req.user.organizationId`. Cross-tenant queries return 404 (`CUSTOMER_NOT_FOUND`).
* Server-side RBAC enforcement (`OWNER`, `ADMIN`, `MANAGER` full CRUD; `MEMBER` denied all operations with 403 `INSUFFICIENT_ROLE`).
* Transactional audit logs (`CUSTOMER_CREATED`, `CUSTOMER_UPDATED`, `CUSTOMER_DELETED`).
* Zod validation for body inputs and customer ID route parameters.
* Comprehensive customer service and RBAC middleware unit tests.
* **98 automated tests passing across 10 test suites.**
* Backend build verified (`npm run build`).
* No schema changes or migrations required.

#### Day 8 — Customer ↔ Project Association

* Customer-Project association endpoints implemented (`/api/v1/customers/:customerId/projects/:projectId`, `/api/v1/customers/:customerId/projects`).
* Uses existing Day 2 implicit many-to-many database relationship (`Customer.projects <-> Project.customers`).
* Dual-entity organization/tenant isolation (both Customer and Project must belong to `organizationId`).
* RBAC guards: `OWNER`, `ADMIN`, `MANAGER` allowed, `MEMBER` denied with 403 `INSUFFICIENT_ROLE`.
* Transactional audit logs (`CUSTOMER_PROJECT_LINKED`, `CUSTOMER_PROJECT_UNLINKED`).
* Comprehensive service unit tests covering link, unlink, project listing, and cross-tenant rejections.
* No Prisma schema modifications or migrations required.

#### Day 9 — Organization Audit Log Retrieval

* Read-only organization audit-log API (`GET /api/v1/audit-logs`).
* Organization isolation strictly scoped to `req.user.organizationId`. Client-supplied tenant IDs are not accepted or used for tenant selection.
* Server-side RBAC: `OWNER` and `ADMIN` allowed; `MANAGER` and `MEMBER` denied (HTTP 403 `INSUFFICIENT_ROLE`).
* Bounded server-side pagination (`page`, `limit`, `total`, `totalPages`) with newest-first ordering (`createdAt: 'desc'`).
* Optional query filtering by `action` and `actorId` (combinable).
* Explicit actor profile payload selection (`id`, `name`, `email`).
* Zod query parameter validation (`400 VALIDATION_ERROR` on invalid params).
* Added `audit-log.service.ts`, `audit-log.routes.ts`, `audit-log.service.test.ts`, expanded RBAC test coverage, and router registration in `src/index.ts`.
* **114 automated tests passing across 11 test suites.**
* Backend build verified (`npm run build`).
* No schema changes or migrations required.

### Week 3 — Subscriptions, Usage Limits & Billing

#### Day 10 — Subscription & Plan Entitlement Foundation

* Organization subscription retrieval endpoint (`GET /api/v1/subscription`).
* Entitlement engine for seat limits, project limits, API request limits, and advanced analytics for Free, Starter, and Professional plans.
* Server-side RBAC: `OWNER` and `ADMIN` allowed; `MANAGER` and `MEMBER` denied (HTTP 403 `INSUFFICIENT_ROLE`).
* Tenant isolation strictly enforced via `req.user.organizationId`.
* **132 automated tests passing across 12 test suites.**
* Backend build verified (`npm run build`). No schema changes or migrations required.

#### Day 11 — API Usage Tracking & Limits

* Organization API usage retrieval endpoint (`GET /api/v1/usage`).
* Usage tracking and period rollover (`UsageCounter` model).
* Route middleware ordering: `authenticate → enforceApiUsageLimit → requireRole → handler`.
* Exclusions: `/health`, `/api/v1/auth/*`, `POST /api/v1/memberships/accept-invite`, and `GET /api/v1/usage`.
* Atomic conditional database updates (`apiRequests < apiRequestLimit`) enforcing limits; HTTP 429 (`API_USAGE_LIMIT_EXCEEDED`) returned when exhausted.
* **148 automated tests passing across 14 test suites.**
* Backend build verified (`npm run build`). No schema changes or migrations required.

#### Day 12 — Stripe Test-Mode Billing Foundation

* Stripe test-mode Checkout Session endpoint (`POST /api/v1/billing/checkout`) for `OWNER` role plan upgrades.
* Stripe Webhook processing endpoint (`POST /api/v1/billing/webhook`) with raw request body verification (`express.raw({ type: 'application/json' })`) and `STRIPE_WEBHOOK_SECRET` signature check.
* Handles `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`.
* Maps Stripe status strings to Prisma `SubscriptionStatus` enum (`TRIALING`, `ACTIVE`, `PAST_DUE`, `CANCELLED`, `EXPIRED`).
* Updates `Subscription` record fields (`planId`, `status`, `stripeCustomerId`, `stripeSubscriptionId`, `currentPeriodStart`, `currentPeriodEnd`). Validates metadata plan ID against `Plan` table during `customer.subscription.updated`, falling back to price ID mapping.
* Webhook handling updates persisted subscription state and creates a `SUBSCRIPTION_PLAN_CHANGED` audit entry only when the persisted subscription plan actually changes.
* **176 automated tests passing across 16 test suites.**
* Backend build verified (`npm run build`). Commit `321afea` pushed to `origin/main`. No schema changes or migrations required.

### Week 4 — Security, Coverage, Integration Testing & CI

#### Day 13 — Security Hardening & Rate Limiting

* Redis-backed failed-login tracking (`login-rate-limit.service.ts`) with per-email rate limiting (max 5 attempts per 15 mins; HTTP 429 response).
* Input validation for authentication requests using Zod.
* Global Express error middleware in `index.ts` returning safe JSON errors without stack traces.
* **190 automated tests passing across 18 test suites.**

#### Day 14 — Authentication Middleware Coverage Hardening

* Installed `@vitest/coverage-v8` instrumentation.
* Created `server/src/middleware/__tests__/auth.middleware.test.ts` to test all authentication states.
* Reached 89.30% backend statement/line coverage (exceeding PRD requirement of >=70%).
* **194 automated tests passing across 19 test suites.**

#### Day 15 — Tenant-Isolation Integration Testing, CI & Documentation

* Implemented PostgreSQL tenant-isolation integration test (`project.tenant-isolation.integration.test.ts`).
* Configured GitHub Actions CI pipeline (`.github/workflows/ci.yml`) with PostgreSQL 16 service container running migrations, Vitest suite, and TypeScript build.
* Reached **195 automated tests passing across 20 test files.**
* Deployment status: **Pending** (production deployment to be executed in upcoming phase).

### Week 4 — Frontend Implementation & Application Shell

#### Day 16 — Frontend Authentication & Dashboard

* Centralized typed frontend API client in `client/src/api/client.ts`.
* Centralized authentication context in `client/src/context/AuthContext.tsx`.
* JWT access and refresh token session persistence stored in client storage (`flowsuite_access_token`, `flowsuite_refresh_token`).
* Automatic session initialization upon application load via `GET /api/v1/auth/me`.
* User login (`/login`) and organization registration (`/register`) flows with client-side validation aligned with the existing backend validation rules.
* Protected client routing via `ProtectedRoute` guard redirecting unauthenticated users to `/login`.
* Authenticated application layout and navigation shell (`Layout`) featuring active route highlighting, organization/user badge, and logout action.
* Logout flow destroying stored JWT tokens and clearing application user state (`POST /api/v1/auth/logout`).
* Organization Dashboard implementation (`/`) fetching data from `GET /api/v1/subscription` and `GET /api/v1/usage`.
* Dashboard displays current plan name, subscription status, seat and project limits, API request usage progress bar, percentage used, and usage-period dates based on backend responses.
* Safe API error states with single-click retry action.
* **12 automated frontend tests passing across 4 test suites.**
* Frontend production build verified (`tsc && vite build`).
* Backend regression suite verified: **195 tests passing across 20 test suites** and backend build verified (`tsc`).
* Backend authentication, tenant isolation, and RBAC remain authoritative.
* Commit `3fc14ea` pushed to `origin/main`.

#### Day 17 — Frontend Projects & Tasks

* **Project Frontend Implementation (`/projects`)**:
  * Displays organization projects with status badges (`ACTIVE`, `ARCHIVED`), descriptions, and creation dates.
  * Project creation modal (`POST /api/v1/projects`).
  * Project update modal (`PATCH /api/v1/projects/:id`).
  * Project archiving action (`POST /api/v1/projects/:id/archive`).
  * Status filter tabs (`ALL`, `ACTIVE`, `ARCHIVED`).
  * Client-side validation for project name (required, max 100 chars) and description (max 500 chars).
  * Loading, empty, and safe error states with retry action.
* **Task Frontend Implementation (`/tasks`)**:
  * Task listing with project badge, task title, description, status, assignee, creation date, and due date when available.
  * Project and status filtering using backend query parameters (`projectId`, `status`).
  * Task creation modal (`POST /api/v1/tasks`).
  * Task editing modal (`PATCH /api/v1/tasks/:id`).
  * Inline status update dropdown (`PATCH /api/v1/tasks/:id/status`).
  * Inline task assignment/reassignment dropdown (`PATCH /api/v1/tasks/:id/assign`).
  * Client-side validation for project selection, task title (required, max 200 chars), and description (max 2000 chars).
  * Loading, empty, and safe error states.
* **Server-Side RBAC Reflected in UI**:
  * `OWNER`, `ADMIN`, `MANAGER`: Access project mutation controls and task creation/assignment controls.
  * `MEMBER`: Read-only project view according to backend permissions.
  * `OWNER`, `ADMIN`: Full task update controls.
  * `MANAGER`: Task creation, assignment, and status updates according to backend permissions.
  * `MEMBER`: Task status updates only for permitted assigned tasks.
  * Member task visibility remains strictly enforced by backend query filtering (`assigneeId = userId`), not merely by hiding UI elements.
* **Typed API Client Additions**: Added typed functions for Projects (`getProjectsApi`, `createProjectApi`, `updateProjectApi`, `archiveProjectApi`), Tasks (`getTasksApi`, `createTaskApi`, `updateTaskApi`, `updateTaskStatusApi`, `assignTaskApi`), and Memberships (`getMembersApi`) in `client/src/api/client.ts`.
* **Testing & Verification**:
  * **22 automated frontend tests passing across 6 test suites.**
  * **195 backend tests passing across 20 test suites.**
  * Frontend production build passing (`tsc && vite build`).
  * Backend production build passing (`tsc`).
  * `git diff --check` passed cleanly.
  * Commit `954895c` pushed to `origin/main`.
  * No new backend business logic was introduced during Day 17 frontend work.

#### Day 18 — Frontend Customers & Customer-Project Associations

* **Customers Frontend Implementation (`/customers`)**:
  * Customer directory listing customer name, email, and phone where available.
  * Customer creation modal (`POST /api/v1/customers`).
  * Customer update modal (`PATCH /api/v1/customers/:id`).
  * Customer deletion action (`DELETE /api/v1/customers/:id`).
  * Client-side validation with trimmed input, required name, email format check, and phone length check.
  * Loading, empty, and safe error states.
  * `MEMBER` Access Restriction: Displays a clear "Access Restricted" message when the backend returns `INSUFFICIENT_ROLE` (HTTP 403).
* **Customer–Project Association UI**:
  * Association modal displaying projects linked to a customer (`GET /api/v1/customers/:id/projects`).
  * Project link control (`POST /api/v1/customers/:id/projects/:projectId`).
  * Project unlink control (`DELETE /api/v1/customers/:id/projects/:projectId`).
  * Project selector dropdown uses existing `/api/v1/projects` endpoint, excluding already linked projects to prevent duplicate link attempts.
  * Backend remains authoritative for organization isolation and RBAC security boundaries.
* **Typed API Client Additions**: Added typed functions in `client/src/api/client.ts` for `getCustomersApi`, `createCustomerApi`, `updateCustomerApi`, `deleteCustomerApi`, `getCustomerProjectsApi`, `linkCustomerProjectApi`, and `unlinkCustomerProjectApi`.
* **Testing & Verification**:
  * **30 automated frontend tests passing across 7 test suites.**
  * **195 backend tests passing across 20 test suites.**
  * Frontend production build passing (`tsc && vite build`).
  * Backend production build passing (`tsc`).
  * `git diff --check` passed cleanly.
  * Commit `7caacf3` pushed to `origin/main`.

#### Day 19 — Audit Logs Frontend

* **Audit Logs Page (`/audit-logs`)**: Implemented functional read-only Audit Logs screen mounted under `ProtectedRoute` and `Layout` in `App.tsx`.
* **Data Retrieval**: Communicates with existing backend endpoint `GET /api/v1/audit-logs` via `getAuditLogsApi` in `client/src/api/client.ts`.
* **Pagination & Filtering**:
  * Bounded pagination (20 logs per page) driven by backend pagination metadata (`page`, `totalPages`, `total`).
  * Action dropdown filter (`action` query param) supporting system audit actions (`PROJECT_CREATED`, `TASK_CREATED`, `MEMBER_INVITED`, `CUSTOMER_CREATED`, etc.).
  * Actor dropdown filter (`actorId` query param) populated dynamically via `getMembersApi`.
  * Single-click "Clear Filters" action resetting pagination and filter criteria.
* **User Interface States**: Includes skeleton loader during fetch, empty state (`"No audit logs found."`), and safe error alert with a `"Retry"` button.
* **RBAC Enforcement**: `OWNER` and `ADMIN` roles view audit logs. `MANAGER` and `MEMBER` roles receive an "Access Restricted" alert banner when access is denied by role check or HTTP 403 `INSUFFICIENT_ROLE`.
* **Testing & Verification**:
  * **8 automated frontend tests passing** in `client/src/__tests__/AuditLogs.test.tsx` (pagination, filtering, empty state, API retry, and RBAC guards).

#### Day 20 — Subscription & Billing Frontend UI & Plan Catalog API

* **Billing Page (`/billing`)**: Replaced `PlaceholderModule` with functional `<Billing />` screen in `client/src/pages/Billing.tsx`.
* **Plan Catalog API (`GET /api/v1/subscription/plans`)**: Added read-only backend endpoint returning seeded subscription plans mapped to explicit public fields (`id`, `name`, `priceInPaise`, `seatLimit`, `projectLimit`, `apiRequestLimit`, `advancedAnalytics`) ordered by `priceInPaise ASC`. Internal DB fields (`stripePriceId`, `createdAt`, `updatedAt`) are stripped before returning.
* **Subscription & Usage Cards**:
  * Subscription Overview card rendering plan name, status badge (`ACTIVE`), price in INR (`formatCurrency`), billing cycle period dates, seat limit, project limit, API request limit, and analytics entitlement. Displays `'N/A'` placeholders when backend response fields are missing.
  * API Usage Overview card rendering consumed requests vs limit (`apiRequests / apiRequestLimit`), progress bar with color thresholds (green <80%, amber 80–95%, red ≥95%), percentage used, and period reset date.
* **Plan Selection & Checkout**:
  * Renders Free, Starter, and Professional plan cards driven strictly by `GET /api/v1/subscription/plans`.
  * Disables non-purchasable Free plans and marks active plan as "Current Plan".
  * Exposes "Upgrade to [Plan]" button for `OWNER` role, calling `POST /api/v1/billing/checkout` and redirecting user via `window.location.href = res.url`.
  * Disables upgrade buttons with title `"Upgrade (Owner Only)"` for `ADMIN` role.
  * Displays "Access Restricted" alert banner for `MANAGER`/`MEMBER` roles (or on HTTP 403 `INSUFFICIENT_ROLE`).
* **Catalog Failure & Return Handling**:
  * If `getPlansApi` fails or returns an empty array, renders a catalog error state (`"Subscription plans catalog is currently unavailable."`) with a `"Retry Loading Plans"` button. Checkout buttons with fabricated IDs are not rendered when catalog is unavailable.
  * Detects `session_id` query parameter on return from Stripe Checkout and displays neutral notice: *"You've returned from Stripe Checkout. Your subscription status will reflect the backend's verified update when checkout processing is complete."*
  * Includes `"Refresh Subscription"` button calling `fetchData(true)` to re-query `GET /api/v1/subscription` and `GET /api/v1/usage`.
* **Testing & Verification**:
  * **9 automated frontend tests passing** in `client/src/__tests__/Billing.test.tsx` (rendering, OWNER checkout redirect, ADMIN disabled buttons, MANAGER/MEMBER access restriction, neutral return notice, catalog error state, retry, N/A placeholders). Total frontend suite: **47 tests passing across 9 test files**.
  * **8 automated backend tests passing** in `server/src/routes/__tests__/subscription.routes.test.ts` (registered middleware chain `authenticate → enforceApiUsageLimit → requireRole('OWNER', 'ADMIN') → handler`, `priceInPaise ASC` ordering, explicit field projection, OWNER/ADMIN access, MEMBER rejection without DB access, and DB error handling). Total backend suite: **203 tests passing across 21 test files**.

#### Day 21 — Documentation Synchronization & PRD Gap Audit

* **Documentation Synchronization**: Updated `README.md`, `ARCHITECTURE.md`, and `DATABASE.md` to reflect full implementation through Day 20.
* **PRD Gap Audit**: Performed comprehensive audit comparing repository implementation against project documentation. Note: No standalone PRD file (`PRD.md`) was found in the repository directory; audit status reflects empirical verification against source code, endpoint contracts, schema models, and existing documentation.
* **Source Code & Test Verification**: Source code and automated test suites confirm implementation for authentication, multi-tenant isolation, project management, task management, customer management, customer-project associations, audit log retrieval, subscription entitlements, API request limit enforcement, Stripe test-mode billing foundation & webhook handling, security hardening (Redis login rate limiting), test coverage instrumentation (89.3% statement coverage), CI pipeline, and full frontend SPA modules (Login, Register, Dashboard, Projects, Tasks, Customers, Audit Logs, Billing). Final PRD acceptance review remains pending.
* **Identified Remaining Gaps**:
  * Cloud deployment to production hosting environments and deployed URL verification remain pending.
  * OpenAPI / Swagger formal API specification document generation remains a formal API-specification gap whose requirement status needs confirmation against the authoritative PRD.
  * Live Stripe production payment processing remains pending (test-mode integration complete).

## Project Scope

FlowSuite development follows the approved Product Requirements Document (PRD).

The implementation focuses only on the functionality defined in the PRD. Features outside the approved scope will not be added unless project requirements are formally modified.

## License

This project is developed as part of an academic/internship project.
