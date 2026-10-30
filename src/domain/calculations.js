/**
 * Pure domain calculation and financial valuation rules for Walkway Inventory Counting.
 * All calculations adhere strictly to the master build specification.
 */

/**
 * Calculates variance: Final Physical Qty - Software Qty.
 * Positive = Excess, Negative = Shortage, 0 = Matched.
 */
export function calculateVariance(finalPhysicalQty, softwareQty) {
  const physical = Number(finalPhysicalQty) || 0;
  const software = Number(softwareQty) || 0;
  return physical - software;
}

/**
 * Calculates shortage quantity: max(Software Qty - Final Physical Qty, 0).
 */
export function calculateShortage(finalPhysicalQty, softwareQty) {
  const physical = Number(finalPhysicalQty) || 0;
  const software = Number(softwareQty) || 0;
  return Math.max(software - physical, 0);
}

/**
 * Calculates excess quantity: max(Final Physical Qty - Software Qty, 0).
 */
export function calculateExcess(finalPhysicalQty, softwareQty) {
  const physical = Number(finalPhysicalQty) || 0;
  const software = Number(softwareQty) || 0;
  return Math.max(physical - software, 0);
}

/**
 * Determines exact item audit status.
 *
 * Statuses:
 * - 'Needs Resolution': duplicate/identity conflict exists
 * - 'Excluded': row explicitly excluded
 * - 'Unknown': item scanned but absent in POS master
 * - 'Uncounted': not scanned and not confirmed zero
 * - 'Counted Zero': physically confirmed 0 units
 * - 'Matched': Final Physical === Software Qty
 * - 'Short': Final Physical < Software Qty
 * - 'Excess': Final Physical > Software Qty
 */
export function determineStockStatus({
  softwareQty = 0,
  finalPhysicalQty = null,
  isUnknown = false,
  isExcluded = false,
  isCountedZero = false,
  hasConflict = false
}) {
  if (hasConflict) return 'Needs Resolution';
  if (isExcluded) return 'Excluded';
  if (isUnknown) return 'Unknown';

  if (finalPhysicalQty === null || finalPhysicalQty === undefined) {
    return isCountedZero ? 'Counted Zero' : 'Uncounted';
  }

  const physical = Number(finalPhysicalQty);
  const software = Number(softwareQty);

  if (physical === software) return 'Matched';
  if (physical < software) return 'Short';
  return 'Excess';
}

/**
 * Safely computes valuation avoiding floating point precision glitches.
 * e.g. 0.1 * 3 = 0.30000000000000004
 */
export function safeMultiply(quantity, price) {
  const q = Number(quantity) || 0;
  const p = Number(price) || 0;
  // Convert price to cents / 100 for precision
  return Math.round(q * p * 100) / 100;
}

/**
 * Aggregates complete project-level audit KPIs and financials from row records.
 */
