// backend-node/src/controllers/saleController.js
import fs from 'fs';
import path from 'path';
import os from 'os';
import axios from 'axios';
import Sale from '../models/Sale.js';
import User from '../models/User.js';
import puppeteer from 'puppeteer';
import PDFDocument from 'pdfkit';
import streamBuffers from 'stream-buffers';

const PYTHON_API = process.env.PYTHON_API_URL || 'https://backend-python-io29.onrender.com';
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || null; // opcional: usa header para llamadas entre servicios
const AXIOS_TIMEOUT = 5000;

/* -------------------- Helpers para comunicacion con backend Python -------------------- */

const pythonHeaders = () => {
  const h = { 'Content-Type': 'application/json' };
  if (INTERNAL_API_KEY) h['x-internal-key'] = INTERNAL_API_KEY;
  return h;
};

const decrementStock = async (productId, cantidad) => {
  console.log(`[DEBUG] Decrementando producto: ${productId}, cantidad: ${cantidad}`);
  const url = `${PYTHON_API}/api/products/${productId}/decrement`;
  try {
    const res = await axios.post(url, { cantidad }, {
      headers: pythonHeaders(),
      timeout: AXIOS_TIMEOUT
    });
    console.log(`[DEBUG] Respuesta Python: ${JSON.stringify(res.data)}`);
    return res.data;
  } catch (error) {
    console.error(`[DEBUG] Error en decrementStock: ${error.message}`);
    console.error(`[DEBUG] Response: ${error.response?.data}`);
    throw error;
  }
};

const adjustStock = async (productId, delta) => {
  const url = `${PYTHON_API}/api/products/${productId}/adjust`;
  const res = await axios.post(url, { cantidad: delta }, { headers: pythonHeaders(), timeout: AXIOS_TIMEOUT });
  return res.data;
};

/* -------------------- Utiles para normalizar items -------------------- */

const normalizeItems = (productos) => {
  // Acepta varias formas: { product_id, id, _id, productId } y cantidad o qty o cantidad
  if (!Array.isArray(productos)) return [];
  return productos.map(p => {
    const productId = p.product_id || p.productId || p.id || p._id || (p.product && (p.product.id || p.product._id));
    const cantidad = p.cantidad ?? p.qty ?? p.quantity ?? p.cant ?? 1;
    return { productId: String(productId), cantidad: Number(cantidad), raw: p };
  });
};

/* -------------------- Crear nueva venta (ahora con ajuste de stock) -------------------- */

export const createSale = async (req, res) => {
  const { productos } = req.body;
  const vendedor_id = req.user.id; // Obtenido del token

  try {
    // Verificar que el vendedor exista
    const vendedor = await User.findById(vendedor_id);
    if (!vendedor) {
      return res.status(404).json({ error: 'Vendedor no encontrado' });
    }

    // Normalizar items
    const items = normalizeItems(productos);
    if (items.length === 0) {
      return res.status(400).json({ error: 'La venta debe incluir al menos un producto' });
    }

    // Validaciones simples
    for (const it of items) {
      if (!it.productId || isNaN(it.cantidad) || it.cantidad <= 0) {
        return res.status(400).json({ error: 'Cada producto debe tener product_id válido y cantidad > 0' });
      }
    }

    // Intentar decrementar stock en Python por cada item
    const adjusted = []; // para rollback [{productId, cantidad}]
    try {
      for (const it of items) {
        await decrementStock(it.productId, it.cantidad);
        adjusted.push({ productId: it.productId, cantidad: it.cantidad });
      }
    } catch (err) {
      // Si falla algún decremento hacemos rollback de los que sí se ajustaron
      console.error('[CREATE_SALE] Error decrementando stock:', err?.response?.data ?? err.message);
      for (const adj of adjusted) {
        try {
          await adjustStock(adj.productId, adj.cantidad); // devolver unidades
        } catch (rbErr) {
          console.error(`[CREATE_SALE][ROLLBACK] Falló rollback para ${adj.productId}:`, rbErr?.response?.data ?? rbErr.message);
        }
      }
      const status = err?.response?.status === 400 ? 400 : 500;
      const message = err?.response?.data?.detail || err?.response?.data || err.message || 'Error al decrementar stock';
      return res.status(status).json({ error: message });
    }

    // Después de los decrementos exitosos, antes de crear la venta:
    const nuevaVenta = new Sale({
      vendedor_id,
      productos: items.map(item => ({
        productId: item.productId,
        cantidad: item.cantidad,
        // nombre y precio_unitario se llenarán automáticamente en el pre-save
      }))
    });

    // El total se calcula automáticamente en el pre-save
    await nuevaVenta.save();

    return res.status(201).json(nuevaVenta);
  } catch (error) {
    console.error('[CREATE_SALE] Error creando venta:', error);
    // En caso de error grave intenta rollback si hubiera hecho ajustes (defensivo)
    // Nota: en este catch no tenemos la lista `adjusted` fuera, por eso la gestión de rollback se hace arriba.
    return res.status(500).json({ error: 'Error creando venta' });
  }
};

