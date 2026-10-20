// =====================================================================
// main.js · Prueba independiente de las clases (sin n8n)
//   node main.js                  -> usa respuestas de IP-API de ejemplo
//   node main.js --live <ip>      -> consulta IP-API de verdad (Node 18+)
// =====================================================================
const { Pedido, ZonaCobertura, EvaluadorPedidos } = require('./src/logica');

// Respuestas con la misma forma que devuelve IP-API
const geo = {
  sanJose:   { status: 'success', country: 'Costa Rica', countryCode: 'CR', regionName: 'San José Province', city: 'San José' },
  heredia:   { status: 'success', country: 'Costa Rica', countryCode: 'CR', regionName: 'Heredia',    city: 'Heredia' },
  guanacaste:{ status: 'success', country: 'Costa Rica', countryCode: 'CR', regionName: 'Guanacaste', city: 'Liberia' },
  limon:     { status: 'success', country: 'Costa Rica', countryCode: 'CR', regionName: 'Limón',      city: 'Limón' },
  usa:       { status: 'success', country: 'United States', countryCode: 'US', regionName: 'California', city: 'Mountain View' },
  sinProvincia: { status: 'success', country: 'Costa Rica', countryCode: 'CR', regionName: '', city: '' },
  apiCaida:  { error: 'connect ECONNREFUSED' },
  ipPrivadaApi: { status: 'fail', message: 'private range' },
};

const pedidoBarato = {
  cliente: 'Ana Rojas',
  ip: '190.10.10.10',
  productos: [{ nombre: 'Camiseta', cantidad: 2, precio: 8000 }], // subtotal 16 000
};
const pedidoGrande = {
  cliente: 'Luis Mora',
  ip: '190.10.10.11',
  productos: [{ nombre: 'Zapatos', cantidad: 2, precio: 30000 }], // subtotal 60 000
};

function probar(titulo, datosPedido, respuestaGeo) {
  const pedido = new Pedido(datosPedido);
  const errores = pedido.validar();
  console.log(`\n=== ${titulo} ===`);
  if (errores.length > 0) {
    console.log('Resultado: PEDIDO INVÁLIDO');
    console.log('Errores  :', errores);
    return;
  }
  const r = EvaluadorPedidos.evaluar(pedido, respuestaGeo);
  console.log('Estado   :', r.estado);
  console.log('Motivo   :', r.motivo);
  console.log('Ubicación:', r.ubicacion);
  console.log('Subtotal :', r.subtotal, '| Envío:', r.costoEnvio, '| Total:', r.total);
}

async function main() {
  const live = process.argv.indexOf('--live');
  if (live !== -1) {
    const ip = process.argv[live + 1];
    if (!ip) return console.log('Uso: node main.js --live <ip>');
    const res = await fetch(
      `http://ip-api.com/json/${ip}?fields=status,message,country,countryCode,regionName,city,query`
    );
    const real = await res.json();
    console.log('Respuesta real de IP-API:', real);
    probar(`Pedido con IP real ${ip}`, { ...pedidoBarato, ip }, real);
    return;
  }

  probar('1. Aceptado en San José (paga envío ₡2 500)', pedidoBarato, geo.sanJose);
  probar('2. Aceptado en San José con envío GRATIS (subtotal ≥ ₡50 000)', pedidoGrande, geo.sanJose);
  probar('3. Rechazado: fuera de San José (Heredia)', pedidoBarato, geo.heredia);
  probar('4. Rechazado: fuera de San José (Guanacaste)', pedidoBarato, geo.guanacaste);
  probar('5. Rechazado: fuera de San José (Limón)', pedidoBarato, geo.limon);
  probar('6. Rechazado: fuera de Costa Rica', pedidoBarato, geo.usa);
  probar('7. ERROR: IP-API caída', pedidoBarato, geo.apiCaida);
  probar('8. ERROR: IP-API sin provincia', pedidoBarato, geo.sinProvincia);
  probar('9. ERROR: datos incompletos', { cliente: '', ip: '', productos: [] }, geo.sanJose);
  probar('10. ERROR: más de 50 unidades', {
    ...pedidoBarato,
    productos: [{ nombre: 'Camiseta', cantidad: 51, precio: 1000 }],
  }, geo.sanJose);
  probar('11. ERROR: IP privada', { ...pedidoBarato, ip: '192.168.1.5' }, geo.sanJose);

  // Prueba directa de métodos de ZonaCobertura
  const z = new ZonaCobertura(geo.limon);
  console.log('\nZonaCobertura(Limón).estaEnCobertura() =', z.estaEnCobertura());
  console.log('ZonaCobertura(Limón).motivoRechazo()   =', z.motivoRechazo());
}

main();
