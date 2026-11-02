import { expect, test } from "@playwright/test";
import type { PublicInviteChallenge } from "../components/invitacion/InvitePageClient";

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

test.describe("Página pública de invitación /r/[code] (Task 6.4)", () => {
  test("el HTML SSR de /r/[code] incluye las etiquetas OpenGraph og:title y og:description", async ({
    request,
  }) => {
    const res = await request.get("/r/CODE777");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("text/html");

    const html = await res.text();
    expect(html).toMatch(/<meta[^>]+property="og:title"[^>]+content="[^"]*CODE777[^"]*"/i);
    expect(html).toMatch(
      /<meta[^>]+property="og:description"[^>]+content="[^"]*CODE777[^"]*"/i,
    );
  });

  test("muestra el reto, registra al invitado en 1 paso con Nombre + @usuario, acepta el reto y genera el Mensaje Inverso de WhatsApp", async ({
    page,
  }) => {
    let registeredPayload: Record<string, unknown> | null = null;
    let acceptedChallenge = false;

    await page.route("**/api/challenges/by-code/CODE777", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_INVITE),
      });
    });

    await page.route("**/api/auth/instant-register", async (route) => {
      registeredPayload = JSON.parse(route.request().postData() ?? "{}");
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          accessToken: "jwt-invitee-token",
          user: {
            id: "u-lucas",
            username: "lucas_ok",
            displayName: "Lucas",
            coinsAvailable: 50,
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

    await page.route("**/api/auth/whatsapp/link-token", async (route) => {
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          token: "VINC-987654",
          messageText: "Quiero vincular mi cuenta en I Bet U: VINC-987654",
          whatsappUrl: "https://wa.me/5491100000000?text=VINC-987654",
          expiresInSeconds: 900,
        }),
      });
    });

    await page.goto("/r/CODE777");

    // 1. Muestra los datos de la invitación
    await expect(page.getByTestId("invite-card")).toBeVisible();
    // La mascota de la marca se anuncia con su nombre en el texto alternativo.
    await expect(page.getByRole("img", { name: "Dadi, la mascota de I Bet U" })).toBeVisible();
    await expect(page.getByTestId("invite-creator")).toContainText("Ana (@ana_ok)");
    await expect(page.getByTestId("invite-title")).toContainText(
      "¿A que no embocás el papel en el cesto de 5 metros?",
    );
    await expect(page.getByTestId("invite-stake-badge")).toContainText(
      "Pozo: 20 monedas",
    );

    // 2. Modal de registro instantáneo (Nombre + @usuario)
    await expect(page.getByTestId("invite-register-modal")).toBeVisible();
    await page.locator("#invite-display-name").fill("Lucas");
    await page.locator("#invite-username").fill("lucas_ok");
    await page.getByTestId("invite-register-submit").click();

    await expect.poll(() => registeredPayload).toEqual({
      displayName: "Lucas",
      username: "lucas_ok",
      inviteCode: "CODE777",
    });
    await expect.poll(() => acceptedChallenge).toBe(true);

    // 3. Banner de reto aceptado y generador de Mensaje Inverso para WhatsApp (+50 monedas)
    await expect(page.getByTestId("invite-accepted-banner")).toBeVisible();
    await expect(page.getByTestId("whatsapp-reverse-link-box")).toBeVisible();
    await page.getByTestId("btn-generate-wsp-token").click();
    await expect(page.getByTestId("wsp-link-token")).toHaveText("VINC-987654");
    await expect(page.getByTestId("wsp-send-link")).toHaveAttribute(
      "href",
      /wa\.me.*VINC-987654/,
    );
  });
});

