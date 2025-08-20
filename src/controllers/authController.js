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
    // 1. Buscar en la base de datos el rol "Administrador"
    //    (Se asume que ya está creado en la colección de roles)
    const adminRole = await Role.findOne({ name: 'Administrador' });

    // 2. Verificar si ya existe un usuario con el correo "admin@empresa.com"
    //    Esto previene que se creen múltiples administradores por error.
    const existingAdmin = await User.findOne({ email: 'admin@empresa.com' });

    // 3. Si NO existe ese administrador, entonces se crea.
    if (!existingAdmin) {
      // Se encripta la contraseña "admin123" con bcrypt
      // 12 -> número de rondas de encriptación (más rondas = más seguro, pero más lento)
      const hashedPassword = await bcrypt.hash('admin123', 12);

      // 4. Crear el nuevo usuario administrador con:
      // - Nombre: "Admin Principal"
      // - Email: "admin@empresa.com"
      // - Contraseña encriptada
      // - Rol: el rol de administrador (referencia a Role._id)
      await User.create({
        name: 'Admin Principal',
        email: 'admin@empresa.com',
        password: hashedPassword,
        role: adminRole._id
      });

      // 5. Mensaje de éxito en consola
      console.log('Usuario administrador inicial creado');
    }
  } catch (error) {
    // Si ocurre cualquier error (problema de conexión, creación, etc.), se muestra en consola
    console.error('Error creando admin inicial:', error);
  }
};

