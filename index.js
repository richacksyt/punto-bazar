// index.js - Punto Bazar con IA real, MongoDB y Cloudinary
// Requisitos:
//   npm install express multer mongoose cloudinary
//   (opcional) Node 18+ para tener fetch global
//
// Variables de entorno necesarias:
//   MONGO_URI
//   CLOUDINARY_CLOUD_NAME
//   CLOUDINARY_API_KEY
//   CLOUDINARY_API_SECRET
//   (opcional) OPENAI_API_KEY
//
// Para activar IA real:
//   1) Crear API key en https://platform.openai.com
//   2) En la consola:  export OPENAI_API_KEY="TU_API_KEY_ACÁ"
//   3) Ejecutar: node index.js

const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const mongoose = require('mongoose');
const cloudinary = require('cloudinary').v2;

const Producto = require('./models/producto');

const app = express();
const PORT = process.env.PORT || 3000;

// --------- CONEXIÓN A MONGODB ----------
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/puntobazar';

mongoose
  .connect(MONGO_URI)
  .then(() => {
    console.log('✅ Conectado a MongoDB');
  })
  .catch((err) => {
    console.error('❌ Error conectando a MongoDB:', err);
  });

// --------- CONFIG CLOUDINARY ----------
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || '',
  api_key: process.env.CLOUDINARY_API_KEY || '',
  api_secret: process.env.CLOUDINARY_API_SECRET || ''
});

// --------- MIDDLEWARES BÁSICOS ----------
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static
app.use(express.static(path.join(__dirname, 'public')));

// --------- "BASE DE DATOS" EN MEMORIA (TEMPORAL PARA LO DEMÁS) ----------
let usuarios = [
  { id: 1, usuario: 'ricardo', password: '1234', nombre: 'Ricardo' },
  { id: 2, usuario: 'eliseo', password: '1234', nombre: 'Eliseo' }
];

let revendedores = [];
let campanias = [];
let clientes = [];
let ventas = [];

let nextIds = {
  revendedor: 1,
  campania: 1,
  cliente: 1,
  venta: 1
};

// --------- SUBIDA DE IMÁGENES (MULTER + CLOUDINARY) ----------
// Usamos multer para guardar un archivo TEMPORAL y luego subirlo a Cloudinary
const uploadsDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname) || '.jpg';
    const base = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, base + ext);
  }
});
const upload = multer({ storage });

// Nuevo: subimos a Cloudinary en lugar de usar la imagen local
app.post('/api/upload-imagen', upload.single('imagen'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ ok: false, mensaje: 'No se recibió archivo.' });
    }

    const filePath = req.file.path; // ruta temporal en el disco de Render

    // Subir a Cloudinary
    const resultado = await cloudinary.uploader.upload(filePath, {
      folder: 'punto-bazar' // carpeta lógica en tu cuenta Cloudinary
    });

    // Borramos el archivo local (ya no lo necesitamos)
    try {
      fs.unlinkSync(filePath);
    } catch (e) {
      console.warn('No se pudo borrar archivo temporal:', e.message);
    }

    // Devolvemos la URL permanente de Cloudinary
    res.json({
      ok: true,
      url: resultado.secure_url
    });
  } catch (err) {
    console.error('Error subiendo imagen a Cloudinary:', err);
    res.status(500).json({ ok: false, mensaje: 'Error al subir imagen.' });
  }
});

// --------- LOGIN ADMIN ----------
app.post('/api/login', (req, res) => {
  const { usuario, password } = req.body || {};
  const u = usuarios.find(
    (x) => x.usuario === usuario && x.password === password
  );
  if (!u) {
    return res.status(401).json({ ok: false, mensaje: 'Usuario o clave incorrectos.' });
  }
  res.json({ ok: true, nombre: u.nombre || u.usuario });
});

// --------- REVendedores ----------
app.get('/api/revendedores', (req, res) => {
  res.json(revendedores);
});

