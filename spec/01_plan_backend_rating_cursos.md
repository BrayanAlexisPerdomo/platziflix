# Plan de Implementación — Backend: Sistema de Rating de Cursos

Plan elaborado por el subagente de backend a partir del análisis técnico en [00_rating_cursos.md](./00_rating_cursos.md), verificado contra el código real de `Backend/` (`app/main.py`, `app/services/course_service.py`, `app/models/`, `app/db/seed.py`, `app/test_main.py`, `Backend/specs/00_contracts.md`, `app/alembic/`).

## Verificación contra el código real

Confirmado, sin cambios respecto al análisis del architect:

- `app/schemas/` no existe — es carpeta nueva real. `pydantic` no está en `pyproject.toml` como dependencia directa, pero es transitiva de `fastapi`/`pydantic-settings`, así que `from pydantic import BaseModel, Field` funciona sin tocar `pyproject.toml`.
- `clear_all_data()` en `seed.py` borra en orden `Lesson → course_teachers → Course → Teacher` (líneas 166-169) — agregar `ratings` sin insertar su DELETE antes de `Course` rompe por FK. Confirmado exacto.
- `app/models/__init__.py` importa modelos uno por uno y `alembic/env.py` (línea 27) hace `from app.models import *`. Confirmado: lo que realmente registra el modelo en `Base.metadata` es la sentencia de import en sí (`from .rating import Rating`), no la presencia en `__all__` — `__all__` solo importa por consistencia con la convención del proyecto, no es lo que hace funcionar el autogenerate.
- `app/models/class.py` existe, no está importado en `__init__.py`, usa `back_populates="classes"` contra un `Course` que no tiene esa relación. Confirmado código muerto/roto y aislado — no tocar.
- `TestContractCompliance` usa comparación exacta de sets de campos (`actual_fields == expected_fields`, líneas 232 y 247 de `test_main.py`) — cualquier campo nuevo sin actualizar ese set rompe el test por campo extra, no solo por campo faltante.
- La única migración (`d18a08253457`) no tiene ningún `CheckConstraint` ni ejemplo de ese patrón. Confirmado que sería el primero.
- `docker-compose.yml` monta `./app` como volumen dentro del contenedor `api` y el `Dockerfile` corre uvicorn con `--reload` — no hace falta `make build` para esta feature, solo tener los contenedores levantados (`make start`).

**Corrección al análisis del architect** (refina el paso de agregación, no invalida nada): la query de `_get_ratings_summary` usa `GROUP BY`, por lo que un curso sin ratings simplemente **no aparece** en las filas devueltas (no llega como una fila con `avg=NULL`) — el `None`/`0` para ese caso lo da el diccionario de defaults inicializado antes de sobreescribir, no el `NULL` de SQL. El riesgo real de "una fila con `avg=NULL`" solo aparece si `add_rating` escribe una query de agregado *separada, sin* `GROUP BY`, para un único curso. Por eso `add_rating` debe reutilizar `_get_ratings_summary([course.id])` en vez de escribir una segunda forma de agregar — evita duplicar lógica y evita ese caso límite por diseño en lugar de por manejo explícito de `NULL`.

## Plan de implementación (por fases)

### Fase 1 — Contrato, modelo y migración ✅ Completada

1. ✅ Levantar el entorno si no está corriendo (`make start`) — la migración se ejecuta dentro del contenedor `api`.
2. ✅ Actualizar `Backend/specs/00_contracts.md`: agregar `rating_average` (`number | null`) y `rating_count` (`number`) a los ejemplos de `GET /courses` y `GET /courses/:slug`; documentar `POST /courses/:slug/ratings` (request, response 201, errores 404/422).
3. ✅ Crear `app/models/rating.py` con el modelo `Rating` (extiende `BaseModel`, no redeclarar `id`/`created_at`/`updated_at`/`deleted_at`; `course_id` FK indexado a `courses.id`; `stars`; `CheckConstraint` **nombrado explícitamente** `ck_ratings_stars_range`). Cuidado deliberado: no copiar/importar nada de `app/models/class.py` (es código muerto y roto, aislado del resto).
4. ✅ Agregar la relationship `ratings` en `app/models/course.py`, simétrica a `lessons` (`cascade="all, delete-orphan"`).
5. ✅ Registrar `Rating` en `app/models/__init__.py`: agregar el `import` real (`from .rating import Rating`, esto es lo que efectivamente lo registra en `Base.metadata` para Alembic) y agregarlo a `__all__` por consistencia con la convención del archivo.
6. ✅ Generar la migración (`make create-migration`) y **antes de aplicarla**, abrir el archivo generado y revisar a mano que el `CheckConstraint` esté en `upgrade()`. Si no aparece (riesgo conocido de autogenerate con este tipo de constraint), agregarlo manualmente con `op.create_check_constraint(...)`; espejar el `downgrade()`. Nota real: el autogenerate sí incluyó el `CheckConstraint` correctamente, pero también arrastró un drift preexistente no relacionado (constraints únicos de `courses.slug`/`teachers.email`) que se eliminó del archivo generado para no mezclarlo con esta migración.

✅ **Checkpoint de Fase 1 (verificado)**: `make migrate` corrió sin error; inspección manual (`\d ratings` en psql) confirmó que la tabla `ratings` tiene el `CheckConstraint ck_ratings_stars_range`, la FK a `courses.id` y los índices correctos. No se avanza a Fase 2 sin esta verificación manual — es el único punto no cubierto por tests automáticos.

### Fase 2 — Validación de entrada, lógica de negocio y endpoint ✅ Completada

7. ✅ Crear la carpeta `app/schemas/` (con `__init__.py`, siguiendo la convención de `app/models/`) y `app/schemas/rating.py` con `RatingCreate` (`stars: int` con `ge=1, le=5`). Es el primer uso de Pydantic del proyecto — deliberadamente acotado solo a validar este body de entrada, no una migración general del proyecto a Pydantic.
8. ✅ En `CourseService`: agregar `_get_ratings_summary(course_ids)` (una sola query agregada con `GROUP BY`, defaults `{"rating_average": None, "rating_count": 0}` por curso antes de sobreescribir con resultados reales); incorporar sus resultados en `get_all_courses()` (recolectando ids de los cursos ya filtrados por `deleted_at is None` y haciendo una única llamada) y en `get_course_by_slug()` (llamando al mismo helper con `[course.id]`, no una query de agregado distinta); agregar `add_rating(slug, stars)` que busque el curso filtrando `deleted_at is None` (igual que `get_course_by_slug`), devuelva `None` si no existe, cree la fila `Rating`, haga commit, y devuelva el resultado de `_get_ratings_summary([course.id])[course.id]` — reutilizando el mismo helper para no duplicar la lógica de agregación ni reintroducir el caso límite de `AVG` sin `GROUP BY`.
9. ✅ Redondear explícitamente el promedio a 1 decimal (`round(float(avg), 1)`) dentro de `_get_ratings_summary`, ya definido en el contrato de la Fase 1 — no dejarlo a criterio del endpoint ni de los clientes.
10. ✅ En `app/main.py`: agregar `POST /courses/{slug}/ratings` (201 en éxito, 404 si `add_rating` devuelve `None`; el 422 por `stars` inválido lo maneja FastAPI/Pydantic automáticamente antes de llegar al handler, sin código adicional).

✅ **Checkpoint de Fase 2 (verificado)**: verificación manual contra el backend real vía `curl` (contenedores ya levantados con `--reload`, sin necesidad de `make build`) — `GET /courses` y `GET /courses/:slug` incluyen `rating_average`/`rating_count` (`null`/`0` antes de votar); `POST /courses/curso-de-react/ratings` con `stars: 5` y luego `stars: 3` devolvió 201 con agregados correctos (`{"rating_average":5.0,"rating_count":1}` y luego `{"rating_average":4.0,"rating_count":2}`), reflejados también en `GET /courses/:slug`; slug inexistente devolvió 404 (`{"detail":"Course not found"}`); los cuatro casos de `stars` inválido (`6`, `0`, `"abc"`, ausente) devolvieron 422 sin llegar al handler.

### Fase 3 — Tests automatizados de contrato ✅ Completada

11. ✅ Actualizar `app/test_main.py`: agregar `rating_average`/`rating_count` a `MOCK_COURSES_LIST` y `MOCK_COURSE_DETAIL`, y a los `expected_fields`/`expected_course_fields` de las tres pruebas de `TestContractCompliance` (fallan por comparación exacta de sets si no se hace). Agregar clase `TestRatingsEndpoint` nueva con: éxito (201 + agregado esperado, mockeando `add_rating`), 404 (slug inexistente, `add_rating` mockeado retornando `None`), 422 (`stars` en `0`, `6`, string, y ausente — cuatro casos, ya que FastAPI/Pydantic los rechaza antes de tocar el mock).

✅ **Checkpoint de Fase 3 (verificado)**: `python -m pytest app/test_main.py -v` (dentro del contenedor `api`) — 16 tests en verde, incluyendo la suite existente sin regresiones. Nota de límite conocido, no un defecto de este plan: como el resto de la suite, estos tests mockean `CourseService` — no ejercitan `_get_ratings_summary` contra una base de datos real, así que la corrección de la query SQL en sí ya quedó cubierta por la verificación manual de la Fase 2, no por esta suite.

### Fase 4 — Datos de ejemplo (seed) ✅ Completada

12. ✅ En `app/db/seed.py`: importar `Rating`; en `create_sample_data()` sembrar varios ratings por curso con valores mixtos (para tener promedios no triviales, no todos 5 estrellas); en `clear_all_data()` agregar `db.query(Rating).delete()` **antes** de `db.query(Course).delete()` (mismo lugar que ya ocupa el delete de `Lesson`, para no violar la FK `ratings.course_id → courses.id`).

✅ **Checkpoint de Fase 4 (verificado, cierre del backend)**: `make seed-fresh` corrió de punta a punta sin error de FK (3 teachers, 3 courses, 6 lessons, 10 ratings); `GET /courses` contra los datos recién sembrados mostró promedios no triviales y counts > 0 (`curso-de-react`: 4.2/5, `curso-de-python`: 3.0/3, `curso-de-javascript`: 4.0/2); `python -m pytest app/test_main.py -v` corrió una última vez como gate final con 16 tests en verde. Backend cerrado — queda pendiente la parte Frontend.
