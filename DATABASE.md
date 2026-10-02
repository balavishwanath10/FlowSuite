# FlowSuite Database Design & Migration Strategy

## Database Technology

FlowSuite uses PostgreSQL 16 as its relational database, with Prisma ORM used for database access and schema management.

## Database Schema

The database schema introduces the core entities required by the FlowSuite PRD:

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

Tenant-owned entities contain an `organizationId` relationship where required.

This structure is designed to support strict organization-level data isolation. Future API queries must always use the authenticated user's organization context when accessing tenant-owned data.

Cross-organization access must not be possible through either the frontend or direct API requests.

## Roles

The `Membership` model supports the four roles defined in the PRD:

* Owner
* Admin
* Manager
* Member

Role-based authorization will be implemented in the backend during the authentication and RBAC development phase.

## Subscription Plans

The `Plan` model stores subscription limits in the database instead of hard-coding them in application logic.

The schema supports:

* Seat limits
* Project limits
* Monthly API request limits
* Advanced analytics entitlement

The three plans defined by the PRD are:

* Free
* Starter
* Professional

The actual plan records and entitlement enforcement will be implemented during the billing and subscription phase.

## Subscription States

The `Subscription` model supports the following states:

* TRIALING
* ACTIVE
* PAST_DUE
* CANCELLED
* EXPIRED

Stripe identifiers are included in the schema to support the PRD's future Stripe test-mode integration.

## Database Relationships

The main relationships are structured as follows:

```text
Organization
├── Membership
├── Project
│   ├── Task
│   └── Customer
├── Customer
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

Indexes have been added to commonly queried fields such as:

* Organization IDs
* User IDs
* Project status
* Task status
* Subscription status
* Audit log timestamps
* Usage periods

Unique constraints are also used where required, including:

* User email
* Organization membership per user
* One subscription per organization
* One usage counter per organization

These constraints help maintain data consistency and support efficient database queries.

## Migration Workflow

All database schema changes are managed through Prisma migrations.

The development workflow is:

```bash
npx prisma migrate dev --name <migration_name>
```

Generated migration files are committed to Git so that database changes remain version-controlled.

Direct schema updates using `prisma db push` are not used as the project's migration workflow.



The initial application schema was introduced through:

```text
20261002043238_init
```

The migration was successfully created and applied to the PostgreSQL database.

The database was verified through Prisma Studio, where all ten core models were confirmed to be available.

## Current Status

The FlowSuite database foundation is implemented and synchronized with the Prisma schema.

Authentication, RBAC enforcement, API endpoints, business logic, billing integration, and frontend application features remain planned for subsequent development phases.
