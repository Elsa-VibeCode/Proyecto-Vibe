import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import { User } from '../models/User.js';
import { protegerRuta } from '../middleware/auth.js';
import { enviarReporteDashboard, resendConfigurado } from '../utils/email.js';
import { generarReporteDashboardBuffer, nombreArchivoReporte } from '../utils/reporteDashboard.js';

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
  const { buffer } = await generarReporteDashboardBuffer();

  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader('Content-Disposition', 'attachment; filename="reporte-dashboard.xlsx"');
  res.send(buffer);
});

router.post(
  '/enviar-reporte',
  [
    body('destinatario')
      .trim()
      .isEmail()
      .withMessage('Correo electrónico del destinatario inválido')
      .normalizeEmail(),
  ],
  async (req, res) => {
    const errores = validationResult(req);
    if (!errores.isEmpty()) {
      return res.status(400).json({ mensaje: errores.array()[0].msg });
    }

    if (!resendConfigurado()) {
      return res.status(500).json({ mensaje: 'RESEND_API_KEY no configurada en el servidor' });
    }

    try {
      const destinatario = req.body.destinatario;
      const { buffer, fechaExportacion } = await generarReporteDashboardBuffer();
      const nombreArchivo = nombreArchivoReporte();

      await enviarReporteDashboard({
        para: destinatario,
        nombreArchivo,
        contenidoExcel: buffer,
        fechaExportacion,
      });

      res.json({
        mensaje: `Reporte enviado correctamente a ${destinatario}`,
      });
    } catch (error) {
      console.error('Error al enviar reporte por correo:', error.message);
      res.status(500).json({
        mensaje: error.message || 'No se pudo enviar el reporte por correo',
      });
    }
  }
);

export default router;
