// backend-node/src/routes/sale.js

// Importa express para definir las rutas
import express from 'express';

// Importa un middleware que asegura que el usuario esté autenticado (JWT, sesión, etc.)
import { authenticate } from '../middlewares/auth.js';

// Importa las funciones (controladores) que contienen la lógica de cada ruta de ventas
import { 
  createSale,       // Crea una nueva venta
  getSales,         // Obtiene todas las ventas (con permisos según rol)
  getSaleById,      // Obtiene una venta en específico
  getSalesReport    // Obtiene un reporte de ventas filtrado (por fechas, etc.)
} from '../controllers/saleController.js';

// Crea un enrutador de Express para manejar las rutas de "sales"
const router = express.Router();

// =========================
// Middleware de autenticación
// =========================
// Aplica el middleware "authenticate" a TODAS las rutas de este router.
// Esto significa que para acceder a cualquiera de estas rutas, 
// el usuario debe estar autenticado.
router.use(authenticate);

// =========================
// RUTAS DE VENTAS
// =========================

// POST /api/sales
// Crear nueva venta (solo el rol "vendedor" debería poder hacerlo)
router.post('/', createSale);

// GET /api/sales
// Obtener todas las ventas
// - Si es admin: puede ver todas las ventas
// - Si es vendedor: solo puede ver las que él mismo registró
router.get('/', getSales);

// GET /api/sales/report
// Obtener reporte de ventas (generalmente filtrado por fechas, totales, etc.)
router.get('/report', getSalesReport);

// GET /api/sales/:id
// Obtener una venta específica por su ID
// - Admin puede ver cualquier venta
// - Vendedor solo puede ver si él la creó
router.get('/:id', getSaleById);

// PUT /api/sales/:id
// Actualizar una venta existente
// (por ejemplo corregir un dato)
router.put('/:id', updateSale);

// DELETE /api/sales/:id
// Eliminar una venta por ID
router.delete('/:id', deleteSale);

// Exporta este router para poder usarlo en app.js o index.js
export default router;
