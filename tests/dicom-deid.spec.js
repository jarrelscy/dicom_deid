// @ts-check
const { test, expect } = require('@playwright/test');
const path = require('path');

const FIXTURE_DIR = path.join(__dirname, 'fixtures');
const ZIP_FILE = path.join(FIXTURE_DIR, 'test_ct_brain_5.zip');
const SAMPLE_DCM = path.join(FIXTURE_DIR, 'sample.dcm');

/** Dismiss the disclaimer modal so the app is interactive. */
async function dismissDisclaimer(page) {
  const checkbox = page.locator('#disclaimerCheckbox');
  if (await checkbox.isVisible({ timeout: 3000 }).catch(() => false)) {
    await checkbox.check();
    await page.locator('#disclaimerAgreeBtn').click();
    // Wait for modal to disappear
    await expect(page.locator('#disclaimerModal')).toHaveClass(/hidden/, { timeout: 3000 });
  }
}

// ────────────────────────────────────────────────
// 1. Smoke: app loads, disclaimer works
// ────────────────────────────────────────────────
test('app loads and disclaimer modal can be dismissed', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('h1')).toHaveText('DICOM De-identification Tool');
  // Disclaimer should be visible
  await expect(page.locator('#disclaimerModal')).not.toHaveClass(/hidden/);
  // Agree button disabled until checkbox
  await expect(page.locator('#disclaimerAgreeBtn')).toBeDisabled();
  await page.locator('#disclaimerCheckbox').check();
  await expect(page.locator('#disclaimerAgreeBtn')).toBeEnabled();
  await page.locator('#disclaimerAgreeBtn').click();
  await expect(page.locator('#disclaimerModal')).toHaveClass(/hidden/);
});

// ────────────────────────────────────────────────
// 2. ZIP mode: process 5 CT brain DICOM files
// ────────────────────────────────────────────────
test('ZIP mode: processes 5 DICOM files end-to-end', async ({ page }) => {
  await page.goto('/');
  await dismissDisclaimer(page);

  // Enter passphrase
  await page.fill('#passphrase', 'testpass123');

  // Upload ZIP via file chooser
  const fileChooserPromise = page.waitForEvent('filechooser');
  await page.locator('#uploadArea').click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles(ZIP_FILE);

  // Process button should be enabled
  await expect(page.locator('#processBtn')).toBeEnabled();
  await page.locator('#processBtn').click();

  // Wait for results section to appear (processing complete)
  await expect(page.locator('#resultsSection')).toBeVisible({ timeout: 60_000 });

  // Check results text
  const resultsText = await page.locator('#resultsText').textContent();
  console.log('ZIP mode results:', resultsText);
  // Should mention successfully processed files
  expect(resultsText).toMatch(/processed/i);

  // Download button should be visible (ZIP mode generates downloadable output)
  await expect(page.locator('#downloadBtn')).toBeVisible();
});

// ────────────────────────────────────────────────
// 3. Unit: isDicomFile correctly identifies DICOM header from 132-byte slice
// ────────────────────────────────────────────────
test('isDicomFile works with 132-byte header slice (MM-03 validation)', async ({ page }) => {
  await page.goto('/');
  await dismissDisclaimer(page);

  const result = await page.evaluate(async () => {
    // @ts-ignore - app global
    const app = new DicomDeidentifier();

    // Create a valid 132-byte DICOM header
    const validHeader = new Uint8Array(132);
    validHeader[128] = 0x44; // D
    validHeader[129] = 0x49; // I
    validHeader[130] = 0x43; // C
    validHeader[131] = 0x4D; // M

    // Create an invalid header
    const invalidHeader = new Uint8Array(132);

    // Create a too-short buffer
    const shortBuf = new Uint8Array(100);

    return {
      validDetected: app.isDicomFile(validHeader.buffer),
      invalidRejected: !app.isDicomFile(invalidHeader.buffer),
      shortRejected: !app.isDicomFile(shortBuf.buffer),
    };
  });

  expect(result.validDetected).toBe(true);
  expect(result.invalidRejected).toBe(true);
  expect(result.shortRejected).toBe(true);
});

