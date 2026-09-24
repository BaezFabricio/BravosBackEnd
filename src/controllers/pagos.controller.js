const crypto = require('crypto')
const db = require('../config/db')
const { asyncHandler } = require('../utils/helpers')
const { successResponse, errorResponse } = require('../utils/response')
const { crearNotificacion } = require('../functions/notificacion.service')
const { sendPagoConfirmadoEmail } = require('../functions/email.service')

/**
 * Valida que la notificación venga realmente de MercadoPago.
 * Firma HMAC-SHA256 sobre "id:<data.id>;request-id:<x-request-id>;ts:<ts>;".
 * Sin MP_WEBHOOK_SECRET configurado no se puede validar: se deja pasar y se avisa,
 * para no romper el webhook de quien todavía no cargó la clave.
 */
const firmaWebhookValida = (req) => {
  const secret = process.env.MP_WEBHOOK_SECRET
  if (!secret) {
    console.warn('MP_WEBHOOK_SECRET sin configurar: el webhook acepta notificaciones sin validar su origen.')
    return true
  }

  const xSignature = req.headers['x-signature'] || ''
  const xRequestId = req.headers['x-request-id'] || ''
  const dataId     = String(req.query['data.id'] || req.query.id || '').toLowerCase()

  let ts, hash
  for (const parte of xSignature.split(',')) {
    const i = parte.indexOf('=')
    if (i === -1) continue
    const clave = parte.slice(0, i).trim()
    const valor = parte.slice(i + 1).trim()
    if (clave === 'ts') ts = valor
    if (clave === 'v1') hash = valor
  }
  if (!ts || !hash) return false

  const partes = []
  if (dataId)     partes.push(`id:${dataId}`)
  if (xRequestId) partes.push(`request-id:${xRequestId}`)
  partes.push(`ts:${ts}`)
  const manifest = partes.join(';') + ';'

  const calculado = crypto.createHmac('sha256', secret).update(manifest).digest('hex')
  const a = Buffer.from(calculado)
  const b = Buffer.from(hash)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

const getMPClient = () => {
  const { MercadoPagoConfig, Preference, Payment, Order } = require('mercadopago')
  const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN })
  return { client, Preference, Payment, Order }
}

// external_reference de la API de Orders solo admite letras, números, "-" y "_"
// (nada de base64 estándar, que trae "+", "/", "="), y prohíbe datos personales.
const codificarReferenciaOrder = (idAlumno, idPlan) => `alu${idAlumno}-plan${idPlan}-${Date.now()}`
const decodificarReferenciaOrder = (ref) => {
  const m = /^alu(\d+)-plan(\d+)-/.exec(ref || '')
  return m ? { idAlumno: Number(m[1]), idPlan: Number(m[2]) } : null
}

// Nadie puede recibir menos de estos días por el precio completo del plan.
const DIAS_MINIMOS = 10

// Las membresías siempre vencen un día 10. Se toma el próximo 10 posterior a la
// fecha de pago, salvo que queden menos de DIAS_MINIMOS: en ese caso pasa al
// siguiente, para que quien paga justo antes del cierre no pague un mes por unos días.
const proximoDia10 = (desde) => {
  const venc = new Date(desde.getFullYear(), desde.getMonth(), 10)
  if (venc <= desde) venc.setMonth(venc.getMonth() + 1)
  const diasRestantes = (venc - desde) / 86400000
  if (diasRestantes < DIAS_MINIMOS) venc.setMonth(venc.getMonth() + 1)
  return venc
}

const fmtFecha = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/**
 * Último pago confirmado hoy para este alumno + plan, o null si no hay ninguno.
 * Se usa tanto para bloquear un cobro nuevo como para detectar si el que se
 * acaba de confirmar es realmente nuevo (comparando idPago contra un valor base).
 *
 * Si un admin canceló el crédito de ese pago (cancelarAbonoUsuario), no cuenta
 * como bloqueo: cancelar es la señal de "esto no vale, que pueda pagar de nuevo".
 */
