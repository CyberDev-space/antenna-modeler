import { expect, test, type Page } from "@playwright/test";

/** The tapered 4-element Yagi for 20 m of the library of MMANA, as the page stores a model. */
function taperedYagi() {
  const element = (x: number, half: number) => {
    const cuts = [-half, -2.7, -0.9, 0.9, 2.7, half];
    const radii = [0.01, 0.0125, 0.015, 0.0125, 0.01];
    return radii.map((radius, k) => ({ x1: x, y1: cuts[k], z1: 0, x2: x, y2: cuts[k + 1], z2: 0, radius, segments: -1 }));
  };
  return {
    name: "4EL20",
    wires: [...element(0, 5.185), ...element(-2.95, 5.405), ...element(1.87, 4.895), ...element(4.94, 4.86)],
    sources: [{ at: { wire: 2, place: "c" }, phase: 0, voltage: 1 }],
    loads: [],
    frequency: 14.05,
    ground: { kind: "real", permittivity: 13, conductivity: 0.005 },
    height: 11.5,
    wireConductivity: 3.5e7,
    taperCorrection: true,
    reference: 50,
    sweep: { from: 13.8, to: 14.5, points: 15 },
  };
}

/** Opens the page with a model already stored, as after an earlier visit. */
async function openWith(page: Page, model: object) {
  await page.addInitScript((text) => localStorage.setItem("antenna-modeler.model", text), JSON.stringify(model));
  await page.goto("/");
}

async function compute(page: Page) {
  await page.getByRole("button", { name: "Розрахувати", exact: true }).click();
  await expect(page.locator(".results-strip .summary")).toBeVisible({ timeout: 30_000 });
}

test("computes the example, a dipole near resonance over a real ground", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Моделювання антен");
  await compute(page);
  const strip = page.locator(".results-strip");
  await expect(strip).toContainText("Вхідний опір");
  const swr = Number(await strip.locator("dd").nth(1).textContent());
  expect(swr).toBeGreaterThan(1.2);
  expect(swr).toBeLessThan(1.7);
});

test("switches to English and remembers it", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "EN", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Antenna modeler");
  await expect(page.getByRole("button", { name: "Compute", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Antenna modeler");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
});

test("gives the help in English on an English page", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "EN", exact: true }).click();
  await page.locator("legend .hint", { hasText: "Ground" }).hover();
  const popup = page.locator(".help-popup");
  await expect(popup).toBeVisible();
  await expect(popup.locator(".help-title")).toHaveText("Ground");
  await expect(popup).not.toContainText("Земля");
});

test("pops up help inside the window, and the switch turns it off", async ({ page }) => {
  await page.goto("/");
  const ground = page.locator("legend .hint", { hasText: "Земля" });
  await ground.hover();
  const popup = page.locator(".help-popup");
  await expect(popup).toBeVisible();
  await expect(popup).toContainText("Що під антеною");
  const box = (await popup.boundingBox())!;
  const window = page.viewportSize()!;
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(window.height);
  expect(box.x + box.width).toBeLessThanOrEqual(window.width);
  await page.mouse.move(2, 2);
  await expect(popup).toHaveCount(0);
  await page.getByRole("button", { name: "Підказки" }).click();
  await ground.hover();
  await page.waitForTimeout(700);
  await expect(popup).toHaveCount(0);
});

test("lines up the Open button with the other buttons of the top bar", async ({ page }) => {
  await page.goto("/");
  const open = (await page.locator("label.button", { hasText: "Відкрити" }).boundingBox())!;
  const save = (await page.getByRole("button", { name: "Зберегти", exact: true }).boundingBox())!;
  expect(Math.abs(open.y - save.y)).toBeLessThanOrEqual(1);
  expect(Math.abs(open.height - save.height)).toBeLessThanOrEqual(1);
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 412, height: 900 } });

  test("has no sideways scroll, and every tab in view", async ({ page }) => {
    await page.goto("/");
    const [scrolled, shown] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
    expect(scrolled).toBe(shown);
    const tabs = await page.getByRole("tab").all();
    expect(tabs).toHaveLength(6);
    for (const tab of tabs) {
      const box = (await tab.boundingBox())!;
      expect(box.x + box.width).toBeLessThanOrEqual(412);
    }
  });
});

test("takes a change back with Ctrl+Z and brings it again", async ({ page }) => {
  await page.goto("/");
  const frequency = page.getByLabel("Частота, МГц");
  await frequency.fill("7.1");
  await frequency.blur();
  await page.keyboard.press("Control+z");
  await expect(frequency).toHaveValue("14.15");
  await page.keyboard.press("Control+Shift+z");
  await expect(frequency).toHaveValue("7.1");
});

test("stops a long sweep, and keeps no error", async ({ page }) => {
  await openWith(page, { ...taperedYagi(), sweep: { from: 13.8, to: 14.5, points: 201 } });
  await page.getByRole("tab", { name: "Розгортка" }).click();
  await page.getByRole("button", { name: "Розгорнути", exact: true }).click();
  const stop = page.getByRole("button", { name: "Зупинити", exact: true });
  await expect(stop).toBeVisible();
  await stop.click();
  await expect(page.getByRole("button", { name: "Розгорнути", exact: true })).toBeVisible();
  await expect(page.locator("#panel-sweep .messages.errors")).toHaveCount(0);
});

