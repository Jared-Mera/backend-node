// backend-node/src/controllers/roleController.js
import Role from '../models/Role.js';
import User from '../models/User.js';

// Obtener todos los roles
export const getRoles = async (req, res) => {
  try {
    const roles = await Role.find();
    res.json(roles);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error obteniendo roles' });
  }
};

// Obtener rol por ID
export const getRoleById = async (req, res) => {
  const { id } = req.params;
  
  try {
    const role = await Role.findById(id);
    if (!role) {
      return res.status(404).json({ error: 'Rol no encontrado' });
    }
    res.json(role);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error obteniendo rol' });
  }
};

// Actualizar permisos de un rol
export const updateRolePermissions = async (req, res) => {
  const { id } = req.params;
  const { permissions } = req.body;

  try {
    const role = await Role.findById(id);
    if (!role) {
      return res.status(404).json({ error: 'Rol no encontrado' });
    }

    // No permitir modificar los roles predefinidos
    if (['Administrador', 'Vendedor', 'Consultor'].includes(role.name)) {
      return res.status(400).json({ 
        error: 'No se pueden modificar los permisos de roles predefinidos' 
      });
    }

    // Actualizar permisos
    role.permissions = permissions;
    await role.save();
    
    res.json(role);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error actualizando permisos' });
  }
};

// Crear nuevo rol personalizado
export const createCustomRole = async (req, res) => {
  const { name, permissions } = req.body;
  
  try {
    // Verificar si el nombre ya existe
    const existingRole = await Role.findOne({ name });
    if (existingRole) {
      return res.status(400).json({ error: 'Ya existe un rol con este nombre' });
    }
    
    // Crear nuevo rol
    const newRole = await Role.create({
      name,
      permissions
    });
    
    res.status(201).json(newRole);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error creando rol' });
  }
};

// Eliminar rol personalizado
export const deleteCustomRole = async (req, res) => {
  const { id } = req.params;
  
  try {
    const role = await Role.findById(id);
    if (!role) {
      return res.status(404).json({ error: 'Rol no encontrado' });
    }
    
    // No permitir eliminar roles predefinidos
    if (['Administrador', 'Vendedor', 'Consultor'].includes(role.name)) {
      return res.status(400).json({ 
        error: 'No se pueden eliminar roles predefinidos' 
      });
    }
    
    // Verificar si hay usuarios usando este rol
    const usersWithRole = await User.countDocuments({ role: role._id });
    if (usersWithRole > 0) {
      return res.status(400).json({ 
        error: 'No se puede eliminar el rol porque está asignado a usuarios' 
      });
    }
    
    await role.deleteOne();
    res.json({ message: 'Rol eliminado correctamente' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error eliminando rol' });
  }
};

// Obtener permisos disponibles (lista fija)
export const getAvailablePermissions = (req, res) => {
  const permissions = [
    'gestion_usuarios',
    'gestion_productos',
    'gestion_ventas',
    'ver_reportes',
    'gestion_roles'
  ];
  
  res.json(permissions);
};