/**
 * Tests del motor de honorarios (node:test).
 * Uso: npm run test:honorarios
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calcularDistribucion,
  defaultsPorPeriodo,
  centsTimesPct,
  toCents,
  fromCents,
} from '../src/utils/honorariosMotor.js';

describe('honorariosMotor — precisión', () => {
  it('41667 × TECH 10% = 4166.70 exacto', () => {
    const cents = toCents(41667);
    const tech = centsTimesPct(cents, 0.1);
    assert.equal(fromCents(tech), 4166.7);
  });

  it('defaults pre-junio: tech 10%, licencia 0', () => {
    const d = defaultsPorPeriodo('2026-05');
    assert.equal(d.pctTech, 0.1);
    assert.equal(d.pctLicencia, 0);
  });

  it('defaults desde junio: tech 5%, licencia 20%', () => {
    const d = defaultsPorPeriodo('2026-06');
    assert.equal(d.pctTech, 0.05);
    assert.equal(d.pctLicencia, 0.2);
  });
});

describe('honorariosMotor — caso DEMEK', () => {
  it('72000, TECH 5%, LIC 20%, FINDER 10%, CLOSER 15%, EJEC 40%', () => {
    const r = calcularDistribucion({
      ingreso1aQna: 36000,
      ingreso2daQna: 36000,
      pctTech: 0.05,
      pctLicencia: 0.2,
      pctGrupo: 0.1,
      asignaciones: [
        { consultantId: 'a', rol: 'FINDER', pct: 0.1 },
        { consultantId: 'b', rol: 'CLOSER', pct: 0.15 },
        { consultantId: 'c', rol: 'EJECUCION', pct: 0.4 },
      ],
    });

    assert.equal(r.ingresoTotal, 72000);
    assert.equal(r.montoTech, 3600);
    assert.equal(r.montoLicencia, 14400);
    assert.equal(r.netoDistribuible, 54000);
    assert.equal(r.montoGrupo, 7200);
    assert.equal(r.asignaciones[0].monto, 5400);
    assert.equal(r.asignaciones[1].monto, 8100);
    assert.equal(r.asignaciones[2].monto, 21600);
    assert.ok(r.advertenciaPct, 'debe advertir que roles ≠ 90%');
    assert.equal(Math.round(r.sumaRolesPct * 100), 65);
  });
});

describe('honorariosMotor — advertencia 90%', () => {
  it('guarda cálculo y marca advertencia si ≠ 90%', () => {
    const r = calcularDistribucion({
      ingreso1aQna: 10000,
      ingreso2daQna: 0,
      pctTech: 0.05,
      pctLicencia: 0.2,
      pctGrupo: 0.1,
      asignaciones: [
        { consultantId: 'a', rol: 'FINDER', pct: 0.1 },
        { consultantId: 'b', rol: 'CLOSER', pct: 0.15 },
        { consultantId: 'c', rol: 'EJECUCION', pct: 0.4 },
      ],
    });
    assert.ok(r.advertenciaPct);
    assert.ok(r.ingresoTotal > 0);
  });

  it('sin advertencia si suma 90%', () => {
    const r = calcularDistribucion({
      ingreso1aQna: 10000,
      ingreso2daQna: 0,
      pctTech: 0.05,
      pctLicencia: 0.2,
      pctGrupo: 0.1,
      asignaciones: [
        { consultantId: 'a', rol: 'FINDER', pct: 0.1 },
        { consultantId: 'b', rol: 'CLOSER', pct: 0.15 },
        { consultantId: 'c', rol: 'EJECUCION', pct: 0.65 },
      ],
    });
    assert.equal(r.advertenciaPct, null);
  });
});

describe('honorariosMotor — Abril 2026 migración', () => {
  it('pct_tech=0.10 pct_licencia=0', () => {
    const defs = defaultsPorPeriodo('2026-04');
    const r = calcularDistribucion({
      ingreso1aQna: 50000,
      ingreso2daQna: 0,
      ...defs,
      asignaciones: [{ consultantId: 'a', rol: 'EJECUCION', pct: 0.65 }],
    });
    assert.equal(r.montoTech, 5000);
    assert.equal(r.montoLicencia, 0);
    assert.equal(r.netoDistribuible, 45000);
  });
});

describe('honorariosMotor — paridad suma consultores', () => {
  it('suma montos por consultor = neto × suma pcts', () => {
    const r = calcularDistribucion({
      ingreso1aQna: 20000,
      ingreso2daQna: 10000,
      pctTech: 0.05,
      pctLicencia: 0.2,
      pctGrupo: 0.1,
      asignaciones: [
        { consultantId: 'a', rol: 'FINDER', pct: 0.1 },
        { consultantId: 'b', rol: 'CLOSER', pct: 0.15 },
        { consultantId: 'c', rol: 'EJECUCION', pct: 0.65 },
      ],
    });
    const suma = r.asignaciones.reduce((acc, a) => acc + a.monto, 0);
    // Roles suman 90% del neto → 20_250, no el neto completo
    assert.equal(Math.round(suma * 100) / 100, 20250);
    assert.equal(r.netoDistribuible, 22500);
  });
});
