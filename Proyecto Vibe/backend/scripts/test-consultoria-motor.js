/**
 * Tests del motor Consultoría (node:test).
 * Uso: npm run test:consultoria
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  toCents,
  fromCents,
  cumplimiento,
  acumuladosHastaMes,
  gapNomina,
  pctEjercido,
  conciliarIngresoMes,
  validarPctCompartido,
  repartirMontoCompartido,
} from '../src/utils/consultoriaMotor.js';

describe('consultoriaMotor — precisión', () => {
  it('toCents/fromCents HALF_UP', () => {
    assert.equal(toCents(10.005), 1001);
    assert.equal(fromCents(1001), 10.01);
  });

  it('cumplimiento 80%', () => {
    assert.equal(cumplimiento(80000, 100000), 0.8);
    assert.equal(cumplimiento(100, 0), null);
  });

  it('acumulados YTD', () => {
    const filas = [
      { mes: 1, ingresoReal: 100, meta: 200 },
      { mes: 2, ingresoReal: 150, meta: 200 },
      { mes: 3, ingresoReal: 50, meta: 100 },
    ];
    const r = acumuladosHastaMes(filas, 2);
    assert.equal(r.ingresoAcumulado, 250);
    assert.equal(r.metaAcumulada, 400);
    assert.equal(r.cumplimientoAcumulado, 0.625);
  });

  it('gap nómina', () => {
    assert.equal(gapNomina(100000, 85000), 15000);
  });

  it('pct ejercido alerta > 90%', () => {
    const p = pctEjercido(91000, 100000);
    assert.equal(p, 0.91);
    assert.ok(p > 0.9);
  });

  it('conciliación cuadra', () => {
    const r = conciliarIngresoMes(1000, [400, 600]);
    assert.equal(r.cuadra, true);
    assert.equal(r.diferencia, 0);
  });

  it('conciliación no cuadra', () => {
    const r = conciliarIngresoMes(1000, [400, 500]);
    assert.equal(r.cuadra, false);
    assert.equal(r.diferencia, 100);
  });

  it('validar % compartido 60/40', () => {
    const r = validarPctCompartido(0.6, 0.4, 'COMPARTIDO');
    assert.equal(r.ok, true);
  });

  it('rechaza % compartido que no suma 100', () => {
    const r = validarPctCompartido(0.5, 0.3, 'COMPARTIDO');
    assert.equal(r.ok, false);
  });

  it('repartir monto 60/40 exacto', () => {
    const r = repartirMontoCompartido(10000, 0.6, 0.4);
    assert.equal(r.principal, 6000);
    assert.equal(r.compartido, 4000);
  });
});
