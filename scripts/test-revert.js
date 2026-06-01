const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

// Tiny valid 1x1 PNGs with distinct contents
// Image 1: Red pixel
const IMG1_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
// Image 2: Blue pixel
const IMG2_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPj/HwADEwDN48m5AAAAAElFTkSuQmCC';

const img1Path = path.resolve(__dirname, 'img1.png');
const img2Path = path.resolve(__dirname, 'img2.png');

fs.writeFileSync(img1Path, Buffer.from(IMG1_BASE64, 'base64'));
fs.writeFileSync(img2Path, Buffer.from(IMG2_BASE64, 'base64'));

console.log('Dummy test images created successfully.');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  
  // Log browser console logs
  page.on('console', msg => console.log('BROWSER CONSOLE:', msg.text()));
  page.on('pageerror', err => console.error('BROWSER ERROR:', err.toString()));
  page.on('requestfailed', request => console.error('BROWSER REQUEST FAILED:', request.url(), request.failure()?.errorText));

  console.log('Navigating to http://localhost:3000...');
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle2' });

  console.log('Page loaded. Waiting 8 seconds for compilation/HMR to fully settle...');
  await new Promise(r => setTimeout(r, 8000));

  console.log('Setting up first pack...');
  
  // Wait for the "Start designing" button to be visible
  await page.waitForSelector('button');
  
  // Find and click the "Start designing" button
  const startDesigningClicked = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const btn = buttons.find(b => b.textContent.trim() === 'Start designing');
    if (btn) {
      btn.click();
      return true;
    }
    return false;
  });

  if (!startDesigningClicked) {
    console.error('Failed to find or click "Start designing" button.');
    await browser.close();
    process.exit(1);
  }

  console.log('Clicked "Start designing". Waiting for canvas editor...');
  await page.waitForSelector('input[type="file"]');
  await new Promise(r => setTimeout(r, 1500)); // Let the editor settle

  console.log('Uploading first image (img1.png)...');
  const fileInput = await page.$('input[type="file"]');
  await fileInput.uploadFile(img1Path);

  console.log('Waiting for first image to load...');
  await new Promise(r => setTimeout(r, 3000));

  // Retrieve store state to verify
  let sleeves = await page.evaluate(() => {
    return window.__STORE__.getState().sleeves;
  });
  console.log(`Initial upload complete. Number of sleeves: ${sleeves.length}`);
  if (sleeves.length === 0) {
    console.error('FAIL: No sleeves found in store after design started.');
    await browser.close();
    process.exit(1);
  }
  const initialCanvasData = sleeves[0]?.canvasData;
  
  if (!initialCanvasData) {
    console.error('FAIL: No canvas data saved after initial upload.');
    await browser.close();
    process.exit(1);
  }
  console.log('SUCCESS: Initial upload saved in store.');

  console.log('Replacing photo with second image (img2.png)...');
  // Upload second image to trigger replace
  await fileInput.uploadFile(img2Path);

  console.log('Waiting for second image to load...');
  await new Promise(r => setTimeout(r, 3000));

  sleeves = await page.evaluate(() => {
    return window.__STORE__.getState().sleeves;
  });
  const replacedCanvasData = sleeves[0]?.canvasData;

  if (replacedCanvasData === initialCanvasData) {
    console.error('FAIL: Replaced canvas data is identical to initial canvas data.');
    await browser.close();
    process.exit(1);
  }
  console.log('SUCCESS: Replaced image successfully saved in store.');

  console.log('Adding a second design to the pack...');
  const addDesignClicked = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const btn = buttons.find(b => b.textContent.includes('Add design'));
    if (btn) {
      btn.click();
      return true;
    }
    return false;
  });

  if (!addDesignClicked) {
    console.error('Failed to find or click "Add design" button.');
    await browser.close();
    process.exit(1);
  }

  await new Promise(r => setTimeout(r, 1500));

  sleeves = await page.evaluate(() => {
    return window.__STORE__.getState().sleeves;
  });
  console.log(`Add design complete. Number of designs in store: ${sleeves.length}`);

  console.log('Switching to Design #2...');
  const switchedToDesign2 = await page.evaluate((sleevesList) => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const design2 = sleevesList[1];
    const btn = buttons.find(b => b.textContent.trim() === design2.name);
    if (btn) {
      btn.click();
      return true;
    }
    return false;
  }, sleeves);

  if (!switchedToDesign2) {
    console.error('Failed to switch to Design #2.');
    await browser.close();
    process.exit(1);
  }

  console.log('Switched to Design #2. Waiting for canvas to sync (3s)...');
  await new Promise(r => setTimeout(r, 3000));

  console.log('Switching back to Design #1...');
  const switchedBackToDesign1 = await page.evaluate((sleevesList) => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const design1 = sleevesList[0];
    const btn = buttons.find(b => b.textContent.trim() === design1.name);
    if (btn) {
      btn.click();
      return true;
    }
    return false;
  }, sleeves);

  if (!switchedBackToDesign1) {
    console.error('Failed to switch back to Design #1.');
    await browser.close();
    process.exit(1);
  }

  console.log('Switched back to Design #1. Waiting for canvas to sync (3s)...');
  await new Promise(r => setTimeout(r, 3000));

  // Check the final store state for Design #1
  const finalSleeves = await page.evaluate(() => {
    return window.__STORE__.getState().sleeves;
  });
  const finalCanvasData = finalSleeves[0]?.canvasData;

  console.log('================ RESULTS ================');
  console.log('Initial Canvas Data length:', initialCanvasData.length);
  console.log('Replaced Canvas Data length:', replacedCanvasData?.length);
  console.log('Final Canvas Data length:', finalCanvasData?.length);

  if (finalCanvasData === initialCanvasData) {
    console.error('❌ BUG DETECTED: The image reverted to the initial image after switching designs!');
    await browser.close();
    process.exit(1);
  } else if (finalCanvasData === replacedCanvasData) {
    console.log('✅ SUCCESS: The replaced image was preserved correctly!');
    await browser.close();
    process.exit(0);
  } else {
    console.warn('⚠️ UNEXPECTED: The final canvas data is different from both initial and replaced canvas data.');
    await browser.close();
    process.exit(2);
  }
})();
