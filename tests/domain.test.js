import { describe, it, expect } from 'vitest';
import {
  calculateVariance,
  calculateShortage,
  calculateExcess,
  determineStockStatus,
  calculateAuditTotals,
  safeMultiply
} from '../src/domain/calculations.js';
import {
  detectDuplicateSkuGroups,
  allocateQuantityAcrossRows
} from '../src/domain/duplicates.js';
import {
  normalizeSku,
  isValidQuantity,
  formatCurrency
} from '../src/domain/validation.js';

describe('Domain Calculations', () => {
  it('correctly calculates variance, shortage and excess', () => {
    expect(calculateVariance(10, 10)).toBe(0);
    expect(calculateShortage(10, 10)).toBe(0);
    expect(calculateExcess(10, 10)).toBe(0);

    expect(calculateVariance(8, 10)).toBe(-2);
    expect(calculateShortage(8, 10)).toBe(2);
    expect(calculateExcess(8, 10)).toBe(0);

    expect(calculateVariance(8, 5)).toBe(3);
    expect(calculateShortage(8, 5)).toBe(0);
    expect(calculateExcess(8, 5)).toBe(3);
  });

  it('determines status correctly according to PRD 13.3', () => {
    expect(determineStockStatus({ softwareQty: 10, finalPhysicalQty: 10 })).toBe('Matched');
    expect(determineStockStatus({ softwareQty: 10, finalPhysicalQty: 8 })).toBe('Short');
    expect(determineStockStatus({ softwareQty: 5, finalPhysicalQty: 8 })).toBe('Excess');
    expect(determineStockStatus({ softwareQty: 5, finalPhysicalQty: null, isCountedZero: false })).toBe('Uncounted');
    expect(determineStockStatus({ softwareQty: 5, finalPhysicalQty: null, isCountedZero: true })).toBe('Counted Zero');
    expect(determineStockStatus({ softwareQty: 0, finalPhysicalQty: 3, isUnknown: true })).toBe('Unknown');
    expect(determineStockStatus({ isExcluded: true })).toBe('Excluded');
    expect(determineStockStatus({ hasConflict: true })).toBe('Needs Resolution');
  });

  it('avoids floating point errors in valuation', () => {
    expect(safeMultiply(3, 0.1)).toBe(0.3);
    expect(safeMultiply(7, 199.99)).toBe(1399.93);
  });

  it('computes complete audit totals accurately', () => {
    const rows = [
      { softwareQty: 10, originalPhysicalQty: 7, finalPhysicalQty: 8, purchasePrice: 1000, sellPrice: 1200 },
      { softwareQty: 5, originalPhysicalQty: 8, finalPhysicalQty: 8, purchasePrice: 500, sellPrice: 650 },
      { softwareQty: 4, originalPhysicalQty: 4, finalPhysicalQty: 4, purchasePrice: 200, sellPrice: 300 }
    ];

    const totals = calculateAuditTotals(rows);
    expect(totals.softwareUnits).toBe(19);
    expect(totals.finalPhysicalUnits).toBe(20);
    expect(totals.shortageUnits).toBe(2);
    expect(totals.excessUnits).toBe(3);
    expect(totals.shortageCost).toBe(2400); // 2 units * 1200 sell price
    expect(totals.excessCost).toBe(1950);   // 3 units * 650 sell price
    expect(totals.netCostVariance).toBe(-450);
    expect(totals.matchedCount).toBe(1);
    expect(totals.shortCount).toBe(1);
    expect(totals.excessCount).toBe(1);
  });

  it('treats uncounted rows as missing stock / shortage in valuation', () => {
    const rows = [
      { softwareQty: 10, originalPhysicalQty: null, finalPhysicalQty: null, purchasePrice: 500, sellPrice: 800 },
      { softwareQty: 2, originalPhysicalQty: 3, finalPhysicalQty: 3, purchasePrice: 200, sellPrice: 300 }
    ];

    const totals = calculateAuditTotals(rows);
    expect(totals.uncountedCount).toBe(1);
    expect(totals.shortageUnits).toBe(10);
    expect(totals.shortageCost).toBe(8000); // 10 * 800
    expect(totals.excessUnits).toBe(1);
    expect(totals.excessCost).toBe(300);    // 1 * 300
    expect(totals.netCostVariance).toBe(-7700); // 300 - 8000 = -7700 (Net Shortage)
  });
});

describe('Duplicate SKU Handling', () => {
  it('detects multiple rows sharing SKU naturally without blocking', () => {
    const rows = [
      { rawSku: '562650-1', productName: 'Shoe A Size 1', purchasePrice: 500, sellPrice: 800 },
      { rawSku: '562650-1', productName: 'Shoe A Size 2', purchasePrice: 600, sellPrice: 900 },
      { rawSku: '809900', productName: 'Socks', purchasePrice: 50, sellPrice: 80 }
    ];

    const groups = detectDuplicateSkuGroups(rows);
    expect(groups.length).toBe(1);
    expect(groups[0].sku).toBe('562650-1');
    expect(groups[0].rowsCount).toBe(2);
  });

  it('safely allocates physical quantity across duplicate rows without repeating full count', () => {
    const rows = [
      { id: 1, rawSku: '562650-1', softwareQty: 5 },
      { id: 2, rawSku: '562650-1', softwareQty: 3 }
    ];

    const allocated = allocateQuantityAcrossRows(rows, 7, 'fill-first');
    expect(allocated[0].allocatedPhysicalQty).toBe(5);
    expect(allocated[1].allocatedPhysicalQty).toBe(2);
    expect(allocated[0].allocatedPhysicalQty + allocated[1].allocatedPhysicalQty).toBe(7);
  });
});

describe('Validation & Normalization', () => {
  it('preserves leading zeros and exact SKU characters', () => {
    expect(normalizeSku('  001294-A  ')).toBe('001294-A');
    expect(normalizeSku('562650-1')).toBe('562650-1');
  });

  it('validates integer quantities strictly', () => {
    expect(isValidQuantity(0)).toBe(true);
    expect(isValidQuantity(50)).toBe(true);
    expect(isValidQuantity(-5)).toBe(false);
    expect(isValidQuantity(12.5)).toBe(false);
    expect(isValidQuantity('abc')).toBe(false);
  });

  it('formats currency correctly with BDT symbol', () => {
    expect(formatCurrency(1500)).toBe('৳1,500');
    expect(formatCurrency(-500)).toBe('-৳500');
  });
});
