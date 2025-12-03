// models/producto.js
const mongoose = require('mongoose');

const ProductoSchema = new mongoose.Schema(
  {
    id: { type: Number, required: true, unique: true },

    nombre: { type: String, required: true },
    descripcion: { type: String, default: '' },
    precio: { type: Number, required: true, default: 0 },
    categoria: { type: String, default: '' },

    imagen_url: { type: String, default: '' },

    colores: { type: [String], default: [] },
    tamanos: { type: [String], default: [] },

    stock: { type: Number, default: 0 },
    activo: { type: Boolean, default: true },

    // 🔥 OFERTAS
    oferta_activa: { type: Boolean, default: false },
    oferta_texto: { type: String, default: '' }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model('Producto', ProductoSchema);
