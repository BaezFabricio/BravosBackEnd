import connection from "../config/db.js";
import escalada from "../functions/escalada.js";

const { esSuperAdmin, clave, permisosQueNoTiene, ID_PERFIL_SUPERADMIN } = escalada;
const prohibido = (res, mensaje) => res.status(403).json({ success: false, message: mensaje, errorCode: "FORBIDDEN" });

export const guardarPerfilCompleto = async (req, res) => {
  const { nombrePerfil, descripcion, permisos } = req.body;
  // POST solo crea y PUT solo modifica (antes un POST con idPerfil pisaba un perfil existente
  // con apenas el permiso de "alta")
  const isNew = req.method === "POST";
  const idPerfil = isNew ? null : Number(req.body.idPerfil);
  const quien = req.user?.idPerfil;

  if (!isNew && (!Number.isInteger(idPerfil) || idPerfil <= 0)) {
    return res.status(400).json({ success: false, message: "Falta el perfil a modificar.", errorCode: "INVALID_ID" });
  }
  const nombre = String(nombrePerfil || "").trim();
  if (!nombre || nombre.length > 60) {
    return res.status(400).json({ success: false, message: "El nombre del perfil es obligatorio (hasta 60 caracteres).", errorCode: "INVALID_NAME" });
  }
  if (descripcion && String(descripcion).length > 255) {
    return res.status(400).json({ success: false, message: "La descripción puede tener hasta 255 caracteres.", errorCode: "INVALID_DESCRIPTION" });
  }
  // Escalada de privilegios: nadie da permisos que no tiene (tampoco a su propio perfil),
  // y el perfil del administrador general solo lo toca él mismo
  if (!isNew && !esSuperAdmin(quien) && idPerfil === ID_PERFIL_SUPERADMIN) {
    return prohibido(res, "Solo el administrador general puede modificar su perfil.");
  }
  const pedidos = Array.isArray(permisos) ? permisos.map((p) => clave(p.modulo, p.nombreAccion)) : [];
  const faltan = await permisosQueNoTiene(quien, pedidos);
  if (faltan.length) return prohibido(res, "No podés dar permisos que vos no tenés.");
  // Sobre el propio perfil se puede quitar o renombrar, pero no el permiso de editar perfiles:
  // si no, la persona se queda afuera sin querer
  if (!isNew && idPerfil === Number(quien) && !pedidos.includes(clave("perfiles", "modificacion"))) {
    return res.status(400).json({ success: false, message: "No podés quitarle a tu propio perfil el permiso de modificar perfiles.", errorCode: "SELF_LOCKOUT" });
  }

  const dbConn = await connection.getConnection();

  try {
    await dbConn.beginTransaction();
    let currentPerfilId = idPerfil;

    if (isNew) {
      const [perfilResult] = await dbConn.query(
        "INSERT INTO perfil (nombrePerfil, descripcion) VALUES (?, ?)",
        [nombre, descripcion || null]
      );
      currentPerfilId = perfilResult.insertId;
    } else {
      await dbConn.query(
        "UPDATE perfil SET nombrePerfil = ?, descripcion = ? WHERE idPerfil = ?",
        [nombre, descripcion || null, currentPerfilId]
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
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ success: false, message: "Perfil inválido.", errorCode: "INVALID_ID" });
  if (id === ID_PERFIL_SUPERADMIN) return prohibido(res, "El perfil del administrador general no se puede eliminar.");
  if (id === Number(req.user?.idPerfil)) return prohibido(res, "No podés eliminar tu propio perfil.");
  // Si tiene usuarios, quedarían sin acceso: primero hay que pasarlos a otro perfil
  const [[enUso]] = await connection.query("SELECT COUNT(*) AS total FROM usuario WHERE idPerfil = ?", [id]);
  if (Number(enUso.total) > 0) {
    return res.status(409).json({ success: false, message: `Este perfil tiene ${enUso.total} usuario(s). Pasalos a otro perfil antes de eliminarlo.`, errorCode: "PROFILE_IN_USE" });
  }
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