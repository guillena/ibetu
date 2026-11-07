import { expect, test } from "@playwright/test";
import type { StoredSession } from "../lib/api";

const MOCK_SESSION: StoredSession = {
  accessToken: "mock-jwt-token",
  user: {
    id: "u-ana",
    username: "ana_ok",
    displayName: "Ana",
    email: "ana@gmail.com",
    coinsAvailable: 100,
    credibilityScore: 100,
    credibilityStatus: "GREEN",
  },
};

test.describe("Login integrado con Google y Apple en /entrar y sesión persistente", () => {
  test.beforeEach(async ({ page }) => {
    const emptyChallenges = {
      items: [],
      counts: {
        inPlay: 0,
        toDeclare: 0,
        toDeclareActionNeeded: 0,
        invitationsReceived: 0,
        invitationsSent: 0,
      },
    };

    await page.route("**/api/challenges", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(emptyChallenges),
        });
        return;
      }
      await route.fallback();
    });

    await page.route("**/api/challenges/open", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(emptyChallenges),
      });
    });
  });

  test("usuario nuevo en /entrar elige Google, confirma su @usuario único (+100 monedas) y entra al inicio", async ({
    page,
  }) => {
    let profilePayload: Record<string, unknown> | null = null;

    await page.route("**/api/auth/oauth/verify", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "NEEDS_PROFILE",
          onboardingToken: "onb-google-123",
          provider: "GOOGLE",
          email: "martin@gmail.com",
          suggestedDisplayName: "Martín",
          suggestedUsername: "martin",
        }),
      });
    });

    await page.route("**/api/auth/oauth/complete-profile", async (route) => {
      profilePayload = JSON.parse(route.request().postData() ?? "{}");
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          accessToken: "jwt-martin-100",
          user: {
            id: "u-martin",
            username: "martin_ok",
            displayName: "Martín",
            email: "martin@gmail.com",
            coinsAvailable: 100,
            credibilityScore: 100,
            credibilityStatus: "GREEN",
          },
        }),
      });
    });

    await page.goto("/entrar?modo=nuevo");

    await expect(page.getByTestId("instant-auth-card")).toBeVisible();
    await expect(page.getByTestId("btn-oauth-google")).toBeVisible();
    await expect(page.getByTestId("btn-oauth-apple")).toBeVisible();

    await page.getByTestId("btn-oauth-google").click();

    await expect(page.getByTestId("oauth-confirm-profile-card")).toBeVisible();
    await expect(page.getByTestId("oauth-connected-email")).toHaveText(
      "martin@gmail.com",
    );
    await expect(page.locator("#auth-display-name")).toHaveValue("Martín");
    await page.locator("#auth-username").fill("martin_ok");

    await page.getByTestId("btn-confirm-profile").click();

    await expect.poll(() => profilePayload).toEqual({
      onboardingToken: "onb-google-123",
      displayName: "Martín",
      username: "martin_ok",
    });

    await expect(page).toHaveURL(/\/$/);
    const saved = await page.evaluate(() =>
      window.localStorage.getItem("ibetu:session"),
    );
    expect(saved).toContain("jwt-martin-100");
    expect(saved).toContain("martin_ok");
  });

  test("usuario recurrente en /entrar?modo=ingresar toca Apple o Google e ingresa en 1 toque sin pedir @usuario de nuevo", async ({
    page,
  }) => {
    await page.route("**/api/auth/oauth/verify", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "AUTHENTICATED",
          accessToken: "jwt-returning-apple",
          user: {
            id: "u-ana",
            username: "ana_ok",
            displayName: "Ana",
            email: "ana@privaterelay.appleid.com",
            coinsAvailable: 150,
            credibilityScore: 100,
            credibilityStatus: "GREEN",
          },
        }),
      });
    });

    await page.goto("/entrar?modo=ingresar");

    await expect(page.getByTestId("instant-auth-card")).toBeVisible();
    await page.getByTestId("btn-oauth-apple").click();

    await expect(page).toHaveURL(/\/$/);
    const saved = await page.evaluate(() =>
      window.localStorage.getItem("ibetu:session"),
    );
    expect(saved).toContain("jwt-returning-apple");
  });

  test("si el @usuario elegido ya está en uso al confirmar perfil, muestra sugerencias disponibles", async ({
    page,
  }) => {
    await page.route("**/api/auth/oauth/verify", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "NEEDS_PROFILE",
          onboardingToken: "onb-conflict-1",
          provider: "GOOGLE",
          email: "lucas@gmail.com",
          suggestedDisplayName: "Lucas",
          suggestedUsername: "lucas",
        }),
      });
    });

    await page.route("**/api/auth/oauth/complete-profile", async (route) => {
      await route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({
          message: "Ese @usuario ya está en uso. Probá con alguna sugerencia.",
          suggestions: ["lucas_ok", "lucas7"],
        }),
      });
    });

    await page.goto("/entrar");
    await page.getByTestId("btn-oauth-google").click();
    await page.getByTestId("btn-confirm-profile").click();

    await expect(page.getByTestId("oauth-profile-error")).toContainText(
      "Ese @usuario ya está en uso",
    );
    await expect(page.getByTestId("username-suggestion-lucas_ok")).toBeVisible();
    await page.getByTestId("username-suggestion-lucas_ok").click();
    await expect(page.locator("#auth-username")).toHaveValue("lucas_ok");
  });

  test("visitante con sesión activa en localStorage es redirigido automáticamente de /entrar a /", async ({
    page,
  }) => {
    await page.addInitScript((session) => {
      window.localStorage.setItem("ibetu:session", JSON.stringify(session));
    }, MOCK_SESSION);

    await page.goto("/entrar?modo=ingresar");
    await expect(page).toHaveURL(/\/$/);
  });
});
