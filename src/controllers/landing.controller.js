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

    // 1. Guardar los textos enviados desde el admin (clave => valor). Solo las claves conocidas:
    // antes se guardaba cualquier campo que llegara en el pedido.
    const { CLAVES_LANDING } = ActualizarLandingTextos;
    const textos = {};
    for (const [clave, valor] of Object.entries(req.body || {})) {
      if (!CLAVES_LANDING.includes(clave)) continue;
      if (valor !== undefined && valor !== null && String(valor).trim() !== '') {
        textos[clave] = String(valor).slice(0, 5000);
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

/*
 * Datos bancarios del gimnasio para pagar por transferencia. Van aparte de la web pública:
 * los ve cualquier usuario con sesión (el alumno los necesita para pagar) y los cambia solo
 * quien tiene permiso de modificar la configuración.
 */
const db = require('../config/db');
const { CLAVES_BANCO } = require('../data/Landing/ActualizarLandingTextos.js');

const obtenerDatosBancarios = async (req, res) => {
  try {
    const [filas] = await db.query(
      `SELECT clave, valor FROM landing_textos WHERE clave IN (${CLAVES_BANCO.map(() => '?').join(',')})`,
      CLAVES_BANCO
    );
    const datos = Object.fromEntries(CLAVES_BANCO.map((c) => [c, '']));
    filas.forEach(({ clave, valor }) => { datos[clave] = valor || ''; });
    return res.status(200).json({ success: true, data: datos });
  } catch (error) {
    console.error('Error al obtener los datos bancarios:', error);
    return res.status(500).json({ success: false, message: 'No se pudieron obtener los datos bancarios' });
  }
};

// Reglas de cada dato (todos opcionales: vacío = se borra)
const REGLAS_BANCO = {
  bancoEntidad:       { max: 60,  mensaje: 'El banco puede tener hasta 60 caracteres.' },
  titularCuenta:      { max: 100, mensaje: 'El titular puede tener hasta 100 caracteres.' },
  cuitTransferencia:  { patron: /^\d{2}-?\d{8}-?\d$/, mensaje: 'El CUIT tiene que tener 11 números (con o sin guiones).' },
  cvuTransferencia:   { patron: /^\d{22}$/, mensaje: 'El CBU o CVU tiene que tener 22 números, sin espacios.' },
  aliasTransferencia: { patron: /^[A-Za-z0-9.-]{6,20}$/, mensaje: 'El alias tiene que tener entre 6 y 20 caracteres: letras, números, puntos o guiones.' },
};

const actualizarDatosBancarios = async (req, res) => {
  try {
    const datos = {};
    for (const clave of CLAVES_BANCO) {
      const valor = String(req.body?.[clave] ?? '').trim();
      const regla = REGLAS_BANCO[clave];
      if (valor && ((regla.max && valor.length > regla.max) || (regla.patron && !regla.patron.test(valor)))) {
        return res.status(400).json({ success: false, message: regla.mensaje, campo: clave });
      }
      datos[clave] = valor;
    }
    // Sin CBU/CVU ni alias el alumno no tiene a dónde transferir
    if (!datos.cvuTransferencia && !datos.aliasTransferencia && Object.values(datos).some(Boolean)) {
      return res.status(400).json({ success: false, message: 'Cargá al menos el CBU/CVU o el alias.', campo: 'cvuTransferencia' });
    }

    for (const [clave, valor] of Object.entries(datos)) {
      if (valor) {
        await db.query(
          `INSERT INTO landing_textos (seccion, clave, valor) VALUES ('banco', ?, ?)
           ON DUPLICATE KEY UPDATE seccion = 'banco', valor = ?`,
          [clave, valor, valor]
        );
      } else {
        await db.query('DELETE FROM landing_textos WHERE clave = ?', [clave]);
      }
    }
    return res.status(200).json({ success: true, message: 'Datos bancarios guardados', data: datos });
  } catch (error) {
    console.error('Error al guardar los datos bancarios:', error);
    return res.status(500).json({ success: false, message: 'No se pudieron guardar los datos bancarios' });
  }
};

module.exports = { obtenerConfiguracion, actualizarConfiguracion, obtenerDatosBancarios, actualizarDatosBancarios };