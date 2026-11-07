import { expect, test } from "@playwright/test";
import type { StoredSession } from "../lib/api";

const MOCK_SESSION: StoredSession = {
  accessToken: "mock-jwt-token",
  user: {
    id: "u-guillena",
    username: "guillena",
    displayName: "Guillena",
    email: "guillena@gmail.com",
    coinsAvailable: 100,
    credibilityScore: 100,
    credibilityStatus: "GREEN",
  },
};

test.describe("Login integrado con Google y Apple, Selector de Cuenta y Cambiar Cuenta", () => {
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

  test("usuario nuevo en /entrar elige Google, ingresa guillena@gmail.com, confirma su @usuario único (+100 monedas) y entra al inicio", async ({
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
          email: "guillena@gmail.com",
          suggestedDisplayName: "Guillena",
          suggestedUsername: "guillena",
        }),
      });
    });

    await page.route("**/api/auth/oauth/complete-profile", async (route) => {
      profilePayload = JSON.parse(route.request().postData() ?? "{}");
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          accessToken: "jwt-guillena-100",
          user: {
            id: "u-guillena",
            username: "guillena_ok",
            displayName: "Guillena",
            email: "guillena@gmail.com",
            coinsAvailable: 100,
            credibilityScore: 100,
            credibilityStatus: "GREEN",
          },
        }),
      });
    });

    await page.goto("/entrar?modo=nuevo");

    await expect(page.getByTestId("instant-auth-card")).toBeVisible();
    await page.getByTestId("btn-oauth-google").click();

    await expect(page.getByTestId("oauth-account-selector")).toBeVisible();
    await page.getByTestId("oauth-email-input").fill("guillena@gmail.com");
    await page.getByTestId("btn-oauth-email-continue").click();

    await expect(page.getByTestId("oauth-confirm-profile-card")).toBeVisible();
    await expect(page.getByTestId("oauth-connected-email")).toHaveText(
      "guillena@gmail.com",
    );
    await expect(page.locator("#auth-display-name")).toHaveValue("Guillena");
    await page.locator("#auth-username").fill("guillena_ok");

    await page.getByTestId("btn-confirm-profile").click();

    await expect.poll(() => profilePayload).toEqual({
      onboardingToken: "onb-google-123",
      displayName: "Guillena",
      username: "guillena_ok",
    });

    await expect(page).toHaveURL(/\/$/);
    const saved = await page.evaluate(() =>
      window.localStorage.getItem("ibetu:session"),
    );
    expect(saved).toContain("jwt-guillena-100");
    expect(saved).toContain("guillena@gmail.com");
  });

  test("si ya hay una cuenta guardada en el navegador, la propone para entrar con 1 toque sin volver a escribir el email", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem(
        "ibetu:known_oauth_accounts",
        JSON.stringify([
          {
            provider: "GOOGLE",
            email: "guillena@gmail.com",
            displayName: "Guillena",
            username: "guillena",
          },
        ]),
      );
    });

    await page.route("**/api/auth/oauth/verify", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "AUTHENTICATED",
          accessToken: "jwt-returning-google",
          user: {
            id: "u-guillena",
            username: "guillena",
            displayName: "Guillena",
            email: "guillena@gmail.com",
            coinsAvailable: 150,
            credibilityScore: 100,
            credibilityStatus: "GREEN",
          },
        }),
      });
    });

    await page.goto("/entrar?modo=ingresar");

    const knownBtn = page.getByTestId(
      "oauth-known-account-guillena@gmail.com",
    );
    await expect(knownBtn).toBeVisible();
    await expect(knownBtn).toContainText("guillena@gmail.com");
    await knownBtn.click();

    await expect(page).toHaveURL(/\/$/);
    const saved = await page.evaluate(() =>
      window.localStorage.getItem("ibetu:session"),
    );
    expect(saved).toContain("jwt-returning-google");
  });

  test("en /perfil muestra el correo vinculado (guillena@gmail.com) y permite tocar 'Cambiar cuenta'", async ({
    page,
  }) => {
    await page.addInitScript((session) => {
      window.localStorage.setItem("ibetu:session", JSON.stringify(session));
      window.localStorage.setItem(
        "ibetu:known_oauth_accounts",
        JSON.stringify([
          {
            provider: "GOOGLE",
            email: "guillena@gmail.com",
            displayName: "Guillena",
            username: "guillena",
          },
        ]),
      );
    }, MOCK_SESSION);

    await page.route("**/api/users/me/profile", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: "u-guillena",
          username: "guillena",
          displayName: "Guillena",
          email: "guillena@gmail.com",
          memberSince: new Date().toISOString(),
          isSelf: true,
          totalPlayed: 4,
          totalWins: 3,
          credibility: { score: 100, band: "GREEN", provisional: false },
        }),
      });
    });

    await page.goto("/perfil");

    await expect(page.getByTestId("profile-card")).toBeVisible();
    await expect(page.getByTestId("profile-email")).toContainText(
      "guillena@gmail.com",
    );
    await expect(page.getByTestId("switch-account-button")).toBeVisible();

    await page.getByTestId("switch-account-button").click();

    // Se cierra la sesión actual y aparece la tarjeta para elegir cuenta (proponiendo guillena@gmail.com o cambiar a otra)
    await expect(page.getByTestId("instant-auth-card")).toBeVisible();
    await expect(
      page.getByTestId("oauth-known-account-guillena@gmail.com"),
    ).toBeVisible();
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
