import { expect, test } from "@playwright/test";
import type { ChallengeDetailData } from "../components/retos/ChallengeDetailClient";
import type { StoredSession } from "../lib/api";

const ANA_SESSION: StoredSession = {
  accessToken: "token-ana",
  user: {
    id: "u-ana",
    username: "ana_ok",
    displayName: "Ana",
    coinsAvailable: 100,
    credibilityScore: 96,
    credibilityStatus: "GREEN",
  },
};

function baseDetail(
  overrides: Partial<ChallengeDetailData> = {},
): ChallengeDetailData {
  return {
    id: "ch-det-1",
    inviteCode: "DET001",
    title: "Partido de Ping Pong 1v1 al mejor de 3 sets",
    status: "ACTIVE",
    mode: "COINS",
    stakeAmount: 25,
    pot: 50,
    role: "CREATOR",
    createdAt: new Date(Date.now() - 3_600_000).toISOString(),
    expiresAt: new Date(Date.now() + 20 * 3_600_000).toISOString(),
    closedAt: null,
    winnerId: null,
    shareUrl: "http://localhost:3100/r/DET001",
    whatsappShareUrl: "https://wa.me/?text=DET001",
    creator: {
      id: "u-ana",
      username: "ana_ok",
      displayName: "Ana",
      credibility: { score: 96, band: "GREEN", provisional: false },
    },
    opponent: {
      id: "u-beto",
      username: "beto",
      displayName: "Beto",
      credibility: { score: 88, band: "GREEN", provisional: false },
    },
    myVote: null,
    rivalHasVoted: false,
    rivalVote: null,
    creatorVote: null,
    opponentVote: null,
    silenceDeadline: null,
    judge: {
      proposed: false,
      assigned: false,
      proposedById: null,
      judgeUser: null,
      verdictDeadline: null,
    },
    cashPaymentStatus: "NONE",
    events: [
      {
        id: "ev-1",
        eventType: "CREATED",
        actorId: "u-ana",
        payload: null,
        createdAt: new Date(Date.now() - 3_600_000).toISOString(),
      },
      {
        id: "ev-2",
        eventType: "ACCEPTED",
        actorId: "u-beto",
        payload: null,
        createdAt: new Date(Date.now() - 1_800_000).toISOString(),
      },
    ],
    ...overrides,
  };
}

