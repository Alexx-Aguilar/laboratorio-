const test = require('node:test');
const assert = require('node:assert/strict');
const { Pedido, ZonaCobertura, EvaluadorPedidos } = require('../src/logica');

const pedido = (overrides = {}) =>
  new Pedido({
    cliente: 'Ana Rojas',
    ip: '8.8.8.8',
    productos: [{ nombre: 'Camiseta', cantidad: 2, precio: 8000 }],
    ...overrides,
  });

const ubicacion = (regionName, countryCode = 'CR') => ({
  status: 'success',
  country: countryCode === 'CR' ? 'Costa Rica' : 'United States',
  countryCode,
  regionName,
  city: 'Ciudad',
});

test('acepta pedidos ubicados en San Jose y calcula envio', () => {
  const resultado = EvaluadorPedidos.evaluar(pedido(), ubicacion('San José Province'));

  assert.equal(resultado.estado, 'aceptado');
  assert.equal(resultado.costoEnvio, 2500);
  assert.equal(resultado.total, 18500);
});

test('acepta la provincia San Jose sin tilde despues de normalizar', () => {
  assert.equal(new ZonaCobertura(ubicacion('San Jose')).estaEnCobertura(), true);
});

test('rechaza pedidos de otras provincias y paises', () => {
  assert.equal(EvaluadorPedidos.evaluar(pedido(), ubicacion('Heredia')).estado, 'rechazado');
  assert.equal(EvaluadorPedidos.evaluar(pedido(), ubicacion('California', 'US')).estado, 'rechazado');
});

test('aplica envio gratis desde ₡50 000', () => {
  const pedidoGrande = pedido({
    productos: [{ nombre: 'Zapatos', cantidad: 2, precio: 25000 }],
  });
  const resultado = EvaluadorPedidos.evaluar(pedidoGrande, ubicacion('San José'));

  assert.equal(resultado.estado, 'aceptado');
  assert.equal(resultado.costoEnvio, 0);
  assert.equal(resultado.total, 50000);
});

test('rechaza IP invalida, privada y pedidos sobre el maximo', () => {
  assert.notEqual(pedido({ ip: 'not-an-ip' }).validar().length, 0);
  assert.notEqual(pedido({ ip: '192.168.1.5' }).validar().length, 0);
  assert.notEqual(
    pedido({ productos: [{ nombre: 'Camiseta', cantidad: 51, precio: 1000 }] }).validar().length,
    0,
  );
});

test('marca la ubicacion como pendiente cuando IP-API falla', () => {
  assert.equal(EvaluadorPedidos.evaluar(pedido(), { error: 'timeout' }).estado, 'pendiente_verificacion');
});
