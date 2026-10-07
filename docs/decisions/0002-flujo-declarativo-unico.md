# 0002 — Un solo flujo: todo demo es declarativo

**Estado:** aceptada · **Fecha:** 2026-10-07

## Contexto
El repo original tenía dos caminos para grabar: clases de flujo escritas a mano
en TypeScript (una por app/sección) y un `DeclarativeFlow` genérico que
interpreta `actions` del YAML. Las clases a mano acoplaban el motor a una app
específica y duplicaban lógica que el flujo declarativo ya cubría.

## Decisión
En la copia OSS **existe un solo camino: el declarativo**. Se eliminaron todas
las clases de flujo nombradas y su registry. Un segmento **debe** tener un
array `actions`; si no lo tiene, el pipeline falla con un mensaje claro
(`record-demo.ts → assertDeclarative`).

## Consecuencias
- **Propiedad Acotado + Documentada:** lo que el browser hace está 100% en el
  YAML, legible sin abrir TypeScript. Una pieza se entiende sola.
- No hay que escribir ni mantener código para grabar una app nueva: se escribe
  un YAML.
- Si un caso real no se puede expresar con las `actions` existentes, la salida
  correcta es **agregar una acción al vocabulario** (`declarativeActionSchema` +
  su handler) y registrarlo, no volver a las clases a mano.
