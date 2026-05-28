(async ()=>{
  const db = require('../config/db');
  try{
    const [rows] = await db.query("SELECT u.idUsuario,u.idPersona,u.username,u.estado,p.correo FROM usuario u JOIN persona p ON u.idPersona=p.idPersona WHERE p.correo = 'fabriciobaezz11@gmail.com'");
    console.log(JSON.stringify(rows,null,2));
  }catch(e){
    console.error('ERROR', e && e.message ? e.message : e);
  } finally { process.exit(); }
})();