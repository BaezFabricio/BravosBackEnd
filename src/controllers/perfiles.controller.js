const db = require('../config/db');
const obtenerPerfiles = require('../data/Perfil/ObtenerPerfiles');
const obtenerPerfilPorId = require('../data/Perfil/ObtenerPerfilPorId');
const insertarPerfil = require('../data/Perfil/InsertarPerfil');
const actualizarPerfil = require('../data/Perfil/ActualizarPerfil');
const eliminarPerfil = require('../data/Perfil/EliminarPerfil');
const obtenerModulos = require('../data/Modulos/ObtenerModulos');
const obtenerModuloPorId = require('../data/Modulos/ObtenerModuloPorId');
const insertarModulo = require('../data/Modulos/InsertarModulo');
const actualizarModulo = require('../data/Modulos/ActualizarModulo');
const eliminarModulo = require('../data/Modulos/EliminarModulo');
const asignarPermisosPerfilModulo = require('../data/Perfil/AsignarPermisosPerfilModulo');
const obtenerPermisosPorPerfil = require('../data/Perfil/ObtenerPermisosPorPerfil');
const eliminarPermisosPerfilModulo = require('../data/Perfil/EliminarPermisosPerfilModulo');
const { asyncHandler } = require('../utils/helpers');
const { successResponse, errorResponse } = require('../utils/response');

exports.getAll = asyncHandler(async (req, res) => {
  const [perfiles] = await db.query(obtenerPerfiles);
  return successResponse(res, 'Perfiles obtenidos correctamente', perfiles);
});

exports.getById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const [perfiles] = await db.query(obtenerPerfilPorId, [id]);

  if (perfiles.length === 0) {
    return errorResponse(res, 'Perfil no encontrado', 'PROFILE_NOT_FOUND', 404);
  }

  return successResponse(res, 'Perfil obtenido correctamente', perfiles[0]);
});

exports.create = asyncHandler(async (req, res) => {
  const { nombrePerfil } = req.body;

  if (!nombrePerfil) {
    return errorResponse(res, 'El nombre del perfil es requerido', 'INVALID_PROFILE', 400);
  }

  const [resultado] = await db.query(insertarPerfil, [nombrePerfil]);

  return successResponse(res, 'Perfil creado exitosamente', {
    idPerfil: resultado.insertId,
    nombrePerfil,
  }, 201);
});

exports.update = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { nombrePerfil } = req.body;

  if (!nombrePerfil) {
    return errorResponse(res, 'El nombre del perfil es requerido', 'INVALID_PROFILE', 400);
  }

  const [perfilExistente] = await db.query(obtenerPerfilPorId, [id]);
  if (perfilExistente.length === 0) {
    return errorResponse(res, 'Perfil no encontrado', 'PROFILE_NOT_FOUND', 404);
  }

  await db.query(actualizarPerfil, [nombrePerfil, id]);

  const [perfilActualizado] = await db.query(obtenerPerfilPorId, [id]);
  return successResponse(res, 'Perfil actualizado exitosamente', perfilActualizado[0]);
});

exports.delete = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const [perfilExistente] = await db.query(obtenerPerfilPorId, [id]);
  if (perfilExistente.length === 0) {
    return errorResponse(res, 'Perfil no encontrado', 'PROFILE_NOT_FOUND', 404);
  }

  await db.query(eliminarPerfil, [id]);
  return successResponse(res, 'Perfil eliminado exitosamente', { idPerfil: id });
});

exports.getModulos = asyncHandler(async (req, res) => {
  const [modulos] = await db.query(obtenerModulos);
  return successResponse(res, 'Módulos obtenidos correctamente', modulos);
});

exports.getModuloById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const [modulos] = await db.query(obtenerModuloPorId, [id]);

  if (modulos.length === 0) {
    return errorResponse(res, 'Módulo no encontrado', 'MODULE_NOT_FOUND', 404);
  }

  return successResponse(res, 'Módulo obtenido correctamente', modulos[0]);
});

exports.createModulo = asyncHandler(async (req, res) => {
  const { nombreModulo, descripcion } = req.body;

  if (!nombreModulo) {
    return errorResponse(res, 'El nombre del módulo es requerido', 'INVALID_MODULE', 400);
  }

  const [resultado] = await db.query(insertarModulo, [nombreModulo, descripcion || null]);

  return successResponse(res, 'Módulo creado exitosamente', {
    idModulo: resultado.insertId,
    nombreModulo,
    descripcion: descripcion || null,
  }, 201);
});

exports.updateModulo = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { nombreModulo, descripcion } = req.body;

  if (!nombreModulo) {
    return errorResponse(res, 'El nombre del módulo es requerido', 'INVALID_MODULE', 400);
  }

  const [moduloExistente] = await db.query(obtenerModuloPorId, [id]);
  if (moduloExistente.length === 0) {
    return errorResponse(res, 'Módulo no encontrado', 'MODULE_NOT_FOUND', 404);
  }

  await db.query(actualizarModulo, [nombreModulo, descripcion || null, id]);

  const [moduloActualizado] = await db.query(obtenerModuloPorId, [id]);
  return successResponse(res, 'Módulo actualizado exitosamente', moduloActualizado[0]);
});

exports.deleteModulo = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const [moduloExistente] = await db.query(obtenerModuloPorId, [id]);
  if (moduloExistente.length === 0) {
    return errorResponse(res, 'Módulo no encontrado', 'MODULE_NOT_FOUND', 404);
  }

  await db.query(eliminarModulo, [id]);
  return successResponse(res, 'Módulo eliminado exitosamente', { idModulo: id });
});

exports.getPermisosByPerfil = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const [permisos] = await db.query(obtenerPermisosPorPerfil, [id]);
  return successResponse(res, 'Permisos obtenidos correctamente', permisos);
});

exports.asignarPermisos = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { idModulo, permiso_alta, permiso_baja, permiso_modificacion, permiso_consulta } = req.body;

  if (!idModulo) {
    return errorResponse(res, 'El módulo es requerido', 'INVALID_PERMISSION', 400);
  }

  await db.query(asignarPermisosPerfilModulo, [
    id,
    idModulo,
    permiso_alta ? 1 : 0,
    permiso_baja ? 1 : 0,
    permiso_modificacion ? 1 : 0,
    permiso_consulta ? 1 : 0,
  ]);

  const [permisos] = await db.query(obtenerPermisosPorPerfil, [id]);
  return successResponse(res, 'Permisos asignados correctamente', permisos);
});

exports.eliminarPermisos = asyncHandler(async (req, res) => {
  const { id, idModulo } = req.params;

  await db.query(eliminarPermisosPerfilModulo, [id, idModulo]);
  return successResponse(res, 'Permisos eliminados correctamente', { idPerfil: id, idModulo });
});
