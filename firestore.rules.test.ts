/**
 * Firestore Security Rules Verification Suite (Dirty Dozen Adversarial Payloads)
 * Verifies that all 12 adversarial payloads in security_spec.md return PERMISSION_DENIED.
 */

export interface SecurityTestCase {
  id: number;
  name: string;
  collection: string;
  docId: string;
  operation: 'create' | 'update' | 'get' | 'list' | 'delete';
  auth: { uid: string; email?: string; email_verified?: boolean } | null;
  payload?: Record<string, unknown>;
  expectedResult: 'PERMISSION_DENIED' | 'ALLOWED';
}

export const DIRTY_DOZEN_SECURITY_TESTS: SecurityTestCase[] = [
  {
    id: 1,
    name: 'Unauthenticated Write to activityLogs',
    collection: 'activityLogs',
    docId: 'log-1',
    operation: 'create',
    auth: null,
    payload: { ownerId: 'anon', action: 'TEST' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 2,
    name: 'Unverified Email Spoof on triggerEvents',
    collection: 'triggerEvents',
    docId: 'trig-1',
    operation: 'create',
    auth: { uid: 'u1', email: 'arpitaghosh2167@gmail.com', email_verified: false },
    payload: { ownerId: 'u1', triggerType: 'QBER_THRESHOLD_EXCEEDED' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 3,
    name: 'Identity Spoofing (ownerId mismatch)',
    collection: 'activityLogs',
    docId: 'log-1',
    operation: 'create',
    auth: { uid: 'user-a', email: 'a@example.com', email_verified: true },
    payload: { ownerId: 'user-b', action: 'SPOOF' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 4,
    name: 'Shadow Field Injection on Create',
    collection: 'activityLogs',
    docId: 'log-1',
    operation: 'create',
    auth: { uid: 'user-a', email: 'a@example.com', email_verified: true },
    payload: { ownerId: 'user-a', isAdminOverride: true },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 5,
    name: 'ID Poisoning with Invalid Characters',
    collection: 'activityLogs',
    docId: 'invalid$id!spaces',
    operation: 'create',
    auth: { uid: 'user-a', email: 'a@example.com', email_verified: true },
    payload: { ownerId: 'user-a' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 6,
    name: 'String Buffer Overflow (>600 chars in details)',
    collection: 'activityLogs',
    docId: 'log-1',
    operation: 'create',
    auth: { uid: 'user-a', email: 'a@example.com', email_verified: true },
    payload: { ownerId: 'user-a', details: 'X'.repeat(5000) },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 7,
    name: 'Enum Violation on TriggerEvent severity',
    collection: 'triggerEvents',
    docId: 'trig-1',
    operation: 'create',
    auth: { uid: 'user-a', email: 'a@example.com', email_verified: true },
    payload: { ownerId: 'user-a', severity: 'INVALID_SEVERITY' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 8,
    name: 'Forged Client createdAt Timestamp',
    collection: 'systemConditions',
    docId: 'cond-1',
    operation: 'create',
    auth: { uid: 'user-a', email: 'a@example.com', email_verified: true },
    payload: { ownerId: 'user-a', createdAt: '1999-01-01T00:00:00Z' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 9,
    name: 'Cross-Tenant Get Read',
    collection: 'triggerEvents',
    docId: 'trig-victim',
    operation: 'get',
    auth: { uid: 'attacker', email: 'att@example.com', email_verified: true },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 10,
    name: 'Unfiltered Cross-Tenant List Query',
    collection: 'systemConditions',
    docId: '*',
    operation: 'list',
    auth: { uid: 'attacker', email: 'att@example.com', email_verified: true },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 11,
    name: 'Immutable Field Mutation (ownerId / createdAt) on Update',
    collection: 'activityLogs',
    docId: 'log-1',
    operation: 'update',
    auth: { uid: 'user-a', email: 'a@example.com', email_verified: true },
    payload: { ownerId: 'user-b' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 12,
    name: 'Value Poisoning on Update (summaryNote > 400 chars)',
    collection: 'systemConditions',
    docId: 'cond-1',
    operation: 'update',
    auth: { uid: 'user-a', email: 'a@example.com', email_verified: true },
    payload: { summaryNote: 'Z'.repeat(2000) },
    expectedResult: 'PERMISSION_DENIED',
  },
];