export function calculateAuditTotals(rows = []) {
  let softwareUnits = 0;
  let originalPhysicalUnits = 0;
  let finalPhysicalUnits = 0;
  let shortageUnits = 0;
  let excessUnits = 0;

  let beforeStockCost = 0; // In Sell Price per user requirement
  let finalPhysicalCost = 0; // In Sell Price per user requirement
  let shortageCost = 0; // In Sell Price per user requirement
  let excessCost = 0; // In Sell Price per user requirement

  let beforePurchaseCost = 0;
  let finalPhysicalPurchaseCost = 0;
  let shortagePurchaseCost = 0;
  let excessPurchaseCost = 0;

  let beforeRetailValue = 0;
  let finalPhysicalRetailValue = 0;

  let matchedCount = 0;
  let shortCount = 0;
  let excessCount = 0;
  let unknownCount = 0;
  let uncountedCount = 0;
  let countedZeroCount = 0;
  let missingPriceCount = 0;
  let countedItemCount = 0;

  for (const row of rows) {
    if (row.isExcluded) continue;

    const softQty = Number(row.softwareQty) || 0;
    const origQty = row.originalPhysicalQty !== null && row.originalPhysicalQty !== undefined
      ? Number(row.originalPhysicalQty) : null;
    const finalQty = row.finalPhysicalQty !== null && row.finalPhysicalQty !== undefined
      ? Number(row.finalPhysicalQty) : null;
    const purchPrice = Number(row.purchasePrice) || 0;
    const sellPrice = Number(row.sellPrice) || 0;

    if (!row.sellPrice && row.sellPrice !== 0) {
      missingPriceCount++;
    }

    softwareUnits += softQty;
    beforeStockCost += safeMultiply(softQty, sellPrice);
    beforeRetailValue += safeMultiply(softQty, sellPrice);
    beforePurchaseCost += safeMultiply(softQty, purchPrice);

    if (row.isUnknown) {
      unknownCount++;
    }

    if (finalQty !== null) {
      finalPhysicalUnits += finalQty;
      finalPhysicalCost += safeMultiply(finalQty, sellPrice);
      finalPhysicalRetailValue += safeMultiply(finalQty, sellPrice);
      finalPhysicalPurchaseCost += safeMultiply(finalQty, purchPrice);
      countedItemCount++;
    }

    if (origQty !== null) {
      originalPhysicalUnits += origQty;
    }

    const status = determineStockStatus({
      softwareQty: softQty,
      finalPhysicalQty: finalQty,
      isUnknown: row.isUnknown,
      isExcluded: row.isExcluded,
      isCountedZero: row.isCountedZero,
      hasConflict: row.hasConflict
    });

    if (status === 'Matched') {
      matchedCount++;
    } else if (status === 'Short') {
      shortCount++;
      const short = calculateShortage(finalQty, softQty);
      shortageUnits += short;
      shortageCost += safeMultiply(short, sellPrice);
      shortagePurchaseCost += safeMultiply(short, purchPrice);
    } else if (status === 'Excess') {
      excessCount++;
      const excess = calculateExcess(finalQty, softQty);
      excessUnits += excess;
      excessCost += safeMultiply(excess, sellPrice);
      excessPurchaseCost += safeMultiply(excess, purchPrice);
    } else if (status === 'Uncounted') {
      uncountedCount++;
      // Uncounted items were not physically found in store, representing missing software stock (shortage)
      const short = softQty;
      shortageUnits += short;
      shortageCost += safeMultiply(short, sellPrice);
      shortagePurchaseCost += safeMultiply(short, purchPrice);
    } else if (status === 'Counted Zero') {
      countedZeroCount++;
      const short = softQty; // short by entire software qty
      shortageUnits += short;
      shortageCost += safeMultiply(short, sellPrice);
      shortagePurchaseCost += safeMultiply(short, purchPrice);
    }
  }

  const netCostVariance = Math.round((excessCost - shortageCost) * 100) / 100;
  const totalCountableRows = rows.filter(r => !r.isExcluded && !r.isUnknown).length;
  const completionPercentage = totalCountableRows > 0
    ? Math.min(100, Math.round(((countedItemCount + countedZeroCount) / totalCountableRows) * 100))
    : 0;

  return {
    totalRows: rows.length,
    softwareUnits,
    originalPhysicalUnits,
    finalPhysicalUnits,
    varianceUnits: finalPhysicalUnits - softwareUnits,
    shortageUnits,
    excessUnits,
    beforeStockCost: Math.round(beforeStockCost * 100) / 100,
    finalPhysicalCost: Math.round(finalPhysicalCost * 100) / 100,
    shortageCost: Math.round(shortageCost * 100) / 100,
    excessCost: Math.round(excessCost * 100) / 100,
    beforePurchaseCost: Math.round(beforePurchaseCost * 100) / 100,
    finalPhysicalPurchaseCost: Math.round(finalPhysicalPurchaseCost * 100) / 100,
    shortagePurchaseCost: Math.round(shortagePurchaseCost * 100) / 100,
    excessPurchaseCost: Math.round(excessPurchaseCost * 100) / 100,
    netCostVariance,
    beforeRetailValue: Math.round(beforeRetailValue * 100) / 100,
    finalPhysicalRetailValue: Math.round(finalPhysicalRetailValue * 100) / 100,
    matchedCount,
    shortCount,
    excessCount,
    unknownCount,
    uncountedCount,
    countedZeroCount,
    missingPriceCount,
    completionPercentage
  };
}

