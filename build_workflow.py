import json, uuid, re, pathlib

base = pathlib.Path(__file__).parent
logica = (base / "src" / "logica.js").read_text(encoding="utf-8")
# Se copia SOLO la lógica (sin el bloque de exports)
logica = logica.split("// >>> EXPORTS")[0].rstrip() + "\n"

glue_validar = """
// ---- Nodo 1: validar el pedido recibido por el Webhook ----
const body = $input.first().json.body ?? {};
const pedido = new Pedido(body);
const errores = pedido.validar();

return [{
  json: {
    valido: errores.length === 0,
    errores,
    pedido: pedido.toJSON(),
  },
}];
"""

glue_evaluar = """
// ---- Nodo 2: evaluar cobertura y calcular envío ----
// El pedido ya validado viene del nodo anterior; la ubicación, de IP-API.
const datosPedido = $('Validar pedido').first().json.pedido;
const geo = $input.first().json; // si IP-API falló, trae { error: ... }

const pedido = new Pedido(datosPedido);
const registro = EvaluadorPedidos.evaluar(pedido, geo);

return [{ json: { registro } }];
"""

def nid(): return str(uuid.uuid4())

def if_node(name, left, op, right, pos):
    cond = {
        "id": nid(),
        "leftValue": left,
        "rightValue": right,
        "operator": op,
    }
    return {
        "parameters": {
            "conditions": {
                "options": {"caseSensitive": True, "leftValue": "", "typeValidation": "strict", "version": 2},
                "conditions": [cond],
                "combinator": "and",
            },
            "options": {},
        },
        "id": nid(), "name": name, "type": "n8n-nodes-base.if", "typeVersion": 2.2, "position": pos,
    }

def respond(name, code, body, pos):
    return {
        "parameters": {
            "respondWith": "json",
            "responseBody": body,
            "options": {"responseCode": code},
        },
        "id": nid(), "name": name, "type": "n8n-nodes-base.respondToWebhook", "typeVersion": 1.1, "position": pos,
    }

nodes = [
    {
        "parameters": {"httpMethod": "POST", "path": "pedido", "responseMode": "responseNode", "options": {}},
        "id": nid(), "name": "Webhook pedido", "type": "n8n-nodes-base.webhook", "typeVersion": 2,
        "position": [0, 300], "webhookId": nid(),
    },
    {
        "parameters": {"jsCode": logica + glue_validar},
        "id": nid(), "name": "Validar pedido", "type": "n8n-nodes-base.code", "typeVersion": 2, "position": [220, 300],
    },
    if_node("¿Pedido válido?", "={{ $json.valido }}",
            {"type": "boolean", "operation": "true", "singleValue": True}, "", [440, 300]),
    respond("Responder datos inválidos", 400,
            "={{ { estado: 'rechazado', motivo: 'Datos del pedido inválidos', errores: $json.errores } }}",
            [680, 500]),
    {
        "parameters": {
            "url": "=http://ip-api.com/json/{{ $json.pedido.ip }}",
            "sendQuery": True,
            "queryParameters": {"parameters": [
                {"name": "fields", "value": "status,message,country,countryCode,regionName,city,query"}
            ]},
            "options": {"timeout": 8000},
        },
        "id": nid(), "name": "Consultar IP-API", "type": "n8n-nodes-base.httpRequest", "typeVersion": 4.2,
        "position": [680, 200], "onError": "continueRegularOutput",
    },
    {
        "parameters": {"jsCode": logica + glue_evaluar},
        "id": nid(), "name": "Evaluar cobertura y envío", "type": "n8n-nodes-base.code", "typeVersion": 2, "position": [900, 200],
    },
    if_node("¿Pedido aceptado?", "={{ $json.registro.estado }}",
            {"type": "string", "operation": "equals"}, "aceptado", [1120, 200]),
    respond("Responder pedido aceptado", 201, "={{ $json.registro }}", [1360, 100]),
    respond("Responder pedido no despachado",
            "={{ $json.registro.estado === 'pendiente_verificacion' ? 503 : 422 }}",
            "={{ $json.registro }}", [1360, 320]),
]

def link(n): return {"node": n, "type": "main", "index": 0}

connections = {
    "Webhook pedido": {"main": [[link("Validar pedido")]]},
    "Validar pedido": {"main": [[link("¿Pedido válido?")]]},
    "¿Pedido válido?": {"main": [[link("Consultar IP-API")], [link("Responder datos inválidos")]]},
    "Consultar IP-API": {"main": [[link("Evaluar cobertura y envío")]]},
    "Evaluar cobertura y envío": {"main": [[link("¿Pedido aceptado?")]]},
    "¿Pedido aceptado?": {"main": [[link("Responder pedido aceptado")], [link("Responder pedido no despachado")]]},
}

workflow = {
    "name": "Pedidos con verificación geográfica de cobertura",
    "nodes": nodes,
    "connections": connections,
    "active": False,
    "settings": {"executionOrder": "v1"},
    "pinData": {},
}

(base / "workflow.json").write_text(json.dumps(workflow, ensure_ascii=False, indent=2), encoding="utf-8")
print("workflow.json generado:", len(nodes), "nodos")
