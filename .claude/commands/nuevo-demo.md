---
description: Autorar un demo nuevo (YAML declarativo) y validarlo con --dry-run
---

Vas a crear un demo nuevo para el AI Demo Generator siguiendo el método del repo.

Antes de producir nada, confirmá en una línea que leíste, en orden:
1. `docs/spec/SPEC.md` (la gramática: qué se produce y las reglas)
2. `CLAUDE.md` (el mapa del repo)
3. `docs/playbooks/nuevo-demo.md` (la receta paso a paso)

Luego, para el tema/flujo pedido (`$ARGUMENTS`):

1. Explorá la app objetivo (`BASE_URL`) para encontrar los selectores reales de
   cada paso. Si es una web pública, usá `skip_login: true`.
2. Escribí `src/config/<id>.yaml` siguiendo el playbook: formato, segmentos con
   `actions`, warmup oculto si las rutas son frías, `narration_hint` escritos
   como querés que suenen.
3. Validá con `npx tsx src/index.ts --demo=<id> --dry-run --skip-seed` y revisá
   los screenshots de `output/screenshots/`. Corregí selectores hasta que el
   flujo haga exactamente lo que la narración va a decir.
4. No corras la pasada completa (gasta LLM/TTS) sin que el `--dry-run` esté
   limpio y el usuario lo apruebe.

Respetá las restricciones inviolables del `CLAUDE.md`: no narres lo que la
grabación no muestra, no toques el motor sin registrar una decisión, no
commitees `.env` ni datos de un cliente.
