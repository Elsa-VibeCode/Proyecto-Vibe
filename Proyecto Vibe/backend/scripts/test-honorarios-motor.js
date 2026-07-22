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
    // Roles sobre valor sin IVA (ingreso total), no sobre neto
    assert.equal(r.asignaciones[0].monto, 7200);
    assert.equal(r.asignaciones[1].monto, 10800);
    assert.equal(r.asignaciones[2].monto, 28800);
    assert.equal(r.advertenciaPct, null);
    assert.equal(r.diferenciaIngreso, 0);
    assert.equal(Math.round(r.sumaRolesPct * 100), 65);
  });
});

describe('honorariosMotor — caso NOVAMEX (Excel julio)', () => {
  it('21229.53 con roles 10/15/40 y deducciones estándar', () => {
    const r = calcularDistribucion({
      ingreso1aQna: 21229.53,
      ingreso2daQna: 0,
      pctTech: 0.05,
      pctLicencia: 0.2,
      pctGrupo: 0.1,
      pctIva: 0,
      asignaciones: [
        { consultantId: 'chava', rol: 'FINDER', pct: 0.1 },
        { consultantId: 'ap', rol: 'CLOSER', pct: 0.15 },
        { consultantId: 'ap', rol: 'EJECUCION', pct: 0.4 },
      ],
    });

    assert.equal(r.montoTech, 1061.48);
    assert.equal(r.montoLicencia, 4245.91);
    assert.equal(r.montoGrupo, 2122.95);
    assert.equal(r.asignaciones[0].monto, 2122.95);
    assert.equal(r.asignaciones[1].monto, 3184.43);
    assert.equal(r.asignaciones[2].monto, 8491.81);
    assert.equal(r.diferenciaIngreso, 0);
    assert.equal(r.montoIva, 0);
    assert.equal(r.totalConIva, 21229.53);
  });
});

describe('honorariosMotor — IVA informativo', () => {
  it('agrega 16% IVA sobre valor sin IVA', () => {
    const r = calcularDistribucion({
      ingreso1aQna: 10000,
      ingreso2daQna: 0,
      pctTech: 0.05,
      pctLicencia: 0.2,
      pctGrupo: 0.1,
      pctIva: 0.16,
      asignaciones: [
        { consultantId: 'a', rol: 'FINDER', pct: 0.1 },
        { consultantId: 'b', rol: 'CLOSER', pct: 0.15 },
        { consultantId: 'c', rol: 'EJECUCION', pct: 0.4 },
      ],
    });
    assert.equal(r.montoIva, 1600);
    assert.equal(r.totalConIva, 11600);
    assert.equal(r.diferenciaIngreso, 0);
  });
});

describe('honorariosMotor — advertencia 100%', () => {
  it('marca advertencia si distribución ≠ 100%', () => {
    const r = calcularDistribucion({
      ingreso1aQna: 10000,
      ingreso2daQna: 0,
      pctTech: 0.05,
      pctLicencia: 0.2,
      pctGrupo: 0.1,
      asignaciones: [
        { consultantId: 'a', rol: 'FINDER', pct: 0.1 },
        { consultantId: 'b', rol: 'CLOSER', pct: 0.15 },
        { consultantId: 'c', rol: 'EJECUCION', pct: 0.3 },
      ],
    });
    assert.ok(r.advertenciaPct);
    assert.ok(r.ingresoTotal > 0);
  });

  it('sin advertencia si suma 100%', () => {
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
    assert.equal(r.advertenciaPct, null);
    assert.equal(r.diferenciaIngreso, 0);
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
    assert.equal(r.asignaciones[0].monto, 32500);
  });
});

describe('honorariosMotor — paridad suma consultores', () => {
  it('suma montos por consultor = ingreso × suma pcts roles', () => {
    const r = calcularDistribucion({
      ingreso1aQna: 20000,
      ingreso2daQna: 10000,
      pctTech: 0.05,
      pctLicencia: 0.2,
      pctGrupo: 0.1,
      asignaciones: [
        { consultantId: 'a', rol: 'FINDER', pct: 0.1 },
        { consultantId: 'b', rol: 'CLOSER', pct: 0.15 },
        { consultantId: 'c', rol: 'EJECUCION', pct: 0.4 },
      ],
    });
    const suma = r.asignaciones.reduce((acc, a) => acc + a.monto, 0);
    assert.equal(Math.round(suma * 100) / 100, 19500);
    assert.equal(r.netoDistribuible, 22500);
    assert.equal(r.diferenciaIngreso, 0);
  });
});
