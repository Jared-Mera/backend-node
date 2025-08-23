// backend-node/src/routes/sale.js
import express from 'express';
import { authenticate } from '../middlewares/auth.js';
import { 
  createSale, 
  getSales, 
  getSaleById,
  getSalesReport,
  updateSale,
  deleteSale,
  getSalesReportPDF,
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

// Agregar estas rutas al final del archivo sale.js

// PUT /api/sales/:id - Actualizar venta
router.put('/:id', updateSale);

// DELETE /api/sales/:id - Eliminar venta
router.delete('/:id', deleteSale);

//Generación de reportes PDF
router.get('/report/pdf', getSalesReportPDF);

export default router;