test("computes the tapered Yagi with Leeson's correction, its currents and its matching", async ({ page }) => {
  await openWith(page, taperedYagi());
  await expect(page.getByText("Поправка Лісона для труб різного діаметра")).toBeVisible();
  await expect(page.locator(".taper-correction li")).toHaveCount(4);
  await compute(page);
  await expect(page.locator(".results-strip")).toContainText("25.3 + j3.7 Ом");
  await page.getByRole("tab", { name: "Струми" }).click();
  await expect(page.locator("#panel-currents .band")).toContainText("1.98");
  await page.getByRole("tab", { name: "Узгодження" }).click();
  await expect(page.locator("#panel-matching .networks section")).toHaveCount(2);
  await expect(page.locator("#panel-matching")).toContainText("507 мм");
});

test("edits an element by its length, about its centre", async ({ page }) => {
  await openWith(page, taperedYagi());
  await page.getByRole("button", { name: "Елементи", exact: true }).click();
  await page.getByLabel("Елемент 1, довжина").fill("10.2");
  await page.getByRole("button", { name: "Дроти", exact: true }).click();
  await expect(page.getByLabel("Дріт 1, Y1")).toHaveValue("-5.1");
  await expect(page.getByLabel("Дріт 5, Y2")).toHaveValue("5.1");
});

test("moves the antenna to another frequency, with its diameters", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Перенести на частоту…" }).click();
  await page.getByLabel("Нова частота, МГц").fill("28.3");
  await page.getByRole("button", { name: "Перенести", exact: true }).click();
  await expect(page.getByLabel("Частота, МГц")).toHaveValue("28.3");
  await expect(page.getByLabel("Дріт 1, Y1")).toHaveValue("-2.59");
  await expect(page.getByLabel("Дріт 1, радіус")).toHaveValue("0.5");
  // One step back brings the antenna for 20 m.
  await page.keyboard.press("Control+z");
  await expect(page.getByLabel("Частота, МГц")).toHaveValue("14.15");
});

test("makes a Yagi from a template, cut to resonance for a 50-ohm line, and takes it back with Ctrl+Z", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Шаблони…" }).click();
  const dialog = page.getByRole("dialog", { name: "Шаблони антен" });
  await dialog.locator("label", { hasText: "Yagi" }).click();
  await expect(dialog.getByLabel("Висота траверси, м")).toHaveValue("10");
  await dialog.getByLabel("Елементів").selectOption("4");
  await dialog.getByRole("button", { name: "Створити", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const name = page.getByRole("textbox", { name: "Назва моделі" });
  await expect(name).toHaveValue("Yagi, 4 ел., 14.15 МГц");
  await expect(page.locator(".messages.opened")).toContainText("підрізано до резонансу на висоті 10 м");
  await compute(page);
  const values = await page.locator(".results-strip dd").allTextContents();
  expect(values[0]).toMatch(/ j0\.\d Ом$/);
  expect(Number(values[1])).toBeLessThan(1.3);
  // The whole antenna is one step.
  await page.keyboard.press("Control+z");
  await expect(name).toHaveValue("Диполь на 20 м");
});

test("says how high an antenna must hang when it does not fit above the ground", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Шаблони…" }).click();
  const dialog = page.getByRole("dialog", { name: "Шаблони антен" });
  await dialog.locator("label", { hasText: "Дельта" }).click();
  await dialog.getByLabel("Частота, МГц").fill("3.65");
  await expect(dialog.locator(".messages.errors")).toContainText("підніміть її щонайменше до");
  await expect(dialog.getByRole("button", { name: "Створити", exact: true })).toBeDisabled();
  await dialog.getByRole("button", { name: "Скасувати" }).click();
  await expect(dialog).toHaveCount(0);
});

test("draws the sweep on the Smith chart, with a readout under the pointer", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "Розгортка" }).click();
  await page.getByRole("button", { name: "Розгорнути", exact: true }).click();
  const chart = page.getByRole("img", { name: "Діаграма Сміта (50 Ом)" });
  await expect(chart).toBeVisible({ timeout: 30_000 });
  // The best match of the example dipole lies nearest the centre of the chart.
  const box = (await chart.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.locator("#panel-sweep .smith figcaption")).toContainText(/1[34]\.\d{3} МГц Z \d+\.\d [+−] j\d+\.\d Ом, КСХ 1\.\d\d/);
});

test("keeps a variant and draws it dashed beside the next one", async ({ page }) => {
  await page.goto("/");
  await compute(page);
  await page.getByRole("tab", { name: "Розгортка" }).click();
  await page.getByRole("button", { name: "Розгорнути", exact: true }).click();
  await expect(page.getByRole("img", { name: "Діаграма Сміта (50 Ом)" })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Запам'ятати для порівняння" }).click();
  await expect(page.locator(".pin-bar")).toContainText("Порівняння: Диполь на 20 м");
  // The same dipole at a higher frequency: electrically longer.
  const frequency = page.getByLabel("Частота, МГц");
  await frequency.fill("14.35");
  await frequency.blur();
  await compute(page);
  await expect(page.locator(".summary dd.pinned")).toHaveCount(6);
  await expect(page.locator(".summary dd.pinned").first()).toContainText(" Ом");
  await page.getByRole("button", { name: "Розгорнути", exact: true }).click();
  // The SWR, R and X, the gain, the front/back and the Smith chart each get the dashed curve of the kept dipole.
  await expect(page.locator("#panel-sweep .series.pinned")).toHaveCount(6);
  await page.getByRole("button", { name: "Прибрати порівняння" }).click();
  await expect(page.locator(".summary dd.pinned")).toHaveCount(0);
  await expect(page.locator("#panel-sweep .series.pinned")).toHaveCount(0);
});
