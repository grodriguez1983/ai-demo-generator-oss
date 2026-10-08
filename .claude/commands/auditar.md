---
description: Auditar un guion con un panel de 3 agentes antes de producirlo (gate, antes de gastar TTS)
argument-hint: <ruta del guion> [tipo: educativa|ventas|demo] [ruta del material real]
---

Auditá el guion con el panel de agentes. NO re-expliques el método; ejecutalo.

1. Leé `docs/playbooks/auditoria-con-agentes.md`. Confirmá en una línea que lo leíste.
2. Leé el guion y, si existe, la pieza anterior de la serie (continuidad: lo que su cierre prometió es el contrato de esta).
3. **Armá el panel de 3** según el tipo de pieza (§1 del playbook). Si no me lo dijiste, inferilo del guion y decime cuál elegiste en una línea.
4. **Al menos uno tiene que poder EJECUTAR el material**: pasale la ruta del repo / tests / app corriendo y pedile que corra lo que el guion afirma. Este es el agente que encuentra los defectos caros.
5. Lanzá los 3 **en paralelo, en sesión limpia**, cada uno en personaje, con instrucción explícita de ser crítico y sin relación con los autores. Cada uno devuelve: veredicto · hallazgos por severidad · arreglo concreto · qué NO tocar.
6. **Triage (§3):** lo convergente se aplica sin discusión · un hallazgo técnico se arregla en el **material**, no en el guion (y va en su propio commit) · el mérito que un agente se auto-reporta lo verificás a mano.
7. Escribí la **v2 en una sola pasada** con los tres informes juntos, con la línea "Cambios v2" en el encabezado.
8. Recalculá la duración (medí tu ritmo real: palabras del guion ÷ segundos de audio × 60). Si creció, comprimí prosa — nunca saques lo que la auditoría mandó agregar.
9. Reportá: veredictos, los hallazgos que aplicaste, los que rechazaste y por qué, y qué se arregló en el material.

Entrada: $ARGUMENTS
