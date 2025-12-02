// models/producto.js
const mongoose = require('mongoose');

const productoSchema = new mongoose.Schema(
  {
    // ID numérico que usabas antes. Lo seguimos manteniendo.
    id: {
      type: Number,
      required: true,
      unique: true
    },
    nombre: { type: String, default: '' },
    descripcion: { type: String, default: '' },
    precio: { type: Number, default: 0 },
    categoria: { type: String, default: '' },
    imagen_url: { type: String, default: '' },
    colores: { type: [String], default: [] },
    tamanos: { type: [String], default: [] },
    stock: { type: Number, default: 1 },
    activo: { type: Boolean, default: true }
  },
  {
    timestamps: true
  }
);

const Producto = mongoose.model('Producto', productoSchema);

module.exports = Producto;
