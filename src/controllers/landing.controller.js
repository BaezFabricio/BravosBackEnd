const cloudinary = require('../config/cloudinary');

const obtenerConfiguracion = async (req, res) => {
  try {
    const ObtenerLandingConfig = require('../data/Landing/ObtenerLandingConfig.js');
    const config = await ObtenerLandingConfig();
    return res.status(200).json(config);
  } catch (error) {
    res.status(500).json({ error: "Error al obtener configuración" });
  }
};

const actualizarConfiguracion = async (req, res) => {
  try {
    const ActualizarLandingTextos = require('../data/Landing/ActualizarLandingTextos.js');
    const ActualizarLandingImagen = require('../data/Landing/ActualizarLandingImagen.js');

    // 1. Guardar todos los textos enviados desde el admin (clave => valor)
    const textos = {};
    for (const [clave, valor] of Object.entries(req.body || {})) {
      if (valor !== undefined && valor !== null && String(valor).trim() !== '') {
        textos[clave] = valor;
      }
    }
    if (Object.keys(textos).length > 0) {
      await ActualizarLandingTextos(textos);
    }

    // 2. Procesar imágenes (logo + 3 del carrusel)
    const campos = ['logo', 'imagenHero1', 'imagenHero2', 'imagenHero3', 'imagenNosotros', 'imagenClase1', 'imagenClase2', 'imagenClase3'];
    for (const campo of campos) {
      if (req.files && req.files[campo]) {
        // Configuración de transformaciones por tipo de imagen
        const transformacionHero = { width: 1920, height: 1080, crop: 'fill', gravity: 'auto', quality: 'auto', fetch_format: 'auto', resource_type: 'auto' };
        const transformacionCard = { width: 800, height: 1000, crop: 'fill', gravity: 'auto', quality: 'auto', fetch_format: 'auto', resource_type: 'auto' };
        const transformaciones = {
          logo: { quality: 'auto', fetch_format: 'auto', resource_type: 'auto' },
          imagenHero1: transformacionHero,
          imagenHero2: transformacionHero,
          imagenHero3: transformacionHero,
          imagenNosotros: transformacionHero,
          imagenClase1: transformacionCard,
          imagenClase2: transformacionCard,
          imagenClase3: transformacionCard,
        };

        const opciones = {
          folder: 'bravos_landing',
          ...transformaciones[campo],
        };
        const resultado = await cloudinary.uploader.upload(req.files[campo][0].path, opciones);
        await ActualizarLandingImagen({ tipo: campo, url: resultado.secure_url });
      }
    }

    return res.status(200).json({ ok: true, mensaje: "Configuración actualizada" });
  } catch (error) {
    console.error("Error:", error);
    return res.status(500).json({ ok: false, mensaje: error.message });
  }
};

module.exports = { obtenerConfiguracion, actualizarConfiguracion };