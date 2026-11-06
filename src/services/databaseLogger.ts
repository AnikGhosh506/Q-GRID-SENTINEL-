import {
  collection,
  doc,
  setDoc,
  onSnapshot,
  query,
  where,
  limit,
  serverTimestamp,
  Unsubscribe,
} from 'firebase/firestore';
import { onAuthStateChanged, signInWithPopup, signOut, User } from 'firebase/auth';
import { db, auth, googleProvider, handleFirestoreError, OperationType } from '../firebase';

export type ActivityCategory =
  | 'NAVIGATION'
  | 'BLE_CONNECTION'
  | 'PQC_MITIGATION'
  | 'NODE_CONTROL'
  | 'SETTINGS'
  | 'EXPORT'
  | 'AI_SENTINEL';

export type TriggerType =
  | 'QBER_THRESHOLD_EXCEEDED'
  | 'EVE_SWITCH_ACTIVATED'
  | 'ATTACK_VECTOR_INJECTED'
  | 'AUTOMATED_MITIGATION_FIRED'
  | 'AI_SENTINEL_CRITICAL_ALERT'
  | 'ALERT_CLEARED';

export type TriggerSeverity = 'NOMINAL' | 'ELEVATED' | 'HIGH' | 'CRITICAL';

export type ConditionStatus = 'NOMINAL' | 'ELEVATED' | 'COMPROMISED' | 'MITIGATING';

export interface ActivityLogRecord {
  id: string;
  ownerId: string;
  action: string;
  category: ActivityCategory;
  details: string;
  nodeId: string;
  qberAtEvent: number;
  clientTimestamp: string;
  syncedToCloud?: boolean;
}

export interface TriggerEventRecord {
  id: string;
  ownerId: string;
  triggerType: TriggerType;
  severity: TriggerSeverity;
  source: string;
  nodeId: string;
  nodeName: string;
  peakQber: number;
  thresholdValue: number;
  anomalyScore: number;
  autoMitigated: boolean;
  clientTimestamp: string;
  syncedToCloud?: boolean;
}

export interface SystemConditionRecord {
  id: string;
  ownerId: string;
  conditionStatus: ConditionStatus;
  gridWideAvgQber: number;
  peakQber: number;
  qberCriticalThreshold: number;
  anomalyScore: number;
  sensitivityPreset: 'CONSERVATIVE' | 'BALANCED' | 'AGGRESSIVE' | 'CUSTOM';
  automatedMitigationEnabled: boolean;
  activeNodesCount: number;
  isolatedNodesCount: number;
  summaryNote: string;
  clientTimestamp: string;
  syncedToCloud?: boolean;
}

export interface DatabaseStateSnapshot {
  currentUser: User | null;
  authReady: boolean;
  activityLogs: ActivityLogRecord[];
  triggerEvents: TriggerEventRecord[];
  systemConditions: SystemConditionRecord[];
  pendingQueueCount: number;
  lastSyncError: string | null;
}

const LOCAL_STORAGE_BUFFER_KEY = 'qgrid_firestore_buffer_v1';

function sanitizeId(raw: string, maxLen = 64): string {
  const cleaned = (raw || 'global').replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, maxLen);
  return cleaned.length > 0 ? cleaned : 'global';
}

function truncateStr(val: string, maxLen: number): string {
  const trimmed = (val || '-').trim();
  if (trimmed.length === 0) return '-';
  return trimmed.slice(0, maxLen);
}

function clampNum(val: number, min: number, max: number): number {
  if (!Number.isFinite(val)) return min;
  return Number(Math.min(max, Math.max(min, val)).toFixed(4));
}

function generateValidDocId(prefix: string): string {
  const rand = Math.random().toString(36).substring(2, 9);
  return sanitizeId(`${prefix}-${Date.now()}-${rand}`, 96);
}

class DatabaseLoggerService {
  private currentUser: User | null = null;
  private authReady = false;
  private cloudActivities: ActivityLogRecord[] = [];
  private cloudTriggers: TriggerEventRecord[] = [];
  private cloudConditions: SystemConditionRecord[] = [];

