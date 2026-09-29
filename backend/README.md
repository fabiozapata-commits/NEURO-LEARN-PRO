# NEURO-LEARN PRO

Arquitectura:
Frontend -> Backend -> LLM -> Learning Engine -> SQLite

## 1. Instalar

Requiere Node.js 20+.

cd backend
npm install

## 2. Configurar IA

Copia `.env.example` como `.env` y coloca tu API key:

OPENAI_API_KEY=...

Nunca pongas esta clave en `frontend/app.js`.

## 3. Ejecutar backend

cd backend
npm start

Backend:
http://localhost:3000

## 4. Ejecutar frontend

Puedes servir la carpeta frontend con cualquier servidor estático.

Ejemplo:

cd frontend
npx serve .

Abre la URL que indique el servidor.

## 5. Qué hace

- Genera chunks con LLM.
- Mantiene el flujo chunking -> explicación -> repetición -> active recall.
- Evalúa respuestas con LLM.
- Guarda sesiones y conceptos en SQLite.
- Mantiene métricas básicas de dominio.
- Usa Speech Recognition y Speech Synthesis del navegador.

## 6. Producción

Para producción:
- autenticación
- PostgreSQL
- FSRS/SM-2 para spaced repetition
- almacenamiento de perfiles
- permisos parentales si aplica
- cifrado de datos
- observabilidad
- rate limiting
- moderación
- STT/TTS de producción
- procesamiento de documentos/imágenes
- Class Mode con streaming de audio
