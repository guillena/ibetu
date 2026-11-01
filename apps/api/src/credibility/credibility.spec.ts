import {
  FAULT_WEIGHT,
  GREEN_MIN,
  PROVISIONAL_BELOW,
  YELLOW_MIN,
  bandOf,
  buildView,
  computeScore,
  credibilityKey,
} from './credibility.js';

describe('Termómetro de Credibilidad – fórmula (unitarios)', () => {
  describe('computeScore', () => {
    it('sin historial arranca completo (100)', () => {
      expect(computeScore(0, 0)).toBe(100);
    });

    it('sin incumplimientos siempre es 100, juegue lo que juegue', () => {
      for (const clean of [1, 2, 10, 48, 1000]) expect(computeScore(clean, 0)).toBe(100);
    });

    it('valores de referencia con el peso por defecto', () => {
      expect(FAULT_WEIGHT).toBe(5);
      expect(computeScore(10, 1)).toBe(67); // 10 / (10 + 5)
      expect(computeScore(48, 1)).toBe(91); // 48 / 53
      expect(computeScore(100, 1)).toBe(95);
      expect(computeScore(20, 2)).toBe(67); // 20 / 30
      expect(computeScore(0, 1)).toBe(0);
    });

    it('un incumplimiento baja fuerte: más que un acuerdo limpio sube', () => {
      const before = computeScore(10, 0);
      const afterFault = computeScore(10, 1);
      const afterClean = computeScore(11, 1);
      expect(before - afterFault).toBeGreaterThanOrEqual(30);
      expect(afterClean - afterFault).toBeLessThan(before - afterFault);
    });

    it('es monótona: más acuerdos limpios nunca bajan el puntaje, más incumplimientos nunca lo suben', () => {
      for (let faults = 0; faults <= 4; faults++) {
        let prev = -1;
        for (let clean = 0; clean <= 60; clean++) {
          const s = computeScore(clean, faults);
          if (clean + faults > 0 && prev >= 0) expect(s).toBeGreaterThanOrEqual(prev);
          if (clean + faults > 0) prev = s;
        }
      }
      for (let clean = 1; clean <= 40; clean++) {
        let prev = 101;
        for (let faults = 0; faults <= 8; faults++) {
          const s = computeScore(clean, faults);
          expect(s).toBeLessThanOrEqual(prev);
          prev = s;
        }
      }
    });

    it('siempre es un entero entre 0 y 100', () => {
      for (let clean = 0; clean <= 80; clean += 3) {
        for (let faults = 0; faults <= 12; faults++) {
          const s = computeScore(clean, faults);
          expect(Number.isInteger(s)).toBe(true);
          expect(s).toBeGreaterThanOrEqual(0);
          expect(s).toBeLessThanOrEqual(100);
        }
      }
    });

    it('se recupera con el tiempo: tras un incumplimiento, jugar limpio vuelve a subir el puntaje', () => {
      const path = [0, 5, 10, 20, 40, 80].map((clean) => computeScore(clean, 1));
      for (let i = 1; i < path.length; i++) expect(path[i]).toBeGreaterThan(path[i - 1]);
      expect(path.at(-1)).toBeGreaterThanOrEqual(GREEN_MIN); // vuelve a verde
    });

    it('rechaza contadores negativos', () => {
      expect(() => computeScore(-1, 0)).toThrow(RangeError);
      expect(() => computeScore(0, -1)).toThrow(RangeError);
    });
  });

  describe('bandOf – colores', () => {
    it('verde desde 80, amarillo desde 50, rojo por debajo', () => {
      expect([GREEN_MIN, YELLOW_MIN]).toEqual([80, 50]);
      expect(bandOf(100)).toBe('GREEN');
      expect(bandOf(80)).toBe('GREEN');
      expect(bandOf(79)).toBe('YELLOW');
      expect(bandOf(50)).toBe('YELLOW');
      expect(bandOf(49)).toBe('RED');
      expect(bandOf(0)).toBe('RED');
    });
  });

  describe('buildView', () => {
    const base = { cleanClosedCount: 0, disputeLostCount: 0, paymentDefaultCount: 0, totalPlayed: 0, totalWins: 0 };

    it('un usuario nuevo es verde pero provisional', () => {
      expect(buildView(base)).toMatchObject({ score: 100, band: 'GREEN', provisional: true });
    });

    it('deja de ser provisional con suficiente historial', () => {
      expect(PROVISIONAL_BELOW).toBe(3);
      expect(buildView({ ...base, cleanClosedCount: 2 }).provisional).toBe(true);
      expect(buildView({ ...base, cleanClosedCount: 3 }).provisional).toBe(false);
      expect(buildView({ ...base, cleanClosedCount: 1, disputeLostCount: 2 }).provisional).toBe(false);
    });

    it('suma disputas perdidas y pagos incumplidos como incumplimientos', () => {
      const v = buildView({ ...base, cleanClosedCount: 10, disputeLostCount: 1, paymentDefaultCount: 1, totalPlayed: 12, totalWins: 5 });
      expect(v.score).toBe(computeScore(10, 2));
      expect(v).toMatchObject({ band: 'YELLOW', cleanAgreements: 10, disputesLost: 1, paymentDefaults: 1, totalPlayed: 12, totalWins: 5 });
    });

    it('no expone niveles ni rachas', () => {
      const keys = Object.keys(buildView(base));
      for (const forbidden of ['level', 'nivel', 'streak', 'racha', 'multiplier']) {
        expect(keys.some((k) => k.toLowerCase().includes(forbidden))).toBe(false);
      }
    });
  });

  it('la clave de idempotencia identifica tipo, reto y usuario', () => {
    expect(credibilityKey('CLEAN_AGREEMENT', 'c1', 'u1')).toBe('cred:CLEAN_AGREEMENT:c1:u1');
    expect(credibilityKey('DISPUTE_LOST', 'c1', 'u1')).not.toBe(credibilityKey('PAYMENT_DEFAULT', 'c1', 'u1'));
  });
});

