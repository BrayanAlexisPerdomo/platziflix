# Análisis Técnico: Sistema de Rating de Cursos (1-5 estrellas)

## Problema

Platziflix no tiene forma de que los usuarios califiquen un curso. Se requiere agregar un rating de 1 a 5 estrellas, anónimo (sin auth, sin dedupe), almacenado como voto individual (no desnormalizado), con alcance limitado a `Course` y a Backend+Frontend (Mobile excluido). El sistema hoy es 100% de solo lectura (`GET`) — este es el primer endpoint de escritura de todo el proyecto, lo cual tiene implicaciones que van más allá de "agregar una tabla".

## Impacto Arquitectural

- **Backend**: nuevo modelo `Rating`, nueva relationship en `Course`, nueva migración, primera capa de Pydantic del proyecto (hoy `CourseService` y `main.py` trabajan 100% con dicts sueltos — no existe `app/schemas/`), lógica de agregación en `CourseService`, nuevo endpoint `POST`, actualización de los tests de contrato existentes.
- **Frontend**: nuevos campos en el tipo `Course`, dos componentes nuevos (uno de solo lectura, uno interactivo con `"use client"` — el primer POST del Frontend también), integración en dos componentes existentes.
- **Base de datos**: nueva tabla `ratings` (1-N respecto a `courses`), con un `CheckConstraint` para el rango 1-5 — primer `CheckConstraint` del proyecto (la única migración existente, `d18a08253457_...`, no tiene precedente de esto).

## Decisiones de diseño ya consensuadas

1. **Rating anónimo**: sin `user_id`, sin autenticación, sin deduplicación de votos — cualquiera puede votar cuantas veces quiera. Es la opción más simple y coherente con que hoy no existe ningún concepto de usuario real en el sistema.
2. **Almacenamiento**: tabla `ratings` nueva (una fila por voto: `course_id` FK + `stars` 1-5), con el promedio calculado al vuelo (`AVG()`/`COUNT()`) en cada lectura — no desnormalizado en columnas de `courses`.
3. **Alcance**: solo `Course` tiene rating (no `Lesson`/`Class`). Solo Backend + Frontend — Mobile queda excluido por ahora.
4. El arreglo del mismatch preexistente Frontend↔Backend (título/teacher/duration/wrapper `data`/endpoint de clase faltante) queda fuera de este plan.

## Propuesta de Solución

### Modelo (`Backend/app/models/rating.py`, archivo nuevo)

```python
from sqlalchemy import Column, Integer, ForeignKey, CheckConstraint
from sqlalchemy.orm import relationship
from .base import BaseModel

class Rating(BaseModel):
    __tablename__ = 'ratings'

    course_id = Column(Integer, ForeignKey('courses.id'), nullable=False, index=True)
    stars = Column(Integer, nullable=False)

    __table_args__ = (
        CheckConstraint('stars >= 1 AND stars <= 5', name='ck_ratings_stars_range'),
    )

    course = relationship("Course", back_populates="ratings")
```

En `course.py` se agrega, simétrico a `lessons` (mismo patrón `cascade="all, delete-orphan"` ya usado):
```python
ratings = relationship("Rating", back_populates="course", cascade="all, delete-orphan")
```

### Agregación sin N+1 en `CourseService`

`get_all_courses()` necesita el promedio de N cursos en una sola pasada, no una query por curso:

```python
from sqlalchemy import func

def _get_ratings_summary(self, course_ids: List[int]) -> Dict[int, Dict[str, Any]]:
    rows = (
        self.db.query(Rating.course_id, func.avg(Rating.stars), func.count(Rating.id))
        .filter(Rating.course_id.in_(course_ids))
        .group_by(Rating.course_id)
        .all()
    )
    summary = {cid: {"rating_average": None, "rating_count": 0} for cid in course_ids}
    for course_id, avg_stars, count in rows:
        summary[course_id] = {
            "rating_average": round(float(avg_stars), 1) if avg_stars is not None else None,
            "rating_count": count,
        }
    return summary
```

Curso sin ratings → `rating_average: null`, `rating_count: 0` (distinguible explícitamente de "1 estrella promedio"). Esto se define en el contrato, no se improvisa en cada cliente.

### Endpoint nuevo

