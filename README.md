# Walkway Inventory Counting — POS Stock Reconciliation

**Product:** Walkway Inventory Counting  
**Version:** 1.0.0 (Production Release)  
**Product Owner:** Walkway  
**Developer:** [Metazon BD](https://metazonbd.com)  
**Copyright:** All Rights Reserved © Walkway  

---

## 1. Overview

**Walkway Inventory Counting** is an enterprise-grade, offline-first inventory audit and POS stock reconciliation web application built for Walkway retail stores. 

It imports stock count sheets exported from Walkway's POS system, manages physical counts via hardware barcode scanners or manual entry across multiple counting batches, calculates exact inventory and financial variance, supports non-destructive adjustments, and exports finalized 9-column POS-compliant reconciliation workbooks.

---

## 2. Core Modules & Architecture

1. **Dashboard:** Real-time executive metrics, KPI cards, Stock Status Distribution chart, POS vs. Physical Cost Valuation comparison, and Top 5 Shortage & Excess tables.
2. **Before Inventory (Excel Import):** Drag-and-drop POS count sheet importer with column validation, preview, and automatic conflict detection for duplicate SKU groups (e.g. `562650-1` to `562650-6`).
3. **Physical Scanning:** Hardware keyboard-wedge barcode scanner support, rapid consecutive scan aggregation, automatic focus retention (<kbd>F2</kbd>), offline Web Audio API sound chimes, live batch progress, and zero-count confirmation.
4. **Batch Management:** Organization of counting sessions (racks, aisles, staff shifts) with temporary submission, reactivation, and audit history.
5. **Reconciliation & Variance Analysis:** High-density, sortable, filterable audit table with SKU-level search, pagination, status categorization, and bulk zero-count confirmation.
6. **Exportable Audit Reports:** One-click Excel downloads for Full Audit Reconciliation, Shortages, Excess, Matched, Unknown Barcodes, and Adjustments.
7. **Stock Count Adjustments:** Non-destructive adjustment ledger with mandatory reason tracking, reversal capability, and final quantity computation.
8. **Finalization & Lock:** Comprehensive 8-point verification checklist, audit freeze, and controlled supervisor reopening with reason logging.
9. **POS Excel Export:** Exact 9-column POS template export (`SKU`, `Product`, `Location`, `Software Qty`, `Physical Qty`, `Purchase Price`, `Sell Price`, `Reason`, `Note`), maintaining row order and safely allocating duplicate SKU physical quantities.
10. **Backup & Restore:** Compressed `.walkwaybackup` archives containing JSON records and manifest for seamless disaster recovery and cross-device migration.
11. **Settings:** Scanner sound effect toggle, auto-submit toggle, focus keeper, and local database management.

---

## 3. Technology Stack

- **Frontend & UI:** HTML5, Modern Vanilla JavaScript (ES Modules), Tailwind CSS v3
- **Local Persistence:** IndexedDB via Dexie.js (offline-first, zero cloud dependencies)
- **Spreadsheet Processing:** SheetJS (XLSX)
- **Data Visualizations:** Chart.js
- **Backup Archives:** JSZip
- **Audio Synthesis:** Web Audio API (offline pure oscillator chimes)
- **Build System & Dev Server:** Vite 5
- **Unit & Integration Testing:** Vitest

---

## 4. Getting Started

### Prerequisites
- Node.js (v18+ recommended)
- Modern web browser (Google Chrome, Microsoft Edge)

### Installation
```bash
npm install
```

### Running the Development Server
```bash
npm run dev
```
The application will launch at `http://localhost:3000`.

### Running Unit Tests
```bash
npm test
```

### Building for Production
```bash
npm run build
```
Production assets are generated in the `dist/` directory ready for static hosting or local offline browser execution.

### Previewing the Production Build
```bash
npm run preview
```

---

## 5. Offline & PWA Usage

The application includes a `manifest.webmanifest` and service worker (`sw.js`). Once loaded over `http://localhost` or `https://`, all assets are cached locally and the application functions 100% offline without requiring internet access.

