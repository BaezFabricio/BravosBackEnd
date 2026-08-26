import connection from "../config/db.js";

export const guardarPerfilCompleto = async (req, res) => {
  const { idPerfil, nombrePerfil, descripcion, permisos } = req.body;
  const isNew = !idPerfil;

  const dbConn = await connection.getConnection();

  try {
    await dbConn.beginTransaction();
    let currentPerfilId = idPerfil;

    if (isNew) {
      const [perfilResult] = await dbConn.query(
        "INSERT INTO perfil (nombrePerfil, descripcion) VALUES (?, ?)",
        [nombrePerfil, descripcion]
      );
      currentPerfilId = perfilResult.insertId;
    } else {
      await dbConn.query(
        "UPDATE perfil SET nombrePerfil = ?, descripcion = ? WHERE idPerfil = ?",
        [nombrePerfil, descripcion, currentPerfilId]
      );
      await dbConn.query("DELETE FROM perfilpermiso WHERE idPerfil = ?", [currentPerfilId]);
    }

    if (permisos && permisos.length > 0) {
      for (const item of permisos) {
        // 🟢 BLINDAJE 1: Buscamos limpiando espacios y forzando minúsculas en la query
        const [permisoRows] = await dbConn.query(
          "SELECT idPermiso FROM permiso WHERE LOWER(TRIM(modulo)) = LOWER(TRIM(?)) AND LOWER(TRIM(accion)) = LOWER(TRIM(?))",
          [item.modulo, item.nombreAccion]
        );

        if (permisoRows.length > 0) {
          const idPermiso = permisoRows[0].idPermiso;
          await dbConn.query(
            "INSERT INTO perfilpermiso (idPerfil, idPermiso) VALUES (?, ?)",
            [currentPerfilId, idPermiso]
          );
        }
      }
    }

    await dbConn.commit();
    return res.status(200).json({ success: true, message: "Perfil guardado correctamente", idPerfil: currentPerfilId });

  } catch (error) {
    await dbConn.rollback();
    console.error("Error en la transacción de perfiles:", error);
    return res.status(500).json({ error: "Error interno del servidor al procesar los permisos" });
  } finally {
    dbConn.release();
  }
};

export const eliminarPerfil = async (req, res) => {
  const { id } = req.params;
  const dbConn = await connection.getConnection();

  try {
    await dbConn.beginTransaction();
    await dbConn.query("DELETE FROM perfilpermiso WHERE idPerfil = ?", [id]);
    await dbConn.query("DELETE FROM perfil WHERE idPerfil = ?", [id]);
    await dbConn.commit();
    return res.status(200).json({ success: true, message: "Perfil eliminado con éxito" });
  } catch (error) {
    await dbConn.rollback();
    console.error("Error al eliminar perfil:", error);
    return res.status(500).json({ error: "No se pudo eliminar el perfil" });
  } finally {
    dbConn.release();
  }
};

// --- PARCHE TEMPORAL PARA MÓDULOS ---
export const getModulos = async (req, res) => {
  try { return res.status(200).json({ success: true, data: [] }); } catch (error) { return res.status(500).json({ error: error.message }); }
};
export const getModuloById = async (req, res) => {
  try { return res.status(200).json({ success: true, data: {} }); } catch (error) { return res.status(500).json({ error: error.message }); }
};
export const createModulo = async (req, res) => {
  try { return res.status(201).json({ success: true, message: "Módulo creado" }); } catch (error) { return res.status(500).json({ error: error.message }); }
};
export const updateModulo = async (req, res) => {
  try { return res.status(200).json({ success: true, message: "Módulo actualizado" }); } catch (error) { return res.status(500).json({ error: error.message }); }
};
export const deleteModulo = async (req, res) => {
  try { return res.status(200).json({ success: true, message: "Módulo eliminado" }); } catch (error) { return res.status(500).json({ error: error.message }); }
};

export const obtenerPerfiles = async (req, res) => {
  try {
    const [perfilesRows] = await connection.query("SELECT * FROM perfil");
    const [usuariosPorPerfilRows] = await connection.query(
      `SELECT u.idPerfil, COUNT(*) AS usuarios
       FROM usuario u
       GROUP BY u.idPerfil`
    );

    const usuariosPorPerfilMap = {}
    usuariosPorPerfilRows.forEach((row) => {
      usuariosPorPerfilMap[row.idPerfil] = row.usuarios
    })

    const perfilesCompletos = [];

    for (const perfil of perfilesRows) {
      const [permisosRows] = await connection.query(
        `SELECT p.modulo, p.accion 
         FROM perfilpermiso pp
         INNER JOIN permiso p ON pp.idPermiso = p.idPermiso
         WHERE pp.idPerfil = ?`,
        [perfil.idPerfil]
      );

      const modulosEstructura = {
        dashboard: { activo: false, permisos: { alta: false, baja: false, consulta: false, modificacion: false } },
        usuarios: { activo: false, permisos: { alta: false, baja: false, consulta: false, modificacion: false } },
        clases: { activo: false, permisos: { alta: false, baja: false, consulta: false, modificacion: false } },
        reservas: { activo: false, permisos: { alta: false, baja: false, consulta: false, modificacion: false } },
        creditos: { activo: false, permisos: { alta: false, baja: false, consulta: false, modificacion: false } },
        membresias: { activo: false, permisos: { alta: false, baja: false, consulta: false, modificacion: false } },
        perfiles: { activo: false, permisos: { alta: false, baja: false, consulta: false, modificacion: false } },
        configuracion: { activo: false, permisos: { alta: false, baja: false, consulta: false, modificacion: false } },
        alumno: { activo: false, permisos: { alta: false, baja: false, consulta: false, modificacion: false } },
        alumno_reservas: { activo: false, permisos: { alta: false, baja: false, consulta: false, modificacion: false } },
        alumno_creditos: { activo: false, permisos: { alta: false, baja: false, consulta: false, modificacion: false } },
        profesor: { activo: false, permisos: { alta: false, baja: false, consulta: false, modificacion: false } },
        profesor_rutinas: { activo: false, permisos: { alta: false, baja: false, consulta: false, modificacion: false } },
        profesor_perfil: { activo: false, permisos: { alta: false, baja: false, consulta: false, modificacion: false } }
      };


      if (permisosRows && permisosRows.length > 0) {
        permisosRows.forEach(row => {
          if (row && row.modulo && row.accion) {
            
            const moduloKey = row.modulo.toLowerCase().trim();
            const accionKey = row.accion.toLowerCase().trim();

            if (modulosEstructura[moduloKey]) {
              modulosEstructura[moduloKey].activo = true;
              modulosEstructura[moduloKey].permisos[accionKey] = true;
            }
          }
        });
      }

      perfilesCompletos.push({
        idPerfil: perfil.idPerfil,         
        nombrePerfil: perfil.nombrePerfil, 
        descripcion: perfil.descripcion,   
        usuarios: usuariosPorPerfilMap[perfil.idPerfil] || 0,
        modulos: modulosEstructura
      });
    }

    return res.status(200).json({ success: true, data: perfilesCompletos });

  } catch (error) {
    console.error("Error al obtener perfiles:", error);
    return res.status(500).json({ success: false });
  }
};