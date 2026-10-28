'use strict';
/**
 * Limpieza de metadatos de videos MP4 y MOV (los que graba un celular).
 *
 * Un video de celular lleva ubicación GPS, marca y modelo del teléfono, versión del sistema, fecha y hora de grabación
 * y, a veces, el nombre de quien lo grabó. Esos datos están en cajas ("boxes") del archivo: udta, meta y uuid (XMP),
 * más las fechas de creación de las cabeceras. Se los borra SIN cambiar el tamaño del archivo (la caja pasa a ser
 * una caja vacía "free" y las fechas se ponen en cero), así no se mueve nada de lugar y el video sigue reproduciéndose igual.
 * Se hace en el mismo archivo, leyendo solo las cabeceras (los videos pueden pesar cientos de MB).
 *
 * Otros formatos (WebM, MKV, AVI) no se tocan acá: no llevan ubicación GPS y no los graba un celular.
 */
const fs = require('fs');

const CONTENEDORAS = new Set(['moov', 'trak', 'mdia']); // cajas que tienen otras cajas adentro y hay que recorrer
const A_VACIAR = new Set(['udta', 'meta', 'uuid']);      // metadatos: ubicación, equipo, XMP…
const CON_FECHAS = new Set(['mvhd', 'tkhd', 'mdhd']);    // cabeceras con fecha de creación y modificación

/** true si el archivo parece un MP4/MOV (tiene una caja "ftyp" al principio). */
function esVideoIso(ruta) {
  const fd = fs.openSync(ruta, 'r');
  try {
    const cab = Buffer.alloc(12);
    if (fs.readSync(fd, cab, 0, 12, 0) < 12) return false;
    return cab.toString('latin1', 4, 8) === 'ftyp';
  } finally {
    fs.closeSync(fd);
  }
}

/** Limpia el archivo en el lugar. Devuelve cuántas cajas de metadatos vació. */
function limpiarVideoIso(ruta) {
  const fd = fs.openSync(ruta, 'r+');
  const total = fs.fstatSync(fd).size;
  let vaciadas = 0;

  const leer = (pos, largo) => {
    const b = Buffer.alloc(largo);
    const n = fs.readSync(fd, b, 0, largo, pos);
    return n === largo ? b : null;
  };

  const cabecera = (pos, limite) => {
    const b = leer(pos, 16) || leer(pos, Math.min(16, limite - pos));
    if (!b || b.length < 8) return null;
    let tam = b.readUInt32BE(0);
    let cab = 8;
    if (tam === 1) {
      if (b.length < 16) return null;
      tam = Number(b.readBigUInt64BE(8));
      cab = 16;
    } else if (tam === 0) {
      tam = limite - pos; // la última caja llega hasta el final
    }
    if (tam < cab || pos + tam > limite) return null;
    return { tam, cab, tipo: b.toString('latin1', 4, 8) };
  };

  const ceros = (desde, largo, bloque = 1 << 20) => {
    let pos = desde;
    const fin = desde + largo;
    const z = Buffer.alloc(Math.min(bloque, largo));
    while (pos < fin) {
      const n = Math.min(z.length, fin - pos);
      fs.writeSync(fd, z, 0, n, pos);
      pos += n;
    }
  };

  const recorrer = (desde, hasta) => {
    let pos = desde;
    while (pos + 8 <= hasta) {
      const c = cabecera(pos, hasta);
      if (!c) break;
      if (A_VACIAR.has(c.tipo)) {
        ceros(pos + c.cab, c.tam - c.cab);                       // se borra el contenido
        fs.writeSync(fd, Buffer.from('free', 'latin1'), 0, 4, pos + 4); // y la caja pasa a ser una caja vacía
        vaciadas += 1;
      } else if (CONTENEDORAS.has(c.tipo)) {
        recorrer(pos + c.cab, pos + c.tam);
      } else if (CON_FECHAS.has(c.tipo)) {
        const v = leer(pos + c.cab, 1);
        if (v) ceros(pos + c.cab + 4, v[0] === 1 ? 16 : 8);      // fecha de creación y de modificación (versión 0: 4+4 bytes; 1: 8+8)
      }
      pos += c.tam;
    }
  };

  try {
    recorrer(0, total);
  } finally {
    fs.closeSync(fd);
  }
  return vaciadas;
}

module.exports = { esVideoIso, limpiarVideoIso };