app.post('/api/revendedores', (req, res) => {
  const { nombre, telefono, zona, acepta_whatsapp } = req.body || {};
  if (!nombre) {
    return res.status(400).json({ mensaje: 'Nombre es obligatorio.' });
  }
  const r = {
    id: nextIds.revendedor++,
    nombre,
    telefono: telefono || '',
    zona: zona || '',
    activo: true,
    acepta_whatsapp: !!acepta_whatsapp
  };
  revendedores.push(r);
  res.json(r);
});

app.patch('/api/revendedores/:id/activo', (req, res) => {
  const id = Number(req.params.id);
  const r = revendedores.find((x) => x.id === id);
  if (!r) return res.status(404).json({ mensaje: 'Revendedor no encontrado.' });
  if (typeof req.body.activo === 'boolean') {
    r.activo = req.body.activo;
  } else {
    r.activo = !r.activo;
  }
  res.json(r);
});

// --------- CAMPAÑAS ----------
app.get('/api/campanias', (req, res) => {
  res.json(campanias);
});

app.post('/api/campanias', (req, res) => {
  const { titulo, texto, activa } = req.body || {};
  if (!titulo && !texto) {
    return res.status(400).json({ mensaje: 'Se necesita al menos título o texto.' });
  }
  const c = {
    id: nextIds.campania++,
    titulo: titulo || '',
    texto: texto || '',
    activa: !!activa,
    creada_en: new Date().toISOString()
  };
  if (c.activa) {
    campanias.forEach((x) => (x.activa = false));
  }
  campanias.push(c);
  res.json(c);
});

app.patch('/api/campanias/:id/activa', (req, res) => {
  const id = Number(req.params.id);
  const c = campanias.find((x) => x.id === id);
  if (!c) return res.status(404).json({ mensaje: 'Campaña no encontrada.' });
  campanias.forEach((x) => (x.activa = false));
  c.activa = true;
  res.json(c);
});

app.delete('/api/campanias/:id', (req, res) => {
  const id = Number(req.params.id);
  const idx = campanias.findIndex((x) => x.id === id);
  if (idx === -1) return res.status(404).json({ mensaje: 'Campaña no encontrada.' });
  const [borrada] = campanias.splice(idx, 1);
  res.json(borrada);
});

// Última campaña activa (para mostrar en portada)
app.get('/api/campanias/hoy', (req, res) => {
  const activa = campanias
    .filter((x) => x.activa)
    .sort((a, b) => new Date(b.creada_en) - new Date(a.creada_en))[0];
  if (!activa) return res.json(null);
  res.json(activa);
});

// --------- PRODUCTOS / STOCK (MONGO) ----------

// helper: normalizar arrays desde input
function normalizarArrayDesdeCampo(valor) {
  if (!valor) return [];
  if (Array.isArray(valor)) return valor;
  // si viene texto "rojo, azul"
  return String(valor)
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length);
}

// helper: obtener siguiente id numérico de producto
async function obtenerSiguienteIdProducto() {
  const ultimo = await Producto.findOne().sort({ id: -1 }).lean();
  const ultimoId = ultimo ? ultimo.id || 0 : 0;
  return ultimoId + 1;
}

// helper: calcular precio con oferta (mismo criterio que el front)
function calcularPrecioConOferta(precioBase, oferta_tipo, oferta_valor) {
  const base = Number(precioBase || 0);
  const v = Number(oferta_valor || 0);
  if (!oferta_tipo || !v || base <= 0) return base;

  if (oferta_tipo === 'porcentaje') {
    const desc = (base * v) / 100;
    return Math.max(0, base - desc);
  }
  if (oferta_tipo === 'precio') {
    return Math.max(0, v);
  }
  return base;
}

// Todos los productos
app.get('/api/productos', async (req, res) => {
  try {
    const productos = await Producto.find().sort({ id: 1 }).lean();
    res.json(productos);
  } catch (err) {
    console.error('Error listando productos:', err);
    res.status(500).json({ mensaje: 'Error al obtener productos.' });
  }
});

// Solo productos activos y con stock > 0 (para catálogo)
app.get('/api/productos/activos', async (req, res) => {
  try {
    const activos = await Producto.find({
      activo: true,
      $or: [
        { stock: { $gt: 0 } },
        { stock: { $exists: false } }
      ]
    })
      .sort({ id: 1 })
      .lean();

    // Los devolvemos tal cual, incluyendo oferta_tipo/oferta_valor/oferta_etiqueta
    res.json(activos);
  } catch (err) {
    console.error('Error listando productos activos:', err);
    res.status(500).json({ mensaje: 'Error al obtener productos activos.' });
  }
});

