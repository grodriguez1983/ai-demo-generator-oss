# 0003 — El seed es un puerto, no una dependencia

**Estado:** aceptada · **Fecha:** 2026-10-07

## Contexto
La etapa 1 del pipeline deja la app en un estado conocido antes de grabar. En el
repo original eso era código Prisma que importaba el cliente de la app
(`@prisma/client` apuntando al repo hermano) y conocía sus tablas. Eso ataba el
generador a una app concreta y rompía el `npm install` en cualquier otra máquina.

## Decisión
El seed pasa a ser un **puerto**: el generador declara la necesidad
("dejá la app en estado conocido") y la app provee la implementación como un
**comando** (`SEED_COMMAND` en `.env`), que corre antes de grabar. Vacío = no-op.

```
SEED_COMMAND="npm --prefix ../my-app run db:seed:demo"
```

Se eliminó la dependencia a `@prisma/client` y todo el código de tablas.

## Consecuencias
- El repo instala y corre sin ninguna app encima; el ejemplo no usa seed.
- Cada proyecto siembra con lo suyo (Prisma, un script SQL, una API, lo que sea)
  sin que el generador lo sepa.
- **Propiedad Acotado:** el generador no conoce el modelo de datos de nadie.
