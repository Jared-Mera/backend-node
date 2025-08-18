import User from '../models/User.js';
import Role from '../models/Role.js';
import { generateToken } from '../utils/jwt.js';
import bcrypt from 'bcryptjs';

// Autenticación de usuario
export const login = async (req, res) => {
  const { email, password } = req.body;

  try {
    // Buscar usuario por email
    const user = await User.findOne({ email }).populate('role');
    if (!user) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    // Verificar contraseña
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    // Generar token JWT
    const token = generateToken({
      _id: user._id,
      name: user.name,
      role: user.role // Esto debe ser el objeto completo de Mongoose
    });


    // Enviar respuesta con información del usuario y token
    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role.name
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error en el servidor' });
  }
};

// Crear usuario inicial (solo para administradores)
export const createInitialAdmin = async () => {
  try {
    const adminRole = await Role.findOne({ name: 'Administrador' });

    const existingAdmin = await User.findOne({ email: 'admin@empresa.com' });
    if (!existingAdmin) {
      const hashedPassword = await bcrypt.hash('admin123', 12);

      await User.create({
        name: 'Admin Principal',
        email: 'admin@empresa.com',
        password: hashedPassword,
        role: adminRole._id
      });
      console.log('Usuario administrador inicial creado');
    }
  } catch (error) {
    console.error('Error creando admin inicial:', error);
  }
};