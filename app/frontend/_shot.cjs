const { chromium } = require('/home/user/.npm/_npx/e41f203b7505f1fb/node_modules/playwright');

(async () => {
  const base = 'http://127.0.0.1:3100';
  const browser = await chromium.launch({ args: ['--no-sandbox','--disable-setuid-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true });
  const page = await ctx.newPage();

  await page.goto(base + '/', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: '/tmp/shot-home.png', fullPage: true });
  console.log('home shot done');

  await page.goto(base + '/scan', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: '/tmp/shot-scan.png', fullPage: true });
  console.log('scan shot done');

  await page.evaluate(async () => {
    const post = (url, body) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    await post('/api/household/items', { analysis: { product: { name: '84消毒液', category: '含氯消毒液' }, risk_level: 'high', hazards: [{ type: '呼吸道刺激', severity: 'high', evidence: '含氯挥发', confidence: 0.8 }], ingredients: [{ name: '次氯酸钠', source: 'label', confidence: 0.9 }], do_not_mix_with: ['酸性洁厕剂'], summary: '含氯消毒液' }, image_path: '' });
    await post('/api/household/items', { analysis: { product: { name: '洁厕灵', category: '酸性洁厕剂' }, risk_level: 'high', hazards: [{ type: '腐蚀', severity: 'high', evidence: '盐酸', confidence: 0.8 }], ingredients: [{ name: '盐酸', source: 'label', confidence: 0.9 }], do_not_mix_with: ['含氯漂白剂'], summary: '酸性洁厕剂' }, image_path: '' });
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  const btn = page.locator('.gen-report-btn');
  if (await btn.count()) {
    await btn.first().scrollIntoViewIfNeeded();
    await btn.first().click();
    await page.waitForTimeout(2800);
    await page.screenshot({ path: '/tmp/shot-report.png', fullPage: true });
    console.log('report shot done');
  } else { console.log('gen-report-btn not found'); }

  await browser.close();
})().catch((e) => { console.error(e.message); process.exit(1); });