const ultimoPagoHoy = async (idAlumno, idPlan) => {
  const [rows] = await db.query(
    `SELECT pg.idPago
      FROM pago pg
      LEFT JOIN credito c ON c.idPago = pg.idPago
      WHERE pg.idAlumno = ? AND pg.idPlan = ? AND pg.estadoPago = 'confirmado' AND pg.fechaPago = CURDATE()
        AND (c.idCredito IS NULL OR c.estado != 'CANCELADO')
      ORDER BY pg.idPago DESC LIMIT 1`,
    [idAlumno, Number(idPlan)]
  )
  return rows[0]?.idPago ?? null
}

/**
 * Crea el abono y los créditos de un pago aprobado.
 * Idempotente por referenciaExterna, porque la invocan dos caminos que pueden
 * solaparse: procesarTarjeta (sincrónico) y el webhook (respaldo).
 * Devuelve true si acreditó, false si ya estaba acreditado o faltan datos.
 */
const acreditarPago = async ({ paymentId, idAlumno, idPlan, importe }) => {
  const [existente] = await db.query('SELECT idPago FROM pago WHERE referenciaExterna = ?', [String(paymentId)])
  if (existente.length > 0) return false

  const [planRows] = await db.query('SELECT * FROM plan WHERE idPlan = ?', [idPlan])
  if (planRows.length === 0) return false
  const plan = planRows[0]

  const [alumnoRows] = await db.query(`
    SELECT a.idAlumno, u.idUsuario, p.correo, p.nombrecompleto
    FROM alumno a
    INNER JOIN persona p ON a.idPersona = p.idPersona
    INNER JOIN usuario u ON p.idPersona = u.idPersona
    WHERE a.idAlumno = ?
  `, [idAlumno])
  if (alumnoRows.length === 0) return false
  const { idUsuario, correo, nombrecompleto } = alumnoRows[0]

  const fechaInicio      = new Date()
  const fechaVencimiento = proximoDia10(fechaInicio)

  // Ambos INSERT van en una transacción: un pago sin su crédito dejaría al alumno
  // pagando sin recibir nada, y el índice único haría que el reintento lo saltee.
  const conn = await db.getConnection()
  try {
    await conn.beginTransaction()

    const [pagoResult] = await conn.query(
      `INSERT INTO pago
        (fechaPago, importe, formaPago, estadoPago, fechaVencimiento, idAlumno, idPlan, referenciaExterna)
       VALUES (?, ?, 'MercadoPago', 'confirmado', ?, ?, ?, ?)`,
      [fmtFecha(fechaInicio), importe, fmtFecha(fechaVencimiento), idAlumno, idPlan, String(paymentId)]
    )

    await conn.query(
      `INSERT INTO credito
        (totalCreditos, creditosCisponibles, creditosUtilizados, fechaInicio, fechaVencimiento, estado, idAlumno, idPago)
       VALUES (?, ?, 0, ?, ?, 'ACTIVO', ?, ?)`,
      [plan.cantidadCreditos, plan.cantidadCreditos, fmtFecha(fechaInicio), fmtFecha(fechaVencimiento), idAlumno, pagoResult.insertId]
    )

    await conn.commit()
  } catch (err) {
    await conn.rollback()
    // El índice único cerró la carrera: el otro camino ya acreditó este pago.
    if (err.code === 'ER_DUP_ENTRY') return false
    throw err
  } finally {
    conn.release()
  }

  crearNotificacion(
    idUsuario, 'credito',
    'Membresía activada',
    `Tu pago por ${plan.nombre} fue confirmado. Ya podés reservar clases.`,
    '/alumno/creditos'
  )

  // Comprobante por correo. Sin await a propósito: el envío SMTP tarda segundos
  // y no debe demorar la respuesta al webhook ni al alumno; además la función
  // ya captura sus propios errores, así que un fallo acá no afecta la acreditación.
  if (correo) {
    sendPagoConfirmadoEmail(correo, nombrecompleto, {
      plan: plan.nombre,
      importe,
      creditos: plan.cantidadCreditos,
      vencimiento: fechaVencimiento,
      referencia: String(paymentId),
    })
  }
  return true
}

