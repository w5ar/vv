import { expect, test } from '@playwright/test';

test('library marks the synthetic exercise as synthetic', async ({ page }) => {
  await page.goto('#/');
  const card = page.getByTestId('exercise-sinteticka-vjezba-01');
  await expect(card).toContainText('SINTETIČKI');
  await expect(card).toContainText('Demonstracija');
});

test('symbol catalog renders vector SVG symbols (no raster images)', async ({ page }) => {
  await page.goto('#/katalog/katalog-sinteticki');
  const grid = page.getByTestId('symbol-grid');
  await expect(grid.locator('button')).toHaveCount(8);
  expect(await grid.locator('svg').count()).toBeGreaterThanOrEqual(8);
  expect(await grid.locator('img').count()).toBe(0);
  // Symbol extracted from a multi-symbol sheet by element id.
  await page.getByTestId('symbol-syn.oznaka-polazista').click();
  await expect(page.getByTestId('symbol-detail')).toContainText('oznake-list.svg');
  await expect(page.getByTestId('symbol-detail').locator('svg').first()).toBeVisible();
});

test('demonstration plays deterministically and reaches completion when seeking to the end', async ({ page }) => {
  await page.goto('#/demonstracija/sinteticka-vjezba-01');
  await expect(page.getByTestId('player-time')).toContainText('0:00.0');
  await page.getByTestId('step-forward').click();
  await expect(page.getByTestId('player-time')).not.toContainText('0:00.0 /');
  const range = page.getByTestId('timeline-range');
  const max = await range.getAttribute('max');
  await range.fill(max ?? '0');
  await expect(page.getByTestId('demo-complete')).toBeVisible();
  await expect(page.getByTestId('progress-label')).toContainText('8 / 8');
  // Seeking back reconstructs the earlier state.
  await range.fill('0');
  await expect(page.getByTestId('progress-label')).toContainText('0 / 8');
  await page.getByTestId('play-toggle').click();
  await expect(page.getByTestId('play-toggle')).toContainText('Pauza');
});

test('editor rotates a selected object and supports undo/redo', async ({ page }) => {
  await page.goto('#/uredivac/sinteticka-vjezba-01');
  await page.getByTestId('unlock').click();
  await page.getByTestId('object-razdjelnik').click();
  await expect(page.getByTestId('inspector')).toBeVisible();
  const rotation = page.getByTestId('inspector').getByLabel('Rotacija');
  await expect(rotation).toHaveValue('0');
  await page.getByTestId('editor-rotate-right').click();
  await expect(rotation).toHaveValue('90');
  await page.getByTestId('undo').click();
  await expect(rotation).toHaveValue('0');
  await page.getByTestId('redo').click();
  await expect(rotation).toHaveValue('90');
});

test('import review shows the source dataset and synthetic pipeline results', async ({ page }) => {
  await page.goto('#/uvoz');
  const source = page.getByTestId('dataset-source');
  await expect(source).toContainText('52 simbola');
  await expect(source).toContainText('2 vježbi · 0 grešaka');
  await source.getByRole('tab', { name: /Crteži/ }).click();
  await expect(source).toContainText('Skica 13');
  await source.getByRole('tab', { name: /Povezivanje/ }).click();
  await expect(source.getByText('Zanemareno').first()).toBeVisible();
  await page.getByRole('button', { name: /Sintetički testni skup/ }).click();
  const ds = page.getByTestId('dataset-synthetic');
  await ds.getByRole('tab', { name: /Crteži/ }).click();
  await expect(ds).toContainText('Ravni crtež');
  await expect(ds).toContainText('Heuristika');
  await ds.getByRole('tab', { name: /Povezivanje/ }).click();
  await expect(ds.getByText('Povezano').first()).toBeVisible();
});

test('assessment hides the step list, records incorrect operations and reports exercise-defined criteria', async ({ page }) => {
  await page.goto('#/provjera/sinteticka-vjezba-01');
  await expect(page.getByText('Popis koraka skriven je tijekom provjere znanja.')).toBeVisible();
  await page.getByTestId('port-vozilo-izlaz-2').click();
  await page.getByTestId('port-mlaznica-1-ulaz').click();
  await expect(page.getByTestId('feedback')).toHaveAttribute('data-accepted', 'false');
  await page.getByTestId('finish').click();
  const result = page.getByTestId('assessment-result');
  await expect(result).toContainText('Nije zadovoljeno');
  await expect(result).toContainText('Svi koraci su izvršeni');
  await expect(result).toContainText('Neispravne radnje');
  await expect(result).toContainText('nisu kompatibilni');
});
