//es la forma en la que el backend guarda y organiza la información de cada venta que se realiza en el sistema.
import mongoose from 'mongoose';

const saleSchema = new mongoose.Schema({
  vendedor_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  productos: [{
    producto_id: {
      type: String, //Referencia al ID del producto en PostgreSQL
      required: true
    },
    cantidad: {
      type: Number,
      required: true,
      min: 1
    },
    precio_unitario: {
      type: Number,
      required: true,
      min: 0
    }
  }],
  total: {
    type: Number,
    required: true,
    min: 0
  },
  fecha: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

//Middleware para calcular el total antes de guardar
saleSchema.pre('validate', function(next) {
  if (Array.isArray(this.productos) && this.productos.length > 0) {
    this.total = this.productos.reduce((sum, item) => {
      return sum + (Number(item.cantidad) * Number(item.precio_unitario));
    }, 0);
  } else {
    this.total = 0;
  }
  next();
});

const Sale = mongoose.model('Sale', saleSchema);

export default Sale;