/**
 * POST /pagos/crear-preferencia
 * Crea una preferencia de pago en MercadoPago y retorna la URL de checkout.
 */
exports.crearPreferencia = asyncHandler(async (req, res) => {
  const { idPlan } = req.body
  const idAlumno = req.user?.idAlumno

  if (!idAlumno) return errorResponse(res, 'Usuario no identificado como alumno.', 'NO_ALUMNO', 403)
  if (!idPlan)   return errorResponse(res, 'idPlan es requerido.', 'MISSING_FIELDS', 400)

  const [planRows] = await db.query('SELECT * FROM plan WHERE idPlan = ?', [idPlan])
  if (planRows.length === 0) return errorResponse(res, 'Plan no encontrado.', 'NOT_FOUND', 404)

  const plan = planRows[0]

  // Antes de generar el QR: si ya hay un pago confirmado hoy de este plan, no se
  // ofrece un cobro nuevo. Sin esto, cada apertura del modal generaba una
  // preferencia distinta y el QR permitía pagar el mismo plan varias veces por día.
  if (await ultimoPagoHoy(idAlumno, idPlan)) {
    return errorResponse(
      res,
      'Ya registramos un pago de este plan hoy. Si necesitás comprar otro, escribinos.',
      'PAGO_DUPLICADO',
      409
    )
  }

  // El Checkout Pro que abre la app de MP (QR, Mercado Crédito) pide datos del
  // comprador antes de dejar avanzar. Sin esto, MP puede frenar con un error
  // de "datos incompletos" antes de mostrar el medio de pago.
  const [alumnoRows] = await db.query(`
    SELECT p.correo, p.nombrecompleto
    FROM alumno a
    INNER JOIN persona p ON a.idPersona = p.idPersona
    WHERE a.idAlumno = ?
  `, [idAlumno])
  const [nombre, ...apellido] = (alumnoRows[0]?.nombrecompleto || '').split(' ')

  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173'
  const backendUrl  = process.env.BACKEND_URL  || 'http://localhost:3000'

  const { client, Preference, Order } = getMPClient()
  const preferenceClient = new Preference(client)

  const preference = await preferenceClient.create({
    body: {
      items: [{
        title: `${plan.nombre} — Bravos Box`,
        unit_price: Number(plan.precio),
        quantity: 1,
        currency_id: 'ARS',
      }],
      payer: alumnoRows[0]?.correo ? {
        email: alumnoRows[0].correo,
        name: nombre || undefined,
        surname: apellido.join(' ') || undefined,
      } : undefined,
      external_reference: Buffer.from(JSON.stringify({ idAlumno, idPlan: Number(idPlan) })).toString('base64'),
      back_urls: {
        success: `${frontendUrl}/alumno/pago-exitoso`,
        failure: `${frontendUrl}/alumno/pago-fallido`,
        pending: `${frontendUrl}/alumno/pago-pendiente`,
      },
      notification_url: `${backendUrl}/api/vv1/pagos/webhook`,
    }
  })

  // QR interoperable (Transferencias 3.0): a diferencia del link de arriba, este
  // QR lo puede pagar cualquier billetera (ARQ, Naranja X, Ualá, MP...) escaneando
  // con su propia app, no solo con la cámara. Si falla, no rompe el pago: el
  // alumno sigue teniendo el link/preferencia de siempre.
  let qrData = null
  if (process.env.MP_POS_EXTERNAL_ID) {
    try {
      const orderClient = new Order(client)
      const order = await orderClient.create({
        body: {
          type: 'qr',
          external_reference: codificarReferenciaOrder(idAlumno, idPlan),
          total_amount: Number(plan.precio).toFixed(2),
          description: `${plan.nombre} — Bravos Box`,
          items: [{
            title: plan.nombre,
            unit_price: Number(plan.precio).toFixed(2),
            quantity: 1,
            unit_measure: 'unit',
          }],
          transactions: { payments: [{ amount: Number(plan.precio).toFixed(2) }] },
          config: { qr: { mode: 'dynamic', external_pos_id: process.env.MP_POS_EXTERNAL_ID } },
        },
        requestOptions: { idempotencyKey: `qr-${idAlumno}-${idPlan}-${Date.now()}` },
      })
      qrData = order.type_response?.qr_data || null
    } catch (err) {
      console.error('No se pudo generar el QR interoperable, se sigue con el link normal:', err?.message || err)
    }
  }

  return successResponse(res, 'Preferencia creada correctamente.', {
    id: preference.id,
    init_point: preference.init_point,
    sandbox_init_point: preference.sandbox_init_point,
    qrData,
  })
})

