# Supabase Authentication & Redirect URL Configuration Guide

## Overview

AcadAssess uses Supabase Auth for institutional authentication, secure password-recovery sessions, and cryptographic JWT issuance.
This document outlines the authoritative URL redirect configuration required in the Supabase Dashboard to prevent URL fragment conflicts and ensure seamless password resets.

---

## 1. Supabase Dashboard URL Configuration

In the [Supabase Dashboard](https://supabase.com/dashboard/project/rdfloxppwlbocxplbixu/auth/url-configuration) under **Authentication** &rarr; **URL Configuration**:

### A. Site URL (Default)
Set the primary Site URL to your active application root:

- **Local Development:** `http://localhost:5173` (or `http://localhost:3000`)
- **Production/Staging:** `https://your-domain.edu`

### B. Additional Redirect URLs (Redirect Allow List)
Add the following dedicated paths to the **Redirect URLs** list:

```text
http://localhost:5173/**
http://localhost:5173/reset-password
http://localhost:5173/student/login
http://localhost:5173/faculty/login
http://localhost:3000/**
http://localhost:3000/reset-password
http://localhost:3000/student/login
http://localhost:3000/faculty/login
```

> [!IMPORTANT]
> **Why `/reset-password` instead of `/#reset-password`?**
> Supabase returns tokens via URL fragments: `#access_token=...&refresh_token=...&type=recovery`.
> If the redirect URL contains a hash prefix (such as `/#reset-password`), Supabase appends another `#`, resulting in a dual-hash URL: `/#reset-password#access_token=...`.
> Standard URL parsers fail on double hashes, causing `getSession()` to return `null` and resulting in an `Auth session missing!` error.
> AcadAssess therefore uses the clean, dedicated pathname `/reset-password` with query parameter preservation (`/reset-password?portal=faculty`).

---

## 2. Password Recovery Flow Architecture

```mermaid
sequenceDiagram
    autonumber
    actor User as Institutional User
    participant Browser as AcadAssess Frontend (apps/web)
    participant AuthContext as AuthContext.tsx
    participant Supabase as Supabase Auth Server
    participant API as Trusted Express API (apps/api)

    User->>Browser: Enters email on Forgot Password page
    Browser->>AuthContext: requestPasswordReset(email, portal)
    AuthContext->>Supabase: supabase.auth.resetPasswordForEmail(email, { redirectTo })
    Supabase-->>User: Delivers password recovery email
    User->>Browser: Clicks recovery link in email
    Browser->>Supabase: GET /auth/v1/verify?token=...&type=recovery
    Supabase-->>Browser: HTTP 303 Redirect to /reset-password#access_token=...
    Browser->>AuthContext: Parses hash tokens, establishes recovery session
    AuthContext->>Supabase: supabase.auth.setSession({ access_token, refresh_token })
    Supabase-->>AuthContext: Emits PASSWORD_RECOVERY event with active Session
    AuthContext-->>Browser: Session validated; renders Set New Password form
    User->>Browser: Submits new password
    Browser->>AuthContext: updatePassword(newPassword)
    AuthContext->>Supabase: supabase.auth.updateUser({ password })
    Supabase-->>AuthContext: Password updated successfully
    AuthContext->>Supabase: supabase.auth.signOut() (Clears recovery session)
    AuthContext-->>Browser: Confirmation displayed; routes to /student/login or /faculty/login
```

---

## 3. Security and Resilience Invariants

1. **Guarded Set New Password Form**: If no valid recovery session is present (`!session` or `recoveryError`), the password input form is **never rendered**. Instead, an actionable "Password Reset Link Invalid or Expired" notice is displayed with buttons to request a new link or return to sign-in.
2. **Expired Link Detection**: The app inspects both hash and query parameters for `error_code=otp_expired`, `error=access_denied`, or `expired` descriptions to immediately provide clear feedback to the user.
3. **Legacy Dual-Hash Sanitization**: If a user clicks a legacy link formatted as `/#reset-password#access_token=...`, the frontend sanitizes the window location and extracts the tokens cleanly.
4. **Post-Update Sign-Out**: After successfully updating the password, the temporary recovery session is cleanly signed out so the user must authenticate with their new credentials at the appropriate portal.
5. **Portal Separation Preserved**: The recovery request passes `?portal=student` or `?portal=faculty` so that after resetting their password, users are returned to their designated institutional login portal.
