import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Role from '../models/Role.js';

dotenv.config();

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log(`MongoDB Connected: ${conn.connection.host}`);
    
    // Crear roles iniciales si no existen
    await initRoles();
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
};

const initRoles = async () => {
  const roles = ['Administrador', 'Vendedor', 'Consultor'];
  
  for (const roleName of roles) {
    await Role.findOneAndUpdate(
      { name: roleName },
      { name: roleName },
      { upsert: true, new: true }
    );
  }
};

export default connectDB;