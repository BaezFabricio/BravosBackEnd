(async ()=>{
  const db = require('../config/db');
  const obtenerUsuarioRegistrado = require('../data/Auth/ObtenerUsuarioRegistrado');
  try{
    const [rows] = await db.query(obtenerUsuarioRegistrado, [7]);
    console.log(JSON.stringify(rows,null,2));
  }catch(e){
    console.error('ERROR', e && e.message ? e.message : e);
  } finally { process.exit(); }
})();