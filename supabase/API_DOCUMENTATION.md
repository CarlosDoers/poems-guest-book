# 📚 Guestbook Poems API Documentation

API pública para acceder a los poemas generados en la aplicación Emotional Guestbook.

## 🌐 Base URL

```
https://tzceiqfhkmdctuaxszfy.supabase.co/functions/v1
```

## 🔑 Autenticación

Todas las requests requieren el header de autenticación:

```http
Authorization: Bearer {SUPABASE_ANON_KEY}
```

**Nota:** El `SUPABASE_ANON_KEY` es la clave pública de Supabase (anon key).

---

## 📖 Endpoints

### 1. Obtener lista de poemas

Obtiene una lista de poemas ordenados por fecha de creación (más recientes primero).

**Endpoint:**
```
GET /get-poems
```

**Query Parameters:**

| Parámetro | Tipo | Requerido | Default | Descripción |
|-----------|------|-----------|---------|-------------|
| `limit` | number | No | 50 | Número máximo de poemas a retornar (1-100) |
| `emotion` | string | No | - | Filtrar por emoción (búsqueda parcial) |
| `app` | string | No | guestbook | Filtrar por aplicación (slug) |

**Ejemplo de Request:**

```bash
curl -X GET \
  'https://tzceiqfhkmdctuaxszfy.supabase.co/functions/v1/get-poems?limit=20&emotion=tranquilidad' \
  -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR6Y2VpcWZoa21kY3R1YXhzemZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3ODIxMDgsImV4cCI6MjA4MzM1ODEwOH0.O3Sn6W_nFKJiRmoj2WOLxsFuWNwZHg00v0ILSvOpYCU'
```

**Ejemplo de Response (200 OK):**

```json
{
  "success": true,
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "emotion": "tranquilidad",
      "poem": "Entre susurros de brisa se aquieta el alma inquieta...",
      "image_url": "https://tzceiqfhkmdctuaxszfy.supabase.co/storage/v1/object/public/illustrations/...",
      "audio_url": "https://tzceiqfhkmdctuaxszfy.supabase.co/storage/v1/object/public/audio/...",
      "created_at": "2026-01-12T15:30:00.000Z",
      "language": "es",
      "ai_model": "gpt-4o-mini"
    }
  ],
  "count": 1,
  "params": {
    "limit": 20,
    "emotion": "tranquilidad",
    "app": "guestbook"
  }
}
```

---

### 2. Obtener un poema específico

Obtiene un poema individual por su ID.

**Endpoint:**
```
GET /get-poems?id={poem_id}
```

**Query Parameters:**

| Parámetro | Tipo | Requerido | Descripción |
|-----------|------|-----------|-------------|
| `id` | uuid | Sí | ID único del poema |

**Ejemplo de Request:**

```bash
curl -X GET \
  'https://tzceiqfhkmdctuaxszfy.supabase.co/functions/v1/get-poems?id=550e8400-e29b-41d4-a716-446655440000' \
  -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR6Y2VpcWZoa21kY3R1YXhzemZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3ODIxMDgsImV4cCI6MjA4MzM1ODEwOH0.O3Sn6W_nFKJiRmoj2WOLxsFuWNwZHg00v0ILSvOpYCU'
```

**Ejemplo de Response (200 OK):**

```json
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "emotion": "alegría",
    "poem": "Brota luz desde el pecho se expande sin motivo...",
    "image_url": "https://...",
    "audio_url": "https://...",
    "created_at": "2026-01-12T15:30:00.000Z",
    "language": "es",
    "ai_model": "gpt-4o-mini"
  }
}
```

**Ejemplo de Response (404 Not Found):**

```json
{
  "success": false,
  "error": "Poem not found"
}
```

---

## 📝 Response Schema

### Poem Object

```typescript
interface Poem {
  id: string;              // UUID único del poema
  emotion: string;         // Emoción que inspiró el poema
  poem: string;            // Texto del poema (texto continuo sin saltos de línea)
  image_url: string | null; // URL de la ilustración generada (puede ser null)
  audio_url: string | null; // URL del audio narrado (puede ser null)
  created_at: string;      // ISO 8601 timestamp
  language: string;        // Código de idioma (ej: 'es')
  ai_model: string;        // Modelo de IA usado para generar el poema
}
```

---

## 🚨 Manejo de Errores

### Error Response Format

```json
{
  "success": false,
  "error": "Error message here"
}
```

### HTTP Status Codes

| Código | Descripción |
|--------|-------------|
| 200 | Success - Request procesado correctamente |
| 404 | Not Found - Poema no encontrado (cuando se busca por ID) |
| 500 | Internal Server Error - Error del servidor |

---

## 💡 Ejemplos de Uso

### JavaScript/TypeScript

```typescript
const SUPABASE_URL = 'https://tzceiqfhkmdctuaxszfy.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR6Y2VpcWZoa21kY3R1YXhzemZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3ODIxMDgsImV4cCI6MjA4MzM1ODEwOH0.O3Sn6W_nFKJiRmoj2WOLxsFuWNwZHg00v0ILSvOpYCU'

async function getRecentPoems(limit = 20) {
  const response = await fetch(
    `${SUPABASE_URL}/functions/v1/get-poems?limit=${limit}`,
    {
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
      }
    }
  )
  
  return await response.json()
}

async function getPoemsByEmotion(emotion: string) {
  const response = await fetch(
    `${SUPABASE_URL}/functions/v1/get-poems?emotion=${encodeURIComponent(emotion)}`,
    {
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
      }
    }
  )
  
  return await response.json()
}

// Uso
const result = await getRecentPoems(10)
console.log(result.data) // Array de poemas
```

### Python

```python
import requests

SUPABASE_URL = 'https://tzceiqfhkmdctuaxszfy.supabase.co'
SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR6Y2VpcWZoa21kY3R1YXhzemZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3ODIxMDgsImV4cCI6MjA4MzM1ODEwOH0.O3Sn6W_nFKJiRmoj2WOLxsFuWNwZHg00v0ILSvOpYCU'

def get_recent_poems(limit=20):
    response = requests.get(
        f'{SUPABASE_URL}/functions/v1/get-poems',
        params={'limit': limit},
        headers={'Authorization': f'Bearer {SUPABASE_ANON_KEY}'}
    )
    return response.json()

def get_poems_by_emotion(emotion):
    response = requests.get(
        f'{SUPABASE_URL}/functions/v1/get-poems',
        params={'emotion': emotion},
        headers={'Authorization': f'Bearer {SUPABASE_ANON_KEY}'}
    )
    return response.json()

# Uso
result = get_recent_poems(10)
print(result['data'])
```

---

## 🔐 Notas de Seguridad

1. **Rate Limiting:** La API tiene rate limiting aplicado por Supabase (limita requests por IP)
2. **CORS:** La API está configurada para aceptar requests desde cualquier origen (`Access-Control-Allow-Origin: *`)
3. **Read-Only:** Esta API solo permite lectura (GET), no se pueden crear, modificar o eliminar poemas
4. **Límite de resultados:** Máximo 100 poemas por request

---

## 📧 Soporte

Para preguntas o issues con la API, contacta al equipo de desarrollo.

**Última actualización:** 12 de enero de 2026
