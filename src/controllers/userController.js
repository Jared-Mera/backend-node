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