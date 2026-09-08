# CLAUDE.md

Este archivo le da contexto a Claude Code (claude.ai/code) para trabajar en este repositorio.

## Visión general del repositorio

Este es **Platziflix**, el repositorio de práctica del "Curso de Claude Code" de Platzi (profesor: Eduardo Alvarez). Es una plataforma de cursos online deliberadamente minimalista ("cada curso tiene clases y descripciones, nada más") usada como terreno de práctica multi-stack realista: un backend en FastAPI y tres clientes independientes (web en Next.js, iOS nativo, Android nativo) que consumen todos el mismo contrato REST.

El repo es un monorepo de **cuatro proyectos separados que no comparten tooling**. No hay gestor de paquetes raíz, ni un comando único de build/test, ni integración de CI visible en el repo — siempre hay que hacer `cd` al proyecto correspondiente antes de correr cualquier comando.

```
Backend/   FastAPI + SQLAlchemy + PostgreSQL (fuente de verdad del contrato de datos)
Frontend/  Next.js 15 (App Router) + TypeScript + SCSS Modules
Mobile/PlatziFlixAndroid/  Kotlin + Jetpack Compose, Clean Architecture
Mobile/PlatziFlixiOS/      Swift + SwiftUI, Clean Architecture (MVVM)
```

El contrato de API que los cuatro proyectos deben respetar está en [Backend/specs/00_contracts.md](Backend/specs/00_contracts.md) — trátalo como la fuente de verdad compartida al modificar entidades o endpoints, y actualízalo junto con cualquier cambio de API que rompa compatibilidad.

**Brecha importante a tener en cuenta**: los tipos de TypeScript del frontend ([Frontend/src/types/index.ts](Frontend/src/types/index.ts)) ya modelan `Progress`, `Quiz`/`QuizOption` y `FavoriteToggle`, y el spec del contrato documenta un endpoint `GET /courses/:slug/classes/:id` — nada de esto existe todavía en el backend ([Backend/app/main.py](Backend/app/main.py) solo implementa `GET /`, `GET /health`, `GET /courses`, `GET /courses/{slug}`). No asumas que el backend soporta una feature solo porque un cliente la modela; revisa primero `main.py`.

## Backend (`Backend/`)

Python 3.11+, FastAPI, SQLAlchemy 2.0, Alembic, PostgreSQL 15, gestión de dependencias con `uv`, todo corre vía Docker Compose (servicios `db` + `api`).

### Comandos (vía Makefile, envuelve docker-compose)
```bash
make start             # docker-compose up -d (levanta db + api)
make stop               # docker-compose down
make restart
make build               # reconstruye las imágenes
make logs                 # sigue los logs de los contenedores
make migrate               # alembic upgrade head (dentro del contenedor api)
make create-migration        # alembic revision --autogenerate (pide un mensaje)
make seed                     # puebla datos de ejemplo (app/db/seed.py)
make seed-fresh                 # limpia y vuelve a poblar
make clean                       # docker-compose down -v --rmi all --remove-orphans
```
La API queda expuesta en `localhost:8000`, Postgres en `localhost:5432` (usuario/db `platziflix_user`/`platziflix_db`, ver [Backend/docker-compose.yml](Backend/docker-compose.yml)).

### Tests
Los tests mockean `CourseService` vía dependency overrides de FastAPI, así que no necesitan una base de datos viva:
```bash
python -m pytest app/test_main.py -v                                          # todos los tests
python -m pytest app/test_main.py::TestCoursesEndpoints -v                     # una clase
python -m pytest app/test_main.py::TestCoursesEndpoints::test_get_all_courses_success -v   # un test puntual
```
Los tests validan explícitamente el cumplimiento del contrato (`TestContractCompliance` — sets exactos de campos, sin campos extra) contra [Backend/specs/00_contracts.md](Backend/specs/00_contracts.md). Al agregar o cambiar un campo en `Course`, `Class`/`Lesson` o `Teacher`, actualiza el spec, el modelo y estos tests de contrato juntos.

### Arquitectura
Estructura simple por capas, no hexagonal/DDD:
- `app/main.py` — solo rutas; inyecta `CourseService` vía `Depends`, sin lógica de negocio en los handlers.
- `app/services/course_service.py` — lógica de negocio, recibe una `Session`.
- `app/models/` — modelos ORM de SQLAlchemy: `Course`, `Teacher`, `Lesson` (esta es la entidad "Clase" — se llama `Lesson` en código y `Class` en el contrato/clientes, ten presente ese mapeo al rastrear un campo entre proyectos), `course_teacher` (asociación muchos-a-muchos).
- `app/db/base.py` — engine/sesión/metadata compartida (`Base`); `app/db/seed.py` — generador de datos de ejemplo.
- `app/core/config.py` — Settings de Pydantic, lee `.env`.
- Todas las entidades usan soft delete (`deleted_at`) y timestamps automáticos (`created_at`/`updated_at`) vía un `BaseModel` compartido en `app/models/base.py` — nunca borres en duro, y no agregues estos campos manualmente por modelo.
- Las migraciones de Alembic viven en `app/alembic/versions/`; el flujo es: editar el modelo → `alembic revision --autogenerate -m "..."` (o `make create-migration`) → revisar el archivo generado → `alembic upgrade head` (o `make migrate`). Ver [Backend/app/db/migrations_commands.md](Backend/app/db/migrations_commands.md) para la referencia completa de comandos.

## Frontend (`Frontend/`)

Next.js 15 (App Router, Turbopack), React 19, TypeScript, SCSS Modules (sin Tailwind/CSS-in-JS), Vitest + Testing Library.

