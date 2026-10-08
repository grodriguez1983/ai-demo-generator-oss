# Playbook — Auditoría con agentes (el gate que mejora el guion)

**Qué es:** el paso que convierte "el guion me parece bueno" en "el guion
sobrevivió a jueces que no me quieren". Un panel de agentes en sesión limpia, en
personaje, **con acceso al material real**, audita el guion ANTES de gastar TTS
y render.

**Por qué existe (propiedad Verificable del SPEC):** auditar un video ya
renderizado es tirar plata en TTS. El panel corre **entre el guion y la
producción**, nunca después.

**Cómo se invoca:** `/auditar <ruta del guion> [tipo] [ruta del material real]`
(`.claude/commands/auditar.md`).

---

## 1. Elegí el panel (3 agentes, perspectivas que no se solapan)

Tres es el número: dos convergen por casualidad, cuatro empiezan a repetirse. La
regla es que cada uno **pueda descubrir algo que los otros dos no**.

| Tipo de pieza | El panel |
|---|---|
| **Educativa** (curso, tutorial) | diseñador instruccional (carga cognitiva, andamiaje) · experto **en la materia específica** (corrección técnica) · **el eslabón más débil** de la audiencia (el junior que se aburre y cierra) |
| **Ventas / posicionamiento** | los públicos objetivo simulados (p. ej. decisor técnico, comprador, usuario escéptico), cada uno con su **deal-breaker**: qué le haría dejar de mirar o desconfiar |
| **Demo de producto** | alguien que **ejecuta** el flujo y verifica que la app hace lo que el guion afirma · un usuario nuevo que nunca vio el producto · un escéptico que busca el over-claim |

Dos roles que casi siempre valen la pena, sea cual sea la pieza:
- **El que puede ejecutar**: alguien que verifica las afirmaciones corriendo el
  material (la app, el código, los tests), no leyéndolo.
- **El eslabón más débil**: el que se pierde. Es el que te dice dónde se apaga
  el video.

### El límite del panel: audita texto, no el mp4
Este panel audita **guion y material**. Es su límite y hay que decirlo: ninguno
**mira y escucha el video terminado**. Para piezas largas, sumá un **gate de
primera impresión post-render** (un auditor nuevo con el mp4 en la mano, que no
participó del guion) — corre después, pero es lo único que ve la capa de
presentación. Detalle en `tutorial-largo.md`.

## 2. Prompteá cada agente como corresponde

Reglas que hacen la diferencia entre una auditoría y un elogio:

1. **Sesión limpia, sin contexto previo.** Un agente que vio nacer el guion ya
   lo quiere.
2. **En personaje, con su vara.** "Sos diseñador instruccional senior" + qué
   mira. Para el eslabón débil: su contexto real ("mirás videos a 1.25× y los
   abandonás sin culpa cuando te aburrís").
3. **"No tenés relación con los autores: sé crítico y directo."** Explícito. Si
   no, elogian.
4. **Dale el material REAL, no solo el guion.** Este es el punto más importante
   del playbook: pasale la ruta del repo, los tests, la app corriendo. Un
   auditor que puede **correr** las cosas encuentra lo que un lector no.
5. **Pedí veredicto + hallazgos ordenados por severidad + arreglo concreto por
   hallazgo + qué NO tocar.** El "qué no tocar" evita que la v2 rompa lo que ya
   funcionaba.
6. **Citá la línea.** Al eslabón débil pedile la frase exacta donde se perdió o
   cerraría.
7. **Lanzá los tres en paralelo**, sin que se vean entre sí. La convergencia
   solo vale si es independiente.

## 3. Triage de los informes (cómo se decide qué se aplica)

| Señal | Qué hacer |
|---|---|
| **Los 3 coinciden** | Se aplica. Sin discusión: es un defecto real. |
| **Hallazgo técnico que invalida una afirmación** | **Se arregla el material, no el guion.** Si el guion dice algo que la app/el código no cumple, el material estaba mal. |
| **Solo el eslabón débil lo marca** | Casi siempre es una **glosa faltante** (una palabra sin explicar) o un punto de fuga. Barato de arreglar, caro de ignorar. |
| **Solo el experto lo marca** | Suele ser precisión o un caveat que falta. Aplicar: es el que te salva de los comentarios. |
| **Pide agregar contenido** | Aplicar, pero mirando el reloj: si la pieza se estira, recortá en otro lado (ver §5). |

**Nunca aceptes el mérito auto-reportado de un agente.** Si un agente dice "lo
hice bien porque X", verificá X a mano. Al comprobarlo suele aparecer algo mejor.

## 4. Lo que la auditoría encuentra suele ser mejor material que lo que ibas a decir

Patrón repetido: el hallazgo incómodo es más didáctico que el logro. Un paso que
falla en cámara enseña más que un happy-path perfecto.

Regla: **cuando la auditoría rompe algo, mostrá la rotura.** Es honestidad y es
mejor pedagogía.

## 5. Aplicá y dejá rastro

1. Escribí la **v2 del guion en una sola pasada** con los tres informes juntos
   (no tres pasadas: se pisan).
2. En el encabezado del guion, una línea **"Cambios v2"** que liste qué se
   aplicó y de dónde salió.
3. Si hubo arreglos al material real (la app, el código), **commit aparte** con
   el hallazgo en el mensaje.
4. Si la pieza creció de más, recortá comprimiendo prosa — **nunca** sacando lo
   que la auditoría mandó agregar. **Medí tu ritmo real** sobre una pieza ya
   locutada: `palabras del guion ÷ segundos de audio × 60 = palabras/minuto`, y
   sumá el margen de pausa entre tomas. Estimá con ese número, no con uno de
   manual.
5. Lo que el panel encontró y no se pudo arreglar, va a la **nota de producción**
   como caveat declarado, no se esconde.

## Checklist (todo en verde = el guion puede ir a producción)
- [ ] 3 agentes, perspectivas que no se solapan, lanzados en paralelo y en sesión limpia
- [ ] al menos uno con acceso al material real y capacidad de ejecutarlo
- [ ] los 3 informes traen veredicto + severidad + arreglo concreto + "qué no tocar"
- [ ] hallazgos convergentes: todos aplicados
- [ ] hallazgos técnicos: arreglados en el **material**, con su commit
- [ ] méritos auto-reportados por agentes: verificados a mano
- [ ] v2 escrita en una pasada, con "Cambios v2" en el encabezado
- [ ] duración recalculada; los caveats que quedaron, declarados en la nota de producción
