# SmartFA Supabase Database & Migration Architecture

This directory contains the authoritative schema history, seed data, and SQL test suites for SmartFA.

## Authoritative Rules
1. **Single Source of Truth:** SQL files in `supabase/migrations/` define all PostgreSQL tables, constraints, foreign keys, triggers, indexes, and Row-Level Security (RLS) policies.
2. **No Competing Migration Systems:** Prisma or other ORMs are used solely for typed queries via database introspection (`prisma db pull`), never for generating competing migration histories.
3. **Additive & Reversible:** Production migrations are additive and reviewed. Applied migrations must never be edited in-place.
4. **Row-Level Security (RLS):** Every exposed table in the `public` schema has RLS enabled with explicit ownership and institutional-scope predicates (never `TO authenticated` alone).

## Local Development Workflow (Supabase CLI)
To run Supabase locally with Docker:

```bash
# 1. Initialize Supabase configuration (if not already present)
supabase init

# 2. Start local Supabase stack (PostgreSQL, Auth, Storage, Studio)
supabase start

# 3. Create a new migration file
supabase migration new <migration_name>

# 4. Apply migrations and seed data
supabase db reset

# 5. Run pgTAP / database tests
supabase test db
```

## Directory Structure
- `migrations/`: Sequential SQL migration files (e.g. `20261012000000_init_academic_schema.sql`).
- `tests/`: Database constraint and RLS authorization test scripts.
- `seed.sql`: Synthetic institutional test fixtures (institutions, terms, classes, synthetic students and staff).
