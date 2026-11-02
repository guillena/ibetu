import { expect, test, type Page } from "@playwright/test";
import type { StoredSession } from "../lib/api";

const MOCK_SESSION: StoredSession = {
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

async function loginAs(page: Page) {
  await page.addInitScript((session) => {
    window.localStorage.setItem("ibetu:session", JSON.stringify(session));
  }, MOCK_SESSION);
}

async function fulfillJson(page: Page, url: string, body: unknown, status = 200) {
  await page.route(url, async (route) => {
    await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  });
}

/** El personaje debe verse completo: cargado, con tamaño y sin desborde horizontal. */
async function expectMascotVisible(page: Page, testId: string, altPart: string) {
  const state = page.getByTestId(testId);
  await expect(state).toBeVisible();
  const img = state.getByRole("img", { name: new RegExp(altPart, "i") });
  await expect(img).toBeVisible();
  await expect
    .poll(() => img.evaluate((el) => (el as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);
}

test.describe("Estados vacíos con personajes", () => {
  test("Retos sin retos muestra a Dadi y el botón Crear un reto", async ({ page }) => {
    await loginAs(page);
    await fulfillJson(page, "**/api/challenges", {
      items: [],
      counts: {
        inPlay: 0,
        toDeclare: 0,
        toDeclareActionNeeded: 0,
        invitationsReceived: 0,
        invitationsSent: 0,
      },
    });
    await fulfillJson(page, "**/api/users/me/profile", {
      id: "u-ana",
      username: "ana_ok",
      displayName: "Ana",
      memberSince: new Date().toISOString(),
      isSelf: true,
      totalPlayed: 0,
      totalWins: 0,
      credibility: { score: 92, band: "GREEN", provisional: false },
    });
    await page.goto("/");
    await expectMascotVisible(page, "retos-empty-state", "Dadi");
    const cta = page.getByTestId("retos-empty-state").getByRole("link", { name: "Crear un reto" });
    await expect(cta).toHaveAttribute("href", "/crear");
    const box = await cta.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(48);
  });

  test("Amigos sin amigos muestra al Oso y el botón Invitar a un amigo", async ({ page }) => {
    await loginAs(page);
    await fulfillJson(page, "**/api/friends", []);
    await page.goto("/amigos");
    await expectMascotVisible(page, "friends-empty-state", "Oso");
    await expect(
      page.getByTestId("friends-empty-state").getByRole("link", { name: "Invitar a un amigo" }),
    ).toHaveAttribute("href", "/crear");
  });

  test("Historial vacío muestra al Búho sin botón de acción", async ({ page }) => {
    await loginAs(page);
    await fulfillJson(page, "**/api/challenges/history**", {
      summary: { total: 0, wins: 0, losses: 0, draws: 0 },
      items: [],
    });
    await page.goto("/historial");
    await expectMascotVisible(page, "history-empty-state", "Búho");
    await expect(page.getByTestId("history-empty-state").getByRole("link")).toHaveCount(0);
  });

  test("Invitación no disponible muestra al Zorro junto al mensaje", async ({ page }) => {
    await fulfillJson(page, "**/api/challenges/by-code/**", { message: "No existe" }, 404);
    await page.goto("/r/NOEXISTE");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("img", { name: /Zorro/i })).toBeVisible();
  });
});