test.describe("Detalle del Reto y Declarar Resultado / Disputa (Task 6.5)", () => {
  test("muestra cuenta regresiva, barra 50/50 del pozo, evidencia opcional, bitácora, 3 botones de voto y cambio de voto en vivo", async ({
    page,
  }) => {
    let currentDetail = baseDetail();
    const votesSent: string[] = [];

    await page.addInitScript((session) => {
      window.localStorage.setItem("ibetu:session", JSON.stringify(session));
    }, ANA_SESSION);

    await page.route("**/api/challenges/ch-det-1", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(currentDetail),
      });
    });

    await page.route("**/api/challenges/ch-det-1/evidence", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            key: "challenges/ch-det-1/u-ana/photo1.jpg",
            kind: "IMAGE",
            contentType: "image/jpeg",
            sizeBytes: 12000,
            uploadedById: "u-ana",
            uploadedAt: new Date().toISOString(),
            url: "data:image/gif;base64,R0lGODlhAQABAAAAACwAAAAAAQABAAA=",
          },
        ]),
      });
    });

    await page.route("**/api/friends", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
    });

    await page.route("**/api/challenges/ch-det-1/declare", async (route) => {
      const body = JSON.parse(route.request().postData() ?? "{}") as {
        vote: "WIN" | "LOSS" | "DRAW";
      };
      votesSent.push(body.vote);
      currentDetail = baseDetail({
        status: "RESULT",
        myVote: body.vote,
        silenceDeadline: new Date(Date.now() + 24 * 3_600_000).toISOString(),
      });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ status: "RESULT", myVote: body.vote }),
      });
    });

    await page.goto("/retos/ch-det-1");

    // 1. Cuenta regresiva, barra 50/50 del pozo, evidencia y bitácora
    await expect(page.getByTestId("detail-countdown")).toContainText("Quedan");
    await expect(page.getByTestId("detail-pot-total")).toContainText(
      "Pozo 50/50: 50 monedas",
    );
    await expect(page.getByTestId("pot-split-bar")).toBeVisible();
    await expect(page.getByTestId("evidence-item")).toHaveCount(1);
    await expect(page.getByTestId("timeline-event")).toHaveCount(2);

    // 2. Los 3 botones de votación
    await expect(page.getByTestId("vote-win")).toContainText("¡Gané yo!");
    await expect(page.getByTestId("vote-loss")).toContainText("Ganó mi rival");
    await expect(page.getByTestId("vote-draw")).toContainText(
      "Empate / Cancelar mutuo",
    );

    // 3. Declarar "¡Gané yo!" -> aparece estado actual y botón para cambiar voto en vivo
    await page.getByTestId("vote-win").click();
    await expect(page.getByTestId("my-current-vote")).toContainText("¡Gané yo!");
    await expect(page.getByTestId("silence-countdown-box")).toBeVisible();

    // 4. Cambiar voto en vivo a "Empate / Cancelar mutuo"
    await page.getByTestId("btn-change-vote").click();
    await page.getByTestId("vote-draw").click();
    await expect(page.getByTestId("my-current-vote")).toContainText(
      "Empate / Cancelar mutuo",
    );
    expect(votesSent).toEqual(["WIN", "DRAW"]);
  });

  test("flujo de disputa y 3er amigo Juez: proponer, aprobar y emitir fallo como Juez", async ({
    page,
  }) => {
    let currentDetail = baseDetail({
      status: "DISPUTE",
      myVote: "WIN",
      rivalHasVoted: true,
      rivalVote: "WIN",
    });

    await page.addInitScript((session) => {
      window.localStorage.setItem("ibetu:session", JSON.stringify(session));
    }, ANA_SESSION);

    await page.route("**/api/challenges/ch-det-1", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(currentDetail),
      });
    });

    await page.route("**/api/challenges/ch-det-1/evidence", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
    });

    await page.route("**/api/friends", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: "u-carla",
            displayName: "Carla",
            username: "carla_juez",
            since: new Date().toISOString(),
          },
        ]),
      });
    });

    await page.route("**/api/challenges/ch-det-1/judge/propose", async (route) => {
      // Simulamos que el rival propuso y ahora nos toca aprobar, o primero queda propuesto
      currentDetail = baseDetail({
        status: "DISPUTE",
        myVote: "WIN",
        rivalHasVoted: true,
        rivalVote: "WIN",
        judge: {
          proposed: true,
          assigned: false,
          proposedById: "u-beto",
          judgeUser: {
            id: "u-carla",
            username: "carla_juez",
            displayName: "Carla",
          },
          verdictDeadline: null,
        },
      });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true }),
      });
    });

    await page.route("**/api/challenges/ch-det-1/judge/approve", async (route) => {
      // Pasa a vista del Juez asignado con plazo de 48h
      currentDetail = baseDetail({
        status: "DISPUTE",
        role: "JUDGE",
        judge: {
          proposed: true,
          assigned: true,
          proposedById: "u-beto",
          judgeUser: {
            id: "u-carla",
            username: "carla_juez",
            displayName: "Carla",
          },
          verdictDeadline: new Date(Date.now() + 48 * 3_600_000).toISOString(),
        },
      });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true }),
      });
    });

    await page.route("**/api/challenges/ch-det-1/judge/verdict", async (route) => {
      const body = JSON.parse(route.request().postData() ?? "{}") as {
        winnerId: string;
      };
      currentDetail = baseDetail({
        status: "CLOSED",
        winnerId: body.winnerId,
        closedAt: new Date().toISOString(),
      });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ status: "CLOSED", winnerId: body.winnerId }),
      });
    });

    await page.goto("/retos/ch-det-1");

    // 1. Proponer Juez
    await expect(page.getByTestId("dispute-judge-section")).toBeVisible();
    await page.getByTestId("propose-judge-select").selectOption("u-carla");
    await page.getByTestId("btn-propose-judge").click();

    // 2. Aprobar Juez propuesto
    await expect(page.getByTestId("judge-proposed-box")).toContainText(
      "Carla (@carla_juez)",
    );
    await page.getByTestId("btn-approve-judge").click();

    // 3. Emitir veredicto como Juez
    await expect(page.getByTestId("judge-verdict-panel")).toBeVisible();
    await expect(page.getByTestId("judge-countdown")).toBeVisible();
    await page.getByTestId("verdict-creator").click();

    // 4. Queda cerrado con ganador Ana
    await expect(page.getByTestId("detail-closed-outcome")).toContainText(
      "Ganador: Ana (@ana_ok)",
    );
  });
});

