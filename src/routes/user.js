import express from 'express';
import { 
  createUser, 
  getUsers, 
  updateUser, 
  deleteUser,
  searchUsers  // Agregar esta importación
} from '../controllers/userController.js';
import { authenticate, isAdmin } from '../middlewares/auth.js';

const router = express.Router();

// Todas las rutas requieren autenticación y rol de administrador
router.use(authenticate, isAdmin);

// GET /api/users - Obtener todos los usuarios
router.get('/', getUsers);

// POST /api/users - Crear nuevo usuario
router.post('/', createUser);

// PUT /api/users/:id - Actualizar usuario
router.put('/:id', updateUser);

// DELETE /api/users/:id - Eliminar usuario
router.delete('/:id', deleteUser);

router.get('/search', searchUsers);

export default router;
