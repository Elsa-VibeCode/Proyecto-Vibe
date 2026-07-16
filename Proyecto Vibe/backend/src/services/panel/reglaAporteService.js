import { redondear, reglaAplicaEnMes } from './mesUtils.js';

export function calcularReglaAporte({ mes, config, consultingPagado, egresosGrupo }) {
  const aporteConsultingPct = Number(config.aporteConsultingPct) || 0.1;
  const fechaVigenciaRegla = config.fechaVigenciaRegla || '2026-04-01';
  const reglaAplica = reglaAplicaEnMes(mes, fechaVigenciaRegla);

  const basePagado = redondear(consultingPagado);
  const aporteEsperado = reglaAplica ? redondear(basePagado * aporteConsultingPct) : 0;
  const egresos = redondear(egresosGrupo);
  const coberturaPct = egresos > 0 && reglaAplica ? redondear(aporteEsperado / egresos) : 0;
  const gapTechnologies = reglaAplica ? redondear(Math.max(0, egresos - aporteEsperado)) : 0;

  return {
    aporteConsultingPct,
    fechaVigenciaRegla,
    reglaAplica,
    consultingPagado: basePagado,
    aporteEsperado,
    egresosGrupo: egresos,
    coberturaPct,
    gapTechnologies,
  };
}
