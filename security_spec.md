# Q-GRID SENTINEL — Firestore Security Specification (`security_spec.md`)

## 1. Data Invariants

1. **Default-Deny Catch-All**: Every path not explicitly matched under `/databases/{database}/documents` is unconditionally denied (`allow read, write: if false;`).
2. **Verified Identity Invariant**: Every write operation across `/activityLogs/{logId}`, `/triggerEvents/{triggerId}`, and `/systemConditions/{conditionId}` requires an authenticated user with a verified email (`request.auth != null && request.auth.token.email_verified == true`), or the bootstrapped administrator email (`arpitaghosh2167@gmail.com` with `email_verified == true`).
3. **Ownership & Anti-Spoofing Invariant**: Every document created in `/activityLogs`, `/triggerEvents`, or `/systemConditions` must set `ownerId == request.auth.uid`. During any update, `ownerId` and `createdAt` are strictly immutable (`incoming().ownerId == existing().ownerId && incoming().createdAt == existing().createdAt`).
4. **Strict Key & Size Enforcement (Anti-Shadow-Field & Denial-of-Wallet Guard)**:
   - Document IDs (`logId`, `triggerId`, `conditionId`) must match `^[a-zA-Z0-9_\-]+$` with `.size() >= 1 && .size() <= 128` on all single-document operations (`get`, `create`, `update`, `delete`).
   - Every `create` operation enforces both `keys().hasAll([...])` and `keys().hasOnly([...])`.
   - Every string field enforces strict `.size()` bounds matching `firebase-blueprint.json` (`action <= 120`, `details <= 600`, `nodeId <= 64`, `summaryNote <= 400`, etc.).
5. **Temporal Integrity**: `createdAt` must equal the server timestamp `request.time` on creation (`incoming().createdAt == request.time`).
6. **Query Enforcer (No Blanket List Reads)**: `allow list` on `/activityLogs`, `/triggerEvents`, and `/systemConditions` strictly requires `isSignedIn() && (resource.data.ownerId == request.auth.uid || isAdmin())`, preventing cross-tenant query scraping.

---

## 2. The "Dirty Dozen" Adversarial Payloads

1. **Payload 1 — Unauthenticated Write**: `auth = null`, attempting `create` on `/activityLogs/log-1`. (Must return `PERMISSION_DENIED`)
2. **Payload 2 — Unverified Email Spoof**: `auth = { uid: 'u1', token: { email: 'arpitaghosh2167@gmail.com', email_verified: false } }`, attempting `create` on `/triggerEvents/trig-1`. (Must return `PERMISSION_DENIED`)
3. **Payload 3 — Identity Spoofing (`ownerId` Mismatch)**: Authenticated as `uid: 'user-a'`, attempting `create` on `/activityLogs/log-1` with `ownerId: 'user-b'`. (Must return `PERMISSION_DENIED`)
4. **Payload 4 — Ghost / Shadow Field Injection on Create**: Including an undeclared field `isAdminOverride: true` in `/activityLogs/log-1`. (Must return `PERMISSION_DENIED`)
5. **Payload 5 — ID Poisoning (Invalid Characters / Oversized ID)**: Attempting `create` on `/activityLogs/invalid$id!with spaces` or a 200-char ID. (Must return `PERMISSION_DENIED`)
6. **Payload 6 — String Buffer Overflow ("Denial of Wallet")**: Setting `details` to a 5,000-character string (> `maxLength: 600`) in `/activityLogs/log-1`. (Must return `PERMISSION_DENIED`)
7. **Payload 7 — Enum Violation**: Setting `category: 'HACKED_CATEGORY'` on `/activityLogs/log-1` or `severity: 'ULTRA'` on `/triggerEvents/trig-1`. (Must return `PERMISSION_DENIED`)
8. **Payload 8 — Forged Client `createdAt` Timestamp**: Passing a past/future timestamp for `createdAt` instead of `request.time`. (Must return `PERMISSION_DENIED`)
9. **Payload 9 — Cross-Tenant `get` Read**: User `uid: 'attacker'` attempting `get` on `/triggerEvents/trig-owned-by-victim`. (Must return `PERMISSION_DENIED`)
10. **Payload 10 — Unfiltered Blanket `list` Query**: User `uid: 'attacker'` attempting an unfiltered `list` across `/systemConditions` containing documents owned by another user. (Must return `PERMISSION_DENIED`)
11. **Payload 11 — Immutable Field Mutation on Update**: Owner attempting `update` on `/activityLogs/log-1` that mutates `ownerId` or `createdAt`. (Must return `PERMISSION_DENIED`)
12. **Payload 12 — Value Poisoning on Update**: Owner attempting `update` on `/systemConditions/cond-1` changing `summaryNote` to a number or a 2,000-char string. (Must return `PERMISSION_DENIED`)

---

## 3. Red Team Audit Matrix

- **Shadow Update Test**: Passed — `hasOnly()` is enforced on all `create` and `update` paths.
- **Email Spoofing Test**: Passed — `request.auth.token.email_verified == true` is required for both standard users and bootstrapped admin checks.
- **PII Blanket Test**: Passed — No PII is exposed globally; all reads require `existing().ownerId == request.auth.uid || isAdmin()`.
- **Query Trust Test**: Passed — Every `allow list` rule evaluates `resource.data.ownerId == request.auth.uid || isAdmin()`.
- **Value Poisoning Test**: Passed — `isValidActivityLog(incoming())`, `isValidTriggerEvent(incoming())`, and `isValidSystemCondition(incoming())` wrap all `create` and `update` blocks.
