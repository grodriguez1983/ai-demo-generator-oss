# 0001 — Extracción OSS: un núcleo genérico, sin contenido de marca

**Estado:** aceptada · **Fecha:** 2026-10-07

## Contexto
Esta herramienta nació dentro de una operación de marketing concreta (una app
de un producto + una marca + voces clonadas + ~100 piezas). El pipeline en sí
—grabar, guionar, locutar, renderizar— no tiene nada de específico: sirve para
cualquier web app. Queríamos una copia limpia que cualquiera pueda clonar y usar.

## Decisión
Se extrae **solo el motor genérico** a un repo nuevo (`git` fresco, sin
historia). Se deja afuera todo lo que era contenido o marca:

- **Fuera:** los flows específicos de la app (`*.flow.ts`), los ~100 YAMLs de
  piezas, las pantallas HTML brandeadas, los logos, los scripts one-off
  (`shoot-*`, `gen-*`), las voces clonadas y la doc de campaña.
- **Dentro:** el pipeline (`src/pipeline/`), el flujo declarativo
  (`src/flows/declarative-flow.ts` + `base-flow` + `cursor-guide`), los schemas
  (`src/config/constants.ts`), los selectores genéricos y los utils.
- **Genericizado:** defaults de branding neutros, prompt del guion desacoplado
  del dominio (`narration_persona` / `narration_language`), textos de ayuda.
- **Agregado:** un demo de ejemplo que corre contra una web pública
  (`example-playground.yaml`), la disciplina GS (SPEC + sentinela + decisiones),
  y un README para que cualquiera arranque.

## Consecuencias
- El repo corre con solo Node + ffmpeg + una OpenAI key; el ejemplo no necesita
  app propia.
- Ningún nombre de cliente, marca ni credencial viaja en el código ni en los
  commits (historia fresca).
- Las mejoras al motor pueden volver al repo original por cherry-pick manual;
  los dos repos comparten la forma del `src/`, no la historia.
