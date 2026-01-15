import { useState, useCallback, useEffect, lazy, Suspense, useRef } from 'react';
import WritingCanvas from './components/WritingCanvas/WritingCanvas';
import Loader from './components/Loader/Loader';
import { generatePoem, recognizeEmotionFromImage, generateIllustration, isOpenAIConfigured } from './services/ai';

// Lazy load heavy components
const PoemDisplay = lazy(() => import('./components/PoemDisplay/PoemDisplay'));
const PoemCarousel = lazy(() => import('./components/PoemCarousel/PoemCarousel'));
import { savePoem, getRecentPoems, isSupabaseConfigured, uploadIllustration } from './services/supabase';
import { isElevenLabsConfigured } from './services/elevenlabs';

// App states
const STATES = {
  WRITING: 'writing',
  PROCESSING: 'processing',
  POEM: 'poem',
  ERROR: 'error'
};

const WRITING_STAGES = {
  INTRO: 'intro',
  CANVAS: 'canvas'
};

// -------------------------------------------------------------
// CONFIGURACIÓN DE EFECTOS VISUALES (SHADER DE AGUA)
// Modifica estos valores para personalizar el aspecto
// -------------------------------------------------------------
const SHADER_CONFIG = {
  // Movimiento base del agua
  baseWaveSpeed: 1.2,       // Velocidad mucho más suave
  waveAmplitude: 2.0,       // Altura general de las olas (1.0 = normal, 2.0 = fuerte)
  waveFrequency: 7.0,       // Frecuencia/Densidad de olas (más alto = más ondas juntas)
  
  // Interacción (Dibujo/Lápiz)
  interactionRadius: 0.5,   // Radio de efecto del pincel (0.0 a 1.0)
  interactionStrength: 0.5, // Intensidad de la onda al tocar (altura)
  interactionFreq: 20.0,    // Frecuencia de las ondas del pincel (más alto = más ondas juntas)
  interactionSpeed: 8.0,    // Velocidad a la que se mueven las ondas del pincel

  // Distorsión visual (Refracción)
  refractionStrength: 0.075, // Cuánto distorsiona la imagen de fondo (0.0 = sin distorsión)

  // Color y Atmósfera
  waterTint: [0.0, 0.2, 0.5],  // Color del tinte azul (R, G, B) - Más profundo
  tintIntensity: 0.55,         // Intensidad de la mezcla
  colorBalance: [0.8, 0.95, 1.3], // Menos rojo, más azul para efecto subacuático
  contrast: 1.8,               // Aumentar contraste para sombras marcadas
  brightness: 0.7,             // Ligeramente más oscuro
  
  // Textura y Grano
  noiseIntensity: 0.2,        // Intensidad del grano/ruido (0.0 = imagen limpia)

  // Iluminación (Reflejos Especulares)
  specularIntensity: 1.0,      // Intensidad de los reflejos de luz (0.0 = mate, >1.0 = muy brillante)
  specularShininess: 60.0,     // "Dureza" del brillo (más alto = punto de luz más pequeño y concentrado)
  lightDirection: [-0.5, 0.5, 1.0], // Dirección de la luz virtual [x, y, z]

  // Cámara
  cameraZoom: 1.0,             // Zoom de la cámara (1.0 = normal, <1.0 = zoom in/cerca, >1.0 = alejar)

  // Lluvia (Gotas aleatorias)
  rainIntensity: 0.6,          // Intensidad de las gotas (0.0 = desactivado)
  rainScale: 2.0,              // Escala de la cuadrícula de lluvia (más alto = gotas más pequeñas y frecuentes en pantalla)
  rainSpeed: 1.0,              // Velocidad del ciclo de lluvia

  // Enfoque (Blur Radial / Tilt-Shift)
  blurStrength: 3.0,           // Cantidad de desenfoque en los bordes
  focusRadius: 0.4,            // Tamaño del área central nítida (0.0 a 1.0)
  baseBlur: 0.8                // Desenfoque base en toda la imagen (Efecto difuso/reflejo)
};

