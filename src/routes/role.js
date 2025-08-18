// backend-node/src/routes/role.js
import express from 'express';
import { 
  getRoles,
  getRoleById,
  updateRolePermissions,
  createCustomRole,
  deleteCustomRole,
  getAvailablePermissions
} from '../controllers/roleController.js';
import { authenticate, isAdmin } from '../middlewares/auth.js';

const router = express.Router();

// Middleware de autenticación y verificación de admin para todas las rutas
router.use(authenticate);
router.use(isAdmin);

// GET /api/roles - Obtener todos los roles
router.get('/', getRoles);

// GET /api/roles/permissions - Obtener lista de permisos disponibles
router.get('/permissions', getAvailablePermissions);

// GET /api/roles/:id - Obtener un rol por ID
router.get('/:id', getRoleById);

// PUT /api/roles/:id/permissions - Actualizar permisos de un rol
router.put('/:id/permissions', updateRolePermissions);

// POST /api/roles - Crear nuevo rol personalizado
router.post('/', createCustomRole);

// DELETE /api/roles/:id - Eliminar rol personalizado
router.delete('/:id', deleteCustomRole);

export default router;