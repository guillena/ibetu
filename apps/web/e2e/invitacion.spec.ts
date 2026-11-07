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

test.describe("Página pública de invitación /r/[code] con Login Google/Apple y sesión persistente", () => {
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

  test("en dispositivo sin sesión, permite elegir Google, confirmar @usuario (+100 monedas) y aceptar el reto", async ({
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
          email: "lucas@gmail.com",
          suggestedDisplayName: "Lucas",
          suggestedUsername: "lucas",
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
            id: "u-lucas",
            username: "lucas_ok",
            displayName: "Lucas",
            email: "lucas@gmail.com",
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
    await expect(page.getByTestId("invite-title")).toContainText(
      "¿A que no embocás el papel en el cesto de 5 metros?",
    );
    await expect(page.getByTestId("invite-stake-badge")).toContainText(
      "Pozo: 20 monedas",
    );

    // 2. Opciones Google o Apple
    await expect(page.getByTestId("invite-register-modal")).toBeVisible();
    await expect(page.getByTestId("btn-oauth-google")).toBeVisible();
    await expect(page.getByTestId("btn-oauth-apple")).toBeVisible();

    await page.getByTestId("btn-oauth-google").click();

    // 3. Confirma @usuario y acepta el reto
    await expect(page.locator("#invite-display-name")).toHaveValue("Lucas");
    await page.locator("#invite-username").fill("lucas_ok");
    await page.getByTestId("invite-register-submit").click();

    await expect.poll(() => completedProfilePayload).toEqual({
      onboardingToken: "onb-invite-token-777",
      displayName: "Lucas",
      username: "lucas_ok",
      inviteCode: "CODE777",
    });
    await expect.poll(() => acceptedChallenge).toBe(true);

    await expect(page.getByTestId("invite-accepted-banner")).toBeVisible();
  });

  test("en dispositivo que ya tiene sesión activa en localStorage, no pide loguearse de nuevo y muestra directamente 'Aceptar Reto ahora'", async ({
    page,
  }) => {
    let acceptedChallenge = false;

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

    await page.route("**/api/challenges/ch-inv-777/accept", async (route) => {
      acceptedChallenge = true;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ id: "ch-inv-777", status: "ACTIVE" }),
      });
    });

    await page.goto("/r/CODE777");

    // No pide loguearse de nuevo
    await expect(page.getByTestId("invite-register-modal")).toHaveCount(0);
    await expect(page.getByTestId("invite-authenticated-box")).toBeVisible();
    await expect(page.getByTestId("accept-invite-btn")).toBeVisible();

    await page.getByTestId("accept-invite-btn").click();
    await expect.poll(() => acceptedChallenge).toBe(true);
    await expect(page.getByTestId("invite-accepted-banner")).toBeVisible();
  });
});
