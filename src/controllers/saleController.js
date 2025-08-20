// backend-node/src/controllers/saleController.js
import Sale from '../models/Sale.js';
import User from '../models/User.js';

// Crear nueva venta
export const createSale = async (req, res) => {
  const { productos } = req.body;
  const vendedor_id = req.user.id; // Obtenido del token

  try {
    // Verificar que el vendedor exista
    const vendedor = await User.findById(vendedor_id);
    if (!vendedor) {
      return res.status(404).json({ error: 'Vendedor no encontrado' });
    }

    // Creamos la venta
    const nuevaVenta = new Sale({
      vendedor_id,
      productos
    });

    // El total se calcula automáticamente en el pre-save
    await nuevaVenta.save();

    res.status(201).json(nuevaVenta);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error creando venta' });
  }
};

// Obtener todas las ventas (solo administrador o vendedor de la venta)
export const getSales = async (req, res) => {
  try {
    let ventas;
    if (req.user.role === 'Administrador') {
      ventas = await Sale.find().populate('vendedor_id', 'name email');
    } else {
      // Solo las ventas del vendedor
      ventas = await Sale.find({ vendedor_id: req.user.id }).populate('vendedor_id', 'name email');
    }
    res.json(ventas);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error obteniendo ventas' });
  }
};

// Obtener una venta por ID
export const getSaleById = async (req, res) => {
  const { id } = req.params;

  try {
    const venta = await Sale.findById(id).populate('vendedor_id', 'name email');
    if (!venta) {
      return res.status(404).json({ error: 'Venta no encontrada' });
    }

    // Verificar permisos: administrador o vendedor que creó la venta
    if (req.user.role !== 'Administrador' && venta.vendedor_id._id.toString() !== req.user.id) {
      return res.status(403).json({ error: 'No autorizado para ver esta venta' });
    }

    res.json(venta);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error obteniendo venta' });
  }
};

// Obtener reporte de ventas por rango de fechas
export const getSalesReport = async (req, res) => {
  const { startDate, endDate } = req.query;

  try {
    const query = {
      fecha: {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      }
    };

    // Solo administrador puede ver todas las ventas
    if (req.user.role !== 'Administrador') {
      query.vendedor_id = req.user.id;
    }

    const ventas = await Sale.find(query)
      .populate('vendedor_id', 'name email')
      .sort({ fecha: -1 });

    // Calcular totales
    const totalVentas = ventas.reduce((sum, venta) => sum + venta.total, 0);
    const cantidadVentas = ventas.length;

    res.json({
      ventas,
      totalVentas,
      cantidadVentas
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error generando reporte' });
  }
};