// backend-node/src/controllers/saleController.js
import fs from 'fs';
import path from 'path';
import os from 'os';
import Sale from '../models/Sale.js';
import User from '../models/User.js';
import puppeteer from 'puppeteer';
import PDFDocument from 'pdfkit';
import streamBuffers from 'stream-buffers';

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

/* -------------------- Helpers para PDF -------------------- */

const commonChromeCandidates = () => {
  const homedir = os.homedir();
  const candidates = [
    // Env vars
    process.env.PUPPETEER_EXECUTABLE_PATH,
    process.env.CHROME_PATH,
    process.env.CHROME_BIN,
    process.env.PUPPETEER_EXECUTABLE_PATH, // redundante por si acaso
    // Puppeteer cache typical path (Windows example you used)
    path.join(homedir, '.cache', 'puppeteer', 'chrome', 'win64-139.0.7258.138', 'chrome-win64', 'chrome.exe'),
    // Common windows fallback (program files)
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    // Linux common
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/snap/bin/chromium',
    // Mac common
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  ];
  return candidates.filter(Boolean);
};

const findChromeExecutable = () => {
  const candidates = commonChromeCandidates();
  for (const c of candidates) {
    try {
      if (fs.existsSync(c)) return c;
    } catch (e) {
      // ignore
    }
  }
  return null;
};

const generatePdfWithPdfKit = async (ventas, meta, res) => {
  try {
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    const writableStreamBuffer = new streamBuffers.WritableStreamBuffer({
      initialSize: (100 * 1024),
      incrementAmount: (10 * 1024)
    });
    doc.pipe(writableStreamBuffer);

    doc.fontSize(16).text('Reporte de Ventas', { align: 'center' });
    doc.moveDown();
    doc.fontSize(10).text(`Rango: ${meta.startDate} — ${meta.endDate}`);
    doc.text(`Generado por: ${meta.user}`);
    doc.text(`Fecha generación: ${new Date().toLocaleString()}`);
    doc.moveDown();

    ventas.forEach((v, i) => {
      doc.fontSize(10).text(`${i + 1}. Fecha: ${new Date(v.fecha).toLocaleString()} — Vendedor: ${v.vendedor_id?.name ?? v.vendedor_id?.email ?? '—'}`);
      const productosStr = Array.isArray(v.productos) ? v.productos.map(p => `${p.nombre || p.name}(x${p.cantidad ?? p.qty ?? 1})`).join(', ') : JSON.stringify(v.productos);
      doc.fontSize(9).text(`Productos: ${productosStr}`);
      doc.text(`Total: ${(v.total ?? 0).toFixed(2)}`);
      doc.moveDown(0.5);
    });

    doc.moveDown();
    doc.fontSize(11).text(`Cantidad ventas: ${ventas.length}`);
    doc.text(`Total ventas: ${ventas.reduce((s, v) => s + (v.total ?? 0), 0).toFixed(2)}`);

    doc.end();

    await new Promise((resolve) => {
      writableStreamBuffer.on('finish', resolve);
    });

    const pdfBuffer = writableStreamBuffer.getContents();
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="reporte_ventas_${Date.now()}.pdf"`,
      'Content-Length': pdfBuffer.length
    });
    return res.send(pdfBuffer);
  } catch (err) {
    console.error('[PDF-FALLBACK] Error generando PDF con PDFKit:', err);
    return res.status(500).json({ error: 'Error generando PDF con fallback PDFKit', message: err.message });
  }
};

/**
 * getSalesReportPDF mejorado: detecta Chrome, logs detallados y fallback a PDFKit.
 * Para activar stack trace en la respuesta añade ?debug=true (útil en desarrollo).
 */
export const getSalesReportPDF = async (req, res) => {
  const { startDate, endDate } = req.query;
  const includeStack = req.query.debug === 'true' || process.env.NODE_ENV !== 'production';

  console.log('[PDF] Inicio de getSalesReportPDF', { startDate, endDate, user: req.user?.id, role: req.user?.role });

  // Validación básica de fechas
  if (!startDate || !endDate) {
    console.error('[PDF] Falta startDate o endDate en query.');
    return res.status(400).json({ error: 'startDate y endDate son requeridos. Formato ISO: YYYY-MM-DD', hint: 'Ejemplo: ?startDate=2025-01-01&endDate=2025-08-22' });
  }

  const start = new Date(startDate);
  const end = new Date(endDate);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    console.error('[PDF] startDate o endDate no son fechas válidas.', { startDate, endDate });
    return res.status(400).json({ error: 'startDate o endDate no son fechas válidas (ISO).', startDate, endDate });
  }

  try {
    // Construir query (igual que en getSalesReport)
    const query = {
      fecha: { $gte: start, $lte: end }
    };
    if (req.user.role !== 'Administrador') {
      query.vendedor_id = req.user.id;
    }

    console.log('[PDF] Query construida', query);

    // Obtener ventas
    let ventas;
    try {
      ventas = await Sale.find(query).populate('vendedor_id', 'name email').sort({ fecha: -1 });
      console.log(`[PDF] Ventas recuperadas: ${ventas.length}`);
      if (ventas.length > 0) {
        const sample = ventas[0].toObject ? ventas[0].toObject() : ventas[0];
        const sampleCompact = {
          id: sample._id,
          fecha: sample.fecha,
          total: sample.total,
          vendedor: sample.vendedor_id,
          productos_sample: Array.isArray(sample.productos) ? sample.productos.slice(0,2) : sample.productos
        };
        console.log('[PDF] Ejemplo de venta:', sampleCompact);
      }
    } catch (dbErr) {
      console.error('[PDF] Error consultando la base de datos:', dbErr);
      if (includeStack) {
        return res.status(500).json({ error: 'Error consultando ventas', message: dbErr.message, stack: dbErr.stack });
      }
      return res.status(500).json({ error: 'Error consultando ventas (revisar logs del servidor)' });
    }

    // Construir HTML (puedes personalizarlo)
    const rowsHtml = ventas.map((v, idx) => {
      const fecha = new Date(v.fecha).toLocaleString();
      const vendedor = v.vendedor_id ? (v.vendedor_id.name || v.vendedor_id.email) : '—';
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

    const totalVentas = ventas.reduce((sum, venta) => sum + (venta.total ?? 0), 0);
    const cantidadVentas = ventas.length;

    const html = `
      <!doctype html><html><head><meta charset="utf-8" />
      <title>Reporte de Ventas</title>
      <style>
        body{font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#222;margin:20px}
        h1{text-align:center;margin-bottom:6px}
        table{width:100%;border-collapse:collapse;margin-top:8px}
        th{background:#f2f2f2;padding:8px;border:1px solid #ddd}
        td{vertical-align:top}
      </style>
      </head>
      <body>
        <h1>Reporte de Ventas</h1>
        <div><strong>Rango:</strong> ${startDate} — ${endDate}<br/>
        <strong>Generado por:</strong> ${req.user?.name ?? req.user?.email ?? req.user?.id} (${req.user?.role})<br/>
        <strong>Fecha generación:</strong> ${new Date().toLocaleString()}</div>

        <table>
          <thead>
            <tr><th>#</th><th>Fecha</th><th>Vendedor</th><th>Productos</th><th>Total</th></tr>
          </thead>
          <tbody>
            ${rowsHtml || `<tr><td colspan="5" style="padding:12px;text-align:center">No hay ventas en el rango seleccionado.</td></tr>`}
          </tbody>
        </table>

        <div style="margin-top:12px;">
          <strong>Cantidad ventas:</strong> ${cantidadVentas}<br/>
          <strong>Total ventas:</strong> ${totalVentas.toFixed(2)}
        </div>
      </body>
      </html>
    `;

    // Intentar generar con Puppeteer primero
    let browser;
    try {
      console.log('[PDF] Intentando detectar Chrome/Chromium...');
      const chromePath = findChromeExecutable();
      if (chromePath) console.log('[PDF] Ejecutable Chrome detectado en:', chromePath);
      else console.warn('[PDF] No se detectó Chrome automáticamente mediante rutas comunes. Intentando lanzamiento sin executablePath.');

      const launchOptions = {
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
        headless: 'new',
        timeout: 30000
      };
      if (chromePath) launchOptions.executablePath = chromePath;

      console.log('[PDF] Opciones de lanzamiento Puppeteer:', { ...launchOptions, executablePath: launchOptions.executablePath ? 'present' : 'not-set' });
      browser = await puppeteer.launch(launchOptions);
      console.log('[PDF] Puppeteer lanzado correctamente.');
    } catch (pptrLaunchErr) {
      console.error('[PDF] Error lanzando Puppeteer:', pptrLaunchErr);
      // En caso de fallo al lanzar Puppeteer usamos fallback con PDFKit
      console.warn('[PDF] Usando fallback PDFKit para generar el PDF.');
      return await generatePdfWithPdfKit(ventas, { startDate, endDate, user: `${req.user?.name ?? req.user?.email ?? req.user?.id}` }, res);
    }

    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30000 });
      console.log('[PDF] HTML cargado en página Puppeteer.');

      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '20mm', right: '10mm', bottom: '20mm', left: '10mm' },
        timeout: 120000
      });
      console.log('[PDF] PDF generado, tamaño(bytes):', pdfBuffer.length);

      await browser.close();

      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="reporte_ventas_${Date.now()}.pdf"`,
        'Content-Length': pdfBuffer.length
      });
      return res.send(pdfBuffer);
    } catch (pptrPageErr) {
      console.error('[PDF] Error generando PDF en página de Puppeteer:', pptrPageErr);
      try { if (browser) await browser.close(); } catch (closeErr) { console.error('[PDF] Error cerrando browser:', closeErr); }
      console.warn('[PDF] Usando fallback PDFKit tras error en page/pdf.');
      return await generatePdfWithPdfKit(ventas, { startDate, endDate, user: `${req.user?.name ?? req.user?.email ?? req.user?.id}` }, res);
    }
  } catch (error) {
    console.error('[PDF] Error inesperado:', error);
    if (includeStack) {
      return res.status(500).json({ error: 'Error generando PDF', message: error.message, stack: error.stack });
    }
    return res.status(500).json({ error: 'Error generando PDF (revisar logs del servidor).' });
  }
};