/**
 * GET /pagos/estado/:idPlan
 * El modal de pago hace polling acá mientras espera un cobro que se confirma
 * afuera del navegador — QR pagado desde el celular, Mercado Crédito por redirect.
 */
exports.estadoPago = asyncHandler(async (req, res) => {
  // Sin esto, el navegador cachea el primer 200 y le sigue devolviendo esa misma
  // respuesta vieja al polling (visible como 304 en Network), aunque en la base
  // ya haya un pago nuevo: el modal nunca se entera de que se confirmó.
  res.set('Cache-Control', 'no-store')

  const { idPlan } = req.params
  const idAlumno = req.user?.idAlumno
  if (!idAlumno) return errorResponse(res, 'Usuario no identificado como alumno.', 'NO_ALUMNO', 403)

  // Se devuelve el idPago, no solo un booleano: un pago de más temprano hoy
  // (o uno que quedó de una prueba) no debe confundirse con uno recién hecho.
  // El que pregunta compara este id contra el que tenía al abrir el modal.
  const idPago = await ultimoPagoHoy(idAlumno, idPlan)
  return successResponse(res, 'ok', { idPago })
})

/**
 * POST /pagos/webhook
 * Recibe las notificaciones de MercadoPago y crea el abono automáticamente.
 * Responde 200 inmediatamente (MP requiere respuesta rápida).
 */
exports.webhook = async (req, res) => {
  if (!firmaWebhookValida(req)) {
    console.warn('Webhook con firma inválida, descartado.')
    return res.status(401).json({ ok: false })
  }

  // MP espera el 200 dentro de 22s, así que se responde antes de procesar.
  res.status(200).json({ ok: true })

  const topic = req.query.topic || req.body?.type
  const id    = req.query.id    || req.query['data.id'] || req.body?.data?.id

  // QR interoperable: la notificación viene con todo el estado de la order en
  // el body, no hace falta una consulta extra a MP para saber si se acreditó.
  if (topic === 'order') {
    try {
      const order = req.body?.data
      if (!order || order.status !== 'processed') return

      const refInfo = decodificarReferenciaOrder(order.external_reference)
      if (!refInfo) return

      const pagoTx = order.transactions?.payments?.[0]
      await acreditarPago({
        paymentId: order.id,
        idAlumno: refInfo.idAlumno,
        idPlan: refInfo.idPlan,
        importe: Number(order.total_paid_amount || order.total_amount || pagoTx?.amount || 0),
      })
    } catch (err) {
      console.error('Webhook order MP error:', err?.message || err)
    }
    return
  }

  if ((topic !== 'payment' && topic !== 'payment.created') || !id) return

  try {
    const { client, Payment } = getMPClient()
    const paymentClient = new Payment(client)
    const payment = await paymentClient.get({ id })

    if (payment.status !== 'approved') return

    const { idAlumno, idPlan } = JSON.parse(Buffer.from(payment.external_reference || 'e30=', 'base64').toString())
    if (!idAlumno || !idPlan) return

    await acreditarPago({
      paymentId: payment.id,
      idAlumno,
      idPlan,
      importe: payment.transaction_amount,
    })
  } catch (err) {
    console.error('Webhook MP error:', err?.message || err)
  }
}

