// =====================================================================
// logica.js  ·  Pedidos con verificación geográfica de cobertura
// ---------------------------------------------------------------------
// Esta es la ÚNICA lógica de negocio del proyecto. El mismo bloque de
// clases se copia dentro de los nodos Code del workflow de n8n.
// JavaScript puro, sin frameworks ni librerías.
// =====================================================================

// ---- Parámetros del negocio (se cambian aquí y en el nodo Code) ----
const CONFIG = {
  paisCubierto: 'CR',          // Regla 2: solo se despacha a Costa Rica
  maxUnidadesPorPedido: 50,    // Regla 5: tope de unidades por pedido
  envioGratisDesde: 50000,     // Regla 4: envío gratis desde este subtotal (colones)
  zonas: [                     // Regla 3: solo se despacha en San José
    {
      nombre: 'San José',
      provincias: ['san jose'],
      costoEnvio: 2500,
    },
  ],
};

// Quita tildes y pasa a minúsculas: "San José Province" -> "san jose province"
const normalizar = (texto) =>
  String(texto ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

// ---------------------------------------------------------------------
// Clase 1: ZonaCobertura  (dónde está el cliente y si le despachamos)
// ---------------------------------------------------------------------
class ZonaCobertura {
  // ubicacion tiene la forma de la respuesta de IP-API:
  // { countryCode, country, regionName, city }
  constructor(ubicacion = {}) {
    this.pais = ubicacion.country ?? '';
    this.codigoPais = ubicacion.countryCode ?? '';
    this.provincia = ubicacion.regionName ?? '';
    this.ciudad = ubicacion.city ?? '';
  }

  // Situación inesperada: la API respondió pero sin datos suficientes
  ubicacionCompleta() {
    if (!this.codigoPais) return false;
    if (this.codigoPais === CONFIG.paisCubierto && !this.provincia) return false;
    return true;
  }

  // Devuelve la zona de tarifa (o null si no hay cobertura)
  buscarZona() {
    if (this.codigoPais !== CONFIG.paisCubierto) return null;
    const provincia = normalizar(this.provincia).replace(/\s+province$/, '');
    return (
      CONFIG.zonas.find((z) => z.provincias.includes(provincia)) ?? null
    );
  }

  estaEnCobertura() {
    return this.buscarZona() !== null;
  }

  tarifaBase() {
    const zona = this.buscarZona();
    return zona ? zona.costoEnvio : 0;
  }

  motivoRechazo() {
    if (this.codigoPais !== CONFIG.paisCubierto) {
      return `Solo despachamos a Costa Rica (la IP está ubicada en ${this.pais || 'un país desconocido'})`;
    }
    if (!this.estaEnCobertura()) {
      return `La provincia ${this.provincia} está fuera de nuestra zona de cobertura`;
    }
    return null;
  }
}

// ---------------------------------------------------------------------
// Clase 2: Pedido  (datos del pedido y sus reglas de cálculo/validación)
// ---------------------------------------------------------------------
class Pedido {
  // productos: [{ nombre, cantidad, precio }]
  constructor({ cliente, ip, productos } = {}) {
    this.cliente = typeof cliente === 'string' ? cliente.trim() : '';
    this.ip = typeof ip === 'string' ? ip.trim() : '';
    this.productos = Array.isArray(productos) ? productos : [];
  }

  static esIpValida(ip) {
    const octeto = '(25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)';
    return new RegExp(`^${octeto}(\\.${octeto}){3}$`).test(ip);
  }

  static esIpPrivada(ip) {
    const [a, b] = ip.split('.').map(Number);
    return (
      a === 0 || a === 10 || a === 127 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254)
    );
  }

  totalUnidades() {
    return this.productos.reduce((acc, p) => acc + p.cantidad, 0);
  }

  subtotal() {
    return this.productos.reduce((acc, p) => acc + p.cantidad * p.precio, 0);
  }

  // Regla 1 y 5: datos completos/válidos y tope de unidades.
  // Devuelve una lista de errores (vacía = pedido válido).
  validar() {
    const errores = [];
    if (!this.cliente) errores.push('Falta el nombre del cliente');

    if (!this.ip) {
      errores.push('Falta la IP del cliente');
    } else if (!Pedido.esIpValida(this.ip)) {
      errores.push(`La IP "${this.ip}" no tiene un formato IPv4 válido`);
    } else if (Pedido.esIpPrivada(this.ip)) {
      errores.push(`La IP "${this.ip}" es privada y no se puede geolocalizar`);
    }

    if (this.productos.length === 0) errores.push('El pedido no tiene productos');

    this.productos.forEach((p, i) => {
      const n = i + 1;
      if (!p || !p.nombre) errores.push(`Producto #${n}: falta el nombre`);
      if (!Number.isInteger(p?.cantidad) || p.cantidad <= 0) {
        errores.push(`Producto #${n}: la cantidad debe ser un entero mayor a 0`);
      }
      if (typeof p?.precio !== 'number' || p.precio < 0) {
        errores.push(`Producto #${n}: el precio debe ser un número mayor o igual a 0`);
      }
    });

    if (errores.length === 0 && this.totalUnidades() > CONFIG.maxUnidadesPorPedido) {
      errores.push(
        `El pedido tiene ${this.totalUnidades()} unidades y el máximo es ${CONFIG.maxUnidadesPorPedido}`
      );
    }
    return errores;
  }

  // Regla 3 y 4: costo de envío según la zona, gratis si el subtotal es alto
  calcularEnvio(zona) {
    if (!zona.estaEnCobertura()) return 0;
    if (this.subtotal() >= CONFIG.envioGratisDesde) return 0;
    return zona.tarifaBase();
  }

  calcularTotal(zona) {
    return this.subtotal() + this.calcularEnvio(zona);
  }

  toJSON() {
    return { cliente: this.cliente, ip: this.ip, productos: this.productos };
  }
}

