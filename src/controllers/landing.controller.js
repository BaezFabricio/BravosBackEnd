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
    const { tituloHero } = req.body;
    const ActualizarLandingTextos = require('../data/Landing/ActualizarLandingTextos.js');
    const ActualizarLandingImagen = require('../data/Landing/ActualizarLandingImagen.js');

    // 1. Actualizar Título
    if (tituloHero) {
      await ActualizarLandingTextos({ tituloHero });
    }

    // 2. Procesar imágenes (logo + 3 del carrusel)
    const campos = ['logo', 'imagenHero1', 'imagenHero2', 'imagenHero3'];
    for (const campo of campos) {
      if (req.files && req.files[campo]) {
        const resultado = await cloudinary.uploader.upload(req.files[campo][0].path, { folder: "bravos_landing" });
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