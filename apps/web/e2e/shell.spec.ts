import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

const ROUTES = [
  { href: "/", label: "Retos", h1: "Retos" },
  { href: "/amigos", label: "Amigos", h1: "Amigos" },
  { href: "/monedero", label: "Monedero", h1: "Monedero" },
  { href: "/historial", label: "Historial", h1: "Historial" },
];
const ALL_PAGES = [...ROUTES.map((r) => r.href), "/crear", "/perfil"];
const MAX_COLUMN = 480; // --shell-max-w (30rem)

/** Vocabulario de autos y tránsito de las pantallas de ejemplo: no debe aparecer en la app. */
const FORBIDDEN_WORDS = /conductor|copiloto|peaje|cabina|carril|tr[aá]nsito|b[oó]veda|\ben ruta\b|\bruta\b|volante/i;

let problems: string[] = [];

test.beforeEach(async ({ page }) => {
  problems = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") problems.push(`console: ${msg.text()}`);
  });
  page.on("pageerror", (err) => problems.push(`pageerror: ${err.message}`));
  page.on("requestfailed", (req) => problems.push(`request failed: ${req.url()}`));
  page.on("response", (res) => {
    if (res.status() >= 400) problems.push(`HTTP ${res.status()}: ${res.url()}`);
  });
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
});

test.afterEach(() => {
  expect(problems, "errores de consola o de red durante la prueba").toEqual([]);
});

const box = async (page: Page, selector: string) => {
  const b = await page.locator(selector).first().boundingBox();
  if (!b) throw new Error(`Sin caja para ${selector}`);
  return b;
};

test.describe("estructura y estilo", () => {
  test("idioma, título y viewport (el zoom del usuario queda habilitado)", async ({ page }) => {
    await expect(page.locator("html")).toHaveAttribute("lang", "es");
    await expect(page).toHaveTitle("Retos · I Bet U");
    const viewport = await page.locator('meta[name="viewport"]').getAttribute("content");
    expect(viewport).toContain("width=device-width");
    expect(viewport).toContain("viewport-fit=cover");
    expect(viewport).not.toMatch(/user-scalable\s*=\s*(no|0)/);
    expect(viewport).not.toMatch(/maximum-scale\s*=\s*1(\.0)?(?![\d.])/);
  });

  test("las fuentes del sistema se cargan: Outfit en títulos, Manrope en el cuerpo", async ({ page }) => {
    const familyOf = (locator: import("@playwright/test").Locator) =>
      locator.evaluate((el) => getComputedStyle(el).fontFamily);
    // Selectores por texto: así se mide el elemento correcto y no un `span` cualquiera.
    const fam = {
      body: await familyOf(page.locator("body")),
      h1: await familyOf(page.getByRole("heading", { level: 1 })),
      wordmark: await familyOf(page.locator("header").getByText("I Bet U", { exact: true })),
      navLabel: await familyOf(page.getByRole("navigation", { name: "Secciones" }).getByText("Amigos", { exact: true })),
      chip: await familyOf(page.getByTestId("balance-chip")),
      loaded: await page.evaluate(() =>
        [...document.fonts].filter((f) => f.status === "loaded").map((f) => f.family.replace(/["']/g, "")),
      ),
    };
    expect(fam.body).toMatch(/manrope/i);
    expect(fam.h1).toMatch(/outfit/i);
    expect(fam.wordmark).toMatch(/outfit/i);
    expect(fam.navLabel).toMatch(/manrope/i);
    expect(fam.chip).toMatch(/manrope/i);
    expect(fam.loaded.join("|")).toMatch(/Material Symbols Outlined/);
  });

  test("los íconos se dibujan como símbolos (no como texto como \"sports_score\")", async ({ page }) => {
    const icons = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>(".material-symbols-outlined")].map((el) => ({
        name: el.textContent,
        width: el.getBoundingClientRect().width,
        fontSize: parseFloat(getComputedStyle(el).fontSize),
      })),
    );
    expect(icons.length).toBeGreaterThanOrEqual(8);
    for (const icon of icons) {
      // Sin la fuente de íconos, "sports_score" ocuparía ~100 px; con ligadura mide lo que su tamaño.
      expect(icon.width, `ícono ${icon.name}`).toBeLessThanOrEqual(icon.fontSize * 1.3);
      expect(icon.width, `ícono ${icon.name}`).toBeGreaterThan(0);
    }
  });

  test("usa los colores del sistema: azul primario, ámbar del saldo y fondo de superficie", async ({ page }) => {
    const c = await page.evaluate(() => {
      const bg = (sel: string) => getComputedStyle(document.querySelector(sel)!).backgroundColor;
      return {
        body: bg("body"),
        activeRadio: bg('[role="radio"][aria-checked="true"]'),
        chip: bg('[data-testid="balance-chip"]'),
        fab: bg('nav a[aria-label="Crear reto"]'),
        activeNavPill: bg('nav a[aria-current="page"] span'),
      };
    });
    expect(c.body).toBe("rgb(249, 249, 255)"); // surface #f9f9ff
    expect(c.activeRadio).toBe("rgb(0, 153, 255)"); // primary-container #0099ff
    expect(c.chip).toBe("rgb(255, 223, 153)"); // tertiary-fixed #ffdf99
    expect(c.fab).toBe("rgb(0, 153, 255)");
    expect(c.activeNavPill).toBe("rgb(0, 153, 255)");
  });

  test("no usa vocabulario de autos ni de tránsito en ninguna pantalla", async ({ page }) => {
    for (const href of ALL_PAGES) {
      await page.goto(href);
      const text = await page.evaluate(() => document.body.innerText);
      expect(text, `texto de ${href}`).not.toMatch(FORBIDDEN_WORDS);
    }
  });

  test("no hay modo oscuro: el esquema de color es claro", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.reload();
    const body = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(body).toBe("rgb(249, 249, 255)");
  });
});

