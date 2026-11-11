/**
 * Base de conocimiento del asistente (Bravo / Milo).
 *
 * Es lo ÚNICO que el modelo sabe del sistema: si algo no está acá, el asistente debe decir que no lo sabe
 * y derivar a recepción. Mantenerlo al día cuando cambien las reglas (créditos, pagos, vencimientos...).
 * No poner acá datos de personas, claves ni nada secreto: este texto viaja a Google en cada consulta.
 */

const COMUN = `
Bravos Box es un box de CrossFit en Formosa (Eva Perón 552). El sistema es una web instalable (app) con tres paneles: Alumno, Profesor y Administrador.
Cada persona ve solo los paneles y módulos para los que su perfil tiene permiso (el sistema usa perfiles con permisos, no roles fijos).
Arriba a la derecha hay una campanita con los avisos del sistema, el botón de modo claro/oscuro y el menú de usuario con la foto.
Si alguien olvidó la contraseña: en la pantalla de inicio de sesión, "¿La olvidaste?", escribe su correo y le llega un enlace para crear una nueva (revisar spam).
Para hablar con una persona: recepción del box o WhatsApp del gimnasio (los datos están en la página de inicio).
`.trim();

const ALUMNO = `
PANEL DEL ALUMNO (menú): Inicio, Reservar clase, Mis reservas, Mis créditos, Mi membresía, Documentos y comprobantes, Mis RM, Calculadora RM, Logros, Novedades, Mi perfil.

CRÉDITOS Y MEMBRESÍA
- Una membresía (plan) trae una cantidad de créditos y vence junto con sus créditos: los créditos que sobran NO pasan al mes siguiente.
- Todas las membresías vencen el día 10 de cada mes. Si se paga cuando faltan menos de 10 días para ese 10, el vencimiento pasa al 10 del mes siguiente (para no pagar un mes entero por pocos días).
- Hay DOS tipos de plan:
  1) Plan SIN cupo semanal: se descuenta 1 crédito por cada día de apertura del box (lunes a viernes), aunque la persona no reserve ni venga. Los domingos no se descuenta. Los sábados solo se descuenta al plan Planificación Atleta; a los demás planes no. Si reservó una clase ese día, el crédito de ese día se cobra con la reserva (nunca se cobra dos veces el mismo día).
  2) Plan CON créditos por semana (por ejemplo el de 3 días por semana): cada semana hay una cantidad fija de clases y las reservas la consumen. Cancelar una reserva en este tipo de plan nunca devuelve el crédito.
- Si una persona viaja o no va a entrenar y su plan es SIN cupo semanal, igual se le descuenta 1 crédito por cada día de apertura mientras su membresía esté vigente; los créditos siguen venciendo en la fecha de vencimiento. Usá los datos reales de la persona para calcular un ejemplo concreto (créditos disponibles y fecha de vencimiento).
- El sistema NO tiene una función para pausar o congelar la membresía por viaje, lesión o enfermedad. Si preguntan si se puede, decí que eso lo define el box y que lo consulten en recepción. No prometas nada.
- Tampoco está definida la política de devolución de dinero ni de cambios de plan fuera de lo que figura acá: derivar a recepción.

RESERVAS
- Para reservar: "Reservar clase" → elegir día y horario (se ve el profesor y los cupos que quedan) → "Reservar" y confirmar. Hace falta una membresía vigente con créditos. Si la clase está completa no se puede reservar.
- Para cancelar: "Mis reservas" → clase → "Cancelar reserva". Con más de 2 horas de anticipación se devuelve el crédito de esa reserva (solo en planes sin cupo semanal); con menos de 2 horas NO se devuelve. Cancelar libera el cupo para otra persona. Cancelar no evita que ese día de apertura cuente en el descuento diario del plan sin cupo semanal.
- Si reservó y no asiste, el profesor lo marca ausente y el crédito no se devuelve.
- Causas comunes de "no me deja reservar": sin membresía vigente, sin créditos, clase completa, horario que ya pasó o está por comenzar, ya tiene reserva en esa clase, o el perfil no tiene permiso para esa sección.
- La rutina de una clase se ve en "Mis reservas" → "Ver rutina del día". Si dice que no tiene rutina asignada, el profesor todavía no la cargó.

PAGOS
- Para pagar o renovar: "Mi membresía" → "Renovar membresía" (o "Contratar otra membresía"; los créditos de otra membresía se SUMAN a los que ya tiene) → se abre la ventana de pago con el importe y vencimiento.
- Medios: tarjeta de crédito o débito, Mercado Crédito (cuotas sin tarjeta), código QR (billeteras como Mercado Pago, Naranja X, Ualá, ARQ), transferencia bancaria (se sube el comprobante en "Documentos y comprobantes" y un administrador lo aprueba) y efectivo en recepción (el administrador carga la membresía).
- Tarjeta, Mercado Crédito y QR se acreditan solos en segundos y llega un correo con el comprobante. Transferencia y efectivo demoran hasta que un administrador los apruebe o cargue.
- Si pagó y no se acreditó: esperar unos minutos y recargar; mirar la campanita y el correo; si fue transferencia o efectivo, no es automático; si pasó más de una hora, ir a recepción con el comprobante.

DOCUMENTOS
- En "Documentos y comprobantes" se suben: comprobante de transferencia, certificado médico y declaración jurada/contrato firmado. PDF, JPG o PNG de hasta 10 MB. Quedan "En revisión" hasta que un administrador los aprueba.

OTRAS SECCIONES
- Mis RM: se carga el RM (máximo en una repetición) de cada ejercicio; hay ranking del box. La Calculadora RM estima el 1RM a partir de peso y repeticiones (mejor hasta unas 10 repeticiones).
- Logros: se desbloquean solos (Primera clase, Racha de 5 días, Primer PR, Superándote, Todoterreno, Club de los 100).
- Mi perfil: datos personales, foto y estado de la cuenta y la membresía.
- Corrección de técnica o dolores/lesiones: el asistente no puede hacerlo; derivar al profesor en la clase.
`.trim();

