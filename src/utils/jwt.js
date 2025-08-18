// backend-node/src/utils/jwt.js
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

export const generateToken = (user) => {
  return jwt.sign(
    {
      id: user._id,
      roleId: user.role._id || user.role, // Asegurar que guardamos el ID del rol
      name: user.name,
    },
    process.env.JWT_SECRET,
    { expiresIn: '8h' }
  );
};

export const verifyToken = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    console.error('Token verification failed:', error.message);
    return null;
  }
};