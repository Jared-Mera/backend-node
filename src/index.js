import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import connectDB from './config/db.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/user.js';
import rolesRoutes from './routes/role.js';
import saleRoutes from './routes/sale.js'; // Añadir esta línea
import roleRoutes from './routes/role.js'; // Añadir esta línea

// Configuración inicial
dotenv.config({ path: '../.env' });
const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(express.json());

// Conexión a MongoDB
connectDB();

// Rutas básicas
app.get('/', (req, res) => {
  res.json({ 
    message: 'API de Gestión de Usuarios y Ventas',
    version: '1.0.0'
  });
});
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/sales', saleRoutes); // Añadir esta línea
app.use('/api/roles', roleRoutes); // Añadir esta línea


// Manejo de errores
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Error interno del servidor' });
});

// Iniciar servidor
app.listen(process.env.PORT || 3000, () => {
  console.log(`Servidor corriendo en puerto ${process.env.PORT}`);
});