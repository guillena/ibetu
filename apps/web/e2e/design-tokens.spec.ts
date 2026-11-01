import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { parse } from "yaml";

/**
 * Compara el CSS compilado contra design/kinetic-wayfinder.md (fuente de verdad del sistema
 * de diseño). El navegador hace de árbitro: cada valor se aplica como variable CSS y como
 * literal del documento, y se comparan los valores ya calculados. Así la minificación del CSS
 * (por ejemplo #ffffff → #fff) no produce falsos errores, y un valor distinto sí.
 */
const doc = readFileSync(path.join(__dirname, "..", "design", "kinetic-wayfinder.md"), "utf8");
const spec = parse(doc.split(/^---\s*$/m)[1]) as {
  colors: Record<string, string>;
  typography: Record<
    string,
    { fontFamily: string; fontSize: string; fontWeight: string; lineHeight: string; letterSpacing?: string }
  >;
  rounded: Record<string, string>;
  spacing: Record<string, string>;
};

// Solo corre una vez: los tokens no dependen del tamaño de pantalla.
test.beforeEach(async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "movil-375", "Los tokens no dependen del viewport.");
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
});

/** Calcula `property` aplicando `value` (literal o var(--x)) a un elemento de prueba. */
async function computed(
  page: import("@playwright/test").Page,
  property: string,
  values: string[],
  extra: Record<string, string> = {},
): Promise<string[]> {
  return page.evaluate(
    ({ property, values, extra }) => {
      return values.map((value) => {
        const el = document.createElement("div");
        Object.assign(el.style, extra);
        el.style.setProperty(property, value);
        el.style.position = "absolute";
        document.body.appendChild(el);
        const result = getComputedStyle(el).getPropertyValue(property);
        el.remove();
        return result;
      });
    },
    { property, values, extra },
  );
}

test("el documento de diseño tiene todas las secciones esperadas", () => {
  expect(Object.keys(spec.colors).length).toBeGreaterThanOrEqual(47);
  expect(Object.keys(spec.typography)).toHaveLength(14);
  expect(Object.keys(spec.rounded)).toHaveLength(6);
  expect(Object.keys(spec.spacing)).toHaveLength(13);
});

test("todos los colores coinciden con el documento", async ({ page }) => {
  const names = Object.keys(spec.colors);
  const fromVars = await computed(page, "background-color", names.map((n) => `var(--color-${n})`));
  const fromDoc = await computed(page, "background-color", names.map((n) => spec.colors[n]));
  names.forEach((name, i) => expect(fromVars[i], `color ${name}`).toBe(fromDoc[i]));
});

test("los colores nombrados en el texto del documento existen", async ({ page }) => {
  const named: Record<string, string> = {
    "signal-green": "#00C853", // Secondary
    "signal-amber": "#FFC400", // Tertiary
    "ink-navy": "#182945", // Neutral & Ink Navy
  };
  const names = Object.keys(named);
  const fromVars = await computed(page, "background-color", names.map((n) => `var(--color-${n})`));
  const fromDoc = await computed(page, "background-color", names.map((n) => named[n]));
  names.forEach((name, i) => expect(fromVars[i], name).toBe(fromDoc[i]));
  // Y esos valores están realmente escritos en el documento.
  for (const hex of Object.values(named)) expect(doc.toUpperCase()).toContain(hex);
});

test("los radios de borde coinciden (DEFAULT = --radius-base)", async ({ page }) => {
  const keys = Object.keys(spec.rounded);
  const varName = (k: string) => (k === "DEFAULT" ? "--radius-base" : `--radius-${k}`);
  const fromVars = await computed(page, "width", keys.map((k) => `var(${varName(k)})`), { height: "1px" });
  const fromDoc = await computed(page, "width", keys.map((k) => spec.rounded[k]), { height: "1px" });
  keys.forEach((k, i) => expect(fromVars[i], `rounded ${k}`).toBe(fromDoc[i]));
});

