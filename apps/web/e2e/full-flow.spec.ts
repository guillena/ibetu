import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

test.describe("Circuito End-to-End completo con API + PostgreSQL + Redis reales (Task 7.1)", () => {
  test("Caso 1 (Coincidencia): Jugador A crea reto de 10 monedas -> comparte link /r/[code] -> Jugador B se registra y acepta (20 en reserva) -> ambos declaran resultado coincidente -> se liquida el pozo una única vez y actualiza % Fair Play", async ({
    browser,
    request,
  }) => {
    const suffix = randomUUID().slice(0, 6).toLowerCase();
    const userA = `ana_${suffix}`;
    const userB = `beto_${suffix}`;

    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();

    // 1. Jugador A se registra desde /crear y recibe 50 monedas iniciales
    await pageA.goto("/crear");
    await pageA.locator("#auth-display-name").fill("Ana");
    await pageA.locator("#auth-username").fill(userA);
    await pageA.getByTestId("instant-auth-card").getByRole("button", { name: /Entrar/ }).click();
    await expect(pageA.getByTestId("balance-chip")).toContainText("50");

    // 2. Jugador A crea un reto de 10 monedas por link de WhatsApp
    await pageA.getByTestId("preset-pill").first().click();
    await pageA.getByTestId("stake-pill-10").click();
    await pageA.getByTestId("submit-crear-reto").click();

    await expect(pageA.getByTestId("created-challenge-card")).toBeVisible();
    const fullLink = await pageA.getByTestId("created-invite-link").innerText();
    const invitePath = new URL(fullLink.trim()).pathname; // /r/<CODE>
    const detailHref = await pageA
      .getByTestId("go-to-challenge-detail")
      .getAttribute("href");
    expect(detailHref).toMatch(/^\/retos\//);

    // Verificar que el SSR de /r/[code] trae los metadatos OpenGraph reales desde PostgreSQL
    const ssrRes = await request.get(invitePath);
    expect(ssrRes.status()).toBe(200);
    const ssrHtml = await ssrRes.text();
    expect(ssrHtml).toMatch(/property="og:title"[^>]+content="Ana te desafía en I Bet U:/i);
    expect(ssrHtml).toMatch(/property="og:description"[^>]+content="Pozo en juego: 20 monedas/i);

    // 3. Jugador B abre el link /r/[code], se registra en 1 paso y acepta el reto
    await pageB.goto(invitePath);
    await expect(pageB.getByTestId("invite-creator")).toContainText(`Ana (@${userA})`);
    await pageB.locator("#invite-display-name").fill("Beto");
    await pageB.locator("#invite-username").fill(userB);
    await pageB.getByTestId("invite-register-submit").click();

    await expect(pageB.getByTestId("invite-accepted-banner")).toBeVisible();

    // 4. Verificar que hay 20 monedas en reserva (10 de Ana y 10 de Beto; cada uno tiene 40 disponibles y 10 en juego)
    await pageA.goto("/monedero");
    await expect(pageA.getByTestId("wallet-available")).toContainText("40");
    await expect(pageA.getByTestId("wallet-reserved")).toContainText("10");

    await pageB.goto("/monedero");
    await expect(pageB.getByTestId("wallet-available")).toContainText("40");
    await expect(pageB.getByTestId("wallet-reserved")).toContainText("10");

    // 5. Ambos entran al detalle del reto y declaran resultado coincidente (Ana: ¡Gané yo!, Beto: Ganó mi rival)
    await pageA.goto(detailHref!);
    await expect(pageA.getByTestId("detail-pot-total")).toContainText(
      "Pozo 50/50: 20 monedas",
    );
    await pageA.getByTestId("vote-win").click();
    await expect(pageA.getByTestId("my-current-vote")).toContainText("¡Gané yo!");

    await pageB.goto(detailHref!);
    await pageB.getByTestId("vote-loss").click();

    // 6. El reto se cierra de inmediato, el pozo (20 monedas) se liquida una única vez a Ana (saldo 60) y se actualiza el % Fair Play
    await expect(pageB.getByTestId("detail-closed-outcome")).toContainText(
      `Ganador: Ana (@${userA})`,
    );

    await pageA.goto("/monedero");
    await expect(pageA.getByTestId("wallet-available")).toContainText("60");
    await expect(pageA.getByTestId("wallet-reserved")).toContainText("0");

    await pageA.goto("/perfil");
    await expect(pageA.getByTestId("profile-played")).toHaveText("1");
    await expect(pageA.getByTestId("profile-wins")).toHaveText("1");
    await expect(pageA.getByTestId("profile-fair-play")).toHaveText("100%");

    await pageB.goto("/perfil");
    await expect(pageB.getByTestId("profile-played")).toHaveText("1");
    await expect(pageB.getByTestId("profile-wins")).toHaveText("0");
    await expect(pageB.getByTestId("profile-fair-play")).toHaveText("100%");

    await ctxA.close();
    await ctxB.close();
  });

  test("Caso 2 (Disputa resuelta por Juez C): Jugador A y Jugador B declaran victoria opuesta -> proponen y aprueban a Juez C -> Juez C emite veredicto (+5 monedas) -> liquida pozo y penaliza % Fair Play del perdedor", async ({
    browser,
  }) => {
    const suffix = randomUUID().slice(0, 6).toLowerCase();
    const userA = `ana_d_${suffix}`;
    const userB = `beto_d_${suffix}`;
    const userC = `juez_c_${suffix}`;

    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    const ctxC = await browser.newContext();
    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();
    const pageC = await ctxC.newPage();

    // 1. Registrar a Jugador A y crear un primer reto rápido con Juez C para que sean amigos
    await pageA.goto("/crear");
    await pageA.locator("#auth-display-name").fill("Ana");
    await pageA.locator("#auth-username").fill(userA);
    await pageA.getByTestId("instant-auth-card").getByRole("button", { name: /Entrar/ }).click();

    await pageA.getByTestId("preset-pill").first().click();
    await pageA.getByTestId("stake-pill-10").click();
    await pageA.getByTestId("submit-crear-reto").click();
    const linkForC = new URL(
      (await pageA.getByTestId("created-invite-link").innerText()).trim(),
    ).pathname;
    const challengeWithC = await pageA
      .getByTestId("go-to-challenge-detail")
      .getAttribute("href");

    // Juez C se registra aceptando ese reto y ambos declaran empate para liberar las monedas
    await pageC.goto(linkForC);
    await pageC.locator("#invite-display-name").fill("Carla Juez");
    await pageC.locator("#invite-username").fill(userC);
    await pageC.getByTestId("invite-register-submit").click();
    await expect(pageC.getByTestId("invite-accepted-banner")).toBeVisible();

    await pageA.goto(challengeWithC!);
    await pageA.getByTestId("vote-draw").click();
    await pageC.goto(challengeWithC!);
    await pageC.getByTestId("vote-draw").click();
    await expect(pageC.getByTestId("detail-closed-outcome")).toContainText("Empate");

    // 2. Ahora Jugador A crea el reto de 10 monedas para Jugador B
    await pageA.goto("/crear");
    await pageA.getByTestId("preset-pill").nth(1).click();
    await pageA.getByTestId("stake-pill-10").click();
    await pageA.getByTestId("submit-crear-reto").click();

    const linkForB = new URL(
      (await pageA.getByTestId("created-invite-link").innerText()).trim(),
    ).pathname;
    const disputeChallengeHref = await pageA
      .getByTestId("go-to-challenge-detail")
      .getAttribute("href");

    // 3. Jugador B se registra desde el link y acepta (20 monedas en reserva)
    await pageB.goto(linkForB);
    await pageB.locator("#invite-display-name").fill("Beto");
    await pageB.locator("#invite-username").fill(userB);
    await pageB.getByTestId("invite-register-submit").click();
    await expect(pageB.getByTestId("invite-accepted-banner")).toBeVisible();

    // 4. Ambos declaran "¡Gané yo!" -> se abre DISPUTE
    await pageA.goto(disputeChallengeHref!);
    await pageA.getByTestId("vote-win").click();
    await expect(pageA.getByTestId("my-current-vote")).toContainText("¡Gané yo!");

    await pageB.goto(disputeChallengeHref!);
    await pageB.getByTestId("vote-win").click();
    await expect(pageB.getByTestId("dispute-judge-section")).toBeVisible();

    // 5. Jugador A propone a Juez C; Jugador B aprueba a Juez C
    await pageA.goto(disputeChallengeHref!);
    await expect(pageA.getByTestId("dispute-judge-section")).toBeVisible();
    await pageA.getByTestId("propose-judge-select").selectOption({ index: 1 });
    await pageA.getByTestId("btn-propose-judge").click();
    await expect(pageA.getByTestId("judge-proposed-box")).toBeVisible();

    await pageB.goto(disputeChallengeHref!);
    await pageB.getByTestId("btn-approve-judge").click();
    await expect(pageB.getByTestId("judge-assigned-status")).toBeVisible();

    // 6. Juez C entra al detalle del reto, emite veredicto a favor de Ana y recibe +5 monedas
    await pageC.goto(disputeChallengeHref!);
    await expect(pageC.getByTestId("judge-verdict-panel")).toBeVisible();
    await pageC.getByTestId("verdict-creator").click();

    await expect(pageC.getByTestId("detail-closed-outcome")).toContainText(
      `Ganador: Ana (@${userA})`,
    );

    // 7. Verificar saldos finales y % Fair Play
    await pageA.goto("/monedero");
    await expect(pageA.getByTestId("wallet-available")).toContainText("60");
    await expect(pageA.getByTestId("wallet-reserved")).toContainText("0");

    await pageC.goto("/monedero");
    await expect(pageC.getByTestId("wallet-available")).toContainText("55"); // 50 iniciales + 5 por laudar

    await pageB.goto("/perfil");
    await expect(pageB.getByTestId("profile-fair-play")).toHaveText("0%");

    await ctxA.close();
    await ctxB.close();
    await ctxC.close();
  });
});

