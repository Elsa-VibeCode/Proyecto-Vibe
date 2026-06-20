import { Router } from 'express';
import * as XLSX from 'xlsx';
import { User } from '../models/User.js';
import { protegerRuta } from '../middleware/auth.js';

const router = Router();

router.use(protegerRuta);

router.get('/estadisticas', async (req, res) => {
  const [totalUsuarios, usuariosActivos, porRol, recientes] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ activo: true }),
    User.aggregate([
      { $group: { _id: '$rol', cantidad: { $sum: 1 } } },
    ]),
    User.find()
      .select('nombre email rol activo createdAt ultimoAcceso')
      .sort({ createdAt: -1 })
      .limit(5),
  ]);

  const roles = porRol.reduce(
    (acc, item) => {
      acc[item._id] = item.cantidad;
      return acc;
    },
    { admin: 0, editor: 0, visor: 0 }
  );

  res.json({
    estadisticas: {
      totalUsuarios,
      usuariosActivos,
      usuariosInactivos: totalUsuarios - usuariosActivos,
      roles,
      usuariosRecientes: recientes,
      zonaHoraria: 'America/Mexico_City',
      fechaConsulta: new Date().toLocaleString('es-MX', {
        timeZone: 'America/Mexico_City',
      }),
    },
  });
});

router.get('/exportar-excel', async (_req, res) => {
  const [totalUsuarios, usuariosActivos, porRol, usuarios] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ activo: true }),
    User.aggregate([{ $group: { _id: '$rol', cantidad: { $sum: 1 } } }]),
    User.find()
      .select('nombre email rol activo createdAt ultimoAcceso')
      .sort({ createdAt: -1 }),
  ]);

  const roles = porRol.reduce(
    (acc, item) => {
      acc[item._id] = item.cantidad;
      return acc;
    },
    { admin: 0, editor: 0, visor: 0 }
  );

  const resumen = [
    { Indicador: 'Total usuarios', Valor: totalUsuarios },
    { Indicador: 'Usuarios activos', Valor: usuariosActivos },
    { Indicador: 'Usuarios inactivos', Valor: totalUsuarios - usuariosActivos },
    { Indicador: 'Administradores', Valor: roles.admin },
    { Indicador: 'Editores', Valor: roles.editor },
    { Indicador: 'Visores', Valor: roles.visor },
    {
      Indicador: 'Fecha de exportación',
      Valor: new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City' }),
    },
  ];

  const filasUsuarios = usuarios.map((u) => ({
    Nombre: u.nombre,
    Correo: u.email,
    Rol: u.rol,
    Estado: u.activo ? 'Activo' : 'Inactivo',
    Registro: u.createdAt
      ? new Date(u.createdAt).toLocaleString('es-MX', { timeZone: 'America/Mexico_City' })
      : '',
    'Último acceso': u.ultimoAcceso
      ? new Date(u.ultimoAcceso).toLocaleString('es-MX', { timeZone: 'America/Mexico_City' })
      : '—',
  }));

  const libro = XLSX.utils.book_new();
  const hojaResumen = XLSX.utils.json_to_sheet(resumen);
  const hojaUsuarios = XLSX.utils.json_to_sheet(filasUsuarios);
  XLSX.utils.book_append_sheet(libro, hojaResumen, 'Resumen');
  XLSX.utils.book_append_sheet(libro, hojaUsuarios, 'Usuarios');
  const buffer = XLSX.write(libro, { type: 'buffer', bookType: 'xlsx' });

  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader('Content-Disposition', 'attachment; filename="reporte-dashboard.xlsx"');
  res.send(buffer);
});

export default router;
