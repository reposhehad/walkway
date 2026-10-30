import Dexie from 'dexie';

export const db = new Dexie('WalkwayInventoryCountingDB');

db.version(1).stores({
  projects: '++id, name, location, auditDate, status, createdAt, updatedAt, finalizedAt',
  sourceRows: '++id, projectId, sourceRowNumber, rawSku, normalizedSku, location, duplicateGroupId, resolutionStatus, isExcluded',
  products: '++id, projectId, sku, location, identityStatus',
  duplicateGroups: '++id, projectId, sku, resolutionType',
  scanBatches: '++id, projectId, sequence, status, createdAt',
  scanEvents: '++id, projectId, batchId, productId, sku, eventType, inputMethod, createdAt',
  physicalCounts: '++id, [projectId+sku], projectId, productId, sku, countStatus',
  unknownProducts: '++id, [projectId+sku], projectId, sku, priceStatus',
  adjustments: '++id, projectId, productId, sku, adjustmentType, isReversal, status, createdAt',
  auditSnapshots: '++id, projectId, calculatedAt, snapshotStatus',
  auditLogs: '++id, projectId, entityType, action, createdAt',
  appSettings: 'key, updatedAt',
  backupRecords: '++id, projectId, createdAt'
});

export async function getActiveProject() {
  let project = await db.projects.orderBy('id').last();
  if (!project) {
    const id = await db.projects.add({
      name: 'Walkway Store Audit',
      location: 'Walkway Retail Outlet',
      auditDate: new Date().toISOString().slice(0, 10),
      status: 'In Progress',
      sourceFileName: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      schemaVersion: 1
    });
    project = await db.projects.get(id);

    // Create default first batch
    await db.scanBatches.add({
      projectId: id,
      name: 'Batch #1',
      sequence: 1,
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      notes: 'Initial default batch'
    });
  }
  return project;
}

export async function logAudit(projectId, entityType, entityId, action, beforeData = null, afterData = null, reason = '') {
  try {
    await db.auditLogs.add({
      projectId,
      entityType,
      entityId: String(entityId),
      action,
      beforeData: beforeData ? JSON.stringify(beforeData) : null,
      afterData: afterData ? JSON.stringify(afterData) : null,
      reason,
      createdAt: new Date().toISOString()
    });
  } catch (err) {
    console.error('Audit log error:', err);
  }
}

