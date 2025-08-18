import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import Role from '../models/Role.js';
import User from '../models/User.js';

dotenv.config();

const seedDatabase = async () => {
  try {
    // Conexión a MongoDB
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('Conectado a MongoDB para seeding...');

    // Limpiar colecciones (opcional, solo para desarrollo)
    await Role.deleteMany({});
    await User.deleteMany({});

    // 1. Crear Roles
    const rolesData = [
      {
        name: 'Administrador',
        permissions: [
          'gestion_usuarios',
          'gestion_productos',
          'gestion_ventas',
          'ver_reportes',
          'asignar_roles'
        ]
      },
      {
        name: 'Vendedor',
        permissions: ['gestion_ventas']
      },
      {
        name: 'Consultor',
        permissions: ['ver_reportes']
      }
    ];

    const createdRoles = await Role.insertMany(rolesData);
    console.log('Roles creados:', createdRoles.map(r => r.name));

    // 2. Crear Usuarios de Prueba
    const usersData = [
      {
        name: 'Admin Principal',
        email: 'admin@empresa.com',
        password: await bcrypt.hash('Admin123*', 12),
        role: createdRoles.find(r => r.name === 'Administrador')._id
      },
      {
        name: 'Vendedor Ejemplo',
        email: 'vendedor@empresa.com',
        password: await bcrypt.hash('Vendedor123*', 12),
        role: createdRoles.find(r => r.name === 'Vendedor')._id
      },
      {
        name: 'Consultor Ejemplo',
        email: 'consultor@empresa.com',
        password: await bcrypt.hash('Consultor123*', 12),
        role: createdRoles.find(r => r.name === 'Consultor')._id
      }
    ];

    const createdUsers = await User.insertMany(usersData);
    console.log('Usuarios creados:');
    createdUsers.forEach(user => {
      console.log(`- ${user.name} (${user.email}) - Rol: ${createdRoles.find(r => r._id.equals(user.role)).name}`);
    });

    console.log('✅ Base de datos inicializada con datos de prueba');
    process.exit(0);
  } catch (error) {
    console.error('Error durante el seeding:', error);
    process.exit(1);
  }
};

seedDatabase();