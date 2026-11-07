import { expect, test } from "@playwright/test";
import type { PublicInviteChallenge } from "../components/invitacion/InvitePageClient";
import type { StoredSession } from "../lib/api";

const MOCK_INVITE: PublicInviteChallenge = {
  id: "ch-inv-777",
  inviteCode: "CODE777",
  title: "¿A que no embocás el papel en el cesto de 5 metros?",
  status: "PENDING",
  mode: "COINS",
  stakeAmount: 10,
  pot: 20,
  expiresAt: new Date(Date.now() + 48 * 3_600_000).toISOString(),
  createdAt: new Date().toISOString(),
  shareUrl: "http://localhost:3100/r/CODE777",
  creator: {
    id: "u-ana",
    username: "ana_ok",
    displayName: "Ana",
    credibility: {
      score: 95,
      band: "GREEN",
      provisional: false,
    },
  },
  opponent: null,
};

const EXISTING_DEVICE_SESSION: StoredSession = {
  accessToken: "jwt-existing-device",
  user: {
    id: "u-lucas",
    username: "lucas_ok",
    displayName: "Lucas",
    email: "lucas@gmail.com",
    coinsAvailable: 100,
    credibilityScore: 100,
    credibilityStatus: "GREEN",
  },
};

test.describe("Página pública de invitación /r/[code] con Selector de Cuenta Google/Apple y Cambiar Cuenta", () => {
  test("el HTML SSR de /r/[code] incluye las etiquetas OpenGraph og:title y og:description", async ({
    request,
  }) => {
    const res = await request.get("/r/CODE777");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("text/html");

    const html = await res.text();
    expect(html).toMatch(
      /<meta[^>]+property="og:title"[^>]+content="[^"]*CODE777[^"]*"/i,
    );
    expect(html).toMatch(
      /<meta[^>]+property="og:description"[^>]+content="[^"]*CODE777[^"]*"/i,
    );
  });

  test("en dispositivo sin sesión, permite elegir Google, ingresar su cuenta guillena@gmail.com, confirmar @usuario (+100 monedas) y aceptar el reto", async ({
    page,
  }) => {
    let completedProfilePayload: Record<string, unknown> | null = null;
    let acceptedChallenge = false;

    await page.route("**/api/challenges/by-code/CODE777", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_INVITE),
      });
    });

    await page.route("**/api/auth/oauth/verify", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "NEEDS_PROFILE",
          onboardingToken: "onb-invite-token-777",
          provider: "GOOGLE",
          email: "guillena@gmail.com",
          suggestedDisplayName: "Guillena",
          suggestedUsername: "guillena",
        }),
      });
    });

    await page.route("**/api/auth/oauth/complete-profile", async (route) => {
      completedProfilePayload = JSON.parse(route.request().postData() ?? "{}");
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          accessToken: "jwt-invitee-token",
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

    await page.route("**/api/challenges/ch-inv-777/accept", async (route) => {
      acceptedChallenge = true;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ id: "ch-inv-777", status: "ACTIVE" }),
      });
    });

    await page.goto("/r/CODE777");

    // 1. Muestra los datos de la invitación
    await expect(page.getByTestId("invite-card")).toBeVisible();
    await expect(
      page.getByRole("img", { name: "Dadi, la mascota de I Bet U" }),
    ).toBeVisible();
    await expect(page.getByTestId("invite-creator")).toContainText(
      "Ana (@ana_ok)",
    );

    // 2. Opciones Google o Apple -> abre selector de cuenta e ingresa guillena@gmail.com
    await expect(page.getByTestId("invite-register-modal")).toBeVisible();
    await page.getByTestId("btn-oauth-google").click();

    await expect(page.getByTestId("oauth-account-selector")).toBeVisible();
    await page.getByTestId("oauth-email-input").fill("guillena@gmail.com");
    await page.getByTestId("btn-oauth-email-continue").click();

    // 3. Muestra guillena@gmail.com asociado y confirma @usuario + acepta reto
    await expect(page.getByTestId("invite-oauth-email")).toHaveText(
      "guillena@gmail.com",
    );
    await expect(page.locator("#invite-display-name")).toHaveValue("Guillena");
    await page.locator("#invite-username").fill("guillena_ok");
    await page.getByTestId("invite-register-submit").click();

    await expect.poll(() => completedProfilePayload).toEqual({
      onboardingToken: "onb-invite-token-777",
      displayName: "Guillena",
      username: "guillena_ok",
      inviteCode: "CODE777",
    });
    await expect.poll(() => acceptedChallenge).toBe(true);

    await expect(page.getByTestId("invite-accepted-banner")).toBeVisible();
  });

  test("en dispositivo que ya tiene sesión activa, muestra 'Aceptar Reto ahora', indica la cuenta conectada y permite 'Cambiar cuenta'", async ({
    page,
  }) => {
    await page.addInitScript((session) => {
      window.localStorage.setItem("ibetu:session", JSON.stringify(session));
    }, EXISTING_DEVICE_SESSION);

    await page.route("**/api/challenges/by-code/CODE777", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_INVITE),
      });
    });

    await page.goto("/r/CODE777");

    // No pide loguearse de nuevo y muestra con qué cuenta está conectado
    await expect(page.getByTestId("invite-register-modal")).toHaveCount(0);
    await expect(page.getByTestId("invite-authenticated-box")).toBeVisible();
    await expect(page.getByTestId("accept-invite-btn")).toBeVisible();
    await expect(page.getByTestId("invite-current-account")).toContainText(
      "Lucas (@lucas_ok)",
    );
    await expect(page.getByTestId("invite-current-account")).toContainText(
      "lucas@gmail.com",
    );

    // Permite tocar "Cambiar cuenta" para abrir el selector de login en la misma invitación
    await page.getByTestId("invite-switch-account-btn").click();
    await expect(page.getByTestId("invite-register-modal")).toBeVisible();
    await expect(page.getByTestId("btn-oauth-google")).toBeVisible();
  });
});
