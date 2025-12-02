// index.js - Punto Bazar con IA real para productos y campañas 
// Requisitos:
//   npm install express multer mongoose
//   (opcional) Node 18+ para tener fetch global
//
// Para activar IA real:
//   1) Crear API key en https://platform.openai.com
//   2) En la consola:  export OPENAI_API_KEY="TU_API_KEY_ACÁ"
//   3) Ejecutar: node index.js

const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const mongoose = require('mongoose'); // 👈 MongoDB

const Producto = require('./models/producto'); // 👈 Modelo de producto

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

// --------- SUBIDA DE IMÁGENES (MULTER) ----------
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

app.post('/api/upload-imagen', upload.single('imagen'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ ok: false, mensaje: 'No se recibió archivo.' });
  }
  const url = '/uploads/' + req.file.filename;
  res.json({ ok: true, url });
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

// --------- PRODUCTOS / STOCK (AHORA EN MONGO) ----------

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

    res.json(activos);
  } catch (err) {
    console.error('Error listando productos activos:', err);
    res.status(500).json({ mensaje: 'Error al obtener productos activos.' });
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
      stock
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
      activo: true
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
app.patch('/api/productos/:id', async (req, res) => {
  try {
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
      stock
    } = req.body || {};

    if (nombre !== undefined) p.nombre = nombre;
    if (descripcion !== undefined) p.descripcion = descripcion;
    if (precio !== undefined) p.precio = Number(precio) || 0;
    if (categoria !== undefined) p.categoria = categoria;
    if (imagen_url !== undefined) p.imagen_url = imagen_url;
    if (colores !== undefined) p.colores = normalizarArrayDesdeCampo(colores);
    if (tamanos !== undefined) p.tamanos = normalizarArrayDesdeCampo(tamanos);
    if (stock !== undefined) p.stock = Number(stock) || 0;

    await p.save();
    res.json(p);
  } catch (err) {
    console.error('Error editando producto:', err);
    res.status(500).json({ mensaje: 'Error al editar producto.' });
  }
});

// Modificar stock directo
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
      producto_id,
      cantidad_producto,
      detalle
    } = req.body || {};

    const fechaFinal = fecha || new Date().toISOString().slice(0, 10);
    const totalNum = Number(total) || 0;
    const porc = Number(comision_porcentaje) || 0;
    const comision_calculada = Math.round((totalNum * porc) / 100);

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

    // Descontar stock si corresponde (ahora en Mongo)
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
      producto_id: prodId,
      cantidad_producto: cantDesc
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
    return null; // hace que el front use la descripción local
  }

  try {
    const resp = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + OPENAI_API_KEY
      },
      body: JSON.stringify({
        model: 'gpt-5.1-mini', // modelo rápido y barato
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
    // sin IA, devolvemos vacío y el front usa su fallback
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

  // Partimos el formato
  const partes = {
    titulo: '',
    cuerpo: '',
    cta: '',
    hashtags: ''
  };

  const secciones = texto.split(/\n\s*\n/); // bloques
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