```python
# app/schemas/rating.py (carpeta nueva)
from pydantic import BaseModel, Field

class RatingCreate(BaseModel):
    stars: int = Field(ge=1, le=5)
```

```python
# main.py
@app.post("/courses/{slug}/ratings", status_code=201)
def create_rating(slug: str, payload: RatingCreate,
                   course_service: CourseService = Depends(get_course_service)) -> dict:
    summary = course_service.add_rating(slug, payload.stars)
    if summary is None:
        raise HTTPException(status_code=404, detail="Course not found")
    return summary
```

Nota deliberada: Pydantic se usa **solo** para validar el body de entrada (`stars`). El resto del proyecto — incluidas las respuestas de este mismo endpoint — sigue devolviendo dicts sueltos, igual que hoy. No es una migración del proyecto a Pydantic, es un uso puntual y contenido.

`add_rating` debe filtrar `Course.deleted_at.is_(None)` igual que `get_course_by_slug` — si no, se podría calificar un curso soft-deleted que no aparece en ningún listado.

## Riesgos técnicos identificados (verificados contra el código)

1. **`CheckConstraint` + autogenerate no es confiable.** La única migración existente no tiene ningún `CheckConstraint` como precedente en este repo. Alembic no siempre detecta constraints de este tipo en el diff automático, especialmente si el dialecto/versión no lo soporta bien o el constraint no está nombrado. Mitigación: nombrarlo explícitamente (`ck_ratings_stars_range`, como arriba) y **revisar a mano** el archivo generado por `make create-migration` antes de correr `make migrate`. Si el `CheckConstraint` no aparece en el `upgrade()`, agregarlo manualmente con `op.create_check_constraint(...)`.

2. **El sistema usa soft-delete exclusivamente en runtime — pero `seed.py::clear_all_data()` sí hace DELETE real**, y en un orden específico para no violar FKs: hoy borra `Lesson` → `course_teachers` → `Course` → `Teacher`. Si se agrega la tabla `ratings` sin tocar esa función, `make seed-fresh` va a romper con una violación de FK al intentar borrar `Course` mientras quedan filas en `ratings`. Hay que agregar `db.query(Rating).delete()` **antes** de borrar `Course` (mismo lugar que `Lesson` hoy). Este es el único punto del código donde el cascade importa de verdad, porque en el resto del sistema nunca se borra nada de verdad.

3. **`AVG()` sobre curso sin ratings**: la query agregada (sin `GROUP BY` sobre el subconjunto filtrado) devuelve **una fila** con `avg = NULL`, no cero filas — hay que mapear explícitamente `NULL → None` (→ `null` en JSON), como ya contempla el diseño de arriba. Si no se hace, `round(None, 1)` explota con `TypeError`.

4. **Precisión de `AVG` en Postgres**: sobre una columna entera, Postgres devuelve `numeric` con muchos decimales (`4.333333333333333333`) si no se redondea explícitamente. Definir en el contrato el redondeo exacto (propongo 1 decimal) y aplicarlo en el servicio — no dejarlo a criterio de cada cliente.

5. **`app/models/__init__.py` importa modelos explícitamente uno por uno** (`Teacher`, `Course`, `Lesson`, `course_teachers`) y `alembic/env.py` hace `from app.models import *` para detectar metadata. Si `Rating` no se agrega a ese `__init__.py` (import + `__all__`), Alembic **no la va a ver** y el autogenerate no creará la tabla. Es un paso obligatorio, no opcional, y fácil de olvidar porque no está en `main.py` ni en `course_service.py`.

6. **Hallazgo colateral, no tocar**: existe `Backend/app/models/class.py` con una clase `Class(BaseModel)` (`__tablename__='classes'`) que **no está importada en `__init__.py`** y referencia `back_populates="classes"` en `Course`, relación que no existe (`Course` solo tiene `lessons`). Es código muerto/roto, aislado — no forma parte de este plan, pero si alguien la importa por accidente al crear `rating.py` (por similitud de nombre con `lesson.py`), rompe el arranque de la app.

## Plan de Implementación

Orden respetando dependencias: contrato → modelo → migración → schema/servicio → endpoint → tests → seed → frontend.

### Backend

1. **Actualizar `Backend/specs/00_contracts.md`**: agregar `rating_average` (`number | null`) y `rating_count` (`number`) a los ejemplos JSON de `GET /courses` y `GET /courses/:slug`; agregar sección nueva `POST /courses/:slug/ratings` documentando request (`{"stars": 5}`), response 201 (`{"rating_average": 4.5, "rating_count": 12}`), y los errores 404/422.
2. **Crear `app/models/rating.py`** con el modelo `Rating` de arriba (FK a `courses.id`, `stars`, `CheckConstraint` nombrado).
3. **Agregar relationship `ratings` en `app/models/course.py`**, simétrica a `lessons`.
4. **Registrar `Rating` en `app/models/__init__.py`** (import + `__all__`) — obligatorio para que Alembic la detecte (riesgo #5).
5. **Generar migración**: `make create-migration` → **revisar a mano** el archivo generado, en particular que el `CheckConstraint` esté presente (riesgo #1) → `make migrate`.
6. **Crear `app/schemas/` (carpeta nueva) + `app/schemas/rating.py`** con `RatingCreate`.
7. **`CourseService`**: agregar `_get_ratings_summary()` (agregación sin N+1), incorporar `rating_average`/`rating_count` en `get_all_courses()` y `get_course_by_slug()`, y agregar `add_rating(slug, stars)` (filtrando `deleted_at is None`, manejando curso inexistente → `None`).
8. **`main.py`**: nuevo endpoint `POST /courses/{slug}/ratings` (201 éxito, 404 si `add_rating` devuelve `None`; 422 lo maneja FastAPI/Pydantic automáticamente si `stars` es inválido, antes de llegar al handler).
9. **Actualizar `app/test_main.py`**: agregar `rating_average`/`rating_count` a `MOCK_COURSES_LIST`/`MOCK_COURSE_DETAIL` y a los `expected_*_fields` de `TestContractCompliance` (ambos tests, o van a fallar por campo faltante/extra). Agregar clase `TestRatingsEndpoint` nueva: éxito (201 + agregado), 404 (slug inexistente), 422 (`stars` en 0, 6, string, o ausente).
10. **`app/db/seed.py`**: importar `Rating`, sembrar algunos ratings de ejemplo por curso (valores mixtos para tener promedios no triviales); en `clear_all_data()` agregar `db.query(Rating).delete()` **antes** de borrar `Course` (riesgo #2, mismo lugar que ya ocupa `Lesson`).

Verificar backend con `python -m pytest app/test_main.py -v` antes de tocar Frontend.

### Frontend

1. **`src/types/index.ts`**: agregar `rating_average: number | null` y `rating_count: number` a `Course` (se heredan en `CourseDetail`); nuevo tipo para el body del POST (`{ stars: number }`) y, opcionalmente, uno para la respuesta del agregado.
2. **Componente `StarRating`** (solo lectura) en `src/components/StarRating/` — tres archivos co-ubicados según la convención documentada en `.cursor/rules/components-guide.mdc`.
3. **Componente `RatingForm`** (`"use client"`, hace el `POST`) en `src/components/RatingForm/` — tres archivos.
4. **Integrar en `Course.tsx`**: hoy el componente desestructura props sueltas vía `Omit<CourseType, "slug">` — hay que decidir si `rating_average`/`rating_count` se agregan a esa lista de props desestructuradas o si se pasa el objeto completo; e integrar en `CourseDetail.tsx`, que ya recibe `course` como objeto completo (más directo ahí).
5. **Actualizar el test existente** `src/components/Course/__test__/Course.test.tsx` — nota: este test vive en una subcarpeta `__test__/`, no co-ubicado plano como indica la convención documentada; es una inconsistencia preexistente del repo, no algo que este plan deba "corregir", pero hay que saber que está ahí al tocar props de `Course`.
6. SCSS de los componentes nuevos: usar `color()` de `styles/vars.scss`, mantener el look estándar (`border-radius: 18px`, sombra y hover ya documentados).

**Nota de riesgo colateral para la verificación visual**: aunque el rating quede bien implementado en ambos lados, `npm run dev` contra el Backend real puede seguir sin renderizar cursos por el mismatch preexistente Frontend↔Backend (`title`/`teacher`/`duration` vs `name`, wrapper `data`, endpoint de clase inexistente) — eso es ajeno a este plan, no lo confundas con un bug del rating al probar manualmente.
