/**
 * SKU grouping and allocation rules for Walkway Inventory Counting.
 * Handles duplicate SKUs naturally as standard multiple-record rows without blocking or errors.
 */

/**
 * Checks SKU distribution across rows. Does not flag errors or block import.
 */
export function detectDuplicateSkuGroups(sourceRows = []) {
  const map = new Map();

  for (const row of sourceRows) {
    const sku = String(row.rawSku || row.sku || '').trim();
    if (!sku) continue;

    if (!map.has(sku)) {
      map.set(sku, []);
    }
    map.get(sku).push(row);
  }

  const duplicateGroups = [];
  for (const [sku, rows] of map.entries()) {
    if (rows.length > 1) {
      duplicateGroups.push({
        sku,
        rowsCount: rows.length,
        hasConflict: false,
        conflictDetails: `${rows.length} rows sharing SKU (Size variants / multiple batches)`,
        rows
      });
    }
  }

  return duplicateGroups;
}

/**
 * Allocates counted physical quantity across duplicate source rows without repeating full count.
 */
export function allocateQuantityAcrossRows(sourceRows = [], totalPhysicalQty = 0, strategy = 'fill-first') {
  const result = [];
  let remaining = Number(totalPhysicalQty) || 0;

  if (strategy === 'fill-first') {
    for (let i = 0; i < sourceRows.length; i++) {
      const row = sourceRows[i];
      const targetSoft = Number(row.softwareQty) || 0;

      let allocated = 0;
      if (i === sourceRows.length - 1) {
        allocated = remaining;
      } else {
        allocated = Math.min(remaining, targetSoft);
      }
      remaining = Math.max(0, remaining - allocated);

      result.push({
        ...row,
        allocatedPhysicalQty: allocated
      });
    }
  } else {
    const totalSoft = sourceRows.reduce((sum, r) => sum + (Number(r.softwareQty) || 0), 0);
    let assigned = 0;

    for (let i = 0; i < sourceRows.length; i++) {
      const row = sourceRows[i];
      let allocated = 0;
      if (i === sourceRows.length - 1) {
        allocated = totalPhysicalQty - assigned;
      } else if (totalSoft > 0) {
        const ratio = (Number(row.softwareQty) || 0) / totalSoft;
        allocated = Math.round(totalPhysicalQty * ratio);
        assigned += allocated;
      } else {
        allocated = Math.floor(totalPhysicalQty / sourceRows.length);
        assigned += allocated;
      }

      result.push({
        ...row,
        allocatedPhysicalQty: Math.max(0, allocated)
      });
    }
  }

  return result;
}
