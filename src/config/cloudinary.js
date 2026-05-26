// src/config/cloudinary.js
const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: 'dlxibypyj',       // 👈 ¡CON LA "L" EN EL MEDIO!
  api_key: '345171545681153',    // Tu API Key real que termina en 3
  api_secret: 'asRyZ7OqxHxJCaJ21IA8fj5Nvss', // Tu Secret real
});

module.exports = cloudinary;