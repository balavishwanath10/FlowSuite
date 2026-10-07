# FlowSuite Database Design & Migration Strategy

## Database Technology

FlowSuite uses PostgreSQL 16 as its relational database, with Prisma ORM used for database access and schema management.

## Database Schema

The database schema contains the core entities required by the FlowSuite PRD:

* **User** — stores user account information.
* **Organization** — represents a FlowSuite tenant/workspace.
* **Membership** — connects users with organizations and stores their roles.
* **Plan** — stores subscription plan limits and entitlements.
* **Subscription** — associates an organization with its current plan and subscription status.
* **Project** — stores organization-level projects.
* **Task** — stores tasks belonging to projects and optionally assigned to users.
* **Customer** — stores organization-level customer records and their project relationships.
* **UsageCounter** — tracks monthly API request usage for an organization.
* **AuditLog** — records important organization and account actions.

## Multi-Tenant Data Structure

Tenant-owned entities contain an `organizationId` relationship or derive it through parent relations (e.g. `Customer -> Organization`, `Task -> Project -> Organization`).

This structure supports strict organization-level data isolation. API queries always use the authenticated user's organization context when accessing tenant-owned data.

Cross-organization access is blocked through server-side query scoping and authorization middleware.

## Roles

The `Membership` model supports the four roles defined in the PRD:

* `OWNER`
* `ADMIN`
* `MANAGER`
* `MEMBER`

Server-side role authorization is enforced across organization endpoints, project management, task operations, and customer management.

## Customer Data Model & Relationships

### Customer Entity

The `Customer` model includes the following fields:

* `id` — UUID primary key.
* `organizationId` — foreign key referencing `Organization.id`.
* `name` — string customer name.
* `email` — optional string email address.
* `phone` — optional string phone number.
* `createdAt` / `updatedAt` — timestamps.

### Entity Relationships

* A **Customer** belongs to an **Organization** (`Customer.organizationId -> Organization.id`, cascade delete).
* A **Customer** may be associated with **Projects** (`Customer.projects <-> Project.customers` implicit many-to-many relationship).

`organizationId` serves as the explicit tenant isolation boundary for all `Customer` records.

### Query Isolation

All customer database queries enforce organization scoping:

```text
customer.id = requested customerId
AND
customer.organizationId = authenticated organizationId
```

This prevents cross-tenant customer retrieval, updates, or deletions. Attempts to query or mutate a customer belonging to another organization return a generic `CUSTOMER_NOT_FOUND` (404) response.

### AuditLog Integration

Customer mutations (`CUSTOMER_CREATED`, `CUSTOMER_UPDATED`, `CUSTOMER_DELETED`) and customer-project association mutations (`CUSTOMER_PROJECT_LINKED`, `CUSTOMER_PROJECT_UNLINKED`) execute within Prisma transactions (`prisma.$transaction`) to atomically write an entry to the `AuditLog` table with `organizationId` and `actorId`.

## AuditLog Data Model & Retrieval

### Entity Schema

The `AuditLog` model stores persistent organization audit records:
* `id` — UUID primary key.
* `organizationId` — foreign key referencing `Organization.id`.
* `actorId` — optional foreign key referencing `User.id`.
* `action` — string action descriptor.
* `entityType` / `entityId` / `metadata` — optional entity context and JSON payload.
* `createdAt` — timestamp.

### Query Isolation & Filtering (Day 9)

Audit log retrieval (`GET /api/v1/audit-logs`) is a read-only capability over the existing `AuditLog` model.

All audit log queries enforce explicit organization scoping:
```text
auditLog.organizationId = authenticated organizationId
```

Optional query filters supported:
* `action = requested action`
* `actorId = requested actorId`

Ordering: `createdAt DESC`.
Pagination: Implemented via Prisma `skip` and `take` based on validated `page` and `limit`.

Actor Payload Selection:
Audit log queries explicitly select non-sensitive actor fields:
* `actor.id`
* `actor.name`
* `actor.email`

## Stripe Billing Data Model Integration (Day 12)

### Subscription Entity Updates
Stripe billing uses the existing Day 2 `Subscription` model without requiring Prisma schema modifications or migrations.
Stripe webhook events update:
* `planId` — updated to the new plan ID upon completed checkout or subscription update.
* `status` — mapped from Stripe statuses (`trialing`, `active`, `past_due`, `canceled`, `unpaid`) to Prisma `SubscriptionStatus` (`TRIALING`, `ACTIVE`, `PAST_DUE`, `CANCELLED`, `EXPIRED`).
* `stripeCustomerId` — persistent Stripe customer ID (`cus_...`). Unique constraint.
* `stripeSubscriptionId` — persistent Stripe subscription ID (`sub_...`). Unique constraint.
* `currentPeriodStart` / `currentPeriodEnd` — billing period dates.

### AuditLog Integration for Webhooks
When a Stripe webhook event changes an organization's subscription plan, an audit log entry is created:
* `action` = `SUBSCRIPTION_PLAN_CHANGED`
* `entityType` = `Subscription`
* `entityId` = subscription ID
* `actorId` = `null` (webhook events are system actions triggered by Stripe without a JWT user context)
* `metadata` = `{ previousPlanId, newPlanId, stripeSubscriptionId }`

Idempotent checks ensure repeated webhook deliveries do not create duplicate audit log entries or corrupt subscription state.

## Task Data Model & Relationships

### Task Entity

The `Task` model includes the following fields:

* `id` — UUID primary key.
* `projectId` — foreign key referencing `Project.id`.
* `assigneeId` — optional foreign key referencing `User.id`.
* `title` — string task title.
* `description` — optional detailed task description.
* `status` — enum (`TODO`, `IN_PROGRESS`, `COMPLETED`), defaulting to `TODO`.
* `createdAt` / `updatedAt` — timestamps.

### Entity Relationships & Query Isolation

* A **Task** belongs to a **Project** (`Task.projectId -> Project.id`, cascade delete).
* A **Task** may be assigned to a **User** (`Task.assigneeId -> User.id`, set null on delete).
* A **Project** belongs to an **Organization** (`Project.organizationId -> Organization.id`).

Tenant isolation for `Task` records is derived through the `Project -> Organization` relation (`task.project.organizationId = authenticated organizationId`). For `MEMBER` users, queries enforce `task.assigneeId = authenticated userId`.

## Subscription Plans & States

The `Plan` model stores subscription limits in the database:
* Seat limits
* Project limits
* Monthly API request limits
* Advanced analytics entitlement

The three plans defined by the PRD are Free, Starter, and Professional.

The `Subscription` model supports states `TRIALING`, `ACTIVE`, `PAST_DUE`, `CANCELLED`, and `EXPIRED`, with Stripe integration identifiers.

## Database Relationships Summary

```text
Organization
├── Membership
├── Project
│   ├── Task
│   └── Customer
├── Customer
│   └── Project
├── Subscription
├── UsageCounter
└── AuditLog

User
├── Membership
├── Task assignments
└── AuditLog entries

Plan
└── Subscription
```

## Indexes and Constraints

Indexes defined in the Prisma schema include:

* `Organization`: primary key, unique constraints.
* `Membership`: `@@index([organizationId])`, `@@index([userId])`, `@@unique([organizationId, userId])`.
* `Project`: `@@index([organizationId])`, `@@index([organizationId, status])`.
* `Task`: `@@index([projectId])`, `@@index([assigneeId])`, `@@index([projectId, status])`.
* `Customer`: `@@index([organizationId])`, `@@index([organizationId, email])`.
* `Subscription`: `@@index([planId])`, `@@index([status])`, unique constraints on `organizationId`, `stripeCustomerId`, `stripeSubscriptionId`.
* `AuditLog`: `@@index([organizationId])`, `@@index([actorId])`, `@@index([organizationId, createdAt])`.
* `UsageCounter`: unique constraint on `organizationId`, `@@index([periodStart, periodEnd])`.

## Migration Status

* **Initial Migration**: `20261002043238_init` introduced all ten core models.
* **Day 7 Status**: Day 7 required **no database schema changes or migrations**, as the existing `Customer`, `Project`, `Organization`, and `AuditLog` models introduced in the Day 2 baseline fully satisfied all Day 7 PRD requirements.
* **Day 8 Status**: Day 8 required **no database schema changes or migrations**, as the existing implicit `Customer.projects <-> Project.customers` relationship introduced in the Day 2 baseline fully satisfied all Day 8 requirements.
* **Day 9 Status**: Day 9 required **no database schema changes or migrations**, as it provides a read/retrieval capability over the existing `AuditLog` model introduced in Day 2.
* **Day 10 Status**: Day 10 required **no database schema changes or migrations**, as the existing `Plan` and `Subscription` models introduced in the Day 2 baseline fully satisfied all entitlement retrieval requirements.
* **Day 11 Status**: Day 11 required **no database schema changes or migrations**, as the existing `UsageCounter` model introduced in the Day 2 baseline fully satisfied all usage tracking and limit enforcement requirements.
* **Day 12 Status**: Day 12 required **no database schema changes or migrations**, as the existing Stripe fields (`stripeCustomerId`, `stripeSubscriptionId`, `currentPeriodStart`, `currentPeriodEnd`) on `Subscription` introduced in the Day 2 baseline fully satisfied all test-mode billing foundation requirements.
* **Day 13 Status**: Day 13 required **no database schema changes or migrations**, as failed-login rate-limiting counter tracking uses Redis (`failed_login:<email>`) rather than PostgreSQL.
* **Day 14 Status**: Day 14 required **no database schema changes or migrations**, as backend coverage hardening added Vitest test suite coverage (`auth.middleware.test.ts`).
* **Day 15 Status**: Day 15 required **no database schema changes or migrations**, as the PostgreSQL tenant-isolation integration test (`project.tenant-isolation.integration.test.ts`) operates over the existing `Organization` and `Project` models, cleaning up created test entities in `afterAll`.
* **Day 16 Status**: Day 16 required **no database schema changes or migrations**, as frontend-only authentication and organization dashboard work consumes existing backend authentication, `Subscription`, and `UsageCounter` endpoints.
* **Day 17 Status**: Day 17 required **no database schema changes or migrations**, as frontend-only Projects and Tasks work consumes existing `Project`, `Task`, `Membership`, and `Organization` relationships.
* **Day 18 Status**: Day 18 required **no database schema changes or migrations**, as frontend-only Customers and Customer-Project association work consumes existing `Customer`, `Project`, `Organization`, and implicit `Customer.projects <-> Project.customers` relationships.

### Summary of Days 16–18 Database Changes
- **No new tables** were created.
- **No new columns** were added.
- **No new indexes** were created.
- **No new constraints** were introduced.
- **No database migrations** were created or applied.