// (Opcional) Productos con oferta activa (para panel admin/verificación)
app.get('/api/productos/ofertas', async (req, res) => {
  try {
    const conOfertas = await Producto.find({
      oferta_tipo: { $in: ['porcentaje', 'precio'] },
      oferta_valor: { $gt: 0 }
    }).sort({ id: 1 }).lean();

    res.json(conOfertas);
  } catch (err) {
    console.error('Error listando productos en oferta:', err);
    res.status(500).json({ mensaje: 'Error al obtener productos en oferta.' });
  }
});

// Crear producto
app.post('/api/productos', async (req, res) => {
  try {
    let {
      nombre,
      descripcion,
      precio,
      categoria,
      imagen_url,
      colores,
      tamanos,
      stock,
      // NUEVO: campos de oferta
      oferta_tipo,
      oferta_valor,
      oferta_etiqueta
    } = req.body || {};

    if (!nombre || !precio) {
      return res.status(400).json({ mensaje: 'Nombre y precio son obligatorios.' });
    }

    const nuevoId = await obtenerSiguienteIdProducto();

    const producto = await Producto.create({
      id: nuevoId,
      nombre: nombre || '',
      descripcion: descripcion || '',
      precio: Number(precio) || 0,
      categoria: categoria || '',
      imagen_url: imagen_url || '',
      colores: normalizarArrayDesdeCampo(colores),
      tamanos: normalizarArrayDesdeCampo(tamanos),
      stock: stock === '' || stock === undefined ? 1 : Number(stock) || 0,
      activo: true,
      // Oferta: si no viene nada, quedan null / undefined y no molestan
      oferta_tipo: oferta_tipo || null,
      oferta_valor: oferta_valor === '' || oferta_valor === undefined ? null : Number(oferta_valor),
      oferta_etiqueta: oferta_etiqueta || null
    });

    res.json(producto);
  } catch (err) {
    console.error('Error creando producto:', err);
    res.status(500).json({ mensaje: 'Error al crear producto.' });
  }
});

// Activar / desactivar producto
app.patch('/api/productos/:id/activo', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const p = await Producto.findOne({ id });

    if (!p) return res.status(404).json({ mensaje: 'Producto no encontrado.' });

    if (typeof req.body.activo === 'boolean') {
      p.activo = req.body.activo;
    } else {
      p.activo = !p.activo;
    }

    await p.save();
    res.json(p);
  } catch (err) {
    console.error('Error cambiando estado activo del producto:', err);
    res.status(500).json({ mensaje: 'Error al actualizar producto.' });
  }
});

// Editar producto (nombre, precio, stock, etc.)
// IMPORTANTE: acá SOLO se pisan campos que vengan definidos.
// Si la pantalla de stock no manda oferta_tipo/oferta_valor/oferta_etiqueta, NO se borran.
app.patch('/api/productos/:id', async (req, res) => {
  try:
  {
    const id = Number(req.params.id);
    const p = await Producto.findOne({ id });

    if (!p) return res.status(404).json({ mensaje: 'Producto no encontrado.' });

    const {
      nombre,
      descripcion,
      precio,
      categoria,
      imagen_url,
      colores,
      tamanos,
      stock,
      // Oferta opcional: solo se toca si viene en el body
      oferta_tipo,
      oferta_valor,
      oferta_etiqueta
    } = req.body || {};

    if (nombre !== undefined) p.nombre = nombre;
    if (descripcion !== undefined) p.descripcion = descripcion;
    if (precio !== undefined) p.precio = Number(precio) || 0;
    if (categoria !== undefined) p.categoria = categoria;
    if (imagen_url !== undefined) p.imagen_url = imagen_url;
    if (colores !== undefined) p.colores = normalizarArrayDesdeCampo(colores);
    if (tamanos !== undefined) p.tamanos = normalizarArrayDesdeCampo(tamanos);
    if (stock !== undefined) p.stock = Number(stock) || 0;

    // Solo modificamos oferta si el front la manda explícitamente
    if (oferta_tipo !== undefined) {
      p.oferta_tipo = oferta_tipo || null;
    }
    if (oferta_valor !== undefined) {
      p.oferta_valor =
        oferta_valor === '' || oferta_valor === null || oferta_valor === undefined
          ? null
          : Number(oferta_valor);
    }
    if (oferta_etiqueta !== undefined) {
      p.oferta_etiqueta = oferta_etiqueta || null;
    }

    await p.save();
    res.json(p);
  } catch (err) {
    console.error('Error editando producto:', err);
    res.status(500).json({ mensaje: 'Error al editar producto.' });
  }
});

