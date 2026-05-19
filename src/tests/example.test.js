/**
 * Tests de ejemplo
 * Usar Jest o Mocha para testing real
 */

// Ejemplo de test structure
const testUsers = [
  {
    nombre: 'Test Usuario',
    endpoint: '/api/v1/auth/registro',
    method: 'POST',
    body: {
      nombrecompleto: 'Juan Pérez',
      dni: '12345678',
      correo: 'juan@test.com',
      username: 'juanperez',
      password: 'password123',
      idPerfil: 2,
    },
    expectedStatus: 201,
  },
];

module.exports = {
  testUsers,
};