/**
 * POST /pagos/procesar-tarjeta
 * Recibe el token de tarjeta del Payment Brick y procesa el pago.
 */
exports.procesarTarjeta = asyncHandler(async (req, res) => {
  const { formData, idPlan } = req.body
  const idAlumno = req.user?.idAlumno

  if (!idAlumno) return errorResponse(res, 'Usuario no identificado como alumno.', 'NO_ALUMNO', 403)
  if (!formData || !idPlan) return errorResponse(res, 'Datos incompletos.', 'MISSING_FIELDS', 400)

  const [planRows] = await db.query('SELECT * FROM plan WHERE idPlan = ?', [idPlan])
  if (planRows.length === 0) return errorResponse(res, 'Plan no encontrado.', 'NOT_FOUND', 404)
  const plan = planRows[0]

  // Corta el caso de dos pestañas: ni la guarda del botón ni la idempotencia de MP
  // alcanzan ahí, porque son dos tokens distintos y por lo tanto dos cobros válidos.
  if (await ultimoPagoHoy(idAlumno, idPlan)) {
    return errorResponse(
      res,
      'Ya registramos un pago de este plan hoy. Si necesitás comprar otro, escribinos.',
      'PAGO_DUPLICADO',
      409
    )
  }

  const { client, Payment } = getMPClient()
  const paymentClient = new Payment(client)

  // Solo los campos que el Brick necesita para cobrar. El resto del formData que
  // manda el cliente no viaja a MP: el precio sale de la base, no del navegador.
  const datosTarjeta = {
    token:             formData.token,
    payment_method_id: formData.payment_method_id,
    issuer_id:         formData.issuer_id,
    installments:      Number(formData.installments) || 1,
    payer: {
      email: formData?.payer?.email,
      identification: formData?.payer?.identification,
    },
  }

  // El token de tarjeta es único por cada carga de datos y de un solo uso, así que
  // sirve de clave de idempotencia: si el mismo request se reenvía (reintento de red,
  // doble submit), MP devuelve el resultado original en vez de cobrar de nuevo.
  const payment = await paymentClient.create({
    body: {
      ...datosTarjeta,
      transaction_amount: Number(plan.precio),
      description: `${plan.nombre} — Bravos Box`,
      external_reference: Buffer.from(JSON.stringify({ idAlumno, idPlan: Number(idPlan) })).toString('base64'),
      notification_url: `${process.env.BACKEND_URL}/api/vv1/pagos/webhook`,
    },
    requestOptions: formData?.token
      ? { idempotencyKey: `pago-${idAlumno}-${formData.token}` }
      : undefined,
  })

  if (payment.status === 'approved') {
    // Se acredita acá mismo para no depender de que llegue el webhook.
    // Si falla, el pago ya está cobrado igual: se responde OK y el webhook reintenta.
    try {
      await acreditarPago({
        paymentId: payment.id,
        idAlumno,
        idPlan: Number(idPlan),
        importe: payment.transaction_amount,
      })
    } catch (err) {
      console.error('No se pudo acreditar el pago, el webhook reintentará:', err?.message || err)
    }
  }

  if (payment.status === 'approved' || payment.status === 'in_process' || payment.status === 'pending') {
    return successResponse(res, 'Pago procesado.', { status: payment.status, id: payment.id })
  }

  return errorResponse(res, payment.status_detail || 'Pago rechazado.', 'PAYMENT_REJECTED', 400)
})

const DIAS_POR_VENCER = 7