// Modificar stock directo
// ✅ Esta ruta se usa desde la pantalla de stock: solo cambia stock (y si querés podrías agregar stock_minimo)
// NO toca ningún campo de oferta.
app.patch('/api/productos/:id/stock', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const p = await Producto.findOne({ id });
    if (!p) return res.status(404).json({ mensaje: 'Producto no encontrado.' });

    const { stock } = req.body || {};
    p.stock = Number(stock) || 0;

    await p.save();
    res.json(p);
  } catch (err) {
    console.error('Error actualizando stock:', err);
    res.status(500).json({ mensaje: 'Error al actualizar stock.' });
  }
});

// NUEVO: endpoint específico para oferta de producto
// Desde tu panel de "Ofertas" usás este endpoint y sabés que SOLO toca oferta, no stock.
app.patch('/api/productos/:id/oferta', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const p = await Producto.findOne({ id });
    if (!p) return res.status(404).json({ mensaje: 'Producto no encontrado.' });

    let { oferta_tipo, oferta_valor, oferta_etiqueta } = req.body || {};

    oferta_tipo = oferta_tipo || null;
    const valor =
      oferta_valor === '' || oferta_valor === null || oferta_valor === undefined
        ? null
        : Number(oferta_valor);
    oferta_etiqueta = oferta_etiqueta || null;

    // Si no hay tipo o valor => limpiamos oferta
    if (!oferta_tipo || !valor) {
      p.oferta_tipo = null;
      p.oferta_valor = null;
      p.oferta_etiqueta = null;
    } else {
      p.oferta_tipo = oferta_tipo;
      p.oferta_valor = valor;
      p.oferta_etiqueta = oferta_etiqueta;
    }

    await p.save();
    res.json(p);
  } catch (err) {
    console.error('Error actualizando oferta de producto:', err);
    res.status(500).json({ mensaje: 'Error al actualizar oferta.' });
  }
});

// Borrar producto
app.delete('/api/productos/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const borrado = await Producto.findOneAndDelete({ id });
    if (!borrado) return res.status(404).json({ mensaje: 'Producto no encontrado.' });
    res.json(borrado);
  } catch (err) {
    console.error('Error borrando producto:', err);
    res.status(500).json({ mensaje: 'Error al borrar producto.' });
  }
});

// --------- CLIENTES ----------
app.get('/api/clientes', (req, res) => {
  res.json(clientes);
});

app.post('/api/clientes', (req, res) => {
  const { nombre, telefono, zona, notas } = req.body || {};
  if (!nombre) {
    return res.status(400).json({ mensaje: 'Nombre es obligatorio.' });
  }
  const c = {
    id: nextIds.cliente++,
    nombre,
    telefono: telefono || '',
    zona: zona || '',
    notas: notas || ''
  };
  clientes.push(c);
  res.json(c);
});

// --------- VENTAS ----------
app.get('/api/ventas', (req, res) => {
  res.json(ventas);
});