// ────────────────────────────────────────────────
// 4. Unit: BATCH_SIZE is set in constructor
// ────────────────────────────────────────────────
test('constructor sets BATCH_SIZE = 50 (BP-01)', async ({ page }) => {
  await page.goto('/');
  await dismissDisclaimer(page);

  const batchSize = await page.evaluate(() => {
    // @ts-ignore
    const app = new DicomDeidentifier();
    return app.BATCH_SIZE;
  });

  expect(batchSize).toBe(50);
});

// ────────────────────────────────────────────────
// 5. Unit: processWithWorkersQueue method exists
// ────────────────────────────────────────────────
test('processWithWorkersQueue method exists on prototype (BP-01)', async ({ page }) => {
  await page.goto('/');
  await dismissDisclaimer(page);

  const hasMethod = await page.evaluate(() => {
    return typeof DicomDeidentifier.prototype.processWithWorkersQueue === 'function';
  });

  expect(hasMethod).toBe(true);
});

// ────────────────────────────────────────────────
// 6. Folder mode routing: processFiles calls processWithWorkersQueue for folder mode
// ────────────────────────────────────────────────
test('folder mode routes to processWithWorkersQueue (not streaming)', async ({ page }) => {
  await page.goto('/');
  await dismissDisclaimer(page);

  // Instrument the app to detect which method is called
  const methodCalled = await page.evaluate(async () => {
    return new Promise((resolve) => {
      // @ts-ignore
      const app = new DicomDeidentifier();
      app.processingMode = 'folder';
      app.passphrase = 'testpass';
      app.inputDirectoryHandle = {}; // stub
      app.outputDirectoryHandle = {}; // stub

      // Patch methods to detect which is called
      let called = 'none';
      app.processWithWorkersQueue = async () => { called = 'queue'; };
      app.processWithWorkersStreaming = async () => { called = 'streaming'; };
      app.processWithWorkers = () => { called = 'workers'; };
      app.extractDicomFilesFromDirectory = async () => {
        // Return fake dicom files with fileHandle stubs
        return [{ filename: 'test.dcm', path: 'test.dcm', fileHandle: {} }];
      };
      app.getSelectedSOPClassUIDs = () => ['1.2.840.10008.5.1.4.1.1.2'];
      app.initializeWorkers = async () => { app.workers = [{}]; };
      app.distributeFiles = () => [[]];
      app.showProgress = () => {};
      app.updateProgress = () => {};

      app.processFiles().then(() => resolve(called)).catch(() => resolve(called));
    });
  });

  expect(methodCalled).toBe('queue');
});

// ────────────────────────────────────────────────
// 7. Memory: result.data is nulled after save in streaming path (MM-02)
// ────────────────────────────────────────────────
test('processWithWorkersStreaming nulls result.data after save (MM-02)', async ({ page }) => {
  await page.goto('/');
  await dismissDisclaimer(page);

  // Check the source code includes the MM-02 null pattern
  const hasNull = await page.evaluate(() => {
    const src = DicomDeidentifier.prototype.processWithWorkersStreaming.toString();
    return src.includes('result.data = null');
  });

  expect(hasNull).toBe(true);
});

// ────────────────────────────────────────────────
// 8. Memory: processWithWorkersQueue pushes only lightweight metadata
// ────────────────────────────────────────────────
test('processWithWorkersQueue pushes lightweight metadata only (no binary data)', async ({ page }) => {
  await page.goto('/');
  await dismissDisclaimer(page);

  const src = await page.evaluate(() => {
    return DicomDeidentifier.prototype.processWithWorkersQueue.toString();
  });

  // Should null result.data
  expect(src).toContain('result.data = null');
  // Should push only {filename, success, error}
  expect(src).toContain('filename: result.filename');
  expect(src).toContain('success: result.success');
  expect(src).toContain('error: result.error');
});

// ────────────────────────────────────────────────
// 9. No console errors during page load
// ────────────────────────────────────────────────
test('no JavaScript errors on page load', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.goto('/');
  // Give it a moment to fully initialize
  await page.waitForTimeout(1000);
  expect(errors).toEqual([]);
});
