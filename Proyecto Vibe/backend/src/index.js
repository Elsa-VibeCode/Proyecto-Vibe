import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { connectDB } from './config/db.js';
import webhookRoutes from './routes/webhooks.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import dashboardRoutes from './routes/dashboard.js';
import excelRoutes from './routes/excel.js';
import mapasRoutes from './routes/mapas.js';

const app = express();
const PORT = process.env.PORT || 3000;

const origenesPermitidos = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  process.env.CORS_ORIGIN,
].filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }

      const permitido =
        origenesPermitidos.includes(origin) || origin.endsWith('.onrender.com');

      if (permitido) {
        callback(null, true);
      } else {
        callback(new Error('Origen no permitido por CORS'));
      }
    },
    credentials: true,
  })
);

// Webhooks de Clerk requieren body sin parsear (Svix)
app.use('/api/webhooks', webhookRoutes);

app.use(express.json());

app.get('/api/salud', (_req, res) => {
  res.json({
    estado: 'ok',
    mensaje: 'API de administración funcionando',
    zonaHoraria: process.env.TZ || 'America/Mexico_City',
    fecha: new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City' }),
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/usuarios', userRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/excel', excelRoutes);
app.use('/api/mapas', mapasRoutes);

app.use((_req, res) => {
  res.status(404).json({ mensaje: 'Ruta no encontrada' });
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ mensaje: 'Error interno del servidor' });
});

async function iniciar() {
  try {
    await connectDB();
    app.listen(PORT, () => {
      console.log(`✓ Servidor corriendo en http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('Error al iniciar el servidor:', error.message);
    process.exit(1);
  }
}

iniciar();