### Comandos
```bash
npm run dev       # next dev --turbopack
npm run build
npm run start
npm run lint       # next lint
npm run test         # vitest (una vez o en watch según cómo se invoque)
```
Config de Vitest ([Frontend/vitest.config.ts](Frontend/vitest.config.ts)): entorno `jsdom`, globals activado, setup file en `src/test/setup.ts`, `@/*` resuelve a `src/*`.

### Convenciones (de `.cursor/rules/`, específicas del proyecto — no consejos genéricos de Next.js)
- **Estructura de componentes**: cada componente tiene su propia carpeta dentro de `src/components/` con tres archivos co-ubicados — `ComponentName.tsx`, `ComponentName.module.scss`, `ComponentName.test.tsx`. PascalCase para nombres de componentes/carpetas, camelCase para las clases CSS de los módulos.
- **Tipos**: siempre importar los tipos compartidos desde `@/types` primero; solo definir un tipo local/específico del componente cuando no exista algo adecuado ahí.
- **SCSS**: importar variables desde `styles/vars.scss`; usar la función `color('nombre')` en vez de colores hardcodeados; el look estándar de una card es `border-radius: 18px`, `box-shadow: 0 6px 24px rgba(0,0,0,0.10)`, hover = `translateY(-8px) scale(1.02)`.
- **Testing**: preferir `screen` + `getByRole`/`getByText` sobre `container.querySelector`; `getByTestId` como último recurso; mockear dependencias pesadas con `vi.mock()`.

## Mobile — Android (`Mobile/PlatziFlixAndroid/`)

Kotlin + **Jetpack Compose** + Material 3 (nota: el `.cursor/rules/rules.mdc` versionado es una regla genérica de boilerplate que dice preferir XML/Fragments sobre Compose — el código real usa Compose en todos lados; sigue el código real, no esa regla). Clean Architecture con MVVM/MVI, Retrofit + OkHttp + Gson para networking, Coil para imágenes, StateFlow para el estado de UI.

### Comandos
```bash
./gradlew build
./gradlew test                 # tests unitarios (app/src/test)
./gradlew connectedAndroidTest  # tests de instrumentación (app/src/androidTest)
```

### Arquitectura
Paquete raíz `app/src/main/java/com/espaciotiago/platziflixandroid/`, organizado en capas `data/` (`entities` DTOs, `mappers`, `network` servicio de Retrofit, `repositories`) → `domain/` (`models`, interfaces de repositorio) → `presentation/<feature>/` (`components`, `screen`, `state`, `viewmodel`), más `di/` para el wiring manual de inyección de dependencias (`AppModule`) y `ui/theme/` para el sistema de diseño.
- Un `MockCourseRepository` junto a `RemoteCourseRepository` permite alternar `USE_MOCK_DATA` en `AppModule.kt` para desarrollar la UI sin necesidad de tener el backend corriendo.
- La URL base para el emulador es `10.0.2.2:8000` (no `localhost`) para alcanzar el backend en la máquina host; para un dispositivo físico usar la IP de LAN del host. El HTTP en claro está permitido en desarrollo vía `network_security_config.xml`.
- Ver [Mobile/PlatziFlixAndroid/README_COURSES_FEATURE.md](Mobile/PlatziFlixAndroid/README_COURSES_FEATURE.md) para la implementación de referencia de la feature de listado de cursos (estados: Loading/Success/Error/Empty/Refreshing) — úsala como plantilla al agregar nuevas features.

## Mobile — iOS (`Mobile/PlatziFlixiOS/`)

Swift + SwiftUI, MVVM. Nombre del proyecto/scheme de Xcode: `PlatziFlixiOS`. No hay un runner de tests por CLI configurado en el repo (`buildServer.json` es solo para `xcode-build-server`/indexado de LSP) — compilar y correr tests desde Xcode, o vía `xcodebuild -scheme PlatziFlixiOS test` si se necesita CLI.

### Arquitectura
Dentro de `PlatziFlixiOS/PlatziFlixiOS/`:
- `Domain/Models/` — structs de dominio planos (`Course`, `Class`, `Teacher`); `Domain/Repositories/` — protocolos (p. ej. `CourseRepositoryProtocol`) de los que depende la capa de presentación, no implementaciones concretas.
- `Data/Entities/` — DTOs (`CourseDTO`, etc.) que reflejan el JSON de la API; `Data/Mapper/` — mappers de DTO a modelo de dominio; `Data/Repositories/` — repositorios concretos (`RemoteCourseRepository`) que implementan los protocolos de dominio.
- `Services/` — capa de networking hecha a mano (`NetworkManager`, `APIEndpoint`, `HTTPMethod`, `NetworkError`), sin librería HTTP de terceros.
- `Presentation/ViewModels/` y `Presentation/Views/` — MVVM; `DesignSystem.swift` centraliza el estilo compartido.

## Notas transversales

- Al cambiar la superficie de la API (campo nuevo, endpoint nuevo), actualizar en este orden: `Backend/specs/00_contracts.md` → modelo/migración/servicio/ruta del backend → tests de contrato del backend → luego el/los cliente(s) consumidor(es). El spec es el contrato contra el que están construidas las demás plataformas, incluso cuando un cliente va actualmente por delante de él.
- `Class` (contrato/clientes) == `Lesson` (nombre del modelo en el backend) == la entidad de clase-en-video que pertenece a un `Course`. No te confundas con el desajuste de nombres al rastrear un campo entre proyectos.
- Hoy no hay autenticación ni endpoints de escritura en ningún lugar del sistema — todo es navegación de contenido de solo lectura (`GET`).