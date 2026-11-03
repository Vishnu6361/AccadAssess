# AcadAssess (SmartFA) — MCA Major Project Demonstration & Packaging Guide

**Project Title:** Web-Based Institutional Formative Assessment and Evaluation System (AcadAssess)  
**Academic Degree:** Master of Computer Applications (MCA)  
**Architecture Version:** v2.0 (Authoritative Supabase + Trusted Express API + React Vite Client)  
**Security Baseline:** Zero Remote Writes Without Approval / Hardened RBAC / Immutable Frozen Rubrics  

---

## 1. System Architecture & Component Mapping

```
                                      +---------------------------------------------+
                                      |             AUTHENTICATION & CLIENT         |
                                      |          React 18 + TypeScript + Vite       |
                                      |     (Academic Beige/Green Calm UI Design)   |
                                      +----------------------+----------------------+
                                                             |
                                           Authorization Bearer JWT (Supabase / Dev HMAC)
                                                             v
                                      +---------------------------------------------+
                                      |               TRUSTED API GATEWAY           |
                                      |              Node.js 20+ / Express          |
                                      |    - Authenticate JWT & Resolve Context     |
                                      |    - Role-Based Access Control (RBAC)       |
                                      |    - Zod DTO Validation (Zero Client Trust) |
                                      |    - Server-Side Rubric Total Computation   |
                                      |    - Transactional Results Publication      |
                                      |    - Immutable Append-Only Audit Logging    |
                                      +----------------------+----------------------+
                                                             |
                               +-----------------------------+-----------------------------+
                               |                                                           |
                               v                                                           v
+-----------------------------------------------+       +-----------------------------------------------+
|         DATABASE & REPOSITORY LAYER           |       |              STORAGE LAYER                    |
|   Supabase PostgreSQL / In-Memory Mock        |       |        Private Encrypted Bucket               |
|   - Multi-role users, classes, subjects       |       |        (submissions-private)                  |
|   - Question & frozen rubric versions         |       |   - Scoped path:                              |
|   - Submissions & versioned revisions         |       |     assessments/:aId/questions/:qId/          |
|   - Evaluation criteria marks & levels        |       |     students/:sId/submissions/:subId/vN.pdf   |
|   - Result publications log                   |       |   - 5 MB file size limit                      |
|   - Append-only audit events table            |       |   - Magic-byte verification (%PDF-1.4)        |
+-----------------------------------------------+       +-----------------------------------------------+
```

---

## 2. Core Functional Modules & Role Capabilities

| Role | Authoritative Identity | Verified Core Responsibilities |
| :--- | :--- | :--- |
| **HOD (Institutional Admin)** | `hod@smartfa.edu` (`Dr. Rajesh Sharma`) | Creates departments, academic terms, classes, subjects; allocates subject teachers; enrolls students; oversees department assessments, evaluations, and immutable audit logs. |
| **Subject Teacher (Faculty)** | `teacher1@smartfa.edu` (`Prof. Priya Menon`) | Authors formative assessments for assigned classes; configures questions and balanced multi-criterion rubrics; freezes rubrics upon publication; scores student answer PDFs; publishes official results. |
| **Student** | `student.a@smartfa.edu` (`Aarav Patel`) | Views published formative assessments; uploads authentic PDF submissions with SHA-256 fingerprinting; submits revisions before deadline (v2 supersedes v1); views published evaluations and rubric breakdown. |
| **Student (Cross-Student)** | `student.b@smartfa.edu` (`Bhavna Reddy`) | Demonstrates strict tenant and data isolation: cannot view Student A's submissions, drafts, or individual evaluation breakdown. |
| **Proctor** | `proctor@smartfa.edu` (`Dr. Suma Rao`) | Read-only proctorial oversight for assigned student cohorts; strictly blocked from authoring assessments or tampering with grades. |

---

## 3. Five-Minute Evaluator Demonstration Script

Follow this step-by-step walkthrough to demonstrate the complete academic workflow to examiners or project evaluators.

### Preparation
1. Start the Trusted Node.js API:
   ```bash
   npm run dev:api
   # Runs on http://localhost:4000
   ```
2. In a separate terminal, start the React Web Frontend:
   ```bash
   npm run dev:web
   # Runs on http://localhost:3000
   ```
3. Open `http://localhost:3000` in Google Chrome or Microsoft Edge.

---

### Step 1: Institutional Administration & Setup (HOD) — 1 Minute
1. On the Sign In page, click **"HOD Admin"** (or enter `hod@smartfa.edu`).
2. Point out the **Workspace Scope** in the header indicating verified `HOD` role.
3. Click **"Academic Structure"** in the sidebar:
   - View Departments (`MCA`), Academic Terms, and Classes.
   - Point out that all allocations link Department $\rightarrow$ Term $\rightarrow$ Class $\rightarrow$ Subject Teacher.
4. Click **"User Directory & Roles"**:
   - Show the roster of faculty, students, and proctors with verified active status and assigned role scopes.
5. Click **"Audit Records"**:
   - Point out the append-only audit trail logging all institutional actions with actor timestamps.
6. Click **"Sign Out"** in the top navigation bar.

---

### Step 2: Assessment Authoring & Rubric Freezing (Faculty Teacher) — 1.5 Minutes
1. On the Sign In page, click **"Faculty Teacher"** (logs in as `Prof. Priya Menon`).
2. Point out that the workspace automatically transitions to **"Faculty Workspace"** and administrative HOD tabs disappear.
3. Click **"Formative Assessments"**:
   - Click **"+ Create Assessment"**.
   - Select Class/Subject: `Advanced Database Systems` or `MCA-IV`.
   - Title: `Formative Assessment 1: Microservices Architecture`.
   - Set deadline in the future and save draft.
4. Select the newly created assessment:
   - Click **"+ Add Question"**: Prompt = *"Design and explain a resilient event-driven microservices pattern."*, Max Marks = `20`.
   - Click **"Configure Rubric"**:
     - Criterion 1: `Architectural Correctness & Decomposition` (Max Marks: `12`).
     - Criterion 2: `Data Consistency & Resiliency` (Max Marks: `8`).
     - Point out the achievement levels (`Exemplary`, `Proficient`, `Developing`, `Unacceptable`).
5. Click **"Publish Assessment"**:
   - Confirm publication dialog.
   - Point out the status badge changes to **"Published"** and the rubric criteria are now permanently **frozen** to prevent unfair mid-assessment changes.
6. Click **"Sign Out"**.

---

### Step 3: Student Answer Submission & Versioning (Student) — 1 Minute
1. On the Sign In page, click **"Student (Aarav)"** (logs in as `Aarav Patel`).
2. Notice the student sees **"My Assessments"**, **"My Submissions"**, and **"Published Results"**.
3. Under **"My Assessments"**, open the published `Formative Assessment 1`.
4. Upload an answer PDF (any standard `.pdf` document under 5 MB):
   - Notice the client verifies file size, genuine PDF magic bytes (`%PDF-`), and generates a SHA-256 digest receipt.
5. Point out the submission version is recorded as **Version 1 (Active)**.
6. Upload an updated revision:
   - Notice that **Version 2** becomes the active version, and Version 1 is marked as **Superseded**.
7. Click **"Published Results"**:
   - Point out that **zero results** are visible because results have not yet been published by faculty (Strict Premature Grade Leakage Prevention).
8. Click **"Sign Out"**.

---

### Step 4: Rubric Evaluation & Results Publication (Faculty Teacher) — 1 Minute
1. Sign in as **"Faculty Teacher"** (`teacher1@smartfa.edu`).
2. Navigate to **"Rubric Evaluations"**:
   - Select `Formative Assessment 1`.
   - Click **"Grade Submission"** for Aarav Patel.
3. Demonstrate Rubric Scoring:
   - Select achievement levels for Criterion 1 (e.g. 11/12) and Criterion 2 (e.g. 7/8).
   - Show that entering a negative score or exceeding criterion max marks is blocked with live validation.
   - Add faculty qualitative feedback: *"Exceptional service boundary separation and clear saga pattern."*
   - Save as **"Completed"** (Total: `18/20`).
4. Click **"Publish Assessment Results"**:
   - Enter remarks: *"Official Formative Assessment 1 results approved."*
   - Confirm publication. Status transitions to **"Results Published"**.
5. Click **"Sign Out"**.

---

