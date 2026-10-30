import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { db } from '../database/db.js';
import { normalizeSku } from '../domain/validation.js';

class AudioSynthesizer {
  constructor() {
    this.ctx = null;
  }

  init() {
    if (!this.ctx && typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext)) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();
    }
  }

  /**
   * Professional, loud, crisp POS retail barcode scanner chime (Honeywell/Zebra style).
   */
  playSuccess() {
    try {
      this.init();
      if (!this.ctx) return;
      if (this.ctx.state === 'suspended') this.ctx.resume();

      const now = this.ctx.currentTime;

      // Primary oscillator (High crisp tone)
      const osc1 = this.ctx.createOscillator();
      const gain1 = this.ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(2093, now); // C7 (crisp retail scanner chime)
      gain1.gain.setValueAtTime(0.75, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

      // Harmonic oscillator (Gives enterprise chime body)
      const osc2 = this.ctx.createOscillator();
      const gain2 = this.ctx.createGain();
      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(2793.8, now); // F7
      gain2.gain.setValueAtTime(0.4, now);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

      osc1.connect(gain1);
      gain1.connect(this.ctx.destination);
      osc2.connect(gain2);
      gain2.connect(this.ctx.destination);

      osc1.start(now);
      osc1.stop(now + 0.12);
      osc2.start(now);
      osc2.stop(now + 0.12);
    } catch {
      // Audio autoplay policy fallback
    }
  }

  /**
   * Professional loud warning / unknown alert tone.
   */
  playError() {
    try {
      this.init();
      if (!this.ctx) return;
      if (this.ctx.state === 'suspended') this.ctx.resume();

      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(320, now);
      osc.frequency.setValueAtTime(240, now + 0.08);

      gain.gain.setValueAtTime(0.65, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.28);
    } catch {
      // Audio autoplay policy fallback
    }
  }

  /**
   * Delete / undo action blip.
   */
  playDelete() {
    try {
      this.init();
      if (!this.ctx) return;
      if (this.ctx.state === 'suspended') this.ctx.resume();

      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(600, now);
      osc.frequency.exponentialRampToValueAtTime(300, now + 0.09);

      gain.gain.setValueAtTime(0.45, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.09);
    } catch {}
  }
}

export const soundEffects = new AudioSynthesizer();

/**
 * High-Performance Dual-Engine (Hardware BarcodeDetector + ZXing WASM) Camera Scanner.
 * Specifically tuned for Mobile & Desktop:
 * - 1D Retail Barcodes: CODE 128, CODE 39, CODE 93, EAN 13, EAN 8, UPC-A, UPC-E, ITF, CODABAR
 * - 2D Matrix Codes: QR CODE, DATA MATRIX
 */
export class CameraScannerController {
  constructor(elementId, onScanCallback) {
    this.elementId = elementId;
    this.onScan = onScanCallback;
    this.active = false;
    this.html5QrCode = null;
    this.lastScannedCode = null;
    this.lastScanTime = 0;
    this.cooldownMs = 1500;
  }

  async start() {
    if (this.active) return { success: true };

    try {
      if (!this.html5QrCode) {
        const formatsToSupport = [
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.CODE_93,
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
          Html5QrcodeSupportedFormats.QR_CODE,
          Html5QrcodeSupportedFormats.ITF,
          Html5QrcodeSupportedFormats.CODABAR,
          Html5QrcodeSupportedFormats.DATA_MATRIX
        ];

        this.html5QrCode = new Html5Qrcode(this.elementId, {
          formatsToSupport: formatsToSupport,
          verbose: false,
          experimentalFeatures: {
            useBarCodeDetectorIfSupported: true
          }
        });
      }

      this.active = true;

      // Scanning region calculation: wide horizontal rect for 1D barcodes and 2D QR codes
      const qrboxFunction = (viewfinderWidth, viewfinderHeight) => {
        const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
        const qrboxWidth = Math.max(Math.floor(viewfinderWidth * 0.88), 260);
        const qrboxHeight = Math.max(Math.floor(viewfinderHeight * 0.55), 160);
        return { width: qrboxWidth, height: qrboxHeight };
      };

      const config = {
        fps: 20, // 20 scans per second for instant responsiveness
        qrbox: qrboxFunction,
        aspectRatio: 1.333333,
        videoConstraints: {
          facingMode: { ideal: 'environment' },
          focusMode: 'continuous'
        }
      };

      await this.html5QrCode.start(
        { facingMode: 'environment' },
        config,
        (decodedText, decodedResult) => {
          if (!this.active) return;
          const rawText = (decodedText || '').trim();
          if (rawText) {
            const now = Date.now();
            if (rawText === this.lastScannedCode && (now - this.lastScanTime) < this.cooldownMs) {
              return;
            }
            this.lastScannedCode = rawText;
            this.lastScanTime = now;

            soundEffects.playSuccess();
            this.onScan(rawText);
          }
        },
        (errorMessage) => {
          // ignore scan frame misses
        }
      );

      return { success: true };
    } catch (err) {
      this.active = false;
      console.error('Camera scanner start error:', err);
      return {
        success: false,
        error: err.message || 'Camera permission denied or camera not found'
      };
    }
  }

