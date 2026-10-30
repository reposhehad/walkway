import * as XLSX from 'xlsx';
import { db } from '../database/db.js';
import { allocateQuantityAcrossRows } from '../domain/duplicates.js';
import { determineStockStatus } from '../domain/calculations.js';

/**
 * Downloads a generated XLSX workbook blob to the user's browser.
 */
function downloadWorkbook(workbook, filename) {
  const wbout = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Generates the official POS-compatible 9-column Stock Reconciliation Excel File.
 * Option to include scanned unknown SKUs at the end of the sheet preserving the identical 9-column structure.
 */
export async function exportPosReconciliationExcel(projectId, includeUnknownSkus = false) {
  const project = await db.projects.get(projectId);
  const sourceRows = await db.sourceRows.where('projectId').equals(projectId).sortBy('sourceRowNumber');
  const physicalCounts = await db.physicalCounts.where('projectId').equals(projectId).toArray();
  const adjustments = await db.adjustments.where('projectId').equals(projectId).toArray();
  const duplicateGroups = await db.duplicateGroups.where('projectId').equals(projectId).toArray();

  // Determine the exact store location from imported Excel source rows
  const firstSourceWithLoc = sourceRows.find(r => r.location && r.location.trim() && r.location !== 'Store' && r.location !== 'Main Store');
  const auditStoreLocation = firstSourceWithLoc?.location || project?.location || 'Store';

  // Map physical count by SKU
  const countMap = new Map();
  for (const pc of physicalCounts) {
    countMap.set(pc.sku, pc);
  }

  // Map net adjustment by SKU
  const adjMap = new Map();
  for (const adj of adjustments) {
    if (adj.status === 'reversed') continue;
    const current = adjMap.get(adj.sku) || 0;
    const delta = adj.adjustmentType === 'increase' ? Number(adj.quantity) : -Number(adj.quantity);
    adjMap.set(adj.sku, current + delta);
  }

  // Duplicate groups map
  const dupMap = new Map();
  for (const dg of duplicateGroups) {
    dupMap.set(dg.sku, dg);
  }

  // Pre-calculate final quantities per unique SKU
  const finalSkuQtyMap = new Map();
  for (const [sku, pc] of countMap.entries()) {
    const orig = Number(pc.originalCount) || 0;
    const netAdj = adjMap.get(sku) || 0;
    finalSkuQtyMap.set(sku, Math.max(0, orig + netAdj));
  }

  // Handle duplicate allocation per SKU group
  const groupedSourceBySku = new Map();
  for (const row of sourceRows) {
    if (!groupedSourceBySku.has(row.rawSku)) {
      groupedSourceBySku.set(row.rawSku, []);
    }
    groupedSourceBySku.get(row.rawSku).push(row);
  }

  const allocatedRowQtyMap = new Map();
  for (const [sku, rows] of groupedSourceBySku.entries()) {
    if (rows.length > 1) {
      const totalFinalQty = finalSkuQtyMap.get(sku) || 0;
      const allocated = allocateQuantityAcrossRows(rows, totalFinalQty, 'fill-first');
      for (const r of allocated) {
        allocatedRowQtyMap.set(r.id, r.allocatedPhysicalQty);
      }
    }
  }

  // Build exact 9-column POS data array
  // Position | Header: SKU, Product, Location, Software Qty, Physical Qty, Purchase Price, Sell Price, Reason, Note
  const exportData = [
    ['SKU', 'Product', 'Location', 'Software Qty', 'Physical Qty', 'Purchase Price', 'Sell Price', 'Reason', 'Note']
  ];

  for (const row of sourceRows) {
    let physicalVal = '';

    if (row.isExcluded) {
      physicalVal = ''; // omitted from physical counting
    } else if (allocatedRowQtyMap.has(row.id)) {
      physicalVal = allocatedRowQtyMap.get(row.id);
    } else if (finalSkuQtyMap.has(row.rawSku)) {
      physicalVal = finalSkuQtyMap.get(row.rawSku);
    } else {
      const pc = countMap.get(row.rawSku);
      if (pc && pc.countedZeroConfirmed) {
        physicalVal = 0;
      } else {
        physicalVal = ''; // uncounted blank per Section 3.1 & 17.2
      }
    }

    exportData.push([
      String(row.rawSku),
      String(row.productName || ''),
      String(row.location || project?.location || ''),
      Number(row.softwareQty) || 0,
      physicalVal,
      Number(row.purchasePrice) || 0,
      Number(row.sellPrice) || 0,
      String(row.reason || ''),
      String(row.note || '')
    ]);
  }

  // If user requested to include unknown scanned SKUs in the same POS sheet
  if (includeUnknownSkus) {
    const unknowns = await db.unknownProducts.where('projectId').equals(projectId).toArray();
    for (const u of unknowns) {
      const uQty = Number(u.physicalQty) || 0;
      if (uQty <= 0) continue;
      exportData.push([
        String(u.sku),
        String(u.productName || `Unknown Article (${u.sku})`),
        String(u.location && u.location !== 'Main Store' ? u.location : auditStoreLocation),
        0, // POS software quantity is 0 for uncatalogued items
        uQty, // Scanned physical units
        Number(u.purchasePrice) || 0,
        Number(u.sellPrice) || 0,
        'Unknown Scanned Article',
        String(u.note || 'Scanned during audit')
      ]);
    }
  }

  const ws = XLSX.utils.aoa_to_sheet(exportData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Worksheet');

  const locSafe = String(auditStoreLocation).replace(/[^a-zA-Z0-9_-]/g, '_');
  const dateStr = new Date().toISOString().slice(0, 10);
  downloadWorkbook(wb, `Walkway_${locSafe}_POS_Count_Sheet_${dateStr}.xlsx`);
}

/**
 * Exports Unknown SKUs (scanned items not in POS source master) in separate Excel file.
 */
export async function exportUnknownSkusExcel(projectId) {
  const project = await db.projects.get(projectId);
  const firstSourceWithLoc = await db.sourceRows.where('projectId').equals(projectId).and(r => r.location && r.location.trim() && r.location !== 'Store' && r.location !== 'Main Store').first();
  const auditStoreLocation = firstSourceWithLoc?.location || project?.location || 'Store';
  const unknowns = await db.unknownProducts.where('projectId').equals(projectId).toArray();

  const exportData = [
    ['SKU', 'Product Description', 'Location', 'Physical Qty', 'Purchase Price', 'Sell Price', 'Price Status', 'Note', 'Discovered At']
  ];

  for (const u of unknowns) {
    exportData.push([
      String(u.sku),
      String(u.productName || 'Unknown Article'),
      String(u.location && u.location !== 'Main Store' ? u.location : auditStoreLocation),
      Number(u.physicalQty) || 0,
      Number(u.purchasePrice) || 0,
      Number(u.sellPrice) || 0,
      String(u.priceStatus || 'Missing Price'),
      String(u.note || ''),
      String(u.createdAt || '')
    ]);
  }

  const ws = XLSX.utils.aoa_to_sheet(exportData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Unknown_SKUs');

  const locSafe = (project?.location || 'Store').replace(/[^a-zA-Z0-9_-]/g, '_');
  downloadWorkbook(wb, `Walkway_${locSafe}_Unknown_SKUs_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

/**
 * Exports specialized Audit Reports (Full, Shortage, Excess, Matched, Adjustments, Batches).
 */
export async function exportSpecializedAuditReport(projectId, reportType = 'full') {
  const project = await db.projects.get(projectId);
  const sourceRows = await db.sourceRows.where('projectId').equals(projectId).toArray();
  const physicalCounts = await db.physicalCounts.where('projectId').equals(projectId).toArray();
  const adjustments = await db.adjustments.where('projectId').equals(projectId).toArray();
  const unknowns = await db.unknownProducts.where('projectId').equals(projectId).toArray();

  const countMap = new Map();
  for (const pc of physicalCounts) countMap.set(pc.sku, pc);

  const adjMap = new Map();
  for (const adj of adjustments) {
    if (adj.status === 'reversed') continue;
    const current = adjMap.get(adj.sku) || 0;
    const delta = adj.adjustmentType === 'increase' ? Number(adj.quantity) : -Number(adj.quantity);
    adjMap.set(adj.sku, current + delta);
  }

  const exportData = [
    ['SKU', 'Product Name', 'Location', 'Software Qty', 'Original Count', 'Adjustment', 'Final Physical Qty', 'Variance Qty', 'Status', 'Purchase Price', 'Sell Price', 'Cost Impact (BDT)', 'Retail Impact (BDT)']
  ];

  // Process POS rows
  for (const r of sourceRows) {
    const pc = countMap.get(r.rawSku);
    const orig = pc ? Number(pc.originalCount) : null;
    const adj = adjMap.get(r.rawSku) || 0;
    const finalQty = orig !== null ? Math.max(0, orig + adj) : null;
    const soft = Number(r.softwareQty) || 0;
    const status = determineStockStatus({
      softwareQty: soft,
      finalPhysicalQty: finalQty,
      isUnknown: false,
      isExcluded: r.isExcluded,
      isCountedZero: pc?.countedZeroConfirmed,
      hasConflict: false
    });

    if (reportType === 'shortages' && status !== 'Short') continue;
    if (reportType === 'excess' && status !== 'Excess') continue;
    if (reportType === 'matched' && status !== 'Matched') continue;

    const variance = (finalQty !== null ? finalQty : 0) - soft;
    const purch = Number(r.purchasePrice) || 0;
    const sell = Number(r.sellPrice) || 0;
    const costImpact = Math.round(variance * purch * 100) / 100;
    const retailImpact = Math.round(variance * sell * 100) / 100;

    exportData.push([
      String(r.rawSku),
      String(r.productName || ''),
      String(r.location || ''),
      soft,
      orig !== null ? orig : (pc?.countedZeroConfirmed ? 0 : 'Uncounted'),
      adj !== 0 ? (adj > 0 ? `+${adj}` : adj) : 0,
      finalQty !== null ? finalQty : (pc?.countedZeroConfirmed ? 0 : 'Uncounted'),
      variance,
      status,
      purch,
      sell,
      costImpact,
      retailImpact
    ]);
  }

  // Include Unknowns in full report
  if (reportType === 'full' || reportType === 'unknown') {
    for (const u of unknowns) {
      const finalQty = Number(u.physicalQty) || 0;
      const purch = Number(u.purchasePrice) || 0;
      const sell = Number(u.sellPrice) || 0;
      exportData.push([
        String(u.sku),
        String(u.productName || 'Unknown SKU'),
        String(u.location || ''),
        0,
        finalQty,
        0,
        finalQty,
        finalQty,
        'Unknown',
        purch,
        sell,
        Math.round(finalQty * purch * 100) / 100,
        Math.round(finalQty * sell * 100) / 100
      ]);
    }
  }

  const ws = XLSX.utils.aoa_to_sheet(exportData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, `Audit_${reportType.toUpperCase()}`);

  const locSafe = (project?.location || 'Store').replace(/[^a-zA-Z0-9_-]/g, '_');
  downloadWorkbook(wb, `Walkway_${locSafe}_Audit_${reportType}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