  private localActivities: ActivityLogRecord[] = [];
  private localTriggers: TriggerEventRecord[] = [];
  private localConditions: SystemConditionRecord[] = [];

  private lastSyncError: string | null = null;
  private listeners: ((state: DatabaseStateSnapshot) => void)[] = [];
  private snapshotUnsubs: Unsubscribe[] = [];

  constructor() {
    this.loadLocalBuffer();

    onAuthStateChanged(auth, (user) => {
      this.currentUser = user;
      this.authReady = true;
      this.detachFirestoreListeners();

      if (user) {
        this.attachFirestoreListeners(user.uid);
        void this.flushPendingToCloud(user.uid);
      } else {
        this.cloudActivities = [];
        this.cloudTriggers = [];
        this.cloudConditions = [];
      }
      this.notifyListeners();
    });
  }

  private loadLocalBuffer() {
    try {
      const raw = localStorage.getItem(LOCAL_STORAGE_BUFFER_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.activities)) this.localActivities = parsed.activities.slice(0, 30);
        if (Array.isArray(parsed.triggers)) this.localTriggers = parsed.triggers.slice(0, 30);
        if (Array.isArray(parsed.conditions)) this.localConditions = parsed.conditions.slice(0, 30);
      }
    } catch {
      // Ignore storage errors
    }
  }

  private saveLocalBuffer() {
    try {
      localStorage.setItem(
        LOCAL_STORAGE_BUFFER_KEY,
        JSON.stringify({
          activities: this.localActivities.slice(0, 30),
          triggers: this.localTriggers.slice(0, 30),
          conditions: this.localConditions.slice(0, 30),
        })
      );
    } catch {
      // Ignore storage errors
    }
  }

  private detachFirestoreListeners() {
    this.snapshotUnsubs.forEach((u) => u());
    this.snapshotUnsubs = [];
  }

  private attachFirestoreListeners(uid: string) {
    const actQuery = query(
      collection(db, 'activityLogs'),
      where('ownerId', '==', uid),
      limit(30)
    );
    const trigQuery = query(
      collection(db, 'triggerEvents'),
      where('ownerId', '==', uid),
      limit(30)
    );
    const condQuery = query(
      collection(db, 'systemConditions'),
      where('ownerId', '==', uid),
      limit(30)
    );

    const unsubAct = onSnapshot(
      actQuery,
      (snap) => {
        const rows: ActivityLogRecord[] = [];
        snap.forEach((d) => {
          const data = d.data();
          rows.push({
            id: d.id,
            ownerId: String(data.ownerId || uid),
            action: String(data.action || ''),
            category: (data.category as ActivityCategory) || 'NAVIGATION',
            details: String(data.details || ''),
            nodeId: String(data.nodeId || 'global'),
            qberAtEvent: Number(data.qberAtEvent ?? 1.15),
            clientTimestamp: String(data.clientTimestamp || new Date().toISOString()),
            syncedToCloud: true,
          });
        });
        rows.sort((a, b) => b.clientTimestamp.localeCompare(a.clientTimestamp));
        this.cloudActivities = rows;
        this.notifyListeners();
      },
      (err) => {
        try {
          handleFirestoreError(err, OperationType.LIST, 'activityLogs');
        } catch (e) {
          this.lastSyncError = e instanceof Error ? e.message : String(e);
          this.notifyListeners();
        }
      }
    );

    const unsubTrig = onSnapshot(
      trigQuery,
      (snap) => {
        const rows: TriggerEventRecord[] = [];
        snap.forEach((d) => {
          const data = d.data();
          rows.push({
            id: d.id,
            ownerId: String(data.ownerId || uid),
            triggerType: (data.triggerType as TriggerType) || 'QBER_THRESHOLD_EXCEEDED',
            severity: (data.severity as TriggerSeverity) || 'CRITICAL',
            source: String(data.source || 'SYSTEM'),
            nodeId: String(data.nodeId || 'global'),
            nodeName: String(data.nodeName || 'GLOBAL'),
            peakQber: Number(data.peakQber ?? 0),
            thresholdValue: Number(data.thresholdValue ?? 11),
            anomalyScore: Number(data.anomalyScore ?? 0),
            autoMitigated: Boolean(data.autoMitigated),
            clientTimestamp: String(data.clientTimestamp || new Date().toISOString()),
            syncedToCloud: true,
          });
        });
        rows.sort((a, b) => b.clientTimestamp.localeCompare(a.clientTimestamp));
        this.cloudTriggers = rows;
        this.notifyListeners();
      },
      (err) => {
        try {
          handleFirestoreError(err, OperationType.LIST, 'triggerEvents');
        } catch (e) {
          this.lastSyncError = e instanceof Error ? e.message : String(e);
          this.notifyListeners();
        }
      }
    );

    const unsubCond = onSnapshot(
      condQuery,
      (snap) => {
        const rows: SystemConditionRecord[] = [];
        snap.forEach((d) => {
          const data = d.data();
          rows.push({
            id: d.id,
            ownerId: String(data.ownerId || uid),
            conditionStatus: (data.conditionStatus as ConditionStatus) || 'NOMINAL',
            gridWideAvgQber: Number(data.gridWideAvgQber ?? 1.15),
            peakQber: Number(data.peakQber ?? 1.15),
            qberCriticalThreshold: Number(data.qberCriticalThreshold ?? 11.0),
            anomalyScore: Number(data.anomalyScore ?? 0.01),
            sensitivityPreset: (data.sensitivityPreset as SystemConditionRecord['sensitivityPreset']) || 'BALANCED',
            automatedMitigationEnabled: Boolean(data.automatedMitigationEnabled),
            activeNodesCount: Number(data.activeNodesCount ?? 5),
            isolatedNodesCount: Number(data.isolatedNodesCount ?? 0),
            summaryNote: String(data.summaryNote || ''),
            clientTimestamp: String(data.clientTimestamp || new Date().toISOString()),
            syncedToCloud: true,
          });
        });
        rows.sort((a, b) => b.clientTimestamp.localeCompare(a.clientTimestamp));
        this.cloudConditions = rows;
        this.notifyListeners();
      },
      (err) => {
        try {
          handleFirestoreError(err, OperationType.LIST, 'systemConditions');
        } catch (e) {
          this.lastSyncError = e instanceof Error ? e.message : String(e);
          this.notifyListeners();
        }
      }
    );

    this.snapshotUnsubs.push(unsubAct, unsubTrig, unsubCond);
  }

  public async signInWithGoogle(): Promise<void> {
    this.lastSyncError = null;
    await signInWithPopup(auth, googleProvider);
  }

  public async signOutUser(): Promise<void> {
    await signOut(auth);
  }

  public async flushPendingToCloud(uid?: string): Promise<void> {
    const activeUid = uid || this.currentUser?.uid;
    if (!activeUid) return;

    const unsyncedAct = this.localActivities.filter((a) => !a.syncedToCloud);
    for (const item of unsyncedAct) {
      await this.writeActivityToFirestore(activeUid, item);
      item.syncedToCloud = true;
    }

    const unsyncedTrig = this.localTriggers.filter((t) => !t.syncedToCloud);
    for (const item of unsyncedTrig) {
      await this.writeTriggerToFirestore(activeUid, item);
      item.syncedToCloud = true;
    }

    const unsyncedCond = this.localConditions.filter((c) => !c.syncedToCloud);
    for (const item of unsyncedCond) {
      await this.writeConditionToFirestore(activeUid, item);
      item.syncedToCloud = true;
    }

    this.saveLocalBuffer();
    this.notifyListeners();
  }

  private async writeActivityToFirestore(uid: string, item: ActivityLogRecord): Promise<void> {
    const docId = sanitizeId(item.id, 96);
    const path = `activityLogs/${docId}`;
    try {
      await setDoc(doc(db, 'activityLogs', docId), {
        ownerId: sanitizeId(uid, 128),
        action: truncateStr(item.action, 120),
        category: item.category,
        details: truncateStr(item.details, 600),
        nodeId: sanitizeId(item.nodeId, 64),
        qberAtEvent: clampNum(item.qberAtEvent, 0, 100),
        clientTimestamp: truncateStr(item.clientTimestamp, 40),
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      try {
        handleFirestoreError(err, OperationType.CREATE, path);
      } catch (formattedErr) {
        this.lastSyncError =
          formattedErr instanceof Error ? formattedErr.message : String(formattedErr);
      }
    }
  }

  private async writeTriggerToFirestore(uid: string, item: TriggerEventRecord): Promise<void> {
    const docId = sanitizeId(item.id, 96);
    const path = `triggerEvents/${docId}`;
    try {
      await setDoc(doc(db, 'triggerEvents', docId), {
        ownerId: sanitizeId(uid, 128),
        triggerType: item.triggerType,
        severity: item.severity,
        source: truncateStr(item.source, 80),
        nodeId: sanitizeId(item.nodeId, 64),
        nodeName: truncateStr(item.nodeName, 100),
        peakQber: clampNum(item.peakQber, 0, 100),
        thresholdValue: clampNum(item.thresholdValue, 1, 50),
        anomalyScore: clampNum(item.anomalyScore, 0, 1),
        autoMitigated: Boolean(item.autoMitigated),
        clientTimestamp: truncateStr(item.clientTimestamp, 40),
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      try {
        handleFirestoreError(err, OperationType.CREATE, path);
      } catch (formattedErr) {
        this.lastSyncError =
          formattedErr instanceof Error ? formattedErr.message : String(formattedErr);
      }
    }
  }

  private async writeConditionToFirestore(uid: string, item: SystemConditionRecord): Promise<void> {
    const docId = sanitizeId(item.id, 96);
    const path = `systemConditions/${docId}`;
    try {
      await setDoc(doc(db, 'systemConditions', docId), {
        ownerId: sanitizeId(uid, 128),
        conditionStatus: item.conditionStatus,
        gridWideAvgQber: clampNum(item.gridWideAvgQber, 0, 100),
        peakQber: clampNum(item.peakQber, 0, 100),
        qberCriticalThreshold: clampNum(item.qberCriticalThreshold, 1, 50),
        anomalyScore: clampNum(item.anomalyScore, 0, 1),
        sensitivityPreset: item.sensitivityPreset,
        automatedMitigationEnabled: Boolean(item.automatedMitigationEnabled),
        activeNodesCount: clampNum(item.activeNodesCount, 0, 100),
        isolatedNodesCount: clampNum(item.isolatedNodesCount, 0, 100),
        summaryNote: truncateStr(item.summaryNote, 400),
        clientTimestamp: truncateStr(item.clientTimestamp, 40),
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      try {
        handleFirestoreError(err, OperationType.CREATE, path);
      } catch (formattedErr) {
        this.lastSyncError =
          formattedErr instanceof Error ? formattedErr.message : String(formattedErr);
      }
    }
  }

  public logActivity(params: {
    action: string;
    category: ActivityCategory;
    details: string;
    nodeId?: string;
    qberAtEvent?: number;
  }): void {
    const uid = this.currentUser?.uid || 'local-session';
    const record: ActivityLogRecord = {
      id: generateValidDocId('act'),
      ownerId: sanitizeId(uid, 128),
      action: truncateStr(params.action, 120),
      category: params.category,
      details: truncateStr(params.details, 600),
      nodeId: sanitizeId(params.nodeId || 'global', 64),
      qberAtEvent: clampNum(params.qberAtEvent ?? 1.15, 0, 100),
      clientTimestamp: new Date().toISOString(),
      syncedToCloud: Boolean(this.currentUser),
    };

    this.localActivities = [record, ...this.localActivities].slice(0, 30);
    this.saveLocalBuffer();
    this.notifyListeners();

    if (this.currentUser) {
      void this.writeActivityToFirestore(this.currentUser.uid, record);
    }
  }

  public logTrigger(params: {
    triggerType: TriggerType;
    severity: TriggerSeverity;
    source: string;
    nodeId?: string;
    nodeName?: string;
    peakQber: number;
    thresholdValue: number;
    anomalyScore: number;
    autoMitigated?: boolean;
  }): void {
    const uid = this.currentUser?.uid || 'local-session';
    const record: TriggerEventRecord = {
      id: generateValidDocId('trig'),
      ownerId: sanitizeId(uid, 128),
      triggerType: params.triggerType,
      severity: params.severity,
      source: truncateStr(params.source, 80),
      nodeId: sanitizeId(params.nodeId || 'global', 64),
      nodeName: truncateStr(params.nodeName || 'GLOBAL_GRID', 100),
      peakQber: clampNum(params.peakQber, 0, 100),
      thresholdValue: clampNum(params.thresholdValue, 1, 50),
      anomalyScore: clampNum(params.anomalyScore, 0, 1),
      autoMitigated: Boolean(params.autoMitigated),
      clientTimestamp: new Date().toISOString(),
      syncedToCloud: Boolean(this.currentUser),
    };

    this.localTriggers = [record, ...this.localTriggers].slice(0, 30);
    this.saveLocalBuffer();
    this.notifyListeners();

    if (this.currentUser) {
      void this.writeTriggerToFirestore(this.currentUser.uid, record);
    }
  }

  public logSystemCondition(params: {
    conditionStatus: ConditionStatus;
    gridWideAvgQber: number;
    peakQber: number;
    qberCriticalThreshold: number;
    anomalyScore: number;
    sensitivityPreset: 'CONSERVATIVE' | 'BALANCED' | 'AGGRESSIVE' | 'CUSTOM';
    automatedMitigationEnabled: boolean;
    activeNodesCount: number;
    isolatedNodesCount: number;
    summaryNote: string;
  }): void {
    const uid = this.currentUser?.uid || 'local-session';
    const record: SystemConditionRecord = {
      id: generateValidDocId('cond'),
      ownerId: sanitizeId(uid, 128),
      conditionStatus: params.conditionStatus,
      gridWideAvgQber: clampNum(params.gridWideAvgQber, 0, 100),
      peakQber: clampNum(params.peakQber, 0, 100),
      qberCriticalThreshold: clampNum(params.qberCriticalThreshold, 1, 50),
      anomalyScore: clampNum(params.anomalyScore, 0, 1),
      sensitivityPreset: params.sensitivityPreset,
      automatedMitigationEnabled: Boolean(params.automatedMitigationEnabled),
      activeNodesCount: clampNum(params.activeNodesCount, 0, 100),
      isolatedNodesCount: clampNum(params.isolatedNodesCount, 0, 100),
      summaryNote: truncateStr(params.summaryNote, 400),
      clientTimestamp: new Date().toISOString(),
      syncedToCloud: Boolean(this.currentUser),
    };

    this.localConditions = [record, ...this.localConditions].slice(0, 30);
    this.saveLocalBuffer();
    this.notifyListeners();

    if (this.currentUser) {
      void this.writeConditionToFirestore(this.currentUser.uid, record);
    }
  }

  public getSnapshot(): DatabaseStateSnapshot {
    const mergedActivities =
      this.cloudActivities.length > 0 ? this.cloudActivities : this.localActivities;
    const mergedTriggers =
      this.cloudTriggers.length > 0 ? this.cloudTriggers : this.localTriggers;
    const mergedConditions =
      this.cloudConditions.length > 0 ? this.cloudConditions : this.localConditions;

    const pendingCount =
      this.localActivities.filter((a) => !a.syncedToCloud).length +
      this.localTriggers.filter((t) => !t.syncedToCloud).length +
      this.localConditions.filter((c) => !c.syncedToCloud).length;

    return {
      currentUser: this.currentUser,
      authReady: this.authReady,
      activityLogs: mergedActivities,
      triggerEvents: mergedTriggers,
      systemConditions: mergedConditions,
      pendingQueueCount: pendingCount,
      lastSyncError: this.lastSyncError,
    };
  }

  public subscribe(cb: (state: DatabaseStateSnapshot) => void): () => void {
    this.listeners.push(cb);
    cb(this.getSnapshot());
    return () => {
      this.listeners = this.listeners.filter((l) => l !== cb);
    };
  }

  private notifyListeners() {
    const snap = this.getSnapshot();
    this.listeners.forEach((cb) => cb(snap));
  }
}

export const databaseLogger = new DatabaseLoggerService();