test.describe("encabezado", () => {
  test("queda fijo arriba con marca, saldo, perfil y el switch de modo", async ({ page }) => {
    const header = await box(page, "header");
    expect(header.y).toBeCloseTo(0, 0);
    await expect(page.locator("header").getByText("I Bet U")).toBeVisible();
    await expect(page.getByTestId("balance-chip")).toBeVisible();
    await expect(page.getByRole("link", { name: /Mi perfil/ })).toBeVisible();
    await expect(page.getByRole("radiogroup", { name: "Modo de juego" })).toBeVisible();
    await expect(page.getByRole("radio")).toHaveCount(2);

    // Sigue pegado arriba aunque se haga scroll.
    await page.evaluate(() => {
      const spacer = document.createElement("div");
      spacer.style.height = "3000px";
      document.querySelector("main")!.appendChild(spacer);
      window.scrollTo(0, 1500);
    });
    expect((await box(page, "header")).y).toBeCloseTo(0, 0);
  });

  test("el saldo muestra un guion mientras no hay sesión y no inventa cifras", async ({ page }) => {
    await expect(page.getByTestId("balance-chip")).toContainText("—");
    await expect(page.getByTestId("balance-chip")).not.toContainText(/\d/);
  });

  test("Monedas es el modo inicial y el switch cambia a Plata", async ({ page }) => {
    const monedas = page.getByRole("radio", { name: "Monedas" });
    const plata = page.getByRole("radio", { name: "Plata" });
    await expect(monedas).toHaveAttribute("aria-checked", "true");
    await expect(plata).toHaveAttribute("aria-checked", "false");

    await plata.click();
    await expect(plata).toHaveAttribute("aria-checked", "true");
    await expect(monedas).toHaveAttribute("aria-checked", "false");
    // En Plata no hay saldo que custodiar: el acuerdo es directo entre amigos.
    await expect(page.getByTestId("balance-chip")).toContainText("Entre amigos");

    await monedas.click();
    await expect(page.getByTestId("balance-chip")).toContainText("—");
  });

  test("el modo elegido se recuerda al recargar y al cambiar de pantalla", async ({ page }) => {
    await page.getByRole("radio", { name: "Plata" }).click();
    await page.reload();
    await expect(page.getByRole("radio", { name: "Plata" })).toHaveAttribute("aria-checked", "true");
    await page.getByRole("link", { name: "Monedero" }).click();
    await expect(page).toHaveURL(/\/monedero$/);
    await expect(page.getByRole("radio", { name: "Plata" })).toHaveAttribute("aria-checked", "true");
  });

  test("el switch se maneja con el teclado (flechas) y mueve el foco", async ({ page }) => {
    const monedas = page.getByRole("radio", { name: "Monedas" });
    await monedas.focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("radio", { name: "Plata" })).toHaveAttribute("aria-checked", "true");
    await expect(page.getByRole("radio", { name: "Plata" })).toBeFocused();
    await page.keyboard.press("ArrowLeft");
    await expect(monedas).toHaveAttribute("aria-checked", "true");
    await expect(monedas).toBeFocused();
  });

  test("el acceso al perfil lleva a /perfil", async ({ page }) => {
    await page.getByRole("link", { name: /Mi perfil/ }).click();
    await expect(page).toHaveURL(/\/perfil$/);
    await expect(page.getByRole("heading", { name: "Mi perfil" })).toBeVisible();
  });
});

