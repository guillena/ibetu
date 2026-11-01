import { expect, test } from "@playwright/test";
import type { StoredSession } from "../lib/api";

const ANA_SESSION: StoredSession = {
  accessToken: "token-ana",
  user: {
    id: "u-ana",
    username: "ana_ok",
    displayName: "Ana",
    coinsAvailable: 5,
    credibilityScore: 95,
    credibilityStatus: "GREEN",
  },
};

test.describe("Vistas Monedero, Amigos e Historial (Task 6.6)", () => {
  test("Monedero: muestra saldo disponible y en juego, progreso de los 3 días de Constancia, botón Salvavidas e historial de movimientos", async ({
    page,
  }) => {
    let availableCoins = 5;
    let lifelineClaimed = false;

    await page.addInitScript((session) => {
      window.localStorage.setItem("ibetu:session", JSON.stringify(session));
    }, ANA_SESSION);

    await page.route("**/api/wallet", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          coinsAvailable: availableCoins,
          coinsReserved: lifelineClaimed ? 15 : 0,
          streakDaysCount: 2,
          lastCleanChallengeAt: new Date().toISOString(),
          lastLifelineAt: null,
          lifelineEligible: !lifelineClaimed,
          lifelineNextAvailableAt: null,
          whatsappLinked: true,
          paymentAlias: "ana.mp",
          transactions: [
            {
              id: "tx-1",
              type: "BONUS_INIT",
              amount: 50,
              challengeId: null,
              createdAt: new Date(Date.now() - 86_400_000).toISOString(),
            },
            {
              id: "tx-2",
              type: "RESERVE",
              amount: -45,
              challengeId: "ch-1",
              createdAt: new Date(Date.now() - 3_600_000).toISOString(),
            },
          ],
        }),
      });
    });

    await page.route("**/api/wallet/lifeline", async (route) => {
      lifelineClaimed = true;
      availableCoins = 25;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          granted: 20,
          coinsAvailable: 25,
          nextAvailableAt: new Date(Date.now() + 86_400_000).toISOString(),
        }),
      });
    });

    await page.goto("/monedero");

    // 1. Saldo disponible y en juego
    await expect(page.getByTestId("wallet-available")).toContainText("5");
    await expect(page.getByTestId("wallet-reserved")).toContainText("0");

    // 2. Progreso de 3 días de Constancia (2/3 días completados)
    await expect(page.getByTestId("wallet-streak-count")).toHaveText("2/3 días");
    await expect(page.getByTestId("streak-day-1")).toHaveAttribute(
      "data-completed",
      "true",
    );
    await expect(page.getByTestId("streak-day-2")).toHaveAttribute(
      "data-completed",
      "true",
    );
    await expect(page.getByTestId("streak-day-3")).toHaveAttribute(
      "data-completed",
      "false",
    );

    // 3. Historial de movimientos
    await expect(page.getByTestId("wallet-tx-item")).toHaveCount(2);
    await expect(page.getByTestId("wallet-tx-list")).toContainText(
      "Regalo de bienvenida",
    );
    await expect(page.getByTestId("wallet-tx-list")).toContainText(
      "Reserva para reto",
    );

    // 4. Reclamar Salvavidas (+20 monedas)
    await page.getByTestId("btn-lifeline").click();
    expect(lifelineClaimed).toBe(true);
    await expect(page.getByTestId("wallet-available")).toContainText("25");
    await expect(page.getByTestId("balance-chip")).toContainText("25");
  });

  test("Amigos e Historial: muestra lista de amigos con % Fair Play y balance de retos cerrados sin niveles ni rachas", async ({
    page,
  }) => {
    await page.addInitScript((session) => {
      window.localStorage.setItem("ibetu:session", JSON.stringify(session));
    }, ANA_SESSION);

    await page.route("**/api/friends", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: "u-beto",
            displayName: "Beto",
            username: "beto",
            since: new Date().toISOString(),
            credibility: { score: 91, band: "GREEN", provisional: false },
          },
        ]),
      });
    });

    await page.route("**/api/challenges/history**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          summary: { total: 3, wins: 2, losses: 1, draws: 0 },
          items: [
            {
              id: "ch-closed-1",
              title: "Partido de Ping Pong 1v1",
              mode: "COINS",
              stakeAmount: 20,
              closedAt: new Date().toISOString(),
              rival: { id: "u-beto", username: "beto", displayName: "Beto" },
              outcome: "WON",
              winnerId: "u-ana",
              resolvedBy: "AGREEMENT",
              hadDispute: false,
              cashPaymentStatus: null,
            },
            {
              id: "ch-closed-2",
              title: "Mejor Pizza Casera",
              mode: "CASH",
              stakeAmount: 4000,
              closedAt: new Date().toISOString(),
              rival: { id: "u-beto", username: "beto", displayName: "Beto" },
              outcome: "LOST",
              winnerId: "u-beto",
              resolvedBy: "JUDGE",
              hadDispute: true,
              cashPaymentStatus: "CONFIRMED",
            },
          ],
          nextCursor: null,
        }),
      });
    });

    // 1. Vista Amigos
    await page.goto("/amigos");
    await expect(page.getByTestId("friend-card")).toHaveCount(1);
    await expect(page.getByTestId("friend-card")).toContainText("Beto");
    await expect(page.getByTestId("friend-card")).toContainText("91% Fair Play");
    await expect(page.getByTestId("friend-challenge-u-beto")).toHaveAttribute(
      "href",
      "/crear?opponentId=u-beto",
    );

    // 2. Ir al Historial
    await page.getByTestId("friend-history-u-beto").click();
    await expect(page).toHaveURL(/\/historial\?with=u-beto$/);
    await expect(page.getByTestId("history-total")).toHaveText("3");
    await expect(page.getByTestId("history-wins")).toHaveText("2");
    await expect(page.getByTestId("history-losses")).toHaveText("1");
    await expect(page.getByTestId("history-item")).toHaveCount(2);
    await expect(page.getByTestId("history-list")).toContainText(
      "De común acuerdo",
    );
    await expect(page.getByTestId("history-list")).toContainText(
      "Laudo de Juez",
    );

    const bodyText = await page.evaluate(() => document.body.innerText);
    expect(bodyText).not.toMatch(/\bNv\.\s*\d+|\b\d+x\b/i);
  });
});

