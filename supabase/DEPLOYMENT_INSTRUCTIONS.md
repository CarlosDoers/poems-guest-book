# 🚀 Instrucciones de Deployment - Edge Function

Guía paso a paso para desplegar la Edge Function `get-poems` en Supabase.

---

## ✅ Pre-requisitos

1. Tener una cuenta en [Supabase](https://supabase.com)
2. Proyecto de Supabase ya creado
3. Instalar Supabase CLI

---

## 📦 Paso 1: Instalar Supabase CLI

### Windows (PowerShell)

```powershell
# Opción 1: Con npm
npm install -g supabase

# Opción 2: Con Scoop
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
scoop install supabase
```

### macOS

```bash
brew install supabase/tap/supabase
```

### Linux

```bash
# Instalar con npm
npm install -g supabase
```

**Verificar instalación:**
```bash
supabase --version
```

---

## 🔐 Paso 2: Login en Supabase

```bash
supabase login
```

Esto abrirá tu navegador para autenticarte. Genera un access token y pégalo en la terminal.

---

## 🔗 Paso 3: Link con tu proyecto

```bash
# Asegúrate de estar en la raíz del proyecto guestbook
cd c:\Users\CarlosRabago\Documents\mdf2026\guestbook

# Link con tu proyecto (tu project-ref es: tzceiqfhkmdctuaxszfy)
supabase link --project-ref tzceiqfhkmdctuaxszfy
```

Te pedirá la contraseña de la base de datos. Encuéntrala en:
- Dashboard de Supabase → Settings → Database → Connection String → Password

---

## 🚀 Paso 4: Desplegar la función

```bash
# Desplegar la función get-poems
supabase functions deploy get-poems --no-verify-jwt

# Si quieres ver los logs durante el deploy
supabase functions deploy get-poems --no-verify-jwt --debug
```

**Nota:** Usamos `--no-verify-jwt` porque esta API es pública y usa el anon key en el Authorization header, no JWT de usuarios autenticados.

---

## ✅ Paso 5: Verificar el deployment

Una vez desplegada, la función estará disponible en:

```
https://tzceiqfhkmdctuaxszfy.supabase.co/functions/v1/get-poems
```

**Test rápido:**

```bash
curl -X GET \
  'https://tzceiqfhkmdctuaxszfy.supabase.co/functions/v1/get-poems?limit=5' \
  -H 'Authorization: Bearer YOUR_SUPABASE_ANON_KEY'
```

Reemplaza `YOUR_SUPABASE_ANON_KEY` con tu anon key de:
- Dashboard → Settings → API → Project API keys → `anon` `public`

---

## 🔍 Paso 6: Ver logs de la función

Para ver logs en tiempo real:

```bash
supabase functions logs get-poems
```

O en el dashboard:
- Dashboard → Edge Functions → get-poems → Logs

---

## 🔄 Actualizar la función

Cuando hagas cambios en el código:

```bash
supabase functions deploy get-poems --no-verify-jwt
```

---

## 🧪 Testing Local (Opcional)

Si quieres probar localmente antes de desplegar:

```bash
# Iniciar Supabase local
supabase start

# Servir las funciones localmente
supabase functions serve get-poems --no-verify-jwt

# En otra terminal, hacer requests
curl -X GET \
  'http://localhost:54321/functions/v1/get-poems?limit=5' \
  -H 'Authorization: Bearer YOUR_LOCAL_ANON_KEY'
```

**Detener servicios locales:**
```bash
supabase stop
```

---

## 📋 Resumen de Comandos

| Comando | Descripción |
|---------|-------------|
| `supabase login` | Autenticarse con Supabase |
| `supabase link --project-ref {ref}` | Conectar con el proyecto |
| `supabase functions deploy {name}` | Desplegar función |
| `supabase functions logs {name}` | Ver logs en tiempo real |
| `supabase functions list` | Listar funciones desplegadas |
| `supabase functions delete {name}` | Eliminar función |

---

## 🎯 Información para el desarrollador externo

Una vez desplegada, comparte con el desarrollador:

1. **Endpoint:**
   ```
   https://tzceiqfhkmdctuaxszfy.supabase.co/functions/v1/get-poems
   ```

2. **Anon Key** (obtenerla de Dashboard → Settings → API):
   ```
   eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   ```

3. **Documentación:** Comparte el archivo `API_DOCUMENTATION.md`

---

## ⚠️ Troubleshooting

### Error: "project not linked"
```bash
supabase link --project-ref tzceiqfhkmdctuaxszfy
```

### Error: "unauthorized"
```bash
supabase login
```

### Error: "function failed to deploy"
- Revisa los logs con `--debug`
- Verifica que la sintaxis de TypeScript sea correcta
- Asegúrate de que las imports usen URLs válidas (esm.sh)

### La función no responde
- Verifica en Dashboard → Edge Functions que esté activa
- Revisa los logs: `supabase functions logs get-poems`
- Verifica que el Authorization header sea correcto

---

## 📚 Recursos

- [Supabase Edge Functions Docs](https://supabase.com/docs/guides/functions)
- [Supabase CLI Docs](https://supabase.com/docs/reference/cli/introduction)
- [Deno Deploy Docs](https://deno.com/deploy/docs)

---

**Listo para desplegar! 🚀**
