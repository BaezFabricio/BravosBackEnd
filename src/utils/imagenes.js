'use strict';
/**
 * Limpieza de metadatos de imágenes subidas.
 *
 * Las fotos suelen llevar datos ocultos: ubicación GPS, modelo del teléfono, fecha y hora, nombre del programa
 * de edición, rutas de carpetas, comentarios. Nada de eso hace falta para mostrar la imagen, así que antes de guardar
 * o reenviar cualquier imagen se la reescribe conservando SOLO lo imprescindible para dibujarla (lista blanca).
 * También se reconoce el formato por sus bytes (no por el nombre ni por el tipo que declara el cliente).
 * Sin dependencias externas. Formatos: JPEG, PNG, WebP y GIF. Nunca SVG.
 */
const fs = require('fs');

const igual = (b, pos, bytes) => bytes.every((v, i) => b[pos + i] === v);

/** Devuelve 'jpeg' | 'png' | 'webp' | 'gif' según los bytes, o null si no es una imagen permitida. */
function tipoDeImagen(b) {
  if (!Buffer.isBuffer(b) || b.length < 12) return null;
  if (igual(b, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png';
  if (igual(b, 0, [0xff, 0xd8, 0xff])) return 'jpeg';
  if (igual(b, 0, [0x52, 0x49, 0x46, 0x46]) && igual(b, 8, [0x57, 0x45, 0x42, 0x50])) return 'webp';
  if (b.toString('latin1', 0, 6) === 'GIF89a' || b.toString('latin1', 0, 6) === 'GIF87a') return 'gif';
  return null;
}

const PNG_CONSERVAR = new Set(['IHDR', 'PLTE', 'tRNS', 'IDAT', 'IEND', 'sRGB', 'gAMA', 'cHRM', 'pHYs']);
function limpiarPng(b) {
  const partes = [b.subarray(0, 8)];
  let i = 8;
  while (i + 12 <= b.length) {
    const largo = b.readUInt32BE(i);
    const tipo = b.toString('latin1', i + 4, i + 8);
    const fin = i + 12 + largo;
    if (fin > b.length) break;
    if (PNG_CONSERVAR.has(tipo)) partes.push(b.subarray(i, fin));
    i = fin;
  }
  return Buffer.concat(partes);
}

function limpiarJpeg(b) {
  const partes = [b.subarray(0, 2)];
  let i = 2;
  while (i + 2 <= b.length) {
    if (b[i] !== 0xff) break;
    const m = b[i + 1];
    if (m === 0xff) { i++; continue; }
    if (m === 0xda || m === 0xd9) { partes.push(b.subarray(i)); return Buffer.concat(partes); } // desde el barrido, todo es imagen
    if (i + 4 > b.length) break;
    const largo = b.readUInt16BE(i + 2);
    const seg = b.subarray(i, i + 2 + largo);
    const esJfif = m === 0xe0 && seg.toString('latin1', 4, 9) === 'JFIF\0';
    const esAdobe = m === 0xee && seg.toString('latin1', 4, 9) === 'Adobe'; // necesario para los colores de algunos JPEG
    const esMetadato = (m >= 0xe0 && m <= 0xef && !esJfif && !esAdobe) || m === 0xfe; // APPn (EXIF, XMP, IPTC, ICC…) y comentarios
    if (!esMetadato) partes.push(seg);
    i += 2 + largo;
  }
  return Buffer.concat(partes);
}

function limpiarWebp(b) {
  const partes = [];
  let i = 12;
  while (i + 8 <= b.length) {
    const tipo = b.toString('latin1', i, i + 4);
    const largo = b.readUInt32LE(i + 4);
    const fin = i + 8 + largo + (largo % 2);
    if (fin > b.length + 1) break;
    const trozo = Buffer.from(b.subarray(i, Math.min(fin, b.length)));
    if (tipo === 'VP8X') trozo[8] &= ~(0x20 | 0x08 | 0x04); // apaga las marcas de perfil de color, EXIF y XMP
    if (!['EXIF', 'XMP ', 'ICCP'].includes(tipo)) partes.push(trozo);
    i = fin;
  }
  const cuerpo = Buffer.concat(partes);
  const cabecera = Buffer.from(b.subarray(0, 12));
  cabecera.writeUInt32LE(cuerpo.length + 4, 4);
  return Buffer.concat([cabecera, cuerpo]);
}

function limpiarGif(b) {
  const partes = [];
  const flags = b[10];
  let i = 13 + (flags & 0x80 ? 3 * (1 << ((flags & 7) + 1)) : 0);
  partes.push(b.subarray(0, i));
  const saltarSubbloques = (desde) => { let j = desde; while (j < b.length && b[j] !== 0) j += b[j] + 1; return j + 1; };
  while (i < b.length) {
    const marca = b[i];
    if (marca === 0x3b) { partes.push(b.subarray(i, i + 1)); break; } // fin del archivo
    if (marca === 0x21) {
      const etiqueta = b[i + 1];
      const fin = saltarSubbloques(i + 2);
      const bloque = b.subarray(i, fin);
      const esNetscape = etiqueta === 0xff && bloque.toString('latin1', 3, 14) === 'NETSCAPE2.0'; // cuántas veces se repite la animación
      if (etiqueta === 0xf9 || esNetscape) partes.push(bloque); // el resto (comentarios, texto, XMP…) se descarta
      i = fin;
    } else if (marca === 0x2c) {
      const lf = b[i + 9];
      const cabecera = 10 + (lf & 0x80 ? 3 * (1 << ((lf & 7) + 1)) : 0) + 1;
      const fin = saltarSubbloques(i + cabecera);
      partes.push(b.subarray(i, fin));
      i = fin;
    } else break;
  }
  return Buffer.concat(partes);
}

/** Devuelve la misma imagen sin ningún metadato. Falla si los bytes no son una imagen permitida. */
function limpiarMetadatos(datos) {
  const tipo = tipoDeImagen(datos);
  if (!tipo) throw new Error('No es una imagen JPG, PNG, WebP o GIF válida.');
  if (tipo === 'png') return limpiarPng(datos);
  if (tipo === 'jpeg') return limpiarJpeg(datos);
  if (tipo === 'webp') return limpiarWebp(datos);
  return limpiarGif(datos);
}

/** Limpia un archivo en el disco (el que dejó multer) y lo reescribe en el mismo lugar. */
function limpiarArchivoDeImagen(ruta) {
  fs.writeFileSync(ruta, limpiarMetadatos(fs.readFileSync(ruta)));
}

/** Limpia una imagen recibida como «data:image/png;base64,…». Devuelve otra cadena igual, pero sin metadatos. */
function limpiarDataUri(dataUri) {
  const m = /^data:image\/(jpeg|png|webp|gif);base64,([A-Za-z0-9+/=\s]+)$/.exec(String(dataUri));
  if (!m) throw new Error('La imagen tiene que ser JPG, PNG, WebP o GIF en base64.');
  const limpia = limpiarMetadatos(Buffer.from(m[2], 'base64'));
  return `data:image/${tipoDeImagen(limpia)};base64,${limpia.toString('base64')}`;
}

module.exports = { tipoDeImagen, limpiarMetadatos, limpiarArchivoDeImagen, limpiarDataUri };