test.describe("navegación inferior", () => {
  test("queda fija abajo con las 5 secciones en orden: Retos, Amigos, +, Monedero, Historial", async ({ page, viewport }) => {
    const nav = await box(page, "nav");
    expect(nav.y + nav.height).toBeCloseTo(viewport!.height, 0);
    const items = await page.locator("nav li a").evaluateAll((els) =>
      els.map((el) => ({
        href: new URL((el as HTMLAnchorElement).href).pathname,
        name: el.getAttribute("aria-label") ?? el.textContent!.replace(/[a-z_]+$/, "").trim(),
        text: el.textContent!,
      })),
    );
    expect(items.map((i) => i.href)).toEqual(["/", "/amigos", "/crear", "/monedero", "/historial"]);
    expect(items[0].text).toContain("Retos");
    expect(items[1].text).toContain("Amigos");
    expect(items[2].name).toBe("Crear reto");
    expect(items[3].text).toContain("Monedero");
    expect(items[4].text).toContain("Historial");
  });

  test("cada elemento táctil mide al menos 48×48 px (y el botón + es el más grande)", async ({ page }) => {
    const sizes = await page
      .locator('header a, header button, nav a')
      .evaluateAll((els) =>
        els.map((el) => {
          const r = el.getBoundingClientRect();
          return { name: el.getAttribute("aria-label") ?? el.textContent!.trim(), w: r.width, h: r.height };
        }),
      );
    expect(sizes.length).toBeGreaterThanOrEqual(8);
    for (const s of sizes) {
      expect(s.w, `ancho de "${s.name}"`).toBeGreaterThanOrEqual(47.5);
      expect(s.h, `alto de "${s.name}"`).toBeGreaterThanOrEqual(47.5);
    }
    const fab = sizes.find((s) => s.name === "Crear reto")!;
    expect(fab.w).toBeGreaterThanOrEqual(64 - 0.5);
    expect(fab.h).toBeGreaterThanOrEqual(64 - 0.5);
    const radios = await page.getByRole("radio").evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height));
    for (const h of radios) expect(h).toBeGreaterThanOrEqual(47.5);
  });

  test("navegar marca la sección activa (aria-current) y conserva la estructura", async ({ page }) => {
    for (const route of ROUTES) {
      await page.getByRole("navigation", { name: "Secciones" }).getByRole("link", { name: route.label }).click();
      await expect(page).toHaveURL(new RegExp(`${route.href === "/" ? "/$" : route.href + "$"}`));
      await expect(page.getByRole("heading", { level: 1, name: route.h1 })).toBeVisible();
      const current = page.locator('nav a[aria-current="page"]');
      await expect(current).toHaveCount(1);
      await expect(current).toContainText(route.label);
      await expect(page.locator("header")).toBeVisible();
      await expect(page.locator("nav")).toBeVisible();
    }
    // El botón + lleva a Crear y se marca como activo.
    await page.getByRole("link", { name: "Crear reto" }).click();
    await expect(page).toHaveURL(/\/crear$/);
    await expect(page.getByRole("link", { name: "Crear reto" })).toHaveAttribute("aria-current", "page");
    await expect(page.locator('nav li a[aria-current="page"]')).toHaveCount(1);
  });

  test("la marca y el estado vacío de Retos llevan a Crear", async ({ page }) => {
    await page.goto("/amigos");
    await page.getByRole("link", { name: /I Bet U, ir a Retos/ }).click();
    await expect(page).toHaveURL(/\/$/);
    await page.getByRole("link", { name: "Crear un reto" }).click();
    await expect(page).toHaveURL(/\/crear$/);
  });
});

