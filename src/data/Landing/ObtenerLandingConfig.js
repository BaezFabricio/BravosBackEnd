const db = require('../../config/db');

const ObtenerLandingConfig = async () => {
  try {
    const [filasTexto] = await db.query('SELECT seccion, clave, valor FROM landing_textos');
    const [filasImagenes] = await db.query('SELECT tipo, url FROM landing_imagenes WHERE url IS NOT NULL AND url != ""');

    const config = {
      // Hero
      tituloHero: 'Centro de Entrenamiento Bravos',
      tituloHeroSize: null,
      tituloHeroFont: null,
      tituloHeroAlign: null,
      logoUrl: '/logo-box-bravos-final.png',
      heroImages: { hero1: null, hero2: null, hero3: null },
      // Nosotros
      tituloNosotros: 'Sobre Nosotros',
      subtituloNosotros: '',
      descripcionNosotros: '',
      mision: '',
      // Clases
      claseCard1Titulo: 'CrossFit',
      claseCard1Descripcion: 'Entrenamiento funcional de alta intensidad.',
      claseCard1Icono: '🔥',
      claseCard2Titulo: 'Funcional',
      claseCard2Descripcion: 'Movilidad, fuerza y resistencia.',
      claseCard2Icono: '💪',
      claseCard3Titulo: 'Planificación',
      claseCard3Descripcion: 'Programa personalizado para atletas.',
      claseCard3Icono: '📋',
      // Contacto
      direccion: '',
      telefono: '',
      email: '',
      instagram: '',
      horario_semana: 'Lun-Vie: 6:00 - 22:00',
      horario_sabado: 'Sábado: 8:00 - 14:00',
      horario_domingo: 'Domingo: Cerrado',
      mapaUrl: '',
    };

    filasTexto.forEach(({ clave, valor }) => {
      if (Object.prototype.hasOwnProperty.call(config, clave)) {
        config[clave] = valor;
      }
    });

    filasImagenes.forEach(({ tipo, url }) => {
      if (tipo === 'logo') config.logoUrl = url;
      if (tipo === 'imagenHero1') config.heroImages.hero1 = url;
      if (tipo === 'imagenHero2') config.heroImages.hero2 = url;
      if (tipo === 'imagenHero3') config.heroImages.hero3 = url;
      if (tipo === 'imagenNosotros') config.imagenNosotros = url;
      if (tipo === 'imagenClase1') config.imagenClase1 = url;
      if (tipo === 'imagenClase2') config.imagenClase2 = url;
      if (tipo === 'imagenClase3') config.imagenClase3 = url;
    });

    return config;
  } catch (error) {
    console.error('Error al obtener configuración:', error);
    return { tituloHero: '...', heroImages: {} };
  }
};

module.exports = ObtenerLandingConfig;
