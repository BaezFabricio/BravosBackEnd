const db = require('../../config/db');

const SECCION_MAP = {
  hero: ['tituloHero', 'tituloHeroSize', 'tituloHeroFont', 'tituloHeroAlign'],
  nosotros: ['tituloNosotros', 'subtituloNosotros', 'descripcionNosotros', 'mision'],
  clases: ['claseCard1Titulo', 'claseCard1Descripcion', 'claseCard1Icono',
           'claseCard2Titulo', 'claseCard2Descripcion', 'claseCard2Icono',
           'claseCard3Titulo', 'claseCard3Descripcion', 'claseCard3Icono'],
  contacto: ['direccion', 'telefono', 'email', 'instagram',
             'horario_semana', 'horario_sabado', 'horario_domingo', 'mapaUrl'],
};

function resolverSeccion(clave) {
  for (const [seccion, claves] of Object.entries(SECCION_MAP)) {
    if (claves.includes(clave)) return seccion;
  }
  return 'hero';
}

const ActualizarLandingTextos = async (datos) => {
  for (const [clave, valor] of Object.entries(datos)) {
    const seccion = resolverSeccion(clave);
    await db.query(
      `INSERT INTO landing_textos (seccion, clave, valor) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE valor = ?`,
      [seccion, clave, valor, valor]
    );
  }
  return { success: true };
};

module.exports = ActualizarLandingTextos;
