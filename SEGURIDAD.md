# Seguridad del backend — reglas y lista de verificación

Este documento existe porque en septiembre de 2026 una auditoría encontró huecos graves: perfiles y
configuración de la landing (con los datos bancarios) sin ninguna protección, alumnos que podían volverse
administradores, y un endpoint de depuración que exponía DNI, correo y teléfono sin pedir sesión.
Las reglas de abajo evitan que se repitan.

## La regla de oro

**Nunca se confía en el cliente.** Lo que llega del navegador (cuerpo, parámetros, `localStorage`, permisos
guardados en el frontend) es solo una sugerencia. El servidor decide quién es la persona (por el token) y qué
puede hacer (por la base de datos). Ocultar un botón en el frontend NO es una protección.

## Al crear o cambiar una ruta

1. Toda ruta lleva `authenticateToken` **y** un permiso: `requirePermission('modulo', 'accion')`,
   `requireAnyPermission([...])` o `allowSelfOrPermission(...)`.
2. Las únicas excepciones son las de `scripts/auditar-rutas.js` (públicas o de datos propios), cada una con
   su motivo. Agregar una excepción es una decisión consciente, no un atajo.
3. Correr `npm run auditar`. También corre solo antes de cada commit y lo bloquea si falla.

## Lo que el auditor NO puede ver (revisar a mano dentro del controlador)

- [ ] **Identidad**: usar `req.user` (el token), nunca un `idUsuario`/`idAlumno` recibido en el cuerpo o la URL
  para actuar "sobre uno mismo".
- [ ] **Escalada de privilegios**: un usuario editando **su propio** registro no puede cambiar `idPerfil`,
  `estado`, permisos, créditos ni ningún campo de privilegio. Esos campos solo los cambia quien tiene el
  permiso de administrar.
- [ ] **Propiedad (IDOR)**: si la ruta recibe un id (`/:id`), comprobar que ese recurso le pertenece a quien
  consulta, o que tiene el permiso de ver recursos ajenos. Ejemplo pendiente: un profesor solo debería marcar
  asistencia de sus propias clases.
- [ ] **Dinero y precios**: importes, precios y descuentos se calculan en el servidor; nunca se acepta el
  monto que manda el navegador.
- [ ] **Datos que salen**: no devolver más campos de los necesarios (evitar `SELECT *`/`p.*` en respuestas;
  jamás contraseñas, tokens ni códigos).
- [ ] **Archivos**: límite de tamaño, tipos permitidos y quién puede subir.
- [ ] **Rutas de prueba o depuración**: no se dejan en el código, ni siquiera "solo para desarrollo".
- [ ] **Secretos**: nunca en el frontend ni en git (`.env` siempre ignorado).

## Cómo probar una ruta antes de darla por terminada

Probar siempre con tokens de distinta identidad y comprobar el código de respuesta:

| Quién llama | Debe dar |
|---|---|
| Sin sesión | 401 |
| Con sesión pero sin permiso (o de otro rol) | 403 |
| Con el permiso correcto | 200 |
| Con permiso, pero sobre un recurso ajeno | 403 |

Los tokens de prueba se generan con `generateToken({ idUsuario, idPerfil })` (`src/functions/jwt.js`).

## Sesión

El token de sesión viaja en la cookie httpOnly `bravos_token` (`src/functions/sesionCookie.js`); el frontend nunca lo
ve ni lo guarda. `authenticateToken` lee la cookie (y acepta `Authorization: Bearer` para clientes que no son el
navegador). Como el navegador manda la cookie solo, los pedidos que modifican datos con cookie se rechazan si el
encabezado `Origin` no es el del propio sistema (defensa contra CSRF), y la cookie es `SameSite=Lax`.
Todo HTML guardado por usuarios (rutinas, descripciones) se muestra con `sanitizarHtml` en el frontend.

## Pendientes conocidos (ver Linear)

- FAB-71: revisar la matriz de permisos por perfil (el perfil Alumno tiene permisos de profesor).
