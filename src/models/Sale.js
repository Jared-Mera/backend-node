import mongoose from 'mongoose';

const SaleSchema = new mongoose.Schema({
  vendedor_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  productos: [{
    productId: { // Cambié producto_id a productId para coincidir con tu controlador
      type: String,
      required: true
    },
    cantidad: {
      type: Number,
      required: true,
      min: 1
    },
    nombre: { // Agregar nombre para mejor visualización
      type: String,
      default: 'Producto'
    },
    precio_unitario: { // Hacer este campo opcional con valor por defecto
      type: Number,
      default: 0
    }
  }],
  total: {
    type: Number,
    default: 0
  },
  fecha: {
    type: Date,
    default: Date.now
  }
});

// Middleware pre-save para calcular el total
SaleSchema.pre('save', async function(next) {
  try {
    // Si no hay productos, total = 0
    if (!this.productos || this.productos.length === 0) {
      this.total = 0;
      return next();
    }

    // Obtener precios actualizados desde Python backend
    const { default: axios } = await import('axios');
    const PYTHON_API = process.env.PYTHON_API_URL;
    const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;
    
    let total = 0;
    
    for (const producto of this.productos) {
      // Si ya tenemos precio_unitario, usarlo
      if (producto.precio_unitario && producto.precio_unitario > 0) {
        total += producto.precio_unitario * producto.cantidad;
        continue;
      }
      
      // Si no tenemos precio, obtenerlo desde Python
      try {
        const headers = { 'Content-Type': 'application/json' };
        if (INTERNAL_API_KEY) headers['x-internal-key'] = INTERNAL_API_KEY;
        
        const response = await axios.get(
          `${PYTHON_API}/api/products/${producto.productId}`,
          { headers, timeout: 5000 }
        );
        
        const precio = response.data.precio;
        producto.precio_unitario = precio;
        producto.nombre = response.data.nombre;
        total += precio * producto.cantidad;
      } catch (error) {
        console.error(`Error obteniendo precio para producto ${producto.productId}:`, error);
        producto.precio_unitario = 0;
        // Continuamos aunque falle para no bloquear la venta
      }
    }
    
    this.total = total;
    next();
  } catch (error) {
    console.error('Error calculando total:', error);
    next(error);
  }
});

export default mongoose.model('Sale', SaleSchema);