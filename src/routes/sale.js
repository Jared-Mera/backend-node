// backend-node/src/routes/sale.js
import express from 'express';
import { authenticate } from '../middlewares/auth.js';
import { 
  createSale, 
  getSales, 
  getSaleById,
  getSalesReport
} from '../controllers/saleController.js';

const router = express.Router();

// Middleware de autenticación para todas las rutas
router.use(authenticate);

// POST /api/sales - Crear nueva venta (vendedor)
router.post('/', createSale);

// GET /api/sales - Obtener todas las ventas (admin ve todas, vendedor solo las suyas)
router.get('/', getSales);

// GET /api/sales/:id - Obtener venta por ID (admin o vendedor que la creó)
router.get('/report', getSalesReport);

// GET /api/sales/report - Obtener reporte de ventas por fechas
router.get('/:id', getSaleById);

// GET /api/sales/summary
router.get('/summary', async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    
    const [todaySales, yesterdaySales, monthSales] = await Promise.all([
      Sale.aggregate([
        { $match: { fecha: { $gte: today, $lt: tomorrow } } },
        { $group: { _id: null, total: { $sum: "$total" } } }
      ]),
      Sale.aggregate([
        { $match: { fecha: { $gte: new Date(today).setDate(today.getDate()-1), $lt: today } } },
        { $group: { _id: null, total: { $sum: "$total" } } }
      ]),
      Sale.aggregate([
        { $match: { fecha: { $gte: firstDayOfMonth, $lte: lastDayOfMonth } } },
        { $group: { _id: null, total: { $sum: "$total" } } }
      ])
    ]);
    
    const todayTotal = todaySales[0]?.total || 0;
    const yesterdayTotal = yesterdaySales[0]?.total || 0;
    const monthTotal = monthSales[0]?.total || 0;
    
    res.json({
      today: todayTotal,
      month: monthTotal,
      changeFromYesterday: yesterdayTotal > 0 ? 
        ((todayTotal - yesterdayTotal) / yesterdayTotal * 100).toFixed(1) : 0,
      monthlyTarget: 50000 // Ejemplo de meta mensual
    });
  } catch (error) {
    res.status(500).json({ error: 'Error obteniendo resumen' });
  }
});

// GET /api/sales/trend
router.get('/trend', async (req, res) => {
  try {
    const dates = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      dates.push(date.toISOString().split('T')[0]);
    }
    
    const salesTrend = await Sale.aggregate([
      {
        $match: {
          fecha: {
            $gte: new Date(dates[0]),
            $lte: new Date(dates[dates.length - 1])
          }
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$fecha" } },
          total: { $sum: "$total" }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]);
    
    // Completar con ceros los días sin ventas
    const filledTrend = dates.map(date => {
      const found = salesTrend.find(item => item._id === date);
      return {
        date,
        total: found ? found.total : 0
      };
    });
    
    res.json(filledTrend);
  } catch (error) {
    res.status(500).json({ error: 'Error obteniendo tendencia' });
  }
});

export default router;