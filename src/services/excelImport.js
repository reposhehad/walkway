import * as XLSX from 'xlsx';
import { db, logAudit } from '../database/db.js';
import { normalizeSku } from '../domain/validation.js';

/**
 * Flexible, dynamic column header matching helper.
 */
function findColumnIndex(headers, patterns) {
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i].toLowerCase().replace(/[^a-z0-9]/g, '');
    for (const pat of patterns) {
      const cleanPat = pat.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (h === cleanPat || h.includes(cleanPat)) {
        return i;
      }
    }
  }
  return -1;
}

/**
 * Required column definitions with descriptions for user interface.
 */
export const REQUIRED_EXCEL_COLUMNS = [
  { key: 'SKU', label: 'SKU / Barcode', required: true, example: '562650-1', desc: 'Unique article or barcode identifier' },
  { key: 'Product', label: 'Product Name', required: true, example: 'Walkway Men Loafer Black', desc: 'Product description or style title' },
  { key: 'Location', label: 'Store Location', required: false, example: 'Sreemongal Walkway', desc: 'Retail branch or outlet name' },
  { key: 'Software Qty', label: 'Software Qty', required: true, example: '10', desc: 'Current stock registered in POS' },
  { key: 'Physical Qty', label: 'Physical Qty', required: false, example: 'Blank', desc: 'Physical counted quantity (leave blank initially)' },
  { key: 'Purchase Price', label: 'Purchase Price', required: false, example: '1250', desc: 'Unit cost price in BDT' },
  { key: 'Sell Price', label: 'Sell Price', required: false, example: '1850', desc: 'Retail selling price in BDT' },
  { key: 'Reason', label: 'Reason', required: false, example: 'Regular Audit', desc: 'Audit reason or discrepancy remark' },
  { key: 'Note', label: 'Note', required: false, example: 'Rack A-2', desc: 'Optional audit note or shelf tag' }
];

export async function parseExcelWorkbook(fileOrBuffer, projectId, locationFallback = 'Walkway Retail Outlet') {
  let wb;
  if (fileOrBuffer instanceof ArrayBuffer || fileOrBuffer instanceof Uint8Array) {
    wb = XLSX.read(fileOrBuffer, { type: 'array' });
  } else {
    const data = await fileOrBuffer.arrayBuffer();
    wb = XLSX.read(data, { type: 'array' });
  }

  const sheetName = wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  const jsonRows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false });

  if (jsonRows.length < 2) {
    throw new Error('Excel workbook contains no data rows.');
  }

  const headerRow = jsonRows[0].map(h => String(h || '').trim());

  // Dynamic header detection with multiple synonyms
  const skuIdx = findColumnIndex(headerRow, ['sku', 'barcode', 'item code', 'article code', 'code', 'article']);
  const prodIdx = findColumnIndex(headerRow, ['product', 'item name', 'description', 'title', 'product name', 'item']);
  const locIdx = findColumnIndex(headerRow, ['location', 'store', 'branch', 'outlet', 'warehouse']);
  const softIdx = findColumnIndex(headerRow, ['software qty', 'soft qty', 'software quantity', 'pos qty', 'system qty', 'stock qty', 'qty']);
  const purchIdx = findColumnIndex(headerRow, ['purchase price', 'purchase', 'cost price', 'cost', 'buy price', 'unit cost']);
  const sellIdx = findColumnIndex(headerRow, ['sell price', 'selling price', 'sale price', 'mrp', 'retail price', 'price']);
  const reasonIdx = findColumnIndex(headerRow, ['reason', 'remarks', 'remark']);
  const noteIdx = findColumnIndex(headerRow, ['note', 'notes', 'comment', 'comments']);

  if (skuIdx === -1) {
    throw new Error('Mandatory "SKU" or Barcode column could not be found. Please ensure the Excel file has a column for SKU.');
  }

  const sourceRows = [];
  for (let i = 1; i < jsonRows.length; i++) {
    const row = jsonRows[i];
    if (!row || row.length === 0) continue;

    const rawSku = String(row[skuIdx] || '').trim();
    if (!rawSku) continue;

    const normSku = normalizeSku(rawSku);
    const softQty = softIdx !== -1 ? (parseInt(row[softIdx], 10) || 0) : 0;
    const purchPrice = purchIdx !== -1 ? (parseFloat(row[purchIdx]) || 0) : 0;
    const sellPrice = sellIdx !== -1 ? (parseFloat(row[sellIdx]) || 0) : 0;
    const prodName = prodIdx !== -1 && row[prodIdx] ? String(row[prodIdx]).trim() : `Article ${normSku}`;
    const loc = locIdx !== -1 && row[locIdx] ? String(row[locIdx]).trim() : locationFallback;
    const reason = reasonIdx !== -1 && row[reasonIdx] ? String(row[reasonIdx]).trim() : '';
    const note = noteIdx !== -1 && row[noteIdx] ? String(row[noteIdx]).trim() : '';

    sourceRows.push({
      projectId,
      sourceRowNumber: i,
      rawSku,
      normalizedSku: normSku,
      productName: prodName,
      location: loc,
      softwareQty: Math.max(0, softQty),
      originalPhysicalQty: null,
      purchasePrice: purchPrice,
      sellPrice: sellPrice,
      reason,
      note,
      isExcluded: 0,
      exclusionReason: '',
      duplicateGroupId: null,
      resolutionStatus: 'valid'
    });
  }

  // Save to Dexie in chunks - naturally preserving every row
  await db.transaction('rw', [db.sourceRows, db.projects], async () => {
    await db.sourceRows.where('projectId').equals(projectId).delete();

    const chunkSize = 2000;
    for (let c = 0; c < sourceRows.length; c += chunkSize) {
      await db.sourceRows.bulkAdd(sourceRows.slice(c, c + chunkSize));
    }

    const detectedLocation = sourceRows.find(r => r.location && r.location.trim() && r.location !== 'Store')?.location;
    await db.projects.update(projectId, {
      name: detectedLocation ? `Walkway Audit - ${detectedLocation}` : 'Walkway Store Audit',
      location: detectedLocation || 'Walkway Retail Outlet',
      status: 'In Progress',
      updatedAt: new Date().toISOString()
    });
  });

  await logAudit(projectId, 'sourceRows', projectId, 'IMPORT_EXCEL', null, {
    totalRows: sourceRows.length
  }, `Imported ${sourceRows.length} source records`);

  return {
    totalImported: sourceRows.length,
    detectedHeaders: {
      sku: headerRow[skuIdx],
      product: prodIdx !== -1 ? headerRow[prodIdx] : null,
      location: locIdx !== -1 ? headerRow[locIdx] : null,
      softwareQty: softIdx !== -1 ? headerRow[softIdx] : null,
      purchasePrice: purchIdx !== -1 ? headerRow[purchIdx] : null,
      sellPrice: sellIdx !== -1 ? headerRow[sellIdx] : null
    }
  };
}