app.post('/api/ventas', async (req, res) => {
  try {
    const {
      revendedor_id,
      revendedor_nombre,
      fecha,
      total,
      comision_porcentaje,
      cliente_id,
      cliente_texto,
      // NUEVO: items con varios productos
      items,
      // Campos viejos (por compatibilidad)
      producto_id,
      cantidad_producto,
      detalle
    } = req.body || {};

    const fechaFinal = fecha || new Date().toISOString().slice(0, 10);

    // Cliente
    let cliId = cliente_id ? Number(cliente_id) : null;
    let cliNombre = cliente_texto || '';

    if (!cliId && cliNombre) {
      // crear cliente al vuelo
      const nuevo = {
        id: nextIds.cliente++,
        nombre: cliNombre,
        telefono: '',
        zona: '',
        notas: 'Creado desde venta'
      };
      clientes.push(nuevo);
      cliId = nuevo.id;
    } else if (cliId) {
      const cli = clientes.find((c) => c.id === cliId);
      if (cli) cliNombre = cli.nombre;
    }

    // Calcular total
    let totalNum = Number(total) || 0;

    // Si se mandaron varios items y no hay total, lo calculamos desde productos en Mongo
    let itemsLimpios = Array.isArray(items) ? items : [];
    itemsLimpios = itemsLimpios
      .map(it => ({
        producto_id: Number(it.producto_id),
        cantidad: Number(it.cantidad) || 0
      }))
      .filter(it => it.producto_id && it.cantidad > 0);

    if (itemsLimpios.length && (!total || totalNum <= 0)) {
      totalNum = 0;
      for (const it of itemsLimpios) {
        try {
          const p = await Producto.findOne({ id: it.producto_id });
          if (p) {
            const precioBase = typeof p.precio === 'number' ? p.precio : 0;
            const precioConOferta = calcularPrecioConOferta(
              precioBase,
              p.oferta_tipo,
              p.oferta_valor
            );
            totalNum += precioConOferta * it.cantidad;
          }
        } catch (e) {
          console.error('Error obteniendo producto para calcular total:', e);
        }
      }
    } else if (!itemsLimpios.length && (!total || totalNum <= 0) && producto_id) {
      // compatibilidad: 1 solo producto
      const prodId = Number(producto_id);
      const cant = Number(cantidad_producto) || 0;
      try {
        const p = await Producto.findOne({ id: prodId });
        if (p) {
          const precioBase = typeof p.precio === 'number' ? p.precio : 0;
          const precioConOferta = calcularPrecioConOferta(
            precioBase,
            p.oferta_tipo,
            p.oferta_valor
          );
          totalNum = precioConOferta * cant;
        }
      } catch (e) {
        console.error('Error obteniendo producto (modo 1 producto):', e);
      }
    }

    const porc = Number(comision_porcentaje) || 0;
    const comision_calculada = Math.round((totalNum * porc) / 100);

    // Descontar stock
    if (itemsLimpios.length) {
      // Varios productos
      for (const it of itemsLimpios) {
        try {
          const p = await Producto.findOne({ id: it.producto_id });
          if (p) {
            const stockActual = typeof p.stock === 'number' ? p.stock : 0;
            p.stock = Math.max(0, stockActual - it.cantidad);
            await p.save();
          }
        } catch (errStock) {
          console.error('Error actualizando stock desde venta (items):', errStock);
        }
      }
    } else {
      // Compatibilidad con viejo formato (un solo producto)
      let prodId = producto_id ? Number(producto_id) : null;
      let cantDesc = cantidad_producto ? Number(cantidad_producto) : 0;
      if (prodId && cantDesc > 0) {
        try {
          const p = await Producto.findOne({ id: prodId });
          if (p) {
            const stockActual = typeof p.stock === 'number' ? p.stock : 0;
            p.stock = Math.max(0, stockActual - cantDesc);
            await p.save();
          }
        } catch (errStock) {
          console.error('Error actualizando stock desde venta:', errStock);
        }
      }
    }

    const v = {
      id: nextIds.venta++,
      revendedor_id: revendedor_id ? Number(revendedor_id) : null,
      revendedor_nombre: revendedor_nombre || '',
      fecha: fechaFinal,
      total: totalNum,
      comision_porcentaje: porc,
      comision_calculada,
      cliente_id: cliId,
      cliente: cliNombre,
      detalle: detalle || '',
      // Guardamos los items si vinieron
      items: itemsLimpios.length ? itemsLimpios : undefined
    };

    ventas.push(v);
    res.json(v);
  } catch (err) {
    console.error('Error creando venta:', err);
    res.status(500).json({ mensaje: 'Error al crear venta.' });
  }
});

