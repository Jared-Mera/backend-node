// backend-node/src/controllers/saleController.js
import Sale from '../models/Sale.js';
import User from '../models/User.js';
import puppeteer from 'puppeteer';

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

// Nuevo endpoint: genera PDF del reporte de ventas
export const getSalesReportPDF = async (req, res) => {
  const { startDate, endDate } = req.query;

  try {
    const query = {
      fecha: {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      }
    };

    if (req.user.role !== 'Administrador') {
      query.vendedor_id = req.user.id;
    }

    const ventas = await Sale.find(query)
      .populate('vendedor_id', 'name email')
      .sort({ fecha: -1 });

    // Calcular totales
    const totalVentas = ventas.reduce((sum, venta) => sum + (venta.total || 0), 0);
    const cantidadVentas = ventas.length;

    // Construir HTML del reporte
    const rowsHtml = ventas.map((v, idx) => {
      const fecha = new Date(v.fecha).toLocaleString();
      const vendedor = v.vendedor_id ? (v.vendedor_id.name || v.vendedor_id.email) : '—';
      // productos -> lista de nombre x cantidad (si existe)
      const productosStr = Array.isArray(v.productos)
        ? v.productos.map(p => `${p.nombre || p.name || 'item'} (x${p.cantidad ?? p.qty ?? 1})`).join(', ')
        : JSON.stringify(v.productos);
      return `
        <tr>
          <td style="padding:6px;border:1px solid #ddd;text-align:center">${idx + 1}</td>
          <td style="padding:6px;border:1px solid #ddd">${fecha}</td>
          <td style="padding:6px;border:1px solid #ddd">${vendedor}</td>
          <td style="padding:6px;border:1px solid #ddd">${productosStr}</td>
          <td style="padding:6px;border:1px solid #ddd;text-align:right">${(v.total ?? 0).toFixed(2)}</td>
        </tr>
      `;
    }).join('');

    const html = `
      <!doctype html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>Reporte de Ventas</title>
        <style>
          body { font-family: Arial, Helvetica, sans-serif; font-size:12px; color:#222; margin:20px; }
          h1 { text-align:center; margin-bottom:6px; }
          .meta { margin-bottom:18px; }
          table { width:100%; border-collapse:collapse; margin-top:8px; }
          th { background:#f2f2f2; padding:8px; border:1px solid #ddd; }
          td { vertical-align:top; }
          .totals { margin-top:12px; float:right; border:1px solid #ddd; padding:8px; }
        </style>
      </head>
      <body>
        <h1>Reporte de Ventas</h1>
        <div class="meta">
          <strong>Rango:</strong> ${startDate || '—'} — ${endDate || '—'}<br/>
          <strong>Generado por:</strong> ${req.user.name ?? req.user.email ?? req.user.id} (${req.user.role})<br/>
          <strong>Fecha generación:</strong> ${new Date().toLocaleString()}
        </div>

        <table>
          <thead>
            <tr>
              <th style="width:4%">#</th>
              <th style="width:18%">Fecha</th>
              <th style="width:18%">Vendedor</th>
              <th style="width:50%">Productos</th>
              <th style="width:10%">Total</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml || `<tr><td colspan="5" style="padding:12px;text-align:center">No hay ventas en el rango seleccionado.</td></tr>`}
          </tbody>
        </table>

        <div class="totals">
          <div><strong>Cantidad ventas:</strong> ${cantidadVentas}</div>
          <div><strong>Total ventas:</strong> ${totalVentas.toFixed(2)}</div>
        </div>
      </body>
      </html>
    `;

    // Generar PDF con puppeteer
    const browser = await puppeteer.launch({
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '20mm', right: '10mm', bottom: '20mm', left: '10mm' } });
    await browser.close();

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="reporte_ventas_${Date.now()}.pdf"`,
      'Content-Length': pdfBuffer.length
    });

    return res.send(pdfBuffer);
  } catch (error) {
    console.error('Error generando PDF:', error);
    res.status(500).json({ error: 'Error generando PDF' });
  }
};