test.describe("responsive", () => {
  for (const href of ALL_PAGES) {
    test(`${href}: sin desborde horizontal y todo el contenido a la vista`, async ({ page }) => {
      await page.goto(href);
      const overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
      }));
      expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.innerWidth);
    });
  }

  test("el contenido no queda tapado por la barra superior ni por la navegación", async ({ page }) => {
    // Se agrega contenido largo para forzar scroll y se mira arriba y abajo.
    await page.evaluate(() => {
      const tall = document.createElement("div");
      tall.id = "contenido-largo";
      tall.style.height = "2500px";
      tall.textContent = "fin";
      document.querySelector("main")!.appendChild(tall);
    });
    const headerBottom = (await box(page, "header")).y + (await box(page, "header")).height;
    const firstTop = (await box(page, "main h1")).y;
    expect(firstTop).toBeGreaterThanOrEqual(headerBottom);

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const navTop = (await box(page, "nav")).y;
    const lastBottom = (await box(page, "#contenido-largo")).y + (await box(page, "#contenido-largo")).height;
    expect(lastBottom).toBeLessThanOrEqual(navTop);
  });

  test("la columna mide como máximo 480 px y se centra en pantallas anchas", async ({ page, viewport }) => {
    const width = viewport!.width;
    for (const sel of ["header > div", "nav > div", "main"]) {
      const b = await box(page, sel);
      expect(b.width, sel).toBeLessThanOrEqual(MAX_COLUMN + 0.5);
      if (width > MAX_COLUMN) expect(b.x, sel).toBeCloseTo((width - b.width) / 2, 0);
      else expect(b.width, sel).toBeCloseTo(width, 0);
    }
  });

  test("en el ancho más chico (360 px) los controles del encabezado no se cortan ni se superponen", async ({ page, viewport }) => {
    test.skip(viewport!.width > 380, "solo aplica a celulares angostos");
    const rects = await page.evaluate(() => {
      const r = (el: Element) => el.getBoundingClientRect();
      const brand = r(document.querySelector("header a")!);
      const chip = r(document.querySelector('[data-testid="balance-chip"]')!);
      const profile = r(document.querySelector('header a[href="/perfil"]')!);
      return { brand, chip, profile, vw: window.innerWidth };
    });
    expect(rects.brand.right).toBeLessThanOrEqual(rects.chip.left);
    expect(rects.chip.right).toBeLessThanOrEqual(rects.profile.left + 0.5);
    expect(rects.profile.right).toBeLessThanOrEqual(rects.vw);
    expect(rects.brand.left).toBeGreaterThanOrEqual(0);
  });

  test("aun con el chip de Plata (más largo) la fila de marca entra en pantalla", async ({ page }) => {
    await page.getByRole("radio", { name: "Plata" }).click();
    const rects = await page.evaluate(() => {
      const r = (el: Element) => el.getBoundingClientRect();
      return {
        brand: r(document.querySelector("header a")!),
        chip: r(document.querySelector('[data-testid="balance-chip"]')!),
        profile: r(document.querySelector('header a[href="/perfil"]')!),
        vw: window.innerWidth,
        sw: document.documentElement.scrollWidth,
      };
    });
    expect(rects.brand.right).toBeLessThanOrEqual(rects.chip.left);
    expect(rects.chip.right).toBeLessThanOrEqual(rects.profile.left + 0.5);
    expect(rects.sw).toBeLessThanOrEqual(rects.vw);
  });
});

test.describe("identidad de marca: mascota", () => {
  test("el encabezado muestra la mascota, con texto alternativo y área táctil de 48 px", async ({ page }) => {
    const mascot = page.locator("header").getByAltText("Mascota de I Bet U");
    await expect(mascot).toBeVisible();
    await expect.poll(() => mascot.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
    const link = await box(page, 'header a[aria-label="I Bet U, ir a Retos"]');
    expect(link.width).toBeGreaterThanOrEqual(47.5);
    expect(link.height).toBeGreaterThanOrEqual(47.5);
    await expect(page.getByRole("link", { name: /I Bet U, ir a Retos/ })).toHaveAttribute("href", "/");
  });

  test("el favicon y el ícono de pantalla de inicio se declaran y responden 200", async ({ page, request }) => {
    const hrefs = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"], link[rel="apple-touch-icon"]')].map((l) => ({
        rel: l.rel,
        href: l.href,
      })),
    );
    expect(hrefs.some((l) => l.rel.includes("icon") && !l.rel.includes("apple"))).toBe(true);
    expect(hrefs.some((l) => l.rel === "apple-touch-icon")).toBe(true);
    for (const { href } of hrefs) {
      const res = await request.get(href);
      expect(res.status(), href).toBe(200);
      expect(res.headers()["content-type"], href).toMatch(/image\//);
    }
  });
});

test("capturas de pantalla para revisión visual", async ({ page }, testInfo) => {
  // Carpeta propia: Playwright vacía `test-results` en cada corrida.
  const dir = path.join(__dirname, "..", "capturas");
  fs.mkdirSync(dir, { recursive: true });
  const shot = (name: string) => page.screenshot({ path: path.join(dir, `${testInfo.project.name}-${name}.png`) });
  await shot("retos-monedas");
  await page.getByRole("radio", { name: "Plata" }).click();
  await shot("retos-plata");
  await page.getByRole("link", { name: "Monedero" }).click();
  await shot("monedero-plata");
  expect(fs.existsSync(path.join(dir, `${testInfo.project.name}-retos-monedas.png`))).toBe(true);
});

