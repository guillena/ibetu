import { expect, test } from "@playwright/test";
import type { OpenChallengeList, ProfileView, StoredSession } from "../lib/api";

const FORBIDDEN_WORDS =
  /conductor|copiloto|peaje|cabina|carril|tr[aá]nsito|b[oó]veda|\ben ruta\b|\bruta\b|volante/i;

const MOCK_SESSION: StoredSession = {
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

const MOCK_PROFILE: ProfileView = {
  id: "u-ana",
  username: "ana_ok",
  displayName: "Ana",
  memberSince: new Date().toISOString(),
  isSelf: true,
  totalPlayed: 8,
  totalWins: 5,
  credibility: {
    score: 92,
    band: "GREEN",
    provisional: false,
  },
};

function buildMockChallenges(): OpenChallengeList {
  const inTwoHours = new Date(Date.now() + 2 * 3_600_000).toISOString();
  const inTwentyHours = new Date(Date.now() + 20 * 3_600_000).toISOString();
  const inThreeDays = new Date(Date.now() + 72 * 3_600_000).toISOString();

  return {
    items: [
      {
        id: "ch-in-play-1",
        inviteCode: "PLAY01",
        title: "Partido de Ping Pong 1v1 al mejor de 3 sets",
        mode: "COINS",
        stakeAmount: 25,
        status: "ACTIVE",
        tab: "IN_PLAY",
        role: "CREATOR",
        rival: { id: "u-beto", username: "beto", displayName: "Beto" },
        players: [
          { id: "u-ana", username: "ana_ok", displayName: "Ana" },
          { id: "u-beto", username: "beto", displayName: "Beto" },
        ],
        createdAt: new Date().toISOString(),
        expiresAt: inTwoHours,
        pot: 50,
        actionNeeded: false,
        myVote: null,
        rivalHasVoted: false,
        rivalVote: null,
        silenceDeadline: null,
        judge: null,
        shareUrl: null,
      },
      {
        id: "ch-in-play-2",
        inviteCode: "PLAY02",
        title: "¿Quién prepara la mejor pizza casera?",
        mode: "CASH",
        stakeAmount: 5000,
        status: "ACTIVE",
        tab: "IN_PLAY",
        role: "OPPONENT",
        rival: { id: "u-carla", username: "carla", displayName: "Carla" },
        players: [
          { id: "u-carla", username: "carla", displayName: "Carla" },
          { id: "u-ana", username: "ana_ok", displayName: "Ana" },
        ],
        createdAt: new Date().toISOString(),
        expiresAt: inThreeDays,
        pot: null,
        actionNeeded: false,
        myVote: null,
        rivalHasVoted: false,
        rivalVote: null,
        silenceDeadline: null,
        judge: null,
        shareUrl: null,
      },
      {
        id: "ch-declare-1",
        inviteCode: "DECL01",
        title: "¿A que no embocás el papel en el cesto de 5 metros?",
        mode: "COINS",
        stakeAmount: 15,
        status: "RESULT",
        tab: "TO_DECLARE",
        role: "OPPONENT",
        rival: { id: "u-beto", username: "beto", displayName: "Beto" },
        players: [
          { id: "u-beto", username: "beto", displayName: "Beto" },
          { id: "u-ana", username: "ana_ok", displayName: "Ana" },
        ],
        createdAt: new Date().toISOString(),
        expiresAt: inThreeDays,
        pot: 30,
        actionNeeded: true,
        myVote: null,
        rivalHasVoted: true,
        rivalVote: null,
        silenceDeadline: inTwentyHours,
        judge: null,
        shareUrl: null,
      },
      {
        id: "ch-judge-1",
        inviteCode: "JUDG01",
        title: "Partida de FIFA 1v1 sin repetir equipo",
        mode: "COINS",
        stakeAmount: 20,
        status: "DISPUTE",
        tab: "TO_DECLARE",
        role: "JUDGE",
        rival: null,
        players: [
          { id: "u-beto", username: "beto", displayName: "Beto" },
          { id: "u-carla", username: "carla", displayName: "Carla" },
        ],
        createdAt: new Date().toISOString(),
        expiresAt: inThreeDays,
        pot: 40,
        actionNeeded: true,
        myVote: null,
        rivalHasVoted: false,
        rivalVote: null,
        silenceDeadline: null,
        judge: {
          proposed: true,
          assigned: true,
          verdictDeadline: inTwentyHours,
        },
        shareUrl: null,
      },
      {
        id: "ch-inv-rec-1",
        inviteCode: "INVR01",
        title: "¿Quién hace 30 flexiones más rápido?",
        mode: "COINS",
        stakeAmount: 10,
        status: "PENDING",
        tab: "INVITATION_RECEIVED",
        role: "OPPONENT",
        rival: { id: "u-diego", username: "diego", displayName: "Diego" },
        players: [
          { id: "u-diego", username: "diego", displayName: "Diego" },
          { id: "u-ana", username: "ana_ok", displayName: "Ana" },
        ],
        createdAt: new Date().toISOString(),
        expiresAt: inThreeDays,
        pot: 20,
        actionNeeded: true,
        myVote: null,
        rivalHasVoted: false,
        rivalVote: null,
        silenceDeadline: null,
        judge: null,
        shareUrl: null,
      },
      {
        id: "ch-inv-sent-1",
        inviteCode: "INVS01",
        title: "¿A que no llegás primero a la esquina?",
        mode: "COINS",
        stakeAmount: 10,
        status: "PENDING",
        tab: "INVITATION_SENT",
        role: "CREATOR",
        rival: null,
        players: [{ id: "u-ana", username: "ana_ok", displayName: "Ana" }],
        createdAt: new Date().toISOString(),
        expiresAt: inThreeDays,
        pot: 20,
        actionNeeded: false,
        myVote: null,
        rivalHasVoted: false,
        rivalVote: null,
        silenceDeadline: null,
        judge: null,
        shareUrl: "http://localhost:3000/r/INVS01",
      },
    ],
    counts: {
      inPlay: 2,
      toDeclare: 2,
      toDeclareActionNeeded: 2,
      invitationsReceived: 1,
      invitationsSent: 1,
    },
  };
}

test.describe("Pantalla principal Retos (Task 6.2)", () => {
  test("muestra el % Fair Play, monedas en juego y filtra las tarjetas por pestaña sin jerga de tránsito", async ({
    page,
  }) => {
    const mockData = buildMockChallenges();

    await page.addInitScript((session) => {
      window.localStorage.setItem("ibetu:session", JSON.stringify(session));
    }, MOCK_SESSION);

    await page.route("**/api/challenges", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockData),
      });
    });

    await page.route("**/api/users/me/profile", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_PROFILE),
      });
    });

    await page.goto("/");

    // 1. Banner de estado rápido: % Fair Play + Monedas en juego (25 + 15 + 10 = 50; el reto como Juez no suma reserva propia)
    await expect(page.getByTestId("retos-fair-play")).toContainText("92%");
    await expect(page.getByTestId("retos-fair-play")).toContainText("Cumplidor");
    await expect(page.getByTestId("retos-coins-in-play")).toContainText("50");
    await expect(page.getByTestId("balance-chip")).toContainText("140");
    await expect(page.getByTestId("fair-play-badge")).toHaveText("92");

    // 2. Las 3 pestañas en píldora y sus contadores
    await expect(page.getByTestId("tab-in-play")).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId("count-in-play")).toHaveText("2");
    await expect(page.getByTestId("count-to-declare")).toHaveText("2");
    await expect(page.getByTestId("count-invitations")).toHaveText("2");
    await expect(page.getByTestId("alert-dot-to-declare")).toBeVisible();
    await expect(page.getByTestId("alert-dot-invitations")).toBeVisible();

    // 3. Pestaña En Juego: muestra exactamente los 2 retos activos (Monedas y Plata)
    const inPlayCards = page.getByTestId("challenge-card");
    await expect(inPlayCards).toHaveCount(2);
    await expect(inPlayCards.nth(0)).toContainText("Partido de Ping Pong 1v1");
    await expect(inPlayCards.nth(0)).toContainText("vs. Beto (@beto)");
    await expect(inPlayCards.nth(0)).toContainText("Pozo: 50 monedas");
    await expect(inPlayCards.nth(0).getByRole("link", { name: "Ver Detalle" })).toBeVisible();

    await expect(inPlayCards.nth(1)).toContainText("¿Quién prepara la mejor pizza casera?");
    await expect(inPlayCards.nth(1)).toContainText("Plata: $5.000 c/u");

    // 4. Cambiar a Por Declarar: muestra reto a declarar y reto donde es Juez
    await page.getByTestId("tab-to-declare").click();
    await expect(page.getByTestId("tab-to-declare")).toHaveAttribute("aria-selected", "true");
    await expect(inPlayCards).toHaveCount(2);
    await expect(inPlayCards.nth(0)).toContainText("Te toca declarar");
    await expect(
      inPlayCards.nth(0).getByRole("link", { name: "Declarar Ganador" }),
    ).toBeVisible();
    await expect(inPlayCards.nth(1)).toContainText("Sos el Juez");
    await expect(
      inPlayCards.nth(1).getByRole("link", { name: "Dar Veredicto" }),
    ).toBeVisible();

    // 5. Cambiar a Invitaciones: muestra invitación recibida y enviada
    await page.getByTestId("tab-invitations").click();
    await expect(page.getByTestId("tab-invitations")).toHaveAttribute("aria-selected", "true");
    await expect(inPlayCards).toHaveCount(2);
    await expect(inPlayCards.nth(0)).toContainText("Te desafiaron");
    await expect(
      inPlayCards.nth(0).getByRole("button", { name: "Aceptar Reto" }),
    ).toBeVisible();
    await expect(inPlayCards.nth(1)).toContainText("Invitación enviada");
    await expect(inPlayCards.nth(1)).toContainText("Abierto por link de WhatsApp");

    // 6. Cero vocabulario de tránsito en todas las pestañas
    const fullText = await page.evaluate(() => document.body.innerText);
    expect(fullText).not.toMatch(FORBIDDEN_WORDS);
  });

  test("aceptar una invitación recibida llama a POST /challenges/:id/accept y pasa a En Juego", async ({
    page,
  }) => {
    let accepted = false;
    const mockData = buildMockChallenges();

    await page.addInitScript((session) => {
      window.localStorage.setItem("ibetu:session", JSON.stringify(session));
    }, MOCK_SESSION);

    await page.route("**/api/challenges", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockData),
      });
    });

    await page.route("**/api/users/me/profile", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_PROFILE),
      });
    });

    await page.route("**/api/challenges/ch-inv-rec-1/accept", async (route) => {
      accepted = true;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ id: "ch-inv-rec-1", status: "ACTIVE" }),
      });
    });

    await page.goto("/");
    await page.getByTestId("tab-invitations").click();
    await page.getByRole("button", { name: "Aceptar Reto" }).click();

    expect(accepted).toBe(true);
    await expect(page.getByTestId("tab-in-play")).toHaveAttribute("aria-selected", "true");
  });
});

