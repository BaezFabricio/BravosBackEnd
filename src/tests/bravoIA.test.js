const { pareceDelTema } = require('../functions/bravoIA/filtroTema');
const { interpretarRespuesta, instrucciones, limpiarFormato } = require('../functions/bravoIA/prompt');
const { ENLACES } = require('../functions/bravoIA/conocimiento');

describe('filtro de tema (sin gastar tokens)', () => {
  test.each([
    '¿Cuántos créditos me quedan?',
    'qué pasa si me voy de viaje',
    'no puedo reservar',
    'Cómo cargo un abono',
    'cuanto sale el plan',
    'me lesioné y no puedo ir',
    'cuándo vence mi cuota',
    'qué es mi PR',
  ])('deja pasar: %s', (p) => expect(pareceDelTema(p)).toBe(true));

  test.each([
    'quién ganó el mundial',
    'escribime un poema',
    'cómo se hace una milanesa',
    'qué hora es en Tokio',
  ])('no reconoce: %s', (p) => expect(pareceDelTema(p)).toBe(false));
});

describe('interpretar la respuesta del modelo', () => {
  test('reconoce la marca de fuera de tema', () => {
    expect(interpretarRespuesta('[FUERA_DE_TEMA]', 'alumno')).toEqual({ fueraDeTema: true });
  });

  test('saca los enlaces y solo acepta rutas de la lista del panel', () => {
    const r = interpretarRespuesta('Entrá a tus reservas.\nENLACES: /alumno/reservas, /admin/usuarios, /alumno/plan', 'alumno');
    expect(r.texto).toBe('Entrá a tus reservas.');
    expect(r.enlaces).toEqual([
      { texto: ENLACES.alumno['/alumno/reservas'], ruta: '/alumno/reservas' },
      { texto: ENLACES.alumno['/alumno/plan'], ruta: '/alumno/plan' },
    ]);
  });

  test('un alumno nunca recibe rutas de admin', () => {
    const r = interpretarRespuesta('Hola\nENLACES: /admin, /admin/usuarios', 'alumno');
    expect(r.enlaces).toEqual([]);
  });

  test('máximo dos enlaces', () => {
    const r = interpretarRespuesta('Hola\nENLACES: /alumno/reservas, /alumno/plan, /alumno/creditos', 'alumno');
    expect(r.enlaces).toHaveLength(2);
  });

  test('limpia el Markdown', () => {
    expect(limpiarFormato('**Hola** __che__\n* uno\n- dos\n# Título')).toBe('Hola che\n• uno\n• dos\nTítulo');
  });
});

describe('instrucciones', () => {
  test('el alumno lleva sus datos y la regla de solo lectura', () => {
    const t = instrucciones({ panel: 'alumno', mascota: 'Bravo', datosPersona: { nombrePila: 'Ana' } });
    expect(t).toContain('"nombrePila":"Ana"');
    expect(t).toContain('Vos solo leés');
    expect(t).toContain('Sos Bravo');
  });

  test('el admin no recibe datos de personas', () => {
    const t = instrucciones({ panel: 'admin', mascota: 'Milo', datosPersona: null });
    expect(t).not.toContain('nombrePila');
    expect(t).toContain('no tenés acceso a datos de personas');
  });
});
