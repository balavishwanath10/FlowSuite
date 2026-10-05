# FlowSuite

## Product Vision

FlowSuite is a production-style B2B SaaS platform designed to provide organizations with isolated workspaces for managing teams, customers, projects, and tasks — backed by role-based access control (RBAC), subscription billing, a flexible feature-entitlement engine, usage limits, and audit logging.

## Current Status — Day 9 Organization Audit Log Retrieval

The repository currently contains the completed **Day 1 foundation, Day 2 database schema, Day 3 authentication, Day 4 organization membership & RBAC, Day 5 project management, Day 6 task management, Day 7 customer management, Day 8 customer ↔ project association, and Day 9 organization audit log retrieval**.

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

### Day 12 — Stripe Test-Mode Billing Foundation

* **Stripe Test-Mode Integration**: Integrated official Stripe Node SDK (`stripe`) for test-mode checkout sessions and webhook processing.
* **Checkout Session Endpoint (`POST /api/v1/billing/checkout`)**:
  * Allows authenticated `OWNER` users to initiate test-mode Stripe Checkout sessions for paid plans (`Starter`, `Professional`).
  * Server resolves requested plan from `Plan` DB table and maps to configured Stripe price IDs (`STRIPE_STARTER_PRICE_ID`, `STRIPE_PROFESSIONAL_PRICE_ID`). Client-supplied prices/amounts are strictly ignored.
  * Free plan cannot be purchased via checkout (returns HTTP 400 `FREE_PLAN_CANNOT_BE_PURCHASED`).
  * Tenant isolation: `req.user.organizationId` used exclusively. Client-supplied organization IDs are rejected/ignored.
  * Generates/reuses Stripe customer ID (`Subscription.stripeCustomerId`) stored on subscription record.
  * Attaches server metadata (`organizationId`, `planId`) to Checkout Session.
* **Webhook Processing Endpoint (`POST /api/v1/billing/webhook`)**:
  * Unauthenticated endpoint using route-specific raw body parsing (`express.raw({ type: 'application/json' })`) for signature verification with `STRIPE_WEBHOOK_SECRET`. Excluded from JWT auth and API usage limits.
  * Handles events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`.
  * Maps Stripe statuses (`trialing`, `active`, `past_due`, `canceled`, `unpaid`, `incomplete`) to Prisma `SubscriptionStatus` enum (`TRIALING`, `ACTIVE`, `PAST_DUE`, `CANCELLED`, `EXPIRED`).
  * Webhook updates FlowSuite `Subscription` fields (`planId`, `status`, `stripeCustomerId`, `stripeSubscriptionId`, `currentPeriodStart`, `currentPeriodEnd`).
  * Idempotent processing: Repeated webhook events do not corrupt subscriptions or produce duplicate plan-change audit logs.
  * Audit logging: Creates `SUBSCRIPTION_PLAN_CHANGED` audit records with `actorId: null` on subscription plan updates.
* **Environment Configuration**: Extended `server/src/config/env.ts` and `.env.example` with `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_STARTER_PRICE_ID`, and `STRIPE_PROFESSIONAL_PRICE_ID`.
* **Vitest Coverage**: Comprehensive unit tests added in `stripe.service.test.ts` and `billing.routes.test.ts`. **172 automated Vitest tests passing across 16 test suites.**
* **Build status**: Verified clean TypeScript compilation (`npm run build`). No Prisma schema changes or migrations required.

> [!IMPORTANT]
> **Planned vs. Implemented Functionality:** Authentication, JWT, RBAC, organization membership, Project Management, Task Management, Customer Management, Customer-Project associations, Organization Audit Log retrieval, Subscription Entitlements, Usage Tracking/Limits, and Stripe Test-Mode Billing Foundation are implemented and tested. Live Stripe payments and frontend billing UI are planned according to the FlowSuite PRD.

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
* Stripe test-mode customer creation, checkout session generation, webhook handling, and audit logging.
* Cross-tenant isolation verification across membership, project, task, customer, audit log, and billing domains.

Note: Current tests consist of service-level unit tests with mocked Prisma and Stripe SDK, alongside isolated middleware and route unit tests. No HTTP end-to-end integration tests or live PostgreSQL/Stripe integration tests are involved.

**Current result: 172 automated tests passing across 16 test suites.**
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

#### Upcoming Development

* **Week 3**: Subscriptions, Usage Limits & Billing.
* **Week 4**: Final Testing, Documentation & Deployment.

## Project Scope

FlowSuite development follows the approved Product Requirements Document (PRD).

The implementation focuses only on the functionality defined in the PRD. Features outside the approved scope will not be added unless project requirements are formally modified.

## License

This project is developed as part of an academic/internship project.
