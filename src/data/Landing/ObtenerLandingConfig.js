const db = require('../../config/db');

const ObtenerLandingConfig = async () => {
  try {
    // 1. Traemos los textos
    const [filasTexto] = await db.query('SELECT clave, valor FROM landing_textos WHERE seccion = "hero"');
    
    // 2. Traemos solo las imágenes que tengan URL (filtramos las que están vacías)
    const [filasImagenes] = await db.query('SELECT tipo, url FROM landing_imagenes WHERE url IS NOT NULL AND url != ""');
    
    const config = {
      tituloHero: "Centro de Entrenamiento Bravos",
      // Estilos configurables del título
      tituloHeroSize: null,
      tituloHeroFont: null,
      tituloHeroAlign: null,
      logoUrl: "/logo-box-bravos-final.png",
      heroImages: { hero1: null, hero2: null, hero3: null }
    };

    filasTexto.forEach(f => {
      if (f.clave === 'tituloHero') config.tituloHero = f.valor;
      if (f.clave === 'tituloHeroSize') config.tituloHeroSize = f.valor;
      if (f.clave === 'tituloHeroFont') config.tituloHeroFont = f.valor;
      if (f.clave === 'tituloHeroAlign') config.tituloHeroAlign = f.valor;
    });
    
    filasImagenes.forEach(f => {
      if (f.tipo === 'logo') config.logoUrl = f.url;
      if (f.tipo === 'imagenHero1') config.heroImages.hero1 = f.url;
      if (f.tipo === 'imagenHero2') config.heroImages.hero2 = f.url;
      if (f.tipo === 'imagenHero3') config.heroImages.hero3 = f.url;
    });

    console.log("Configuración cargada desde BD:", config); // Esto te dirá en la consola si está leyendo bien
    return config;
  } catch (error) {
    console.error("Error al obtener configuración:", error);
    return { tituloHero: "...", heroImages: {} };
  }
};

module.exports = ObtenerLandingConfig;