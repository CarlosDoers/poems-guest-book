# Libro de Emociones 📖✨

Una web app para tablets donde los usuarios escriben una emoción con stylus y reciben un poema único generado por inteligencia artificial.

## 🚀 Características

- **Canvas interactivo**: Escritura con stylus/touch con sensibilidad a la presión
- **OCR**: Reconocimiento de escritura manual usando Tesseract.js
- **IA Poética**: Generación de poemas con OpenAI GPT-4o-mini
- **Persistencia**: Guardado de poemas en Supabase
- **Diseño minimalista**: Tipografía cursiva elegante con animaciones suaves
- **Multi-app ready**: Base de datos diseñada para ecosistema de apps

## 📋 Requisitos previos

1. **Node.js** (v18 o superior)
2. **API Key de OpenAI** - [Obtener aquí](https://platform.openai.com/api-keys)
3. **Cuenta de Supabase** - [Crear cuenta](https://supabase.com)

## 🛠️ Instalación

1. Instalar dependencias:
```bash
npm install
```

2. Configurar las variables de entorno en `.env`:
```env
VITE_OPENAI_API_KEY=sk-tu_api_key_de_openai
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_ANON_KEY=tu_anon_key_de_supabase
```

3. Crear las tablas en Supabase. Ve al **SQL Editor** y ejecuta el contenido de `supabase_schema.sql`

4. Iniciar el servidor de desarrollo:
```bash
npm run dev
```

## 📊 Esquema de Base de Datos

El esquema está diseñado para un ecosistema multi-app:

```
┌─────────────┐      ┌─────────────┐
│    apps     │      │  sessions   │
├─────────────┤      ├─────────────┤
│ id          │◄─────┤ app_id      │
│ slug        │      │ device_info │
│ name        │      │ created_at  │
└─────────────┘      └─────────────┘
       │                    │
       │                    │
       ▼                    ▼
┌─────────────────────────────────┐
│             poems               │
├─────────────────────────────────┤
│ id                              │
│ emotion                         │
│ poem                            │
│ app_id ────────────────────────►│ (FK to apps)
│ session_id ────────────────────►│ (FK to sessions)
│ language                        │
│ ai_model                        │
│ created_at                      │
└─────────────────────────────────┘
```

### Para conectar otras apps al ecosistema:

1. Inserta un nuevo registro en la tabla `apps`:
```sql
INSERT INTO apps (slug, name, description) VALUES 
  ('mi-nueva-app', 'Mi Nueva App', 'Descripción de la app');
```

2. Referencia el `app_id` en tus tablas específicas
3. Usa el mismo `session_id` para tracking entre apps

## 📱 Uso en Tablet

1. Abre la app en el navegador de la tablet
2. Escribe una emoción en el canvas usando el stylus
3. Presiona "Generar poema"
4. ¡Disfruta de tu poema personalizado!

## 🎨 Stack Tecnológico

| Tecnología | Uso |
|------------|-----|
| Vite + React | Framework frontend |
| Tesseract.js | OCR (Reconocimiento de texto) |
| OpenAI GPT-4o-mini | Generación de poemas |
| Supabase | Base de datos PostgreSQL |
| CSS Variables | Sistema de diseño |

## 📁 Estructura del proyecto

```
guestbook/
├── src/
│   ├── components/
│   │   ├── WritingCanvas/     # Canvas para escritura
│   │   └── PoemDisplay/       # Visualización del poema
│   ├── services/
│   │   ├── ocr.js            # Servicio OCR
│   │   ├── ai.js             # Servicio OpenAI
│   │   └── supabase.js       # Servicio de BD
│   ├── App.jsx               # Componente principal
│   ├── index.css             # Sistema de diseño
│   └── main.jsx              # Entry point
├── supabase_schema.sql       # Esquema de BD
├── .env                      # Variables de entorno
└── index.html                # HTML principal
```

## 🔧 Scripts disponibles

- `npm run dev` - Servidor de desarrollo
- `npm run build` - Build de producción
- `npm run preview` - Preview del build

## 📝 Licencia

MIT