function RippleBackground({ enabled, sharedPointerRef }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!enabled) return;

    const canvas = canvasRef.current;
    const gl =
      canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false, antialias: false }) ||
      canvas.getContext('experimental-webgl', { alpha: true, premultipliedAlpha: false, antialias: false });

    if (!gl) return;

    const vertSrc = `
      attribute vec2 aPos;
      void main() {
        gl_Position = vec4(aPos, 0.0, 1.0);
      }
    `;

    const fragSrc = `
      precision highp float;

      uniform vec2 uResolution;
      uniform vec2 uVideoRes; 
      uniform float uTime;
      uniform vec4 uMouse;
      uniform sampler2D uChannel0;
      uniform float uVideoReady;

      vec2 paramsDefault() {
        return vec2(${SHADER_CONFIG.baseWaveSpeed.toFixed(1)}, 1.0);
      }

      // Simple pseudo-random function for grain/noise
      float rand(vec2 co) {
        return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
      }

      float rain(vec2 pos, float t) {
          float scale = ${SHADER_CONFIG.rainScale.toFixed(1)};
          vec2 id = floor(pos * scale);
          vec2 f = fract(pos * scale) - 0.5;
          
          float n = rand(id);
          float t_adj = t * ${SHADER_CONFIG.rainSpeed.toFixed(1)} + n * 100.0;
          float period = 4.0 + n * 10.0; // Random period
          float life = mod(t_adj, period);
          
          float r = 0.0;
          if (life < 1.5) {
               // Random position for this cycle
               float cycleIdx = floor(t_adj / period);
               float rndStart = rand(id + cycleIdx);
               vec2 offset = vec2(
                   (rndStart - 0.5) * 0.6,
                   (rand(id + cycleIdx + 0.1) - 0.5) * 0.6
               );
               
               // Variation in size (max 0.4, min 0.15) and intensity
               float dropRnd = fract(rndStart * 123.45); 
               float size = 0.15 + 0.25 * dropRnd;
               float intensity = 0.5 + 0.5 * dropRnd; // Smaller drops are also weaker

               float d = length(f - offset);
               float mask = smoothstep(size, 0.0, d);
               r = sin(25.0 * d - 10.0 * life) * exp(-life * 2.0) * mask * intensity;
          }
          return r * ${SHADER_CONFIG.rainIntensity.toFixed(1)};
      }

      float height(vec2 pos, float t, vec2 params) {
        float speed = params.x;
        float amp = ${SHADER_CONFIG.waveAmplitude.toFixed(1)};
        float freq = ${SHADER_CONFIG.waveFrequency.toFixed(1)};
        float w = 0.0;
        
        // Sum of sine waves with turbulence to create randomness
        // Layer 1: Base swell (large, slow)
        w += 0.50 * amp * sin(dot(pos, vec2(0.8, 0.5)) * freq + t * speed);
        
        // Layer 2: Cross waves (medium)
        w += 0.35 * amp * sin(dot(pos, vec2(-0.7, 0.7)) * (freq * 1.4) + t * speed * 1.1);
        
        // Layer 3: Turbulence (irregular, breaking linearity)
        // Using coordinate distortion (sin inside sin) to simulate random liquid motion
        float q = freq * 2.2;
        w += 0.15 * amp * sin(pos.x * q + t * speed * 1.5 + 2.0 * sin(pos.y * q * 0.4));
        w += 0.12 * amp * sin(pos.y * q * 1.3 + t * speed * 1.6 + 2.0 * sin(pos.x * q * 0.5));

        // Raindrops
        if (${SHADER_CONFIG.rainIntensity.toFixed(1)} > 0.0) {
             w += rain(pos, t);
        }

        // Interaction ripple
        if (uMouse.z > 0.0) {
           vec2 m = (uMouse.xy / uResolution.xy) * 2.0 - 1.0;
           float d = length(pos - m);
           // Localized distortion based on distance to pencil
           float mask = smoothstep(${SHADER_CONFIG.interactionRadius.toFixed(1)}, 0.0, d); 
           // Add high frequency ripples near pointer
           w += ${SHADER_CONFIG.interactionStrength.toFixed(1)} * sin(${SHADER_CONFIG.interactionFreq.toFixed(1)} * d - ${SHADER_CONFIG.interactionSpeed.toFixed(1)} * t) * mask;
        }
        
        return w;
      }

      vec2 normalV(vec2 pos, float t, vec2 params) {
        float e = 0.01;
        return vec2(
          height(pos - vec2(e, 0.0), t, params) - height(pos, t, params),
          height(pos - vec2(0.0, e), t, params) - height(pos, t, params)
        );
      }

      vec3 baseColor(vec2 uv) {
        vec2 p = uv * 2.0 - 1.0;
        float r = length(p);
        float a = atan(p.y, p.x);
        float g1 = 0.55 + 0.45 * sin(3.0 * a + 2.2 * uTime + r * 4.0);
        float g2 = 0.55 + 0.45 * sin(2.0 * a - 1.6 * uTime + r * 3.0);
        vec3 c1 = vec3(0.02, 0.45, 0.62);
        vec3 c2 = vec3(0.08, 0.85, 0.92);
        vec3 col = mix(c1, c2, 0.5 + 0.5 * sin((g1 + g2) * 1.2));
        float v = smoothstep(1.1, 0.2, r);
        return col * (0.35 + 0.65 * v);
      }

      void main() {
        vec2 fragCoord = gl_FragCoord.xy;
        vec2 uv = fragCoord / uResolution.xy;
        vec2 uvn = 2.0 * uv - vec2(1.0);

        vec2 params = paramsDefault();
        // Global mouse interaction removed to keep effect local
        // if (uMouse.z > 0.0) { ... }

        vec2 n = normalV(uvn, uTime, params);
        vec2 duv = n * ${SHADER_CONFIG.refractionStrength.toFixed(3)};

        vec2 suv = vec2(1.0 - (uv.x + duv.x), uv.y + duv.y);
        
        // --- Aspect Ratio Correction & Zoom (Cover Mode) ---
        float screenAspect = uResolution.x / uResolution.y;
        float videoAspect = uVideoReady > 0.5 ? uVideoRes.x / uVideoRes.y : 1.77; 
        
        vec2 texScale = vec2(1.0);
        if (screenAspect > videoAspect) {
             // Screen is wider than video, crop top/bottom (scale Y)
             texScale.y = videoAspect / screenAspect;
        } else {
             // Screen is taller than video, crop sides (scale X)
             texScale.x = screenAspect / videoAspect;
        }
        
        // Apply Zoom (Manual correction for wide angle lens)
        texScale *= ${SHADER_CONFIG.cameraZoom.toFixed(2)};

        // Transform simplified UVs for texture sampling
        // We use 'suv' which already includes water distortion
        vec2 texUv = (suv - 0.5) * texScale + 0.5;
        // ---------------------------------------------------

        texUv = clamp(texUv, 0.0, 1.0); // Clamp to avoid repeating/glitching edges
        
        // --- Radial Blur / Focus Effect ---
        float distToCenter = length(uvn);
        // Calculate how blurry this pixel should be (0.0 = sharp, 1.0 = blurry)
        float radialBlur = smoothstep(${SHADER_CONFIG.focusRadius.toFixed(2)}, 1.2, distToCenter);
        
        // Combine base blur (center/reflection look) with radial blur (edges)
        float blurStr = ${SHADER_CONFIG.baseBlur.toFixed(1)} + (radialBlur * ${SHADER_CONFIG.blurStrength.toFixed(1)});
        
        vec3 camCol;
        
        if (blurStr > 0.01) {
             // 9-tap Blur (Center + 8 surrounding)
             vec3 acc = texture2D(uChannel0, texUv).rgb * 4.0; // Center weight
             float off = 0.003 * blurStr; // Offset spreads with blur strength
             
             acc += texture2D(uChannel0, clamp(texUv + vec2(off, 0.0), 0.0, 1.0)).rgb;
             acc += texture2D(uChannel0, clamp(texUv + vec2(-off, 0.0), 0.0, 1.0)).rgb;
             acc += texture2D(uChannel0, clamp(texUv + vec2(0.0, off), 0.0, 1.0)).rgb;
             acc += texture2D(uChannel0, clamp(texUv + vec2(0.0, -off), 0.0, 1.0)).rgb;
             
             // Diagonals
             acc += texture2D(uChannel0, clamp(texUv + vec2(off, off), 0.0, 1.0)).rgb;
             acc += texture2D(uChannel0, clamp(texUv + vec2(-off, off), 0.0, 1.0)).rgb;
             acc += texture2D(uChannel0, clamp(texUv + vec2(off, -off), 0.0, 1.0)).rgb;
             acc += texture2D(uChannel0, clamp(texUv + vec2(-off, -off), 0.0, 1.0)).rgb;
             
             camCol = acc / 12.0; // Total weight (4 + 8)
        } else {
             camCol = texture2D(uChannel0, texUv).rgb;
        }
        
        // --- Underwater Color Grading ---
        // 1. Contrast & Brightness (Accentuates shadows)
        camCol = (camCol - 0.5) * ${SHADER_CONFIG.contrast.toFixed(1)} + 0.6;
        camCol += (${SHADER_CONFIG.brightness.toFixed(1)} - 1.0);
        
        // 2. Desaturate Red channel (Deep water absorbs red light first)
        camCol.r *= 0.8; 

        // ----------------------------------
        
        // Apply blue water filter
        vec3 waterBlue = vec3(${SHADER_CONFIG.waterTint.join(', ')});
        camCol = mix(camCol, waterBlue, ${SHADER_CONFIG.tintIntensity.toFixed(1)}); // Mix with blue
        
        // Add mystical grain/noise
        float noise = rand(uv + uTime * 0.1) * ${SHADER_CONFIG.noiseIntensity.toFixed(2)};
        camCol += vec3(noise);
        
        camCol *= vec3(${SHADER_CONFIG.colorBalance.join(', ')}); // Cool balance
        
        vec3 col = mix(baseColor(fract(suv)), camCol, step(0.5, uVideoReady));

        // Add Specular Highlights (Water surface reflection)
        // Convert 2D gradient normal to 3D surface normal
        vec3 normal3D = normalize(vec3(-n.x * 5.0, -n.y * 5.0, 1.0));
        vec3 lightDir = normalize(vec3(${SHADER_CONFIG.lightDirection.join(', ')}));
        vec3 viewDir = vec3(0.0, 0.0, 1.0); // Looking straight down
        vec3 reflectDir = reflect(-lightDir, normal3D);
        float specular = pow(max(dot(viewDir, reflectDir), 0.0), ${SHADER_CONFIG.specularShininess.toFixed(1)});
        col += vec3(1.0) * specular * ${SHADER_CONFIG.specularIntensity.toFixed(1)};

        float vignette = smoothstep(1.25, 0.2, length(uvn));
        col *= 0.75 + 0.25 * vignette;

        gl_FragColor = vec4(col, 1.0);
      }
    `;

    const compile = (type, source) => {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        gl.deleteShader(shader);
        return null;
      }
      return shader;
    };

    const vs = compile(gl.VERTEX_SHADER, vertSrc);
    const fs = compile(gl.FRAGMENT_SHADER, fragSrc);
    if (!vs || !fs) return;

    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      gl.deleteProgram(program);
      return;
    }

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW
    );

    gl.useProgram(program);
    const aPos = gl.getAttribLocation(program, 'aPos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const uResolution = gl.getUniformLocation(program, 'uResolution');
    const uVideoRes = gl.getUniformLocation(program, 'uVideoRes');
    const uTime = gl.getUniformLocation(program, 'uTime');
    const uMouse = gl.getUniformLocation(program, 'uMouse');
    const uChannel0 = gl.getUniformLocation(program, 'uChannel0');
    const uVideoReady = gl.getUniformLocation(program, 'uVideoReady');

    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    const video = document.createElement('video');
    
    // Critical for iOS
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
    video.setAttribute('muted', '');
    
    video.muted = true;
    video.playsInline = true;
    video.autoplay = true;

    // iOS Safari fix: Video element needs to be in the DOM and visible (even if 1px transparent)
    // for the stream to update reliably as a texture
    video.style.position = 'fixed';
    video.style.top = '0';
    video.style.left = '0';
    video.style.width = '1px';
    video.style.height = '1px';
    video.style.opacity = '0.01'; // Not 0 to avoid being culled
    video.style.pointerEvents = 'none';
    video.style.zIndex = '-1';
    document.body.appendChild(video);

    const tex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.uniform1i(uChannel0, 0);

    let stream = null;
    let videoReady = false;
    const startCamera = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        console.warn('Camera API not supported or not secure context');
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { 
            facingMode: 'user',
            width: { ideal: 1280 },
            height: { ideal: 720 }
           },
          audio: false
        });
        
        video.srcObject = stream;
        
        // Ensure dimensions are set for iOS
        video.onloadedmetadata = () => {
             video.width = video.videoWidth;
             video.height = video.videoHeight;
        };

        try {
            await video.play();
            videoReady = true;
        } catch (playError) {
            console.warn("Autoplay failed/blocked:", playError);
            // Fallback for iOS interaction requirement
            const enableVideo = () => {
                video.play().then(() => {
                    videoReady = true;
                    document.removeEventListener('touchstart', enableVideo);
                    document.removeEventListener('click', enableVideo);
                });
            };
            document.addEventListener('touchstart', enableVideo);
            document.addEventListener('click', enableVideo);
        }
      } catch (e) {
        console.error('Camera/Video error:', e);
        videoReady = false;
      }
    };
    startCamera();

    const localMouse = { x: 0, y: 0, down: 0 };
    const getMouseState = () => sharedPointerRef ? sharedPointerRef.current : localMouse;

    const onPointerMove = (e) => {
      const rect = canvas.getBoundingClientRect();
      const m = getMouseState();
      m.x = (e.clientX - rect.left) * (window.devicePixelRatio || 1);
      m.y = (rect.bottom - e.clientY) * (window.devicePixelRatio || 1);
    };
    const onPointerDown = () => {
      getMouseState().down = 1;
    };
    const onPointerUp = () => {
      getMouseState().down = 0;
    };

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerdown', onPointerDown, { passive: true });
    window.addEventListener('pointerup', onPointerUp, { passive: true });

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = Math.max(1, Math.floor(window.innerWidth * dpr));
      const h = Math.max(1, Math.floor(window.innerHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        gl.viewport(0, 0, w, h);
      }
      gl.uniform2f(uResolution, canvas.width, canvas.height);
    };

    resize();
    window.addEventListener('resize', resize, { passive: true });

    let raf = 0;
    const start = performance.now();
    const render = () => {
      const now = performance.now();
      const t = (now - start) / 1000;
      const m = getMouseState();
      gl.uniform1f(uTime, t);
      gl.uniform4f(uMouse, m.x, m.y, m.down, 0);
      gl.uniform1f(uVideoReady, videoReady ? 1 : 0);

      if (videoReady && video.readyState >= 2) {
        gl.uniform2f(uVideoRes, video.videoWidth || 1280, video.videoHeight || 720);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
      }
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      raf = requestAnimationFrame(render);
    };

    raf = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointerup', onPointerUp);
      if (stream) {
        for (const track of stream.getTracks()) track.stop();
      }
      if (video.parentNode) {
          document.body.removeChild(video);
      }
      gl.deleteTexture(tex);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
    };
  }, [enabled]);

  if (!enabled) return null;

  return <canvas ref={canvasRef} className="ripple-bg" aria-hidden="true" />;
}