### Step 5: Official Result Review & Cross-Student Privacy (Student) — 30 Seconds
1. Sign in as **"Student (Aarav)"** (`student.a@smartfa.edu`).
2. Click **"Published Results"**:
   - Point out the published result card now displays:
     - Total Score: **18 / 20** (90%)
     - Official publication timestamp and instructor feedback.
     - Criterion-level rubric breakdown (Criterion 1: 11/12, Criterion 2: 7/8).
3. Sign out and sign in as **"Student B (Bhavna)"** (`student.b@smartfa.edu`):
   - View **"Published Results"**: Bhavna has 0 published results and cannot view Aarav's evaluation.
   - Demonstrates strict institutional data isolation and cross-student privacy.

---

## 4. Security & Cryptographic Invariants Enforced

1. **Server-Side Authorization & Zero Client Trust**:
   - Client role claims in JWT payloads or headers are ignored. Role context is retrieved authoritatively from database records (`loadUserContext`).
2. **PDF Magic Bytes & Strict File Constraints**:
   - Only genuine PDF files starting with magic bytes `%PDF-` are accepted. Size is strictly capped at 5 MB (5,242,880 bytes).
3. **Cryptographic Integrity & Tamper-Evident Fingerprinting**:
   - Every uploaded submission version computes a SHA-256 hash stored in the database and echoed in the signed receipt.
4. **Append-Only Revision History**:
   - Resubmissions create a new `submission_versions` record with incremented version numbers; older versions are flagged with `superseded_at` timestamps rather than deleted.
5. **Rubric Invariant & Lifecycle Locking**:
   - An assessment cannot be published unless rubric criterion weights sum exactly to the question max marks. Once published, rubric criteria and assessment point values cannot be modified.
6. **Premature Grade Leakage Prevention**:
   - Unreleased draft and completed grades return HTTP 403 `RESULTS_NOT_PUBLISHED` to students until the teacher publishes the official assessment results.
7. **Immutable Audit Trail**:
   - All critical actions (`CREATE_DEPARTMENT`, `ASSIGN_CLASS_SUBJECT`, `CREATE_ASSESSMENT`, `PUBLISH_ASSESSMENT`, `SUBMIT_ANSWER`, `COMPLETE_EVALUATION`, `PUBLISH_ASSESSMENT_RESULTS`) generate immutable records in `audit_events`.

---

## 5. Verification Commands & Test Results

Run all test suites locally to prove system correctness:

```bash
# 1. Complete Phase 6 End-to-End Academic Workflow Integration (75 Tests)
npx tsx tests/security/phase6_e2e_integration_verification.ts

# 2. Phase 5 Faculty Rubric Grading & Results Publication (30 Tests)
npx tsx tests/security/phase5_evaluation_results_verification.ts

# 3. Phase 4 Student Submission & Private PDF Storage (19 Tests)
npx tsx tests/security/phase4_submission_storage_verification.ts

# 4. Phase 3 Assessment Authoring & Rubric Freezing (21 Tests)
npx tsx tests/security/phase3_assessment_rubric_verification.ts

# 5. Phase 2 Role-Based Access Control & Invariants (14 Tests)
npx tsx tests/security/phase2_rbac_verification.ts

# 6. Staging Provisioning Safety & Recovery Review (37 Tests)
npx tsx tests/security/staging_provisioning_safety_verification.ts

# 7. Monorepo Build across all workspaces (@smartfa/contracts, @smartfa/api, @smartfa/web)
npm run build
```

**Overall Verification Status:** **196 / 196 Automated Tests Passed** (100% Passing, Code 0).

---

## 6. Known Limitations & Deferred Capabilities

1. **Local Demonstration vs Remote Live Supabase**:
   - The local demo environment runs with synthetic in-memory fixtures (`IN_MEMORY_MOCK` mode) to guarantee safety without writing mock records to remote hosted databases.
   - The live Supabase connection has been statically verified and pre-flight tested (HTTP 200 read-only check to `rdfloxppwlbocxplbixu`), while live remote provisioning remains unexecuted pending final institutional administrator authorization.
2. **Deferred Advanced Features**:
   - **Handwritten OCR / TrOCR**: Handwritten character recognition is intentionally deferred in accordance with project constraints, prioritizing core institutional grading workflows and evidence retention.
