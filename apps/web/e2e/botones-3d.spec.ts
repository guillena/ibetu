import { expect, test, type Page } from "@playwright/test";

const MOCK_SESSION = {
  accessToken: "mock-jwt-token",
  user: {
    id: "u-ana",
    username: "ana_ok",
    displayName: "Ana",
    coinsAvailable: 140,
    credibilityScore: 92,
    credibilityStatus: "GREEN",
  },
};

async function openAmigosEmpty(page: Page) {
  await page.addInitScript((session) => {
    window.localStorage.setItem("ibetu:session", JSON.stringify(session));
  }, MOCK_SESSION);
  await page.route("**/api/friends", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });
  await page.goto("/amigos");
}

async function openCrear(page: Page) {
  await page.addInitScript((session) => {
    window.localStorage.setItem("ibetu:session", JSON.stringify(session));
  }, MOCK_SESSION);
  await page.route("**/api/friends", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });
  await page.goto("/crear");
  await page.getByTestId("block-stake").waitFor();
}

const cta = (page: Page) => page.getByTestId("friends-empty-state").getByRole("link", { name: "Invitar a un amigo" });

function luminance([r, g, b]: number[]): number {
  const f = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
const rgb = (css: string) => (css.match(/\d+(\.\d+)?/g) ?? []).slice(0, 3).map(Number);

test.describe("Botones de acción en 3D", () => {
  test("el botón principal tiene base sólida de 4 px, azul #0099FF (igual al de los tabs) y base #0077CC", async ({ page }) => {
    await openAmigosEmpty(page);
    const button = cta(page);
    await expect(button).toBeVisible();
    const style = await button.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { bg: cs.backgroundColor, color: cs.color, shadow: cs.boxShadow };
    });
    expect(style.bg).toBe("rgb(0, 153, 255)");
    expect(style.shadow).toBe("rgb(0, 119, 204) 0px 4px 0px 0px");
    const [a, b] = [luminance(rgb(style.bg)), luminance(rgb(style.color))].sort((x, y) => y - x);
    // Decisión de diseño: un único azul brillante, con texto blanco a ~3:1 (no llega a AA de 4,5:1).
    expect((a + 0.05) / (b + 0.05)).toBeGreaterThanOrEqual(2.9);
    const box = await button.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(48);
  });

  test("al presionar el botón baja 4 px y la base desaparece", async ({ page }) => {
    await openAmigosEmpty(page);
    const button = cta(page);
    const box = (await button.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await expect
      .poll(() => button.evaluate((el) => getComputedStyle(el).transform))
      .toBe("matrix(1, 0, 0, 1, 0, 4)");
    expect(await button.evaluate((el) => getComputedStyle(el).boxShadow)).toMatch(/0px 0px 0px 0px$/);
    await page.mouse.up();
  });

  test("un botón desactivado es gris, plano y sin movimiento", async ({ page }) => {
    await openAmigosEmpty(page);
    const style = await page.evaluate(() => {
      const b = document.createElement("button");
      b.className = "btn-3d btn-3d--primary";
      b.disabled = true;
      b.textContent = "Desactivado";
      document.body.appendChild(b);
      const cs = getComputedStyle(b);
      return { bg: cs.backgroundColor, shadow: cs.boxShadow, transform: cs.transform };
    });
    expect(style.bg).toBe("rgb(225, 228, 234)");
    expect(style.shadow).toBe("none");
    expect(style.transform).toBe("none");
  });

  test("con movimiento reducido no hay transición al presionar", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openAmigosEmpty(page);
    const duration = await cta(page).evaluate((el) => getComputedStyle(el).transitionDuration);
    expect(duration).toBe("0s");
  });

  test("el botón central + es el más llamativo: azul brillante y base de 6 px", async ({ page }) => {
    await openAmigosEmpty(page);
    const fab = page.getByRole("link", { name: "Crear reto" });
    await expect(fab).toHaveAttribute("href", "/crear");
    const shadow = await fab.evaluate((el) => getComputedStyle(el).boxShadow);
    expect(shadow).toBe("rgb(0, 119, 204) 0px 6px 0px 0px");
    const fill = await fab.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(fill).toBe("rgb(0, 153, 255)");
    // Ícono blanco sobre #0099FF: 2,9998:1, que redondea a 3,0:1 (mínimo WCAG 1.4.11 para gráficos).
    const [hi, lo] = [luminance([255, 255, 255]), luminance(rgb(fill))].sort((x, y) => y - x);
    expect(Math.round(((hi + 0.05) / (lo + 0.05)) * 10) / 10).toBeGreaterThanOrEqual(3);
  });

  test("los tabs seleccionados de Retos tienen el mismo azul y la misma base 3D que los botones", async ({ page }) => {
    await page.addInitScript((session) => {
      window.localStorage.setItem("ibetu:session", JSON.stringify(session));
    }, MOCK_SESSION);
    await page.route("**/api/challenges", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          items: [],
          counts: { inPlay: 0, toDeclare: 0, toDeclareActionNeeded: 0, invitationsReceived: 0, invitationsSent: 0 },
        }),
      });
    });
    await page.goto("/");
    const selected = page.getByTestId("tab-in-play");
    const unselected = page.getByTestId("tab-to-declare");
    await expect(selected).toHaveAttribute("aria-selected", "true");
    const read = (loc: ReturnType<Page["getByTestId"]>) =>
      loc.evaluate((el) => {
        const cs = getComputedStyle(el);
        return { bg: cs.backgroundColor, shadow: cs.boxShadow };
      });
    const a = await read(selected);
    expect(a.bg).toBe("rgb(0, 153, 255)");
    expect(a.shadow).toBe("rgb(0, 119, 204) 0px 4px 0px 0px");
    const b = await read(unselected);
    expect(b.shadow).toBe("none");
    // La base queda dentro del contenedor (no se recorta).
    const tabBox = (await selected.boundingBox())!;
    const listBox = (await page.getByRole("tablist").boundingBox())!;
    expect(tabBox.y + tabBox.height + 4).toBeLessThanOrEqual(listBox.y + listBox.height);
    // Al presionar baja 4 px, igual que un botón.
    await page.mouse.move(tabBox.x + tabBox.width / 2, tabBox.y + tabBox.height / 2);
    await page.mouse.down();
    await expect.poll(() => selected.evaluate((el) => getComputedStyle(el).transform)).toBe("matrix(1, 0, 0, 1, 0, 4)");
    await page.mouse.up();
  });

  test("el conmutador del chip es 3D con base de 3 px, mide 48 px y se hunde al presionar", async ({ page }) => {
    await openAmigosEmpty(page);
    const modo = page.getByRole("switch", { name: "Modo Plata" });
    const box = (await modo.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(47.5);
    expect(box.height).toBeGreaterThanOrEqual(47.5);
    const face = modo.locator("> span");
    const style = await face.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { bg: cs.backgroundColor, shadow: cs.boxShadow };
    });
    expect(style.bg).toBe("rgb(0, 153, 255)");
    expect(style.shadow).toBe("rgb(0, 119, 204) 0px 3px 0px 0px");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await expect.poll(() => face.evaluate((el) => getComputedStyle(el).transform)).toBe("matrix(1, 0, 0, 1, 0, 3)");
    await page.mouse.up();
  });

  test("Crear reto: el selector Monedas/Plata es 3D (seleccionado azul, otro blanco con borde)", async ({ page }) => {
    await openCrear(page);
    const read = (id: string) =>
      page.getByTestId(id).evaluate((el) => {
        const cs = getComputedStyle(el);
        return { bg: cs.backgroundColor, shadow: cs.boxShadow };
      });
    const coins = await read("form-mode-coins");
    expect(coins.bg).toBe("rgb(0, 153, 255)");
    expect(coins.shadow).toBe("rgb(0, 119, 204) 0px 4px 0px 0px");
    const cash = await read("form-mode-cash");
    expect(cash.bg).toBe("rgb(255, 255, 255)");
    expect(cash.shadow).toBe("rgb(191, 199, 213) 0px 4px 0px 0px");
    await page.getByTestId("form-mode-cash").click();
    expect((await read("form-mode-cash")).bg).toBe("rgb(0, 153, 255)");
    expect((await read("form-mode-coins")).bg).toBe("rgb(255, 255, 255)");
  });

  test("Crear reto arranca con el último modo usado y su monto por defecto", async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem("ibetu:mode", "CASH"));
    await openCrear(page);
    await expect(page.getByTestId("form-mode-cash")).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("#challenge-stake")).toHaveValue("1000");
    // El conmutador del header está en el mismo modo (un solo estado).
    await expect(page.getByRole("switch", { name: "Modo Plata" })).toHaveAttribute("aria-checked", "true");
    await page.getByTestId("form-mode-coins").click();
    await expect(page.locator("#challenge-stake")).toHaveValue("10");
    await expect(page.getByRole("switch", { name: "Modo Plata" })).toHaveAttribute("aria-checked", "false");
  });

  test("el header no desborda a 360 px con el modo en Plata", async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem("ibetu:mode", "CASH"));
    await openAmigosEmpty(page);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(overflow).toBe(false);
    const header = (await page.locator("header").boundingBox())!;
    const items = await page.locator("header a, header button").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().right));
    for (const right of items) expect(right).toBeLessThanOrEqual(header.width + 0.5);
  });

  test("las tarjetas siguen planas, sin base 3D", async ({ page }) => {
    await openAmigosEmpty(page);
    const shadow = await page.getByTestId("friends-empty-state").evaluate((el) => getComputedStyle(el).boxShadow);
    expect(shadow).not.toContain("rgb(0, 119, 204)");
    expect(shadow).not.toBe("none");
  });
});