export default function App() {
  const [appState, setAppState] = useState(STATES.WRITING);
  const [writingStage, setWritingStage] = useState(WRITING_STAGES.INTRO);
  const [poem, setPoem] = useState(null);
  const [illustration, setIllustration] = useState(null);
  const [emotion, setEmotion] = useState('');
  const [poemId, setPoemId] = useState(null); // ID del poema guardado
  const [existingAudioUrl, setExistingAudioUrl] = useState(null); // Audio from DB
  const [recentPoems, setRecentPoems] = useState([]);
  const [isPoemsLoading, setIsPoemsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Shared pointer state for water ripple effect
  const sharedPointerRef = useRef({ x: 0, y: 0, down: 0 });

  const handleStrokeUpdate = useCallback((x, y, isDown) => {
    if (sharedPointerRef.current) {
      const dpr = window.devicePixelRatio || 1;
      // Convert top-left coordinates to bottom-left (GL style) and scale by DPR
      sharedPointerRef.current.x = x * dpr;
      sharedPointerRef.current.y = (window.innerHeight - y) * dpr;
      sharedPointerRef.current.down = isDown ? 1 : 0;
    }
  }, []);

  // Initialize and Fetch Data
  useEffect(() => {
    const init = async () => {
      if (isSupabaseConfigured()) {
        try {
          setIsPoemsLoading(true);
          const poems = await getRecentPoems();
          if (poems?.length) setRecentPoems(poems);
        } catch (error) {
          console.error('Failed to load recent poems:', error);
        } finally {
          setIsPoemsLoading(false);
        }
      } else {
        setIsPoemsLoading(false);
      }
    };
    init();
  }, []);

  // Check configuration on mount
  const configWarnings = [];
  if (!isOpenAIConfigured()) {
    configWarnings.push('⚠️ Configura VITE_OPENAI_API_KEY en el archivo .env');
  }
  if (!isSupabaseConfigured()) {
    configWarnings.push('⚠️ Configura las variables de Supabase en el archivo .env');
  }
  if (!isElevenLabsConfigured()) {
    console.info('ℹ️ ElevenLabs no configurado - La lectura de poemas estará deshabilitada');
  }

  const handleCanvasSubmit = useCallback(async (imageData) => {
    try {
      setAppState(STATES.PROCESSING);
      setError(null);
      setIllustration(null);
      
      // Step 1: Vision AI - Recognize the handwriting
      console.log('👁️ Reading handwriting...');
      const recognizedText = await recognizeEmotionFromImage(imageData);
      
      if (!recognizedText) {
        throw new Error('No se pudo reconocer ninguna emoción. Intenta escribir más claro.');
      }
      
      setEmotion(recognizedText);
      
      // Step 2: Generate Content
      console.log('✨ Generating poem & art...');
      
      const poemPromise = generatePoem(recognizedText);
      const illustrationPromise = generateIllustration(recognizedText);
      
      const [poemResult, illustrationResult] = await Promise.allSettled([
        poemPromise,
        illustrationPromise
      ]);
      
      // Handle Poem
      if (poemResult.status === 'fulfilled') {
        const generatedPoem = poemResult.value;
        
        let displayUrl = null; // For showing now
        let permanentUrl = null; // For saving to DB
        let rawBase64 = null;

        setPoem(generatedPoem);
        
        // Handle Illustration
        if (illustrationResult.status === 'fulfilled' && illustrationResult.value) {
          rawBase64 = illustrationResult.value;
          // Create temp URL for immediate display
          displayUrl = `data:image/png;base64,${rawBase64}`;
          
          console.log('🎨 Illustration ready for display');
          setIllustration(displayUrl);
          
          // Preload temp image (already in memory but good practice)
          try {
            await new Promise((resolve) => {
              const img = new Image();
              img.onload = resolve;
              img.onerror = resolve; 
              img.src = displayUrl;
            });
          } catch (e) {
            console.warn('Image preload failed', e);
          }
        } else {
          setIllustration(null);
        }
        
        setAppState(STATES.POEM);

        // Step 3: Upload & Save (non-blocking for UI, but blocking for DB consistency)
        if (isSupabaseConfigured()) {
          (async () => {
            try {
              // If we have an image, upload it first to get permanent URL
              if (rawBase64) {
                console.log('☁️ Uploading image to storage...');
                permanentUrl = await uploadIllustration(rawBase64, recognizedText);
              }
              
              const savedPoem = await savePoem({ 
                emotion: recognizedText, 
                poem: generatedPoem, 
                illustration: permanentUrl // Null if failed or no image
              });
              
              // Store poem ID for audio association
              if (savedPoem?.id) {
                setPoemId(savedPoem.id);
                
                // Optimización: agregar nuevo poema al state en lugar de recargar todos
                setRecentPoems(prev => [savedPoem, ...prev].slice(0, 20));
              }
            } catch (error) {
              console.error('Failed to save poem to database:', error);
              // No bloqueamos la UI, el poema ya se muestra
            }
          })();
        }
      } else {
        throw new Error('No se pudo generar el poema. Por favor intenta de nuevo.');
      }
      
    } catch (err) {
      console.error('Error:', err);
      setError(err.message || 'Ocurrió un error. Intenta de nuevo.');
      setAppState(STATES.ERROR);
    }
  }, []);

  const handleNewPoem = useCallback(() => {
    setAppState(STATES.WRITING);
    setWritingStage(WRITING_STAGES.INTRO);
    setPoem(null);
    setIllustration(null);
    setEmotion('');
    setPoemId(null);
    setExistingAudioUrl(null);
    setError(null);
  }, []);

  const handleStartWriting = useCallback(() => {
    setWritingStage(WRITING_STAGES.CANVAS);
  }, []);

  const handleSelectHistoryPoem = useCallback((poemItem) => {
    // Load a poem from history
    setEmotion(poemItem.emotion);
    setPoem(poemItem.poem);
    setIllustration(poemItem.image_url || null);
    setPoemId(poemItem.id || null); // Set poem ID for audio reuse
    setExistingAudioUrl(poemItem.audio_url || null); // Load existing audio
    setAppState(STATES.POEM);
  }, []);

  const isWritingIntro = appState === STATES.WRITING && writingStage === WRITING_STAGES.INTRO;
  const isWritingCanvas = appState === STATES.WRITING && writingStage === WRITING_STAGES.CANVAS;
  
  // Enable Ripple/Water effect for all states except Error (optional)
  const isRippleEnabled = appState !== STATES.ERROR;

  return (
    <div className={`app ${appState === STATES.POEM ? 'app-scrollable' : 'app-fixed'} ${isRippleEnabled ? 'app-fullscreen' : ''}`}>
      <RippleBackground enabled={isRippleEnabled} sharedPointerRef={sharedPointerRef} />
      {/* Configuration Warnings */}
      {configWarnings.length > 0 && appState === STATES.WRITING && !isRippleEnabled && (
        <div className="config-warnings">
          {configWarnings.map((warning, i) => (
            <p key={i} className="config-warning">{warning}</p>
          ))}
        </div>
      )}

      {/* Writing State */}
      {isWritingIntro && (
        <div
          className="intro-screen"
          role="button"
          tabIndex={0}
          onPointerUp={handleStartWriting}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') handleStartWriting();
          }}
        >
          <div className="intro-title">Eres un poema</div>
          <div className="intro-cta">Pulsa para comenzar</div>
        </div>
      )}

      {isWritingCanvas && (
        <div className="writing-screen">
          <div className="writing-hint">Usa el boli para escribir una emoción</div>
          <WritingCanvas 
            onSubmit={handleCanvasSubmit} 
            isProcessing={false} 
            fullScreen 
            onStrokeUpdate={handleStrokeUpdate}
          />
        </div>
      )}

      {/* Processing State */}
      {appState === STATES.PROCESSING && (
        <Loader emotion={emotion} />
      )}

      {/* Poem Display State */}
      {appState === STATES.POEM && (
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', flexGrow: 1 }}>
          <Suspense fallback={<Loader emotion={emotion} />}>
            <PoemDisplay 
              poem={poem}
              emotion={emotion}
              existingAudioUrl={existingAudioUrl}
              illustration={illustration}
              poemId={poemId}
              onNewPoem={handleNewPoem}
            />
          </Suspense>
        </div>
      )}

      {/* History Carousel - Visible in Writing and Poem states */}
      {appState === STATES.POEM && (recentPoems.length > 0 || isPoemsLoading) && (
        <Suspense fallback={null}>
          <PoemCarousel 
            poems={recentPoems} 
            isLoading={isPoemsLoading}
            onSelect={handleSelectHistoryPoem} 
          />
        </Suspense>
      )}

      {/* Error State */}
      {appState === STATES.ERROR && (
        <div className="error-container animate-fade-in-up">
          <div className="error-icon">😔</div>
          <h2>Algo salió mal</h2>
          <p>{error}</p>
          <button className="btn btn-primary" onClick={handleNewPoem}>
            Intentar de nuevo
          </button>
        </div>
      )}
    </div>
  );
}
