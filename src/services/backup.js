import JSZip from 'jszip';
import { db, logAudit } from '../database/db.js';

/**
 * Creates a complete .walkwaybackup compressed zip archive.
 */
export async function createProjectBackup(projectId) {
  const project = await db.projects.get(projectId);
  if (!project) throw new Error('Project not found');

  const sourceRows = await db.sourceRows.where('projectId').equals(projectId).toArray();
  const duplicateGroups = await db.duplicateGroups.where('projectId').equals(projectId).toArray();
  const scanBatches = await db.scanBatches.where('projectId').equals(projectId).toArray();
  const scanEvents = await db.scanEvents.where('projectId').equals(projectId).toArray();
  const physicalCounts = await db.physicalCounts.where('projectId').equals(projectId).toArray();
  const unknownProducts = await db.unknownProducts.where('projectId').equals(projectId).toArray();
  const adjustments = await db.adjustments.where('projectId').equals(projectId).toArray();
  const auditLogs = await db.auditLogs.where('projectId').equals(projectId).toArray();

  const zip = new JSZip();

  const manifest = {
    appName: 'Walkway Inventory Counting',
    appVersion: '1.0.0',
    backupVersion: '1.0',
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    projectId,
    projectName: project.name,
    recordCounts: {
      sourceRows: sourceRows.length,
      duplicateGroups: duplicateGroups.length,
      scanBatches: scanBatches.length,
      scanEvents: scanEvents.length,
      physicalCounts: physicalCounts.length,
      unknownProducts: unknownProducts.length,
      adjustments: adjustments.length,
      auditLogs: auditLogs.length
    }
  };

  zip.file('manifest.json', JSON.stringify(manifest, null, 2));
  zip.file('project.json', JSON.stringify(project, null, 2));
  zip.file('sourceRows.json', JSON.stringify(sourceRows));
  zip.file('duplicateGroups.json', JSON.stringify(duplicateGroups));
  zip.file('scanBatches.json', JSON.stringify(scanBatches));
  zip.file('scanEvents.json', JSON.stringify(scanEvents));
  zip.file('physicalCounts.json', JSON.stringify(physicalCounts));
  zip.file('unknownProducts.json', JSON.stringify(unknownProducts));
  zip.file('adjustments.json', JSON.stringify(adjustments));
  zip.file('auditLogs.json', JSON.stringify(auditLogs));

  const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });

  // Trigger download
  const safeName = (project.name || 'Walkway_Audit').replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename = `${safeName}_backup_${new Date().toISOString().slice(0, 10)}.walkwaybackup`;
  const url = URL.createObjectURL(zipBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  await logAudit(projectId, 'backupRecords', projectId, 'CREATE_BACKUP', null, manifest.recordCounts, `Backup generated: ${filename}`);

  return manifest;
}

/**
 * Validates and restores a project from a .walkwaybackup or .zip file.
 */
export async function restoreProjectBackup(file) {
  const zip = new JSZip();
  const unzipped = await zip.loadAsync(file);

  const manifestFile = unzipped.file('manifest.json');
  if (!manifestFile) {
    throw new Error('Invalid backup archive: missing manifest.json');
  }

  const manifest = JSON.parse(await manifestFile.async('string'));
  const projectData = JSON.parse(await unzipped.file('project.json').async('string'));
  const sourceRows = JSON.parse(await unzipped.file('sourceRows.json').async('string'));
  const duplicateGroups = JSON.parse(await unzipped.file('duplicateGroups.json').async('string'));
  const scanBatches = JSON.parse(await unzipped.file('scanBatches.json').async('string'));
  const scanEvents = JSON.parse(await unzipped.file('scanEvents.json').async('string'));
  const physicalCounts = JSON.parse(await unzipped.file('physicalCounts.json').async('string'));
  const unknownProducts = JSON.parse(await unzipped.file('unknownProducts.json').async('string'));
  const adjustments = JSON.parse(await unzipped.file('adjustments.json').async('string'));

  // Create a new project entry to prevent overwriting existing ID
  const newProjectId = await db.projects.add({
    ...projectData,
    id: undefined,
    name: `${projectData.name} (Restored ${new Date().toLocaleDateString()})`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  // Re-link records to the new project ID
  const remappedSources = sourceRows.map(r => ({ ...r, id: undefined, projectId: newProjectId }));
  const remappedDuplicates = duplicateGroups.map(d => ({ ...d, id: undefined, projectId: newProjectId }));
  const remappedBatches = scanBatches.map(b => ({ ...b, id: undefined, projectId: newProjectId }));
  const remappedEvents = scanEvents.map(e => ({ ...e, id: undefined, projectId: newProjectId }));
  const remappedCounts = physicalCounts.map(c => ({ ...c, id: undefined, projectId: newProjectId }));
  const remappedUnknowns = unknownProducts.map(u => ({ ...u, id: undefined, projectId: newProjectId }));
  const remappedAdjustments = adjustments.map(a => ({ ...a, id: undefined, projectId: newProjectId }));

  // Chunked write
  await db.transaction('rw', [
    db.sourceRows,
    db.duplicateGroups,
    db.scanBatches,
    db.scanEvents,
    db.physicalCounts,
    db.unknownProducts,
    db.adjustments
  ], async () => {
    const chunk = 2000;
    for (let i = 0; i < remappedSources.length; i += chunk) {
      await db.sourceRows.bulkAdd(remappedSources.slice(i, i + chunk));
    }
    if (remappedDuplicates.length > 0) await db.duplicateGroups.bulkAdd(remappedDuplicates);
    if (remappedBatches.length > 0) await db.scanBatches.bulkAdd(remappedBatches);
    if (remappedEvents.length > 0) await db.scanEvents.bulkAdd(remappedEvents);
    if (remappedCounts.length > 0) await db.physicalCounts.bulkAdd(remappedCounts);
    if (remappedUnknowns.length > 0) await db.unknownProducts.bulkAdd(remappedUnknowns);
    if (remappedAdjustments.length > 0) await db.adjustments.bulkAdd(remappedAdjustments);
  });

  return {
    newProjectId,
    recordCounts: manifest.recordCounts
  };
}

