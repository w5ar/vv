import { expect, test, type Locator, type Page } from '@playwright/test';

/** Exercises compiled from the source materials (content/source): Vježba 1 and Vježba 2. */

async function center(locator: Locator) {
  const box = (await locator.boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  // The canvas starts a drag on the first move after mouse-down; keep that move small.
  await page.mouse.move(from.x + 1, from.y + 1);
  await page.mouse.move(to.x, to.y, { steps: 12 });
  await page.mouse.up();
}

test('library lists both source exercises as awaiting expert review, next to the synthetic one', async ({ page }) => {
  await page.goto('#/');
  await expect(page.getByTestId('no-sources-banner')).toHaveCount(0);
  await expect(page.getByTestId('review-banner')).toContainText('čeka stručnu provjeru');
  const v1 = page.getByTestId('exercise-vjezba-1-dva-c-mlaza');
  await expect(v1).toContainText('Vježba 1 – Vježba s dva „C” mlaza vode (šest vatrogasaca)');
  await expect(v1).toContainText('Čeka stručnu provjeru');
  await expect(v1).not.toContainText('SINTETIČKI');
  await expect(page.getByTestId('exercise-vjezba-2-jedan-c-mlaz')).toContainText('tri vatrogasca');
  await expect(page.getByTestId('exercise-sinteticka-vjezba-01')).toContainText('SINTETIČKI');
});

test('source catalog renders the source symbols as vector SVG', async ({ page }) => {
  await page.goto('#/katalog/katalog-vjezbovnik');
  const grid = page.getByTestId('symbol-grid');
  await expect(grid.locator('button')).toHaveCount(56);
  expect(await grid.locator('img').count()).toBe(0);
  await page.getByTestId('symbol-src.trodijelna-razdjelnica').click();
  const detail = page.getByTestId('symbol-detail');
  await expect(detail).toContainText('Trodijelna razdjelnica');
  await expect(detail).toContainText('lijevi');
  await expect(detail.locator('svg').first()).toBeVisible();
});

test('Vježba 1 demonstration lays the hose lines of sketch 13 and reaches completion', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('#/demonstracija/vjezba-1-dva-c-mlaza');
  await expect(page.getByTestId('object-n1')).toBeVisible();
  await expect(page.getByTestId('facing-n1')).toBeVisible();
  const range = page.getByTestId('timeline-range');
  // End of stage "Prvi mlaz" (sketch 13): two laid „B” hoses and two laid „C” hoses.
  await range.fill('61975');
  await expect(page.getByTestId('player-time')).toContainText('1:02.0');
  for (const id of ['b1', 'b2', 'c5', 'c6']) await expect(page.getByTestId(`object-${id}`).locator('.fds-hose__line')).toHaveCount(1);
  await expect(page.getByTestId('object-c1').locator('.fds-hose__line')).toHaveCount(0);
  await range.fill((await range.getAttribute('max')) ?? '0');
  await expect(page.getByTestId('demo-complete')).toBeVisible();
  await expect(page.getByTestId('progress-label')).toContainText('47 / 47');
  await expect(page.locator('.fds-hose__line')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('Vježba 2 demonstration reaches completion', async ({ page }) => {
  await page.goto('#/demonstracija/vjezba-2-jedan-c-mlaz');
  const range = page.getByTestId('timeline-range');
  await range.fill((await range.getAttribute('max')) ?? '0');
  await expect(page.getByTestId('demo-complete')).toBeVisible();
  await expect(page.getByTestId('progress-label')).toContainText('15 / 15');
});

test('training: commander orders, then a hose is picked up, handed over, laid and rolled up', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('#/vjezbanje/vjezba-1-dva-c-mlaza');
  await expect(page.getByTestId('object-z')).toBeVisible();
  const feedback = page.getByTestId('feedback');

  // Step 1: the commander's order (procedural action).
  await page.getByTestId('object-z').click();
  await page.getByTestId('action-act.zbor').click();
  await expect(page.getByTestId('step-zbor')).toHaveAttribute('data-status', 'completed');

  // V₁ walks to the „B” coils and takes one.
  const coil = await center(page.getByTestId('object-b1'));
  await drag(page, await center(page.getByTestId('object-v1')), { x: coil.x, y: coil.y - 30 });
  await expect(feedback).toContainText('premješta');
  await page.getByTestId('object-v1').click();
  await page.getByTestId('pickup-b1').click();
  await expect(feedback).toContainText('uzima');

  // V₂ comes next to V₁; V₁ hands the hose over.
  const v1 = await center(page.getByTestId('object-v1'));
  await drag(page, await center(page.getByTestId('object-v2')), { x: v1.x - 45, y: v1.y });
  await page.getByTestId('object-v1').click();
  await page.getByTestId('handover-b1').selectOption('v2');
  await expect(feedback).toContainText('predaje');

  // V₂ lays the hose towards an empty spot of the scene.
  await page.getByTestId('object-v2').click();
  await page.getByTestId('lay-b1').click();
  const v2 = await center(page.getByTestId('object-v2'));
  await page.mouse.click(v2.x - 60, v2.y + 220);
  await expect(feedback).toHaveAttribute('data-accepted', 'true');
  await expect(feedback).toContainText('polaže');
  await expect(page.getByTestId('object-b1').locator('.fds-hose__line')).toHaveCount(1);

  // A laid hose cannot be picked up; it is rolled up again from its context panel.
  const hose = await center(page.getByTestId('object-b1'));
  await page.mouse.click(hose.x, hose.y);
  await page.getByTestId('rollup-b1').click();
  await expect(feedback).toContainText('Namotana');
  await expect(page.getByTestId('object-b1').locator('.fds-hose__line')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('demonstration offers sound modes and explains how to generate missing clips', async ({ page }) => {
  // The synthetic exercise is never voiced by default (tools/generate_audio.py skips it).
  await page.goto('#/demonstracija/sinteticka-vjezba-01');
  const mode = page.getByTestId('audio-mode');
  await expect(mode).toHaveValue('none');
  await expect(page.getByTestId('audio-status')).toContainText('tools/generate_audio.py');
  await expect(mode.locator('option[value="zapovijedi"]')).toHaveJSProperty('disabled', true);
  await expect(mode.locator('option[value="zapovijedi-opis"]')).toHaveJSProperty('disabled', true);
});

test('Vježba 3 demonstration carries the joined suction line into the water and back', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('#/demonstracija/vjezba-3-usisne-cijevi');
  await expect(page.getByTestId('object-mvp')).toBeVisible();
  const range = page.getByTestId('timeline-range');
  await range.fill((await range.getAttribute('max')) ?? '0');
  await expect(page.getByTestId('demo-complete')).toBeVisible();
  await expect(page.getByTestId('progress-label')).toContainText('59 / 59');
  expect(errors).toEqual([]);
});

test('Vježba 3 training: suction hoses are joined only while they are lifted', async ({ page }) => {
  await page.goto('#/vjezbanje/vjezba-3-usisne-cijevi');
  await expect(page.getByTestId('object-u1')).toBeVisible();
  const feedback = page.getByTestId('feedback');
  // Both hoses lie on the ground next to each other at the pump: joining them there is rejected.
  await page.getByTestId('port-u1-kraj-1').click();
  await page.getByTestId('port-u2-kraj-1').click();
  await expect(feedback).toHaveAttribute('data-accepted', 'false');
  await expect(feedback).toContainText('ne smije se obaviti na tlu');
});

test('Vježba 4 demonstration reaches completion', async ({ page }) => {
  await page.goto('#/demonstracija/vjezba-4-usisne-cijevi');
  const range = page.getByTestId('timeline-range');
  await range.fill((await range.getAttribute('max')) ?? '0');
  await expect(page.getByTestId('demo-complete')).toBeVisible();
  await expect(page.getByTestId('progress-label')).toContainText('49 / 49');
});

test('Vježba 5 demonstration lays the suction line, the „B” line from the pump and two „C” jets, and reaches completion', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('#/demonstracija/vjezba-5-otvoreno-nalaziste');
  await expect(page.getByTestId('object-mvp')).toBeVisible();
  const range = page.getByTestId('timeline-range');
  // While the water is being stopped (after sketch 40): two „B” and four „C” hoses are laid.
  await range.fill('175000');
  for (const id of ['b1', 'b2', 'c1', 'c3', 'c5', 'c6']) await expect(page.getByTestId(`object-${id}`).locator('.fds-hose__line')).toHaveCount(1);
  await range.fill((await range.getAttribute('max')) ?? '0');
  await expect(page.getByTestId('demo-complete')).toBeVisible();
  await expect(page.getByTestId('progress-label')).toContainText('95 / 95');
  await expect(page.locator('.fds-hose__line')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('Vježba 6 demonstration lays two „B” hoses from the hydrant to the collecting head and reaches completion', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('#/demonstracija/vjezba-6-hidrantska-mreza');
  await expect(page.getByTestId('object-sabirnica')).toBeVisible();
  const range = page.getByTestId('timeline-range');
  await range.fill((await range.getAttribute('max')) ?? '0');
  await expect(page.getByTestId('demo-complete')).toBeVisible();
  await expect(page.getByTestId('progress-label')).toContainText('51 / 51');
  await expect(page.locator('.fds-hose__line')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('Vježba 7 demonstration takes the equipment out of the tanker and puts it back', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('#/demonstracija/vjezba-7-autocisterna');
  await expect(page.getByTestId('object-ac')).toBeVisible();
  // Everything starts in the vehicle's compartments.
  await expect(page.getByTestId('object-b1')).toHaveCount(0);
  const range = page.getByTestId('timeline-range');
  await range.fill((await range.getAttribute('max')) ?? '0');
  await expect(page.getByTestId('demo-complete')).toBeVisible();
  await expect(page.getByTestId('progress-label')).toContainText('67 / 67');
  await expect(page.getByTestId('object-u1')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('Vježba 8 demonstration fills the tanker from the hydrant and reaches completion', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('#/demonstracija/vjezba-8-autocisterna-hidrant');
  await expect(page.getByTestId('object-hidrant')).toBeVisible();
  const range = page.getByTestId('timeline-range');
  await range.fill((await range.getAttribute('max')) ?? '0');
  await expect(page.getByTestId('demo-complete')).toBeVisible();
  await expect(page.getByTestId('progress-label')).toContainText('17 / 17');
  await expect(page.getByTestId('object-nastavak')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('Vježba 9 demonstration (fire engine, suction line, two „C” jets) reaches completion', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('#/demonstracija/vjezba-9-navalno-vozilo');
  await expect(page.getByTestId('object-nv')).toBeVisible();
  const range = page.getByTestId('timeline-range');
  await range.fill((await range.getAttribute('max')) ?? '0');
  await expect(page.getByTestId('demo-complete')).toBeVisible();
  await expect(page.getByTestId('progress-label')).toContainText('93 / 93');
  expect(errors).toEqual([]);
});
