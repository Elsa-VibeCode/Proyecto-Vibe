/** Día 5 del mes siguiente al pago (deadline SAT para emitir REP). */
export function deadlineREP(fechaPago) {
  if (!fechaPago) return null;
  const d = fechaPago instanceof Date ? new Date(fechaPago) : new Date(fechaPago);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getFullYear(), d.getMonth() + 1, 5, 23, 59, 59, 999);
}

export function estaVencido(factura, hoy = new Date()) {
  const est = factura.estatusComplemento;
  if (est !== 'pendiente' && est !== 'parcial') return false;
  if (!factura.fechaPago) return false;
  const limite = deadlineREP(factura.fechaPago);
  if (!limite) return false;
  return hoy > limite;
}
