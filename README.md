# SmartFA

**Web-Based Institutional Formative Assessment, Evaluation and Internal Answer Similarity Review System**

MCA Major Project — Authoritative Supabase Architecture (v2.0)

---

## 1. Architecture Overview

- **Frontend (`apps/web`)**: React 18, TypeScript, Vite, Tailwind CSS. Academic Beige and Green design system with strict accessibility controls.
- **Trusted API (`apps/api`)**: Node.js, Express, TypeScript, Zod request contracts, Supabase JWT verification, and audited transactions.
- **Processing Worker (`services/processor`)**: Python 3, FastAPI, PDF/image processing, replaceable HTR/OCR adapter, and scikit-learn internal pairwise similarity engine.
- **Database & Storage (`supabase/`)**: Supabase PostgreSQL with version-controlled migrations, Row-Level Security (RLS) on all exposed tables, and private bucket `submissions-private` (5 MB PDF limit).

---

## 2. Quick Start Guide

### Prerequisites
- Node.js >= 20.x (tested on v24.x)
- Python >= 3.10 (tested on v3.14.x)
- Git

### Installation

1. **Install Node.js Dependencies (Monorepo root):**
   ```bash
   npm install
   ```

2. **Install Python Processing Worker Dependencies:**
   ```bash
   cd services/processor
   python -m venv venv
   # Windows:
   .\venv\Scripts\activate
   # Linux/macOS:
   source venv/bin/activate
   pip install -r requirements.txt
   ```

---

## 3. Running Services Locally

Each service can be run independently or simultaneously during development:

### A. Run Frontend (Web Client)
```bash
# From repository root:
npm run dev:web
# Or inside apps/web:
npm run dev
# URL: http://localhost:3000
```

### B. Run Trusted Node.js API
```bash
# From repository root:
npm run dev:api
# Or inside apps/api:
npm run dev
# URL: http://localhost:4000
# Health check: http://localhost:4000/health
```

### C. Run Python Processing Worker
```bash
cd services/processor
# Activate virtual environment if configured:
.\venv\Scripts\activate
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
# URL: http://localhost:8000
# Health check: http://localhost:8000/health
```

---

## 4. Environment Variables

Copy `.env.example` to `.env` in respective projects.

| Variable | Target | Nature | Description |
| :--- | :--- | :--- | :--- |
| `VITE_SUPABASE_URL` | `apps/web` | Public | Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | `apps/web` | Public | Supabase anonymous public key |
| `VITE_API_BASE_URL` | `apps/web` | Public | Node.js API base endpoint |
| `PORT` | `apps/api` | Server | Express HTTP listening port (default: 4000) |
| `SUPABASE_URL` | `apps/api` | Server | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | `apps/api` | **Secret** | Supabase service role key (Never expose to client) |
| `DATABASE_URL` | `apps/api` | **Secret** | Direct PostgreSQL connection string |
| `JWT_ISSUER` | `apps/api` | Server | Supabase JWT issuer URL for token verification |
| `PROCESSOR_BASE_URL` | `apps/api` | Server | URL of the Python processing worker (default: http://localhost:8000) |
| `PROCESSOR_SHARED_SECRET` | `apps/api`, `services/processor` | **Secret** | Internal HMAC/Bearer secret shared between API and Worker |
| `PROCESSOR_PORT` | `services/processor` | Worker | Python worker port (default: 8000) |
| `HTR_PROVIDER` | `services/processor` | Worker | OCR adapter engine (`mock`, `trocr`, `google-cloud-vision`) |

For Supabase Dashboard URL configuration and redirect allowlist settings, see **[Supabase Auth Configuration Guide](docs/SUPABASE_AUTH_CONFIGURATION.md)**.

---

## 5. Local Demonstration & Test Accounts

The application includes seeded development identities and a 1-click Quick-Login bar for evaluation demonstrations:

| Role | Email | Purpose in Demonstration |
| :--- | :--- | :--- |
| **HOD Admin** | `hod@smartfa.edu` | Academic structure (Dept/Term/Class/Subject), teacher allocations, audit trail. |
| **Faculty Teacher** | `teacher1@smartfa.edu` | Authors assessments, configures & freezes rubrics, grades submissions, publishes results. |
| **Student (Aarav)** | `student.a@smartfa.edu` | Uploads answer PDFs, views version history with SHA-256 digests, views published results. |
| **Student (Bhavna)** | `student.b@smartfa.edu` | Proves data isolation and cross-student privacy (cannot access Aarav's evaluation). |

For a complete five-minute step-by-step evaluator script, see **[MCA Major Project Demo Guide](docs/MCA_MAJOR_PROJECT_DEMO.md)**.

---

## 6. Verification Test Suites

Run the automated integration and security test suites:

```bash
# Phase 6: Complete End-to-End Academic Lifecycle (75 Tests)
npx tsx tests/security/phase6_e2e_integration_verification.ts

# Phase 5: Faculty Evaluation & Results Publication (30 Tests)
npx tsx tests/security/phase5_evaluation_results_verification.ts

# Phase 4: Student Submission & Storage Verification (19 Tests)
npx tsx tests/security/phase4_submission_storage_verification.ts

# Phase 3: Assessment Authoring & Rubric Freezing (21 Tests)
npx tsx tests/security/phase3_assessment_rubric_verification.ts

# Phase 2: Role-Based Access Control (14 Tests)
npx tsx tests/security/phase2_rbac_verification.ts

# Staging Provisioning Safety & Recovery Verification (37 Tests)
npx tsx tests/security/staging_provisioning_safety_verification.ts

# Monorepo Build across all packages
npm run build
```

**Total Verification Status:** **196 / 196 Automated Tests Passing** (100% Pass Rate).