/**
 * GET /pagos/mi-plan
 * Planes vigentes del alumno (cada compra tiene su propio crédito y su propio
 * vencimiento, así que puede haber más de uno), totales sumados y datos para
 * decidir si mostrar "Pagar el mes": si está por vencer o ya venció, y cuál fue
 * el último plan que pagó.
 */
exports.miPlan = asyncHandler(async (req, res) => {
  res.set('Cache-Control', 'no-store')
  const idUsuario = req.user.idUsuario

  const [vigentes] = await db.query(
    `SELECT c.idCredito, c.totalCreditos, c.creditosCisponibles AS disponibles,
            c.creditosUtilizados AS utilizados,
            DATE_FORMAT(c.fechaVencimiento, '%Y-%m-%d') AS fechaVencimiento,
            DATEDIFF(c.fechaVencimiento, CURDATE()) AS diasRestantes,
            pl.idPlan, pl.nombre AS nombrePlan, pl.precio
     FROM credito c
     INNER JOIN alumno a ON c.idAlumno = a.idAlumno
     INNER JOIN usuario u ON a.idPersona = u.idPersona
     INNER JOIN pago p ON c.idPago = p.idPago
     INNER JOIN plan pl ON p.idPlan = pl.idPlan
     WHERE u.idUsuario = ? AND c.estado = 'ACTIVO' AND c.fechaVencimiento >= CURDATE()
     ORDER BY c.fechaVencimiento ASC, c.idCredito ASC`,
    [idUsuario]
  )

  const [ultimo] = await db.query(
    `SELECT pl.idPlan, pl.nombre AS nombrePlan, pl.precio
     FROM pago pg
     INNER JOIN alumno a ON pg.idAlumno = a.idAlumno
     INNER JOIN usuario u ON a.idPersona = u.idPersona
     INNER JOIN plan pl ON pg.idPlan = pl.idPlan
     WHERE u.idUsuario = ? AND pg.estadoPago = 'confirmado'
     ORDER BY pg.idPago DESC LIMIT 1`,
    [idUsuario]
  )

  const planes = vigentes.map((v) => ({
    ...v,
    precio: Number(v.precio),
    diasRestantes: Number(v.diasRestantes),
  }))
  const diasMin = planes.length ? Math.min(...planes.map((p) => p.diasRestantes)) : null

  return successResponse(res, 'Plan obtenido', {
    planes,
    totalDisponibles: planes.reduce((acc, p) => acc + p.disponibles, 0),
    totalCreditos: planes.reduce((acc, p) => acc + p.totalCreditos, 0),
    proximoVencimiento: planes[0]?.fechaVencimiento ?? null,
    vigente: planes.length > 0,
    porVencer: planes.length > 0 && diasMin <= DIAS_POR_VENCER,
    ultimoPlan: ultimo[0] ? { ...ultimo[0], precio: Number(ultimo[0].precio) } : null,
  })
})

/**
 * GET /pagos/planes
 * Retorna los planes activos (sin auth, para que el alumno los vea antes de pagar).
 */
exports.getPlanes = asyncHandler(async (req, res) => {
  const [planes] = await db.query('SELECT idPlan, nombre, descripcion, precio, cantidadCreditos, tipo FROM plan ORDER BY precio ASC')

  // "Más popular" = el plan con más compras confirmadas. Este endpoint es público:
  // se expone solo el marcador, no las cantidades de ventas.
  const [ventas] = await db.query(
    `SELECT idPlan, COUNT(*) AS total
       FROM pago
      WHERE estadoPago = 'confirmado'
      GROUP BY idPlan
      ORDER BY total DESC, idPlan ASC
      LIMIT 1`
  )
  const idMasPopular = ventas[0]?.total > 0 ? ventas[0].idPlan : null

  return successResponse(
    res,
    'Planes obtenidos correctamente',
    planes.map((p) => ({ ...p, masPopular: p.idPlan === idMasPopular }))
  )
})
