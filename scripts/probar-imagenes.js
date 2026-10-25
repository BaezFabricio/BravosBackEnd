const { limpiarMetadatos, tipoDeImagen, limpiarDataUri } = require(require('path').resolve(process.argv[2] || './src/utils/imagenes.js'));
const b = (s) => Buffer.from(s, 'base64');
const S = Buffer.from('SECRETO-GPS-26.1857S-58.1756W-Samsung');
const PNG = b('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==');
const GIF = b('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7');
const WEBP = b('UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==');
const ch = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); return Buffer.concat([l, Buffer.from(t), d, Buffer.alloc(4)]); };
const seg = (m, d) => Buffer.concat([Buffer.from([0xff, m, (d.length + 2) >> 8, (d.length + 2) & 255]), d]);
const JPEG = Buffer.concat([Buffer.from([0xff,0xd8]), seg(0xe0, Buffer.from('JFIF\0\x01\x01\0\0\x01\0\x01\0\0')), seg(0xc0, Buffer.from([8,0,1,0,1,3,1,0x11,0,2,0x11,1,3,0x11,1])), Buffer.from([0xff,0xda,0,12,3,1,0,2,0x11,3,0x11,0,0x3f,0,0x12,0x34,0xff,0xd9])]);
const sucias = {
  png: Buffer.concat([PNG.subarray(0, 33), ch('tEXt', S), ch('eXIf', S), PNG.subarray(33)]),
  jpeg: Buffer.concat([JPEG.subarray(0, 2), seg(0xe1, Buffer.concat([Buffer.from('Exif\0\0'), S])), seg(0xfe, S), seg(0xed, S), JPEG.subarray(2)]),
  webp: (() => { const h = Buffer.alloc(8); h.write('EXIF'); h.writeUInt32LE(S.length, 4); const c = Buffer.concat([WEBP.subarray(12), h, S, S.length % 2 ? Buffer.alloc(1) : Buffer.alloc(0)]); const r = Buffer.from(WEBP.subarray(0, 12)); r.writeUInt32LE(c.length + 4, 4); return Buffer.concat([r, c]); })(),
  gif: Buffer.concat([GIF.subarray(0, 19), Buffer.from([0x21, 0xfe, S.length]), S, Buffer.from([0]), GIF.subarray(19)]),
};
let ok = true;
for (const [t, d] of Object.entries(sucias)) {
  const l = limpiarMetadatos(d);
  const bien = d.includes('SECRETO') && !l.includes('SECRETO') && tipoDeImagen(l) === t;
  const igualSiLimpia = limpiarMetadatos(l).equals(l);
  console.log(t, bien ? 'OK' : 'FALLA', igualSiLimpia ? '(idempotente)' : '(NO idempotente)');
  ok = ok && bien && igualSiLimpia;
}
const du = 'data:image/png;base64,' + sucias.png.toString('base64');
console.log('dataUri', !Buffer.from(limpiarDataUri(du).split(',')[1], 'base64').includes('SECRETO') ? 'OK' : 'FALLA');
for (const malo of ['http://sitio-malo.test/x.png', 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=', 'data:text/html;base64,PGI+']) { try { limpiarDataUri(malo); console.log('FALLA acepto', malo); ok = false; } catch { console.log('rechaza', malo.slice(0, 30)); } }
try { limpiarMetadatos(Buffer.from('<svg onload=alert(1)></svg>')); ok = false; console.log('FALLA svg'); } catch { console.log('rechaza svg'); }
process.exit(ok ? 0 : 1);
