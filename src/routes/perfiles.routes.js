import express from 'express';
import { guardarPerfilCompleto, eliminarPerfil, obtenerPerfiles } from '../controllers/perfiles.controller.js';

const router = express.Router();

router.get("/", obtenerPerfiles);         
router.post("/", guardarPerfilCompleto);   
router.put("/", guardarPerfilCompleto);  
router.delete("/:id", eliminarPerfil); 

export default router; 