import User from '../models/User.js';
import Role from '../models/Role.js';
import bcrypt from 'bcryptjs';

// Crear nuevo usuario (solo administrador)
export const createUser = async (req, res) => {
  const { name, email, password, roleId } = req.body;
  
  try {
    // Verificar si el usuario ya existe
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'El usuario ya existe' });
    }

    // Verificar si el rol es válido
    const role = await Role.findById(roleId);
    if (!role) {
      return res.status(400).json({ error: 'Rol inválido' });
    }

    // Hashear contraseña
    const hashedPassword = await bcrypt.hash(password, 12);

    // Crear nuevo usuario
    const newUser = await User.create({
      name,
      email,
      password: hashedPassword,
      role: roleId
    });

    res.status(201).json({
      id: newUser._id,
      name: newUser.name,
      email: newUser.email,
      role: role.name
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error creando usuario' });
  }
};

// Obtener todos los usuarios (solo administrador)
export const getUsers = async (req, res) => {
  try {
    const users = await User.find().select('-password').populate('role', 'name');
    res.json(users);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error obteniendo usuarios' });
  }
};

// Actualizar usuario (solo administrador)
export const updateUser = async (req, res) => {
  const { id } = req.params;
  const { name, roleId } = req.body;

  try {
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    // Actualizar campos
    if (name) user.name = name;
    if (roleId) {
      const role = await Role.findById(roleId);
      if (!role) {
        return res.status(400).json({ error: 'Rol inválido' });
      }
      user.role = roleId;
    }

    await user.save();
    
    const updatedUser = await User.findById(id).select('-password').populate('role', 'name');
    res.json(updatedUser);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error actualizando usuario' });
  }
};

// Eliminar usuario (solo administrador)
export const deleteUser = async (req, res) => {
  const { id } = req.params;

  try {
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    // No permitir eliminar al administrador inicial
    if (user.email === 'admin@empresa.com') {
      return res.status(400).json({ error: 'No se puede eliminar al administrador principal' });
    }

    await user.deleteOne();
    res.json({ message: 'Usuario eliminado correctamente' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error eliminando usuario' });
  }
};

// Buscar usuarios por nombre o email
export const searchUsers = async (req, res) => {
  const { query } = req.query;

  try {
    const users = await User.find({
      $or: [
        { name: { $regex: query, $options: 'i' } },
        { email: { $regex: query, $options: 'i' } }
      ]
    }).select('-password').populate('role', 'name');

    res.json(users);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error buscando usuarios' });
  }
  // FUNCIÓN NUEVA: Para que un usuario cambie su propia contraseña
export const updateOwnPassword = async (req, res) => {
  // El ID del usuario se obtiene del token de autenticación
  const { id } = req.user;
  const { currentPassword, newPassword } = req.body;

  // Validaciones básicas
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Debes proporcionar la contraseña actual y la nueva.' });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 6 caracteres.' });
  }

  try {
    // Buscamos al usuario y pedimos que incluya la contraseña en el resultado
    const user = await User.findById(id).select('+password');
    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    // Comparamos la contraseña actual proporcionada con la de la BD
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'La contraseña actual es incorrecta.' });
    }

    // Si todo es correcto, hasheamos la nueva contraseña y la guardamos
    user.password = await bcrypt.hash(newPassword, 12);
    await user.save();

    res.json({ message: 'Contraseña actualizada correctamente.' });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error actualizando la contraseña.' });
  }
};

// FUNCIÓN NUEVA: Para que el Admin cambie la contraseña de cualquier usuario
export const updateUserPasswordByAdmin = async (req, res) => {
  // El ID del usuario a modificar viene de los parámetros de la URL
  const { id } = req.params;
  const { newPassword } = req.body;

  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 6 caracteres.' });
  }

  try {
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }

    // El admin no necesita la contraseña vieja, la cambia directamente
    user.password = await bcrypt.hash(newPassword, 12);
    await user.save();

    res.json({ message: `Contraseña del usuario ${user.name} actualizada correctamente.` });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error actualizando la contraseña del usuario.' });
  }
};
