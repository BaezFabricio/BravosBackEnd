'use strict';
/**
 * Limpieza de metadatos de PDF.
 *
 * Un PDF guarda, además de lo que se ve, datos ocultos: autor, título, programa y equipo con que se creó, fechas,
 * un bloque XMP, datos privados de programas de diseño, autores de comentarios y, si trae fotos adentro, el EXIF de
 * esas fotos (ubicación y teléfono). Antes de guardar un PDF subido se reescribe quitando todo eso.
 * También se quita lo que puede ejecutar cosas al abrirlo (JavaScript, acciones automáticas, archivos adjuntos).
 * No se toca lo que se ve en pantalla.
 *
 * Un PDF protegido con contraseña o dañado no se puede limpiar: se rechaza (no se guarda sin limpiar).
 */
const { PDFDocument, PDFName, PDFDict, PDFArray, PDFRawStream, PDFNumber, PDFStream } = require('pdf-lib');
const { limpiarMetadatos } = require('./imagenes');

const nombre = (n) => PDFName.of(n);

/** true si los bytes empiezan como un PDF. */
function esPdf(b) {
  return Buffer.isBuffer(b) && b.length > 8 && b.toString('latin1', 0, 1024).includes('%PDF-');
}

// Claves de un diccionario que guardan datos privados del programa que lo creó o de quien lo editó
const CLAVES_PRIVADAS = ['Metadata', 'PieceInfo', 'LastModified'];
// Autor y asunto de un comentario o anotación
const CLAVES_ANOTACION = ['T', 'Subj', 'CreationDate', 'M'];
// Lo que se ejecuta o se abre solo
const CLAVES_ACTIVAS_CATALOGO = ['OpenAction', 'AA', 'JavaScript', 'JS'];
const CLAVES_ACTIVAS_NOMBRES = ['JavaScript', 'EmbeddedFiles'];

function esFiltroJpeg(dict) {
  const f = dict.get(nombre('Filter'));
  if (!f) return false;
  if (f instanceof PDFName) return f.asString() === '/DCTDecode';
  if (f instanceof PDFArray) return f.asArray().some((x) => x instanceof PDFName && x.asString() === '/DCTDecode');
  return false;
}

/** Devuelve el mismo PDF sin metadatos (Buffer). Falla si no es un PDF válido o está protegido. */
async function limpiarPdf(datos) {
  try {
    return await limpiarPdfInterno(datos);
  } catch (error) {
    // Solo se muestran los mensajes propios; un error interno de la librería (PDF roto de una forma rara) no se le muestra a la persona
    if (error && error.esMensajePropio) throw error;
    throw Object.assign(new Error('El PDF está dañado o no se puede procesar. Probá guardarlo de nuevo o subí una foto.'), { esMensajePropio: true });
  }
}

async function limpiarPdfInterno(datos) {
  if (!esPdf(datos)) throw Object.assign(new Error('No es un PDF válido.'), { esMensajePropio: true });

  let doc;
  try {
    doc = await PDFDocument.load(datos, { updateMetadata: false }); // sin ignoreEncryption: un PDF cifrado falla acá a propósito
  } catch {
    throw Object.assign(new Error('El PDF está protegido con contraseña o dañado.'), { esMensajePropio: true });
  }
  const ctx = doc.context;

  // 1. Información del documento (autor, título, programa, fechas…): se vacía el diccionario
  const info = ctx.trailerInfo.Info ? ctx.lookup(ctx.trailerInfo.Info) : null;
  if (info instanceof PDFDict) for (const k of info.keys()) info.delete(k);

  // 2. Recorrer todos los objetos del archivo
  const paraBorrar = [];
  for (const [ref, obj] of ctx.enumerateIndirectObjects()) {
    const dict = obj instanceof PDFStream ? obj.dict : obj instanceof PDFDict ? obj : null;
    if (!dict) continue;

    // Bloques XMP completos: se borra el objeto
    if (obj instanceof PDFStream && dict.get(nombre('Type'))?.asString?.() === '/Metadata') { paraBorrar.push(ref); continue; }

    for (const k of CLAVES_PRIVADAS) dict.delete(nombre(k));
    if (dict.get(nombre('Type'))?.asString?.() === '/Annot') for (const k of CLAVES_ANOTACION) dict.delete(nombre(k));

    // Fotos JPEG metidas en el PDF: se les quita el EXIF
    if (obj instanceof PDFRawStream && esFiltroJpeg(dict)) {
      try {
        const limpia = limpiarMetadatos(Buffer.from(obj.contents));
        dict.set(nombre('Length'), PDFNumber.of(limpia.length));
        ctx.assign(ref, PDFRawStream.of(dict, new Uint8Array(limpia)));
      } catch { /* si no se pudo reescribir esa foto, se deja como estaba: no es una imagen JPEG normal */ }
    }
  }
  for (const ref of paraBorrar) ctx.delete(ref);

  // 3. Lo que se ejecuta o se abre solo, y los archivos adjuntos
  const catalogo = doc.catalog;
  for (const k of CLAVES_ACTIVAS_CATALOGO) catalogo.delete(nombre(k));
  const nombres = catalogo.lookupMaybe(nombre('Names'), PDFDict);
  if (nombres) for (const k of CLAVES_ACTIVAS_NOMBRES) nombres.delete(nombre(k));

  const salida = await doc.save({ useObjectStreams: false, updateFieldAppearances: false });
  return Buffer.from(salida);
}

module.exports = { esPdf, limpiarPdf };
