import { expect, test, type Page } from '@playwright/test';

const EXERCISE = '#/vjezbanje/sinteticka-vjezba-01';

async function openTraining(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(EXERCISE);
  await expect(page.getByTestId('object-voditelj')).toBeVisible();
  await expect(page.getByTestId('synthetic-banner')).toBeVisible();
  return errors;
}

test('loads an exercise and performs a valid connection between compatible ports', async ({ page }) => {
  const errors = await openTraining(page);
  await expect(page.getByTestId('progress-label')).toContainText('0 / 8');

  // Click-to-connect: vehicle outlet 1 -> large hose end A (compatible port types).
  await page.getByTestId('port-vozilo-izlaz-1').click();
  await page.getByTestId('port-cijev-velika-kraj-a').click();

  const feedback = page.getByTestId('feedback');
  await expect(feedback).toHaveAttribute('data-accepted', 'true');
  await expect(feedback).toContainText('Spojeno');
  await expect(page.locator('[data-testid^="edge-conn:"]')).toHaveCount(1);
  // The step was satisfied before its dependency ("Znak za početak"): accepted with an order warning.
  await expect(feedback).toContainText('izvodi se prije koraka');
  await expect(page.getByTestId('port-vozilo-izlaz-1')).toHaveClass(/is-connected/);
  expect(errors).toEqual([]);
});

test('rejects an incompatible connection according to declared rules', async ({ page }) => {
  await openTraining(page);
  await page.getByTestId('port-vozilo-izlaz-2').click();
  await page.getByTestId('port-mlaznica-1-ulaz').click();
  const feedback = page.getByTestId('feedback');
  await expect(feedback).toHaveAttribute('data-accepted', 'false');
  await expect(feedback).toContainText('nisu kompatibilni');
  await expect(feedback).toContainText('connection.incompatible');
  await expect(page.locator('[data-testid^="edge-"]')).toHaveCount(0);
});

test('highlights valid connection targets while connecting', async ({ page }) => {
  await openTraining(page);
  await page.getByTestId('port-razdjelnik-izlaz-1').click();
  // Small-coupling ports are valid targets, large-coupling ports are not.
  await expect(page.getByTestId('port-cijev-mala-1-kraj-a')).toHaveClass(/is-valid/);
  await expect(page.getByTestId('port-vozilo-izlaz-1')).toHaveClass(/is-invalid/);
});

test('completes steps in order: action, carry and place equipment by drag and drop', async ({ page }) => {
  await openTraining(page);
  await page.getByTestId('object-voditelj').click();
  await page.getByTestId('action-act.znak-pocetka').click();
  await expect(page.getByTestId('step-korak-1')).toHaveAttribute('data-status', 'completed');

  await page.getByTestId('object-clan-1').click();
  await page.getByTestId('pickup-razdjelnik').click();
  await expect(page.getByTestId('feedback')).toContainText('uzima');

  const zone = (await page.locator('.fds-zone').first().boundingBox())!;
  const member = (await page.getByTestId('object-clan-1').boundingBox())!;
  await page.mouse.move(member.x + member.width / 2, member.y + member.height / 2);
  await page.mouse.down();
  await page.mouse.move(zone.x + zone.width / 2, zone.y - 30, { steps: 10 });
  await page.mouse.up();
  await expect(page.getByTestId('feedback')).toContainText('premješta');

  const carried = (await page.getByTestId('object-razdjelnik').boundingBox())!;
  await page.mouse.move(carried.x + carried.width / 2, carried.y + carried.height / 2);
  await page.mouse.down();
  await page.mouse.move(zone.x + zone.width / 2, zone.y + zone.height / 2, { steps: 10 });
  await page.mouse.up();
  await expect(page.getByTestId('step-korak-2')).toHaveAttribute('data-status', 'completed');
  await expect(page.getByTestId('progress-label')).toContainText('2 / 8');
});

test('blocks dragging portable equipment that nobody carries', async ({ page }) => {
  await openTraining(page);
  const hose = (await page.getByTestId('object-cijev-mala-2').boundingBox())!;
  await page.mouse.move(hose.x + hose.width / 2, hose.y + hose.height / 2);
  await page.mouse.down();
  await page.mouse.move(hose.x + 200, hose.y - 100, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByTestId('feedback')).toContainText('prijenosna oprema');
});
