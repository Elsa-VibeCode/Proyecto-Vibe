# Sistema de Administración

Panel de administración full-stack con **SvelteKit** (frontend), **Node.js + Express** (backend) y **MongoDB Atlas** (base de datos).

Configurado para México (`es-MX`, zona horaria `America/Mexico_City`).

## Estructura del proyecto

```
admin-system/
├── backend/          # API REST con Node.js
│   └── src/
│       ├── config/   # Conexión a MongoDB Atlas
│       ├── models/   # Modelos Mongoose
│       ├── routes/   # Rutas de la API
│       └── middleware/
└── frontend/         # Panel de administración con SvelteKit
    └── src/
        ├── lib/      # API client, auth, utilidades
        └── routes/   # Páginas (login, dashboard, usuarios)
```

## Requisitos

- Node.js 20+
- Cuenta en [MongoDB Atlas](https://www.mongodb.com/atlas)

## Configuración de MongoDB Atlas

1. Crea un cluster gratuito en MongoDB Atlas.
2. En **Database Access**, crea un usuario con contraseña.
3. En **Network Access**, agrega tu IP (o `0.0.0.0/0` para desarrollo).
4. Copia la cadena de conexión (`Connect → Drivers → Node.js`).

## Instalación

### Backend

```bash
cd backend
cp .env.example .env
# Edita .env con tu MONGODB_URI y JWT_SECRET
npm install
npm run seed    # Crea usuario administrador inicial
npm run dev     # http://localhost:3000
```

### Frontend

```bash
cd frontend
cp .env.example .env
npm install
npm run dev     # http://localhost:5173
```

## Credenciales por defecto (seed)

| Campo      | Valor              |
|------------|--------------------|
| Email      | `admin@ejemplo.com` |
| Contraseña | `admin123`          |

> Cambia estas credenciales antes de desplegar a producción.

## API Endpoints

| Método | Ruta                        | Descripción              | Rol requerido   |
|--------|-----------------------------|--------------------------|-----------------|
| GET    | `/api/salud`                | Estado del servidor      | Público         |
| POST   | `/api/auth/login`           | Iniciar sesión           | Público         |
| GET    | `/api/auth/perfil`          | Perfil del usuario       | Autenticado     |
| GET    | `/api/usuarios`             | Listar usuarios          | admin, editor   |
| POST   | `/api/usuarios`             | Crear usuario            | admin           |
| PUT    | `/api/usuarios/:id`         | Actualizar usuario       | admin           |
| DELETE | `/api/usuarios/:id`         | Eliminar usuario         | admin           |
| GET    | `/api/dashboard/estadisticas` | Estadísticas del panel | Autenticado     |

## Roles

- **admin** — Acceso completo: crear, editar y eliminar usuarios.
- **editor** — Puede ver la lista de usuarios.
- **visor** — Acceso al panel y su perfil.

## Variables de entorno

### Backend (`backend/.env`)

```env
MONGODB_URI=mongodb+srv://...
PORT=3000
JWT_SECRET=clave_secreta_segura
CORS_ORIGIN=http://localhost:5173
TZ=America/Mexico_City
```

### Frontend (`frontend/.env`)

```env
PUBLIC_API_URL=http://localhost:3000/api
```

## Scripts disponibles

| Proyecto  | Comando        | Descripción                    |
|-----------|----------------|--------------------------------|
| Backend   | `npm run dev`  | Servidor con recarga automática |
| Backend   | `npm run seed` | Crear usuario administrador    |
| Backend   | `npm start`    | Servidor en producción         |
| Frontend  | `npm run dev`  | Servidor de desarrollo         |
| Frontend  | `npm run build`| Build de producción            |