test("la escala de espaciado coincide", async ({ page }) => {
  const keys = Object.keys(spec.spacing);
  const fromVars = await computed(page, "width", keys.map((k) => `var(--spacing-${k})`), { height: "1px" });
  const fromDoc = await computed(page, "width", keys.map((k) => spec.spacing[k]), { height: "1px" });
  keys.forEach((k, i) => expect(fromVars[i], `spacing ${k}`).toBe(fromDoc[i]));
});

test("los cuatro niveles de elevación existen y son distintos", async ({ page }) => {
  const levels = [1, 2, 3, 4].map((n) => `var(--shadow-level-${n})`);
  const shadows = await computed(page, "box-shadow", levels);
  for (const s of shadows) expect(s).not.toBe("none");
  expect(new Set(shadows).size).toBe(4);
  // Valores del documento (Elevation & Depth).
  const expected = await computed(page, "box-shadow", [
    "0px 2px 8px rgba(24, 41, 69, 0.04)",
    "0px 6px 16px rgba(24, 41, 69, 0.08)",
    "0px 10px 24px rgba(0, 153, 255, 0.18), 0px 4px 8px rgba(24, 41, 69, 0.08)",
    "0px 16px 36px rgba(14, 30, 56, 0.14)",
  ]);
  expect(shadows).toEqual(expected);
  // Los valores esperados están realmente escritos en el documento de diseño.
  for (const literal of [
    "0px 2px 8px rgba(24, 41, 69, 0.04)",
    "0px 6px 16px rgba(24, 41, 69, 0.08)",
    "0px 10px 24px rgba(0, 153, 255, 0.18)",
    "0px 16px 36px rgba(14, 30, 56, 0.14)",
  ]) {
    expect(doc).toContain(literal);
  }
});

test.describe("tipografía: los 14 estilos coinciden con el documento", () => {
  for (const name of Object.keys(spec.typography)) {
    test(`type-${name}`, async ({ page }) => {
      const t = spec.typography[name];
      const result = await page.evaluate((cls) => {
        const el = document.createElement("p");
        el.className = cls;
        el.textContent = "Aa";
        el.style.position = "absolute";
        document.body.appendChild(el);
        const cs = getComputedStyle(el);
        const out = {
          fontFamily: cs.fontFamily,
          fontSize: cs.fontSize,
          lineHeight: cs.lineHeight,
          fontWeight: cs.fontWeight,
          letterSpacing: cs.letterSpacing,
        };
        el.remove();
        return out;
      }, `type-${name}`);

      expect(result.fontSize).toBe(t.fontSize);
      expect(result.lineHeight).toBe(t.lineHeight);
      expect(result.fontWeight).toBe(String(t.fontWeight));
      expect(result.fontFamily.toLowerCase()).toContain(t.fontFamily.toLowerCase());
      if (t.letterSpacing) {
        // "-0.02em" se calcula contra el tamaño de fuente del propio elemento.
        const em = parseFloat(t.letterSpacing);
        expect(parseFloat(result.letterSpacing)).toBeCloseTo(em * parseFloat(t.fontSize), 1);
      } else {
        expect(result.letterSpacing).toBe("normal");
      }
    });
  }
});

test("las dos familias del documento son Outfit y Manrope, y se cargan realmente", async ({ page }) => {
  const families = new Set(Object.values(spec.typography).map((t) => t.fontFamily));
  expect([...families].sort()).toEqual(["Manrope", "Outfit"]);

  const loaded = await page.evaluate(() =>
    [...document.fonts].filter((f) => f.status === "loaded").map((f) => f.family.replace(/["']/g, "")),
  );
  expect(loaded.join("|")).toMatch(/outfit/i);
  expect(loaded.join("|")).toMatch(/manrope/i);
  expect(loaded.join("|")).toMatch(/Material Symbols Outlined/);
});
