import { expect, test } from "@playwright/test";
import type { FriendItem, StoredSession } from "../lib/api";

const MOCK_SESSION: StoredSession = {
  accessToken: "mock-jwt-token",
  user: {
    id: "u-ana",
    username: "ana_ok",
    displayName: "Ana",
    coinsAvailable: 50,
    credibilityScore: 100,
    credibilityStatus: "GREEN",
  },
};

const MOCK_FRIENDS: FriendItem[] = [
  {
    id: "u-beto",
    displayName: "Beto",
    username: "beto",
    since: new Date().toISOString(),
  },
];

test.describe("Pantalla Crear Reto (Task 6.3)", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((session) => {
      window.localStorage.setItem("ibetu:session", JSON.stringify(session));
    }, MOCK_SESSION);

    await page.route("**/api/friends", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_FRIENDS),
      });
    });

    await page.route("**/api/challenges/presets", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: "paper-basket",
            label: "Emboque de papel",
            text: "¿A que no embocás el papel en el cesto de 5 metros al primer intento?",
          },
          {
            id: "ping-pong",
            label: "1v1 Ping Pong",
            text: "Partido de Ping Pong 1v1 al mejor de 3 sets.",
          },
        ]),
      });
    });
  });

  test("renderiza los 3 bloques, completa con Presets de 1 toque y no incluye botón de dictado por voz", async ({
    page,
  }) => {
    await page.goto("/crear");

    await expect(page.getByTestId("block-rival")).toBeVisible();
    await expect(page.getByTestId("block-description")).toBeVisible();
    await expect(page.getByTestId("block-stake")).toBeVisible();

    // Sin íconos de micrófono / dictado por voz
    const iconNames = await page.evaluate(() =>
      [...document.querySelectorAll(".material-symbols-outlined")].map((el) =>
        el.textContent?.trim(),
      ),
    );
    expect(iconNames).not.toContain("mic");
    expect(iconNames).not.toContain("keyboard_voice");
    expect(iconNames).not.toContain("settings_voice");

    // Tocar un preset autocompleta la descripción y actualiza el contador
    await page.getByTestId("preset-pill").filter({ hasText: "1v1 Ping Pong" }).click();
    await expect(page.locator("#challenge-title")).toHaveValue(
      "Partido de Ping Pong 1v1 al mejor de 3 sets.",
    );
    await expect(page.getByTestId("title-char-count")).toHaveText("44/140");
  });

  test("valida en el cliente: título vacío, más de 140 caracteres, apuesta inválida, saldo insuficiente y fecha pasada", async ({
    page,
  }) => {
    await page.goto("/crear");

    // 1. Título vacío
    await page.getByTestId("submit-crear-reto").click();
    await expect(page.getByTestId("crear-reto-error")).toContainText(
      "Escribí de qué trata el desafío",
    );

    // 2. Más de 140 caracteres
    await page.locator("#challenge-title").fill("A".repeat(145));
    await page.getByTestId("submit-crear-reto").click();
    await expect(page.getByTestId("crear-reto-error")).toContainText(
      "no puede superar los 140 caracteres",
    );

    // 3. Apuesta <= 0
    await page.locator("#challenge-title").fill("Reto válido");
    await page.locator("#challenge-stake").fill("0");
    await page.getByTestId("submit-crear-reto").click();
    await expect(page.getByTestId("crear-reto-error")).toContainText(
      "número entero mayor a 0",
    );

    // 4. Saldo insuficiente en Monedas (tiene 50, intenta apostar 100)
    await page.locator("#challenge-stake").fill("100");
    await page.getByTestId("submit-crear-reto").click();
    await expect(page.getByTestId("crear-reto-error")).toContainText(
      "No tenés suficientes monedas disponibles",
    );

    // 5. Fecha vencida (en el pasado)
    await page.locator("#challenge-stake").fill("25");
    await page.getByTestId("duration-custom").click();
    await page.locator("#challenge-expires").fill("2020-01-01T10:00");
    await page.getByTestId("submit-crear-reto").click();
    await expect(page.getByTestId("crear-reto-error")).toContainText(
      "fecha de vencimiento debe ser futura",
    );
  });

  test("envía el formulario válido a POST /challenges y muestra la tarjeta para compartir por WhatsApp", async ({
    page,
  }) => {
    let submittedPayload: Record<string, unknown> | null = null;

    await page.route("**/api/challenges", async (route) => {
      if (route.request().method() === "POST") {
        submittedPayload = JSON.parse(route.request().postData() ?? "{}");
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({
            id: "ch-new-1",
            inviteCode: "PING99",
            title: "Partido de Ping Pong 1v1 al mejor de 3 sets.",
            status: "PENDING",
            mode: "COINS",
            stakeAmount: 25,
            expiresAt: new Date(Date.now() + 48 * 3_600_000).toISOString(),
            shareUrl: "http://localhost:3100/r/PING99",
            whatsappShareUrl: "https://wa.me/?text=Te%20desaf%C3%ADo",
          }),
        });
      }
    });

    await page.goto("/crear");

    await page.getByTestId("rival-friend-u-beto").click();
    await page.getByTestId("preset-pill").filter({ hasText: "1v1 Ping Pong" }).click();
    await page.getByTestId("stake-pill-25").click();
    await expect(page.getByTestId("pot-preview")).toContainText("50 monedas");

    await page.getByTestId("submit-crear-reto").click();

    await expect(page.getByTestId("created-challenge-card")).toBeVisible();
    await expect(page.getByTestId("created-invite-link")).toContainText("/r/PING99");
    await expect(page.getByTestId("share-whatsapp-link")).toHaveAttribute(
      "href",
      /wa\.me/,
    );
    expect(submittedPayload).toMatchObject({
      opponentId: "u-beto",
      mode: "COINS",
      stakeAmount: 25,
      title: "Partido de Ping Pong 1v1 al mejor de 3 sets.",
    });
  });
});

