// backend-node/src/middlewares/auth.js
import { verifyToken } from '../utils/jwt.js';
import Role from '../models/Role.js'; // Importación faltante

// Middleware para verificar autenticación
export const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Acceso no autorizado' });
  }

  const token = authHeader.split(' ')[1];
  const decoded = verifyToken(token);

  if (!decoded) {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }

  // Buscar el rol en la base de datos usando el ID almacenado en el token
  Role.findById(decoded.roleId)
    .then(role => {
      if (!role) {
        return res.status(401).json({ error: 'Rol no encontrado' });
      }
      
      // Añadir información del usuario y rol a la solicitud
      req.user = {
        id: decoded.id,
        role: role.name,
        roleId: decoded.roleId,
        name: decoded.name
      };
      next();
    })
    .catch(error => {
      console.error('Error buscando rol:', error);
      res.status(500).json({ error: 'Error de autenticación' });
    });
};

// Middleware para verificar rol de administrador
export const isAdmin = (req, res, next) => {
  if (req.user.role !== 'Administrador') {
    return res.status(403).json({ error: 'Acceso prohibido: se requiere rol de administrador' });
  }
  next();
};

// Middleware para verificar rol de vendedor
export const isSeller = (req, res, next) => {
  if (req.user.role !== 'Vendedor') {
    return res.status(403).json({ error: 'Acceso prohibido: se requiere rol de vendedor' });
  }
  next();
};

// Middleware para verificar rol de consultor
export const isConsultant = (req, res, next) => {
  if (req.user.role !== 'Consultor') {
    return res.status(403).json({ error: 'Acceso prohibido: se requiere rol de consultor' });
  }
  next();
};