// ---------------------------------------------------------------------
// Clase 3: EvaluadorPedidos  (decide el estado final del pedido)
// ---------------------------------------------------------------------
class EvaluadorPedidos {
  // geo = respuesta de IP-API (o el error si el servicio falló)
  static evaluar(pedido, geo) {
    const base = {
      cliente: pedido.cliente,
      ip: pedido.ip,
      productos: pedido.productos,
      unidades: pedido.totalUnidades(),
      subtotal: pedido.subtotal(),
      fecha: new Date().toISOString(),
    };

    // Situación inesperada 1: IP-API caída, sin respuesta o con status "fail"
    if (!geo || geo.error || geo.status !== 'success') {
      return {
        ...base,
        estado: 'pendiente_verificacion',
        motivo: `No se pudo verificar la ubicación: ${geo?.message ?? 'el servicio de geolocalización no respondió'}`,
        ubicacion: null,
        costoEnvio: null,
        total: null,
      };
    }

    const zona = new ZonaCobertura(geo);
    const ubicacion = { pais: zona.pais, provincia: zona.provincia, ciudad: zona.ciudad };

    // Situación inesperada 2: la API respondió pero sin datos suficientes
    if (!zona.ubicacionCompleta()) {
      return {
        ...base,
        estado: 'pendiente_verificacion',
        motivo: 'La geolocalización no devolvió país/provincia suficientes para decidir',
        ubicacion,
        costoEnvio: null,
        total: null,
      };
    }

    // Regla 2 y 3: fuera de cobertura => rechazado con motivo claro
    if (!zona.estaEnCobertura()) {
      return {
        ...base,
        estado: 'rechazado',
        motivo: zona.motivoRechazo(),
        ubicacion,
        costoEnvio: 0,
        total: null,
      };
    }

    // Pedido aceptado
    return {
      ...base,
      estado: 'aceptado',
      motivo: null,
      ubicacion,
      costoEnvio: pedido.calcularEnvio(zona),
      total: pedido.calcularTotal(zona),
    };
  }
}

// >>> EXPORTS (esta parte NO se copia a n8n) >>>
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { CONFIG, Pedido, ZonaCobertura, EvaluadorPedidos };
}
