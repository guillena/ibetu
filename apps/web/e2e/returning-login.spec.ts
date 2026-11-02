import { expect, test } from "@playwright/test";
import type { StoredSession } from "../lib/api";

const MOCK_SESSION: StoredSession = {
  accessToken: "mock-jwt-token",
  user: {
    id: "u-ana",
    username: "ana_ok",
    displayName: "Ana",
    coinsAvailable: 50,
    credibilityScore: 100,
    credibilityStatus: "GREEN",
    whatsappLinked: false,
  },
};

test.describe("Acceso desde sitio web, Magic Link y vinculación de WhatsApp", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/api/auth/whatsapp/login-url", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          messageText: "Quiero entrar a mi cuenta IBetU",
          whatsappUrl:
            "https://wa.me/5491100000000?text=Quiero%20entrar%20a%20mi%20cuenta%20IBetU",
        }),
      });
    });

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

  test("visitante sin sesión en /entrar?modo=nuevo ve alta instantánea y puede cambiar a 'Ya tengo perfil'", async ({
    page,
  }) => {
    await page.goto("/entrar?modo=nuevo");

    await expect(page.getByTestId("instant-auth-card")).toBeVisible();
    await expect(page.getByTestId("btn-switch-to-login")).toBeVisible();

    await page.getByTestId("btn-switch-to-login").click();

    await expect(page.getByTestId("returning-auth-card")).toBeVisible();
    const wspBtn = page.getByTestId("btn-login-whatsapp");
    await expect(wspBtn).toBeVisible();
    await expect(wspBtn).toHaveAttribute(
      "href",
      /https:\/\/wa\.me\/.*Quiero%20entrar%20a%20mi%20cuenta%20IBetU/,
    );
  });

  test("visitante sin sesión en /entrar?modo=ingresar ve directamente el botón 3D 'Entrar con mi WhatsApp'", async ({
    page,
  }) => {
    await page.goto("/entrar?modo=ingresar");

    await expect(page.getByTestId("returning-auth-card")).toBeVisible();
    const wspBtn = page.getByTestId("btn-login-whatsapp");
    await expect(wspBtn).toBeVisible();
    await expect(wspBtn).toContainText("Entrar con mi WhatsApp");
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

  test("canje exitoso de Magic Link en /auth/magic?token=... guarda la sesión y redirige a /", async ({
    page,
  }) => {
    let redeemedToken: string | null = null;
    await page.route("**/api/auth/magic-login", async (route) => {
      const body = route.request().postDataJSON() as { token: string };
      redeemedToken = body.token;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          accessToken: "magic-jwt-999",
          user: {
            id: "u-magic",
            username: "guille_magic",
            displayName: "Guille",
            coinsAvailable: 100,
            credibilityScore: 100,
            credibilityStatus: "GREEN",
            whatsappLinked: true,
          },
        }),
      });
    });

    await page.goto("/auth/magic?token=tok_valido_123");

    await expect.poll(() => redeemedToken).toBe("tok_valido_123");
    await expect(page).toHaveURL(/\/$/);

    const saved = await page.evaluate(() =>
      window.localStorage.getItem("ibetu:session"),
    );
    expect(saved).toContain("magic-jwt-999");
    expect(saved).toContain("guille_magic");
  });

  test("enlace mágico vencido en /auth/magic?token=... muestra estado de error y botón de WhatsApp", async ({
    page,
  }) => {
    await page.route("**/api/auth/magic-login", async (route) => {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({
          message: "Enlace inválido o vencido.",
        }),
      });
    });

    await page.goto("/auth/magic?token=tok_vencido");

    await expect(page.getByTestId("magic-login-error")).toContainText(
      "Enlace inválido o vencido.",
    );
    await expect(page.getByTestId("magic-retry-wsp")).toBeVisible();
  });

  test("al crear el primer reto sin WhatsApp vinculado muestra el aviso de vinculación (+50 monedas)", async ({
    page,
  }) => {
    await page.addInitScript((session) => {
      window.localStorage.setItem("ibetu:session", JSON.stringify(session));
    }, MOCK_SESSION);

    await page.route("**/api/friends", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
    });

    await page.route("**/api/challenges/presets", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: "ping-pong",
            label: "1v1 Ping Pong",
            text: "Partido de Ping Pong 1v1 al mejor de 3 sets.",
          },
        ]),
      });
    });

    await page.route("**/api/challenges", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({
            id: "ch-new-1",
            inviteCode: "ABC1234",
            title: "Partido de Ping Pong 1v1 al mejor de 3 sets.",
            mode: "COINS",
            stakeAmount: 10,
            shareUrl: "http://localhost:3000/r/ABC1234",
            whatsappShareUrl:
              "https://wa.me/?text=Te%20desafio%20http%3A%2F%2Flocalhost%3A3000%2Fr%2FABC1234",
          }),
        });
      }
    });

    await page.route("**/api/auth/whatsapp/link-token", async (route) => {
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          token: "VINC-998877",
          messageText: "Vincular mi cuenta IBetU #VINC-998877",
          whatsappUrl:
            "https://wa.me/5491100000000?text=Vincular%20mi%20cuenta%20IBetU%20%23VINC-998877",
          expiresInSeconds: 900,
        }),
      });
    });

    await page.goto("/crear");
    await page
      .getByTestId("preset-pill")
      .filter({ hasText: "1v1 Ping Pong" })
      .click();
    await page.getByTestId("submit-crear-reto").click();

    await expect(page.getByTestId("created-challenge-card")).toBeVisible();
    await expect(page.getByTestId("whatsapp-reverse-link-box")).toBeVisible();

    await page.getByTestId("btn-generate-wsp-token").click();
    await expect(page.getByTestId("wsp-link-token")).toHaveText("VINC-998877");
    await expect(page.getByTestId("wsp-send-link")).toHaveAttribute(
      "href",
      /VINC-998877/,
    );
  });
});