/* -------------------- Obtener ventas / venta por id / reporte (sin cambios lógicos) -------------------- */

export const getSales = async (req, res) => {
  try {
    let ventas;
    if (req.user.role === 'Administrador') {
      ventas = await Sale.find().populate('vendedor_id', 'name email');
    } else {
      ventas = await Sale.find({ vendedor_id: req.user.id }).populate('vendedor_id', 'name email');
    }
    res.json(ventas);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error obteniendo ventas' });
  }
};

export const getSaleById = async (req, res) => {
  const { id } = req.params;

  try {
    const venta = await Sale.findById(id).populate('vendedor_id', 'name email');
    if (!venta) {
      return res.status(404).json({ error: 'Venta no encontrada' });
    }
    if (req.user.role !== 'Administrador' && venta.vendedor_id._id.toString() !== req.user.id) {
      return res.status(403).json({ error: 'No autorizado para ver esta venta' });
    }
    res.json(venta);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error obteniendo venta' });
  }
};

export const getSalesReport = async (req, res) => {
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

    const totalVentas = ventas.reduce((sum, venta) => sum + venta.total, 0);
    const cantidadVentas = ventas.length;

    res.json({ ventas, totalVentas, cantidadVentas });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error generando reporte' });
  }
};

/* -------------------- Actualizar venta (ajusta stock con diffs) -------------------- */

export const updateSale = async (req, res) => {
  const { id } = req.params;
  const { productos } = req.body;

  try {
    const venta = await Sale.findById(id);
    if (!venta) return res.status(404).json({ error: 'Venta no encontrada' });

    if (req.user.role !== 'Administrador' && venta.vendedor_id.toString() !== req.user.id) {
      return res.status(403).json({ error: 'No autorizado para modificar esta venta' });
    }

    // Normalizar arrays
    const oldItems = normalizeItems(venta.productos);
    const newItems = normalizeItems(productos);

    // Crear mapas productId -> cantidad
    const mapOld = {};
    for (const it of oldItems) mapOld[it.productId] = (mapOld[it.productId] || 0) + it.cantidad;
    const mapNew = {};
    for (const it of newItems) mapNew[it.productId] = (mapNew[it.productId] || 0) + it.cantidad;

    // Calcular diffs: diff = new - old
    const diffs = [];
    const allProductIds = Array.from(new Set([...Object.keys(mapOld), ...Object.keys(mapNew)]));
    for (const pid of allProductIds) {
      const oldQ = mapOld[pid] || 0;
      const newQ = mapNew[pid] || 0;
      const diff = newQ - oldQ;
      if (diff !== 0) diffs.push({ productId: pid, diff }); // diff >0 => necesitamos decrementar más; diff <0 => devolver stock
    }

    // Aplicar diffs en Python: tratar decrementos y ajustes positivos (incrementos)
    const applied = []; // para rollback [{productId, appliedDelta}] appliedDelta is the actual delta applied to DB (positive means stock reduced, negative means stock increased)
    try {
      for (const d of diffs) {
        if (d.diff > 0) {
          // Hay que restar más stock (decrement)
          await decrementStock(d.productId, d.diff);
          applied.push({ productId: d.productId, appliedDelta: d.diff }); // reducimos stock
        } else {
          // diff < 0 -> significa que ahora vendemos menos, devolver stock
          const returnQty = Math.abs(d.diff);
          await adjustStock(d.productId, returnQty); // incrementamos stock en python
          applied.push({ productId: d.productId, appliedDelta: -returnQty }); // negative -> stock increased
        }
      }
    } catch (err) {
      console.error('[UPDATE_SALE] Error aplicando diffs:', err?.response?.data ?? err.message);
      // Rollback: revertir applied en orden inverso
      for (const a of applied.reverse()) {
        try {
          if (a.appliedDelta > 0) {
            // si aplicamos decrement (reducimos stock), devolvemos esas unidades
            await adjustStock(a.productId, a.appliedDelta);
          } else if (a.appliedDelta < 0) {
            // si aplicamos incremento (devuelta), ahora restamos esa cantidad otra vez
            await decrementStock(a.productId, Math.abs(a.appliedDelta));
          }
        } catch (rbErr) {
          console.error(`[UPDATE_SALE][ROLLBACK] Falló rollback para ${a.productId}:`, rbErr?.response?.data ?? rbErr.message);
        }
      }
      const status = err?.response?.status === 400 ? 400 : 500;
      const message = err?.response?.data?.detail || err?.response?.data || err.message || 'Error ajustando stock al actualizar venta';
      return res.status(status).json({ error: message });
    }

    // Si todo ok, actualizamos la venta y guardamos
    venta.productos = productos;
    await venta.save();
    return res.json(venta);
  } catch (error) {
    console.error('[UPDATE_SALE] Error actualizando venta:', error);
    return res.status(500).json({ error: 'Error actualizando venta' });
  }
};

/* -------------------- Eliminar venta (restituye stock) -------------------- */

export const deleteSale = async (req, res) => {
  const { id } = req.params;

  try {
    const venta = await Sale.findById(id);
    if (!venta) return res.status(404).json({ error: 'Venta no encontrada' });

    if (req.user.role !== 'Administrador' && venta.vendedor_id.toString() !== req.user.id) {
      return res.status(403).json({ error: 'No autorizado para eliminar esta venta' });
    }

    // Antes de eliminar, devolver stock de todos los productos vendidos
    const items = normalizeItems(venta.productos);
    const returned = []; // track para rollback teórico
    try {
      for (const it of items) {
        await adjustStock(it.productId, it.cantidad); // devuelve unidades
        returned.push({ productId: it.productId, cantidad: it.cantidad });
      }
    } catch (err) {
      console.error('[DELETE_SALE] Error devolviendo stock antes de eliminar venta:', err?.response?.data ?? err.message);
      // Intentar rollback de lo que ya se devolvió (tratar de restarlo otra vez)
      for (const r of returned) {
        try {
          await decrementStock(r.productId, r.cantidad);
        } catch (rbErr) {
          console.error(`[DELETE_SALE][ROLLBACK] Falló rollback para ${r.productId}:`, rbErr?.response?.data ?? rbErr.message);
        }
      }
      const status = err?.response?.status === 400 ? 400 : 500;
      const message = err?.response?.data?.detail || err?.response?.data || err.message || 'Error devolviendo stock al eliminar venta';
      return res.status(status).json({ error: message });
    }

    await venta.deleteOne();
    res.json({ message: 'Venta eliminada correctamente' });
  } catch (error) {
    console.error('[DELETE_SALE] Error eliminando venta:', error);
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

/* -------------------- getSalesReportPDF (sin cambios) -------------------- */

export const getSalesReportPDF = async (req, res) => {
  const { startDate, endDate } = req.query;
  const includeStack = req.query.debug === 'true' || process.env.NODE_ENV !== 'production';

  console.log('[PDF] Inicio de getSalesReportPDF', { startDate, endDate, user: req.user?.id, role: req.user?.role });

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
    const query = {
      fecha: { $gte: start, $lte: end }
    };
    if (req.user.role !== 'Administrador') {
      query.vendedor_id = req.user.id;
    }

    console.log('[PDF] Query construida', query);

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
          productos_sample: Array.isArray(sample.productos) ? sample.productos.slice(0, 2) : sample.productos
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