  async stop() {
    this.active = false;
    if (this.html5QrCode && this.html5QrCode.isScanning) {
      try {
        await this.html5QrCode.stop();
      } catch (err) {
        console.warn('Error stopping scanner:', err);
      }
    }
  }
}

/**
 * Processes a scanned or typed barcode/SKU within an active project & batch.
 */
export async function processScanInput({ projectId, batchId, rawInput, inputMethod = 'barcode', soundEnabled = true, quantityDelta = 1 }) {
  const normSku = normalizeSku(rawInput);
  if (!normSku) {
    if (soundEnabled) soundEffects.playError();
    return { success: false, error: 'Empty SKU input' };
  }

  const sourceMatches = await db.sourceRows.where('projectId').equals(projectId)
    .and(r => r.normalizedSku === normSku)
    .toArray();

  let scanResult = {
    sku: normSku,
    isUnknown: false,
    item: null,
    totalCount: 0,
    batchDelta: quantityDelta
  };

  const now = new Date().toISOString();

  if (sourceMatches.length > 0) {
    const primaryRow = sourceMatches[0];
    scanResult.item = primaryRow;

    await db.transaction('rw', [db.physicalCounts, db.scanEvents, db.projects], async () => {
      let existingCount = await db.physicalCounts.where('[projectId+sku]').equals([projectId, normSku]).first();

      let newCount = quantityDelta;
      if (existingCount) {
        newCount = Math.max(0, (Number(existingCount.originalCount) || 0) + quantityDelta);
        await db.physicalCounts.update(existingCount.id, {
          originalCount: newCount,
          countedZeroConfirmed: newCount === 0,
          lastUpdatedAt: now
        });
      } else {
        await db.physicalCounts.add({
          projectId,
          sku: normSku,
          productId: primaryRow.id,
          originalCount: Math.max(0, quantityDelta),
          countedZeroConfirmed: false,
          lastUpdatedAt: now,
          sourceBatchIds: [batchId]
        });
      }

      await db.scanEvents.add({
        projectId,
        batchId,
        productId: primaryRow.id,
        sku: normSku,
        eventType: quantityDelta > 0 ? 'scan' : 'manual-decrement',
        quantityDelta,
        quantityAfterEvent: newCount,
        inputMethod,
        createdAt: now
      });

      scanResult.totalCount = newCount;
    });

  } else {
    // Unknown SKU
    scanResult.isUnknown = true;

    await db.transaction('rw', [db.unknownProducts, db.scanEvents], async () => {
      let existingUnknown = await db.unknownProducts.where('[projectId+sku]').equals([projectId, normSku]).first();

      let newCount = quantityDelta;
      if (existingUnknown) {
        newCount = Math.max(0, (Number(existingUnknown.physicalQty) || 0) + quantityDelta);
        await db.unknownProducts.update(existingUnknown.id, {
          physicalQty: newCount,
          updatedAt: now
        });
        scanResult.item = existingUnknown;
      } else {
        const firstSourceWithLoc = await db.sourceRows.where('projectId').equals(projectId).and(r => r.location && r.location.trim() && r.location !== 'Store' && r.location !== 'Main Store').first();
        const proj = await db.projects.get(projectId);
        const storeLocation = firstSourceWithLoc?.location || proj?.location || 'Store';

        const id = await db.unknownProducts.add({
          projectId,
          sku: normSku,
          productName: `Unknown Article (${normSku})`,
          location: storeLocation,
          physicalQty: Math.max(0, quantityDelta),
          purchasePrice: 0,
          sellPrice: 0,
          priceStatus: 'Missing Price',
          note: '',
          createdAt: now,
          updatedAt: now
        });
        scanResult.item = await db.unknownProducts.get(id);
      }

      await db.scanEvents.add({
        projectId,
        batchId,
        sku: normSku,
        eventType: 'unknown',
        quantityDelta,
        quantityAfterEvent: newCount,
        inputMethod,
        createdAt: now
      });

      scanResult.totalCount = newCount;
    });
  }

  if (soundEnabled) {
    if (scanResult.isUnknown) {
      soundEffects.playError();
    } else {
      soundEffects.playSuccess();
    }
  }

  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    try {
      navigator.vibrate(scanResult.isUnknown ? [80, 40, 80] : 50);
    } catch {}
  }

  return { success: true, ...scanResult };
}

/**
 * Returns grouped list of unique SKUs scanned in a specific batch with total batch quantity.
 */
