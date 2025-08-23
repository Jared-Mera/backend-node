// backend-node/src/controllers/saleController.js
import Sale from '../models/Sale.js';
import User from '../models/User.js';
import puppeteer from 'puppeteer';
import PDFDocument from 'pdfkit';
import streamBuffers from 'stream-buffers'; // npm i stream-buffers

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

    // Crear la venta
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

// Agregar estas funciones al final del archivo saleController.js

// Actualizar una venta existente
export const updateSale = async (req, res) => {
  const { id } = req.params;
  const { productos } = req.body;

  try {
    const venta = await Sale.findById(id);
    if (!venta) {
      return res.status(404).json({ error: 'Venta no encontrada' });
    }

    // Verificar permisos: solo administrador o el vendedor que creó la venta
    if (req.user.role !== 'Administrador' && venta.vendedor_id.toString() !== req.user.id) {
      return res.status(403).json({ error: 'No autorizado para modificar esta venta' });
    }

    // Actualizar productos
    venta.productos = productos;
    await venta.save();

    res.json(venta);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error actualizando venta' });
  }
};

// Eliminar una venta
export const deleteSale = async (req, res) => {
  const { id } = req.params;

  try {
    const venta = await Sale.findById(id);
    if (!venta) {
      return res.status(404).json({ error: 'Venta no encontrada' });
    }

    // Verificar permisos: solo administrador o el vendedor que creó la venta
    if (req.user.role !== 'Administrador' && venta.vendedor_id.toString() !== req.user.id) {
      return res.status(403).json({ error: 'No autorizado para eliminar esta venta' });
    }

    await venta.deleteOne();
    res.json({ message: 'Venta eliminada correctamente' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error eliminando venta' });
  }
};

//Generación de reportes
export const getSalesReportPDF = async (req, res) => {
  const { startDate, endDate } = req.query;
  try {
    const query = { fecha: { $gte: new Date(startDate), $lte: new Date(endDate) } };
    if (req.user.role !== 'Administrador') query.vendedor_id = req.user.id;
    const ventas = await Sale.find(query).populate('vendedor_id', 'name email').sort({ fecha: -1 });

    const totalVentas = ventas.reduce((s, v) => s + (v.total || 0), 0);
    const doc = new PDFDocument({ margin: 40, size: 'A4' });

    const writableStreamBuffer = new streamBuffers.WritableStreamBuffer({
      initialSize: (100 * 1024),
      incrementAmount: (10 * 1024)
    });

    doc.pipe(writableStreamBuffer);

    doc.fontSize(16).text('Reporte de Ventas', { align: 'center' });
    doc.moveDown();
    doc.fontSize(10).text(`Rango: ${startDate || '—'} — ${endDate || '—'}`);
    doc.text(`Generado por: ${req.user.name ?? req.user.email ?? req.user.id}`);
    doc.moveDown();

    ventas.forEach((v, i) => {
      doc.fontSize(10).text(`${i + 1}. Fecha: ${new Date(v.fecha).toLocaleString()} — Vendedor: ${v.vendedor_id?.name ?? '—'}`);
      const productosStr = Array.isArray(v.productos) ? v.productos.map(p => `${p.nombre || p.name}(x${p.cantidad ?? 1})`).join(', ') : JSON.stringify(v.productos);
      doc.fontSize(9).text(`Productos: ${productosStr}`);
      doc.text(`Total: ${(v.total ?? 0).toFixed(2)}`);
      doc.moveDown(0.5);
    });

    doc.moveDown();
    doc.fontSize(11).text(`Cantidad ventas: ${ventas.length}`);
    doc.text(`Total ventas: ${totalVentas.toFixed(2)}`);

    doc.end();

    writableStreamBuffer.on('finish', () => {
      const pdfBuffer = writableStreamBuffer.getContents();
      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="reporte_ventas_${Date.now()}.pdf"`,
        'Content-Length': pdfBuffer.length
      });
      res.send(pdfBuffer);
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error generando PDF' });
  }
};
