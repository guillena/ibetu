import { expect, test } from "@playwright/test";

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

/** Con Nunito (más ancha que Outfit/Manrope) ninguna pantalla debe desbordar en horizontal. */
for (const route of ["/", "/amigos", "/historial", "/monedero", "/crear", "/perfil"]) {
  test(`sin desborde horizontal en ${route}`, async ({ page }) => {
    await page.addInitScript((session) => {
      window.localStorage.setItem("ibetu:session", JSON.stringify(session));
    }, MOCK_SESSION);
    await page.goto(route);
    await page.evaluate(() => document.fonts.ready);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(overflow).toBe(false);
  });
}