const ADMIN = `
PANEL DE ADMINISTRACIÓN (menú): Resumen, Usuarios y Abonos, Clases, Planes, Reportes, Check-in, Novedades, Ejercicios del RM, Avisos WhatsApp, Perfiles, Configuración del Box. Cada administrador ve solo los módulos que su perfil permite.

USUARIOS Y ABONOS
- "Usuarios y Abonos" lista a todas las personas: se puede crear un usuario nuevo, abrir su ficha (detalle y abonos), editar sus datos y su perfil de acceso, y exportar el listado a Excel.
- Cargar un abono: "Usuarios y Abonos" → "Gestión de Abonos" (nueva carga): elegir al alumno, plan, créditos, horario (opcional), fecha de inicio, método de pago y monto. El vencimiento se calcula solo (día 10). Se pueden agregar varias filas y "Guardar todo".
- Con método "Transferencia" aparecen los comprobantes que el alumno subió. Para aprobarlos: en la tabla "Membresías" de Gestión de Abonos, elegir el mes, abrir la lista de comprobantes de la fila, revisar el archivo y tocar "Aprobar".
- Cancelar un abono: ícono de papelera en la fila (el lápiz edita). Al cancelar, el crédito de ese pago deja de valer y el pago deja de contar para el bloqueo de pagos repetidos el mismo día.
- Los pagos por tarjeta, Mercado Crédito y QR se acreditan solos desde Mercado Pago (con protección para que un pago no se acredite dos veces); los de transferencia y efectivo los carga o aprueba el administrador.

REGLAS DE CRÉDITOS (para explicarlas)
- Planes sin cupo semanal: se descuenta 1 crédito por día de apertura (lunes a viernes) aunque el alumno no reserve; domingos no; sábados solo el plan Planificación Atleta. Si reserva ese día, el crédito de ese día se cobra con la reserva.
- Planes con créditos por semana: las reservas consumen el cupo semanal y cancelar nunca devuelve crédito.
- Cancelación de reserva: más de 2 horas antes devuelve el crédito (plan sin cupo semanal); menos de 2 horas no. El ausente no recupera el crédito.
- Todas las membresías vencen el día 10 de cada mes (si se paga con menos de 10 días para el 10, vence el 10 del mes siguiente).

CLASES, PLANES Y OTROS MÓDULOS
- Clases: crear una clase nueva (nombre, días y horarios, cupos, profesor), editarla, ver turnos y reservas. Una clase puede vincularse a un plan para que solo lo reserven alumnos de ese plan.
- Planes: nombre, precio y cantidad de créditos; se reflejan en "Mi membresía" de los alumnos. El plan más comprado se marca solo como "más popular".
- Reportes: análisis detallado y exportación a Excel. El Resumen muestra usuarios totales y activos, ingresos del mes y membresías que vencen en los próximos 7 días.
- Novedades: anuncios que ven los alumnos (tipo, color, foto, fechas de vigencia). Avisos WhatsApp: avisos a alumnos por WhatsApp. Check-in: asistencia en el box. Ejercicios del RM: ejercicios disponibles para cargar marcas.
- Perfiles: se crea un perfil, se marcan los permisos módulo por módulo y se asigna a los usuarios desde "Usuarios y Abonos". "Acceso denegado por permisos insuficientes" significa que falta activar ese permiso en el perfil de la persona.
- Configuración del Box: datos que se muestran en el sitio y en los pagos por transferencia (banco, titular, CUIT, CBU/CVU, alias). Mantenerlos al día.
`.trim();

// Rutas que el asistente puede ofrecer como botón (el servidor descarta cualquier otra)
const ENLACES = {
  alumno: {
    '/alumno/reservar': 'Ir a Reservar Clase',
    '/alumno/reservas': 'Ver Mis Reservas',
    '/alumno/plan': 'Ir a Mi Membresía',
    '/alumno/creditos': 'Ver Mis Créditos',
    '/alumno/marcas': 'Ir a Mis RM',
    '/alumno/calculadora-rm': 'Abrir la Calculadora RM',
    '/alumno/documentacion': 'Ir a Documentos y Comprobantes',
    '/alumno/perfil': 'Ir a Mi Perfil',
    '/alumno/novedades': 'Ver las novedades',
  },
  admin: {
    '/admin': 'Ir al Resumen',
    '/admin/usuarios': 'Ir a Usuarios y Abonos',
    '/admin/usuarios/abonos/carga-masiva': 'Ir a Gestión de Abonos',
    '/admin/clases': 'Ir a Clases',
    '/admin/clases/nueva': 'Crear una clase',
    '/admin/planes': 'Ir a Planes',
    '/admin/reportes': 'Ir a Reportes',
    '/admin/perfiles': 'Ir a Perfiles',
    '/admin/configuracion': 'Ir a Configuración',
    '/admin/novedades': 'Ir a Novedades',
    '/admin/avisos': 'Ir a Avisos WhatsApp',
    '/admin/check-in': 'Ir a Check-in',
  },
};

function conocimientoDe(panel) {
  return `${COMUN}\n\n${panel === 'admin' ? ADMIN : ALUMNO}`;
}

module.exports = { conocimientoDe, ENLACES };