// --------- IA REAL (OpenAI) ----------
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';

async function llamarIA(prompt, maxOutputTokens) {
  if (!OPENAI_API_KEY) {
    console.warn('⚠️ No hay OPENAI_API_KEY configurada. Usando IA básica de fallback.');
    return null;
  }

  try {
    const resp = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + OPENAI_API_KEY
      },
      body: JSON.stringify({
        model: 'gpt-5.1-mini',
        input: prompt,
        max_output_tokens: maxOutputTokens || 256
      })
    });

    if (!resp.ok) {
      console.error('Error HTTP IA:', resp.status, await resp.text());
      return null;
    }

    const data = await resp.json();
    return data.output_text || null;
  } catch (e) {
    console.error('Error llamando a IA:', e);
    return null;
  }
}

// IA para DESCRIPCIÓN de PRODUCTO
app.post('/api/ia/descripcion-producto', async (req, res) => {
  const { nombre, categoria, detalles, colores, tamanos } = req.body || {};

  const prompt =
    'Sos el redactor de fichas de producto de un catálogo de bazar. ' +
    'Escribí una descripción clara y vendedora en español neutro, 3 a 5 frases, sin emojis.\n\n' +
    `Nombre del producto: ${nombre || ''}\n` +
    `Categoría: ${categoria || ''}\n` +
    `Colores: ${(colores || []).join(', ')}\n` +
    `Tamaños: ${(tamanos || []).join(', ')}\n` +
    `Detalles adicionales: ${detalles || ''}\n\n` +
    'El texto tiene que ser fácil de leer por WhatsApp y apto para clientes finales.';

  const texto = await llamarIA(prompt, 280);

  if (!texto) {
    return res.json({ ok: false, texto: '' });
  }

  res.json({ ok: true, texto });
});

// IA para CAMPAÑAS
app.post('/api/ia/campania', async (req, res) => {
  const { idea, tipo, tono } = req.body || {};

  const prompt =
    'Sos especialista en marketing para revendedores de catálogo. ' +
    'Generá una campaña breve para usar en historias, estados de WhatsApp o flyers.\n\n' +
    `Idea base: ${idea || ''}\n` +
    `Tipo de campaña: ${tipo || 'historias'}\n` +
    `Tono: ${tono || 'energico'}\n\n` +
    'Devolvé un texto en formato:\n' +
    'TÍTULO:\n...\n\n' +
    'TEXTO:\n...\n\n' +
    'CTA:\n...\n\n' +
    'HASHTAGS:\n...';

  const texto = await llamarIA(prompt, 320);

  if (!texto) {
    return res.json({
      ok: false,
      titulo: '',
      cuerpo: '',
      cta: '',
      hashtags: ''
    });
  }

  const partes = {
    titulo: '',
    cuerpo: '',
    cta: '',
    hashtags: ''
  };

  const secciones = texto.split(/\n\s*\n/);
  for (const bloque of secciones) {
    const b = bloque.trim();
    if (!b) continue;
    if (b.toUpperCase().startsWith('TÍTULO') || b.toUpperCase().startsWith('TITULO')) {
      partes.titulo = b.replace(/^T[ÍI]TULO:\s*/i, '').trim();
    } else if (b.toUpperCase().startsWith('TEXTO')) {
      partes.cuerpo = b.replace(/^TEXTO:\s*/i, '').trim();
    } else if (b.toUpperCase().startsWith('CTA')) {
      partes.cta = b.replace(/^CTA:\s*/i, '').trim();
    } else if (b.toUpperCase().startsWith('HASHTAGS')) {
      partes.hashtags = b.replace(/^HASHTAGS:\s*/i, '').trim();
    }
  }

  res.json({
    ok: true,
    titulo: partes.titulo,
    cuerpo: partes.cuerpo,
    cta: partes.cta,
    hashtags: partes.hashtags
  });
});

// --------- RUTAS BÁSICAS FRONT ----------
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'catalogo.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// --------- ARRANQUE DEL SERVIDOR ----------
app.listen(PORT, () => {
  console.log('Punto Bazar escuchando en http://localhost:' + PORT);
});
