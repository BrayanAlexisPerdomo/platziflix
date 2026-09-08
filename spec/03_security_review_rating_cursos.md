# Revisión de Seguridad: Sistema de Rating de Cursos

Revisión de seguridad realizada sobre el diff que implementa el endpoint `POST /courses/:slug/ratings` en `Backend/`, una vez completadas las cuatro fases del plan de implementación ([01_plan_backend_rating_cursos.md](./01_plan_backend_rating_cursos.md)). Es la primera revisión de seguridad de este tipo en el proyecto, relevante porque este endpoint es **el primer endpoint de escritura de todo el sistema** — hasta ahora Platziflix era 100% de solo lectura (`GET`).

## Alcance

Revisión enfocada exclusivamente en las implicaciones de seguridad **agregadas por este PR**, no en problemas preexistentes del resto del sistema. Cobertura:

- `Backend/app/main.py` — endpoint `POST /courses/{slug}/ratings`.
- `Backend/app/schemas/rating.py` — validación de entrada (`RatingCreate`).
- `Backend/app/services/course_service.py` — `add_rating()` y `_get_ratings_summary()`.
- `Backend/app/models/rating.py` — modelo ORM `Rating`.
- `Backend/app/alembic/versions/0133edaef12c_add_ratings_table.py` — migración y `CheckConstraint` a nivel de base de datos.
- `Backend/app/db/seed.py`, `Backend/app/models/course.py`, `Backend/app/test_main.py` — cambios de soporte sin lógica de negocio nueva relevante a seguridad.

## Metodología

Proceso en tres pasos:
1. Sub-agente de identificación de vulnerabilidades, con exploración directa del código real del repositorio (no solo el diff), cubriendo las categorías estándar: inyección (SQL/command/XXE/template/NoSQL), path traversal, auth/autorización, gestión de secretos y criptografía, deserialización insegura/RCE, XSS, y exposición de datos sensibles.
2. Filtrado de falsos positivos con umbral de confianza ≥ 0.8 (equivalente a 8/10) — solo se reportan hallazgos con ruta de explotación concreta, no teóricos.
3. Exclusiones explícitas fuera de alcance: denegación de servicio, secretos en disco ya gestionados por otros procesos, y rate limiting/agotamiento de recursos.

## Hallazgos

**No se identificaron vulnerabilidades HIGH ni MEDIUM con el nivel de confianza requerido.**

Puntos verificados que descartan las categorías de riesgo más relevantes para un endpoint de escritura nuevo:

- **SQL injection**: todo el acceso a datos (nuevo y preexistente) usa el ORM parametrizado de SQLAlchemy (`.filter(Course.slug == slug)`, `.filter(Rating.course_id.in_(course_ids))`); no hay concatenación de strings ni SQL crudo con entrada de usuario en ninguna query tocada por este PR. La única sentencia SQL cruda del repo (`text("SELECT COUNT(*) FROM courses")` en `/health`) es preexistente, sin parámetros de usuario, y no fue modificada.
- **Mass assignment / IDOR**: `RatingCreate` solo acepta `stars` en el body; `course_id` se resuelve server-side a partir del `slug` de la URL, ya validado contra `Course.slug == slug` (excluyendo soft-deleted). No hay forma de que el cliente controle `course_id` directamente.
- **Bypass de validación de rango**: doble control redundante — `RatingCreate.stars` con `Field(ge=1, le=5)` (rechazo 422 en Pydantic) y `CheckConstraint('stars >= 1 AND stars <= 5', name='ck_ratings_stars_range')` a nivel de base de datos. No existe una ruta de código que inserte un `Rating` fuera de rango saltándose ambos controles.
- **Path traversal / injection vía `slug`**: `slug` se usa únicamente como valor de comparación en una query ORM parametrizada, nunca en operaciones de filesystem ni en SQL crudo.
- **Exposición de datos**: la respuesta del endpoint (`rating_average`, `rating_count`) es un agregado público ya expuesto por `GET /courses` y `GET /courses/:slug`; no se filtran campos internos ni de otros cursos.
- **Deserialización insegura / RCE**: no se introduce pickle, YAML, `eval` ni deserialización personalizada.

**Explícitamente fuera de alcance de este reporte** (no son hallazgos nuevos introducidos por este PR):
- La ausencia de autenticación en el endpoint es una decisión de diseño ya consensuada para todo el sistema (ver [00_rating_cursos.md](./00_rating_cursos.md), "Rating anónimo: sin `user_id`, sin autenticación, sin deduplicación de votos"), no algo que este PR agregue de forma aislada.
- La posibilidad de que un mismo cliente envíe múltiples votos para inflar/deflactar el promedio es consecuencia directa de esa misma decisión de diseño (rating anónimo sin dedupe), y cae además dentro de la exclusión de rate-limiting/abuso de recursos del alcance de esta revisión.

## Conclusión

El endpoint `POST /courses/:slug/ratings` no introduce vulnerabilidades de seguridad de alta confianza. La combinación de validación de entrada vía Pydantic (`RatingCreate`) y `CheckConstraint` a nivel de base de datos ofrece defensa en profundidad razonable para el único campo de escritura expuesto (`stars`), y el uso consistente del ORM parametrizado de SQLAlchemy evita las clases de inyección más comunes. No se requieren cambios de seguridad antes de continuar con la parte Frontend ([02_plan_frontend_rating_cursos.md](./02_plan_frontend_rating_cursos.md)).
