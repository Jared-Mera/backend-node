// backend-node/src/routes/userRoutes.js
import express from 'express';
import {
  createUser,
  getUsers,
  updateUser,
  deleteUser,
  searchUsers,
  updateOwnPassword,
  updateUserPasswordByAdmin
} from '../controllers/userController.js';
import { authenticate, isAdmin } from '../middlewares/auth.js';

const router = express.Router();

// --- Ruta para que un usuario cambie su propia contraseña ---
// Solo requiere estar autenticado.
router.put('/profile/change-password', authenticate, updateOwnPassword);


// --- Rutas que requieren ser Administrador ---

// Obtener todos los usuarios
router.get('/', [authenticate, isAdmin], getUsers);

// Crear un nuevo usuario
router.post('/', [authenticate, isAdmin], createUser);

// Buscar usuarios (importante: debe ir antes de las rutas con /:id)
router.get('/search', [authenticate, isAdmin], searchUsers);

// Actualizar datos de un usuario (nombre, rol) por su ID
router.put('/:id', [authenticate, isAdmin], updateUser);

// Eliminar un usuario por su ID
router.delete('/:id', [authenticate, isAdmin], deleteUser);

// Cambiar la contraseña de cualquier usuario por su ID
router.put('/:id/change-password', [authenticate, isAdmin], updateUserPasswordByAdmin);

export default router;