export async function getBatchGroupedItems(batchId, projectId) {
  const numBatchId = Number(batchId) || batchId;
  const events = await db.scanEvents.where('projectId').equals(projectId)
    .and(e => e.batchId === batchId || e.batchId === numBatchId)
    .toArray();

  // Aggregate quantity per SKU in this batch
  const skuDeltaMap = new Map();
  for (const ev of events) {
    const sku = ev.sku;
    skuDeltaMap.set(sku, (skuDeltaMap.get(sku) || 0) + (ev.quantityDelta || 0));
  }

  const items = [];
  let totalBatchUnits = 0;

  for (const [sku, batchQty] of skuDeltaMap.entries()) {
    if (batchQty <= 0) continue; // Skip zero/negative net in batch

    totalBatchUnits += batchQty;

    // Fetch product details
    const sourceMatch = await db.sourceRows.where('projectId').equals(projectId)
      .and(r => r.rawSku === sku || r.normalizedSku === sku)
      .first();
    const unknownMatch = !sourceMatch 
      ? (await db.unknownProducts.where('projectId').equals(projectId).and(u => u.sku === sku).first()) 
      : null;
    const countRecord = await db.physicalCounts.where('projectId').equals(projectId)
      .and(c => c.sku === sku)
      .first();

    const prodName = sourceMatch ? sourceMatch.productName : (unknownMatch ? unknownMatch.productName : `Article ${sku}`);
    const location = sourceMatch ? sourceMatch.location : (unknownMatch ? unknownMatch.location : 'Store');
    const softwareQty = sourceMatch ? Number(sourceMatch.softwareQty) : 0;
    const totalPhysical = countRecord ? Number(countRecord.originalCount) : (unknownMatch ? Number(unknownMatch.physicalQty) : batchQty);

    items.push({
      sku,
      productName: prodName,
      location,
      softwareQty,
      batchQty,
      totalPhysical,
      isUnknown: !sourceMatch,
      purchasePrice: sourceMatch ? sourceMatch.purchasePrice : (unknownMatch ? unknownMatch.purchasePrice : 0),
      sellPrice: sourceMatch ? sourceMatch.sellPrice : (unknownMatch ? unknownMatch.sellPrice : 0)
    });
  }

  // Sort descending by batch quantity (most scanned on top)
  items.sort((a, b) => b.batchQty - a.batchQty);

  return {
    items,
    totalBatchUnits,
    uniqueSkusCount: items.length
  };
}

/**
 * Direct batch item quantity modification (+/- or set exact).
 */
export async function setBatchSkuQuantity(batchId, projectId, sku, targetBatchQty) {
  const currentGroup = await getBatchGroupedItems(batchId, projectId);
  const currentItem = currentGroup.items.find(i => i.sku === sku);
  const currentBatchQty = currentItem ? currentItem.batchQty : 0;
  const delta = targetBatchQty - currentBatchQty;

  if (delta === 0) return;

  await processScanInput({
    projectId,
    batchId,
    rawInput: sku,
    inputMethod: 'manual',
    soundEnabled: false,
    quantityDelta: delta
  });
}

/**
 * Removes all counts of a SKU from the active batch.
 */
export async function removeSkuFromBatch(batchId, projectId, sku) {
  const currentGroup = await getBatchGroupedItems(batchId, projectId);
  const currentItem = currentGroup.items.find(i => i.sku === sku);
  if (!currentItem || currentItem.batchQty <= 0) return;

  const delta = -currentItem.batchQty;
  await processScanInput({
    projectId,
    batchId,
    rawInput: sku,
    inputMethod: 'manual',
    soundEnabled: false,
    quantityDelta: delta
  });
  soundEffects.playDelete();
}

/**
 * Deletes a specific scan event and properly re-adjusts physicalCounts aggregate.
 */
export async function deleteScanEvent(eventId, projectId) {
  const event = await db.scanEvents.get(eventId);
  if (!event) return;

  const sku = event.sku;
  const delta = event.quantityDelta || 1;

  await db.transaction('rw', [db.physicalCounts, db.unknownProducts, db.scanEvents], async () => {
    await db.scanEvents.delete(eventId);

    const pc = await db.physicalCounts.where('[projectId+sku]').equals([projectId, sku]).first();
    if (pc) {
      const newCount = Math.max(0, (Number(pc.originalCount) || 0) - delta);
      await db.physicalCounts.update(pc.id, {
        originalCount: newCount,
        countedZeroConfirmed: newCount === 0,
        lastUpdatedAt: new Date().toISOString()
      });
    }

    const unk = await db.unknownProducts.where('[projectId+sku]').equals([projectId, sku]).first();
    if (unk) {
      const newCount = Math.max(0, (Number(unk.physicalQty) || 0) - delta);
      await db.unknownProducts.update(unk.id, {
        physicalQty: newCount,
        updatedAt: new Date().toISOString()
      });
    }
  });

  soundEffects.playDelete();
}
