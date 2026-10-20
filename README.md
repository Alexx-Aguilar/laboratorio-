# Pedidos con verificacion geografica en n8n

Workflow de n8n y clases JavaScript para validar pedidos y aceptar envios
solamente en la provincia de San Jose, Costa Rica.

## Contenido

- `workflow.json`: workflow exportado e importable en n8n.
- `src/logica.js`: clases `Pedido`, `ZonaCobertura` y `EvaluadorPedidos`.
- `build_workflow.py`: genera `workflow.json` y copia la logica en los nodos Code.
- `main.js`: demostracion local con respuestas de geolocalizacion de ejemplo.
- `pruebas/`: datos y solicitudes de ejemplo para probar el flujo.

## Reglas

- El webhook recibe `POST /pedido` con `cliente`, `ip` y `productos`.
- Se valida que la IP sea IPv4 publica y que los productos sean validos.
- Se consulta `ip-api.com` para obtener el pais y la provincia de la IP.
- Solo se aceptan IP ubicadas en Costa Rica y en la provincia de San Jose.
- El maximo es de 50 unidades por pedido.
- El envio cuesta ₡2 500 y es gratis cuando el subtotal es de ₡50 000 o mas.
- El workflow no guarda pedidos en bases de datos ni servidores externos.

La geolocalizacion por IP es aproximada: puede indicar la ubicacion del
proveedor de Internet, VPN o red movil y no confirma la direccion de entrega.

## Importar en n8n

1. En n8n, selecciona **Import from File** y elige `workflow.json`.
2. Guarda el workflow.
3. Para probarlo, pulsa **Listen for test event** y envia un POST a:

   `http://localhost:5678/webhook-test/pedido`

4. Para uso normal, activa el workflow y envia el POST a:

   `http://localhost:5678/webhook/pedido`

La direccion y el puerto pueden cambiar segun donde este instalado n8n.

## Formato de la solicitud

```json
{
  "cliente": "Ana Rojas",
  "ip": "IP_PUBLICA_DEL_CLIENTE",
  "productos": [
    {
      "nombre": "Camiseta",
      "cantidad": 2,
      "precio": 8000
    }
  ]
}
```

Usa la IP publica real del cliente. Una IP privada como `192.168.1.5` no se
puede geolocalizar con IP-API. Las respuestas son `201` para pedidos aceptados,
`400` para datos invalidos y `422` cuando la ubicacion esta fuera de cobertura.
Si no se puede verificar la ubicacion, el workflow devuelve `503`.

## Ejecutar y probar las clases JavaScript

No se requieren paquetes npm. Usa Node.js 18 o superior:

```bash
node --test pruebas/logica.test.js
node main.js
```

Para consultar IP-API directamente desde Node:

```bash
node main.js --live IP_PUBLICA
```

El servicio gratuito de IP-API tiene limites de uso; las pruebas automatizadas
usan ubicaciones de ejemplo y no hacen llamadas a Internet.

## Regenerar el workflow

Si cambia `src/logica.js`, regenera el workflow con Python 3:

```bash
python build_workflow.py
```

El archivo generado es `workflow.json`. Importalo nuevamente en n8n para
aplicar los cambios.
