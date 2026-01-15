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
  baseWaveSpeed: 1.4,         // Velocidad más suave para ondas orgánicas
  waveAmplitude: 1.5,         // Altura general de las olas (reducido para más sutileza)
  waveFrequency: 12.0,         // Frecuencia/Densidad de olas (más bajo = ondas más amplias)
  
  // Ruido orgánico (NUEVO - clave para naturalidad)
  organicNoiseScale: 3.0,     // Escala del ruido Simplex para ondas naturales
  organicNoiseSpeed: 0.7,     // Velocidad del ruido (lento = más sereno)
  organicNoiseStrength: 0.5,  // Intensidad del ruido en las ondas
  microWaveIntensity: 0.01,   // Pequeñas ondulaciones de superficie - 0.12
  microWaveSpeed: 0.2,        // Velocidad de micro-ondas
  
  // Interacción (Dibujo/Lápiz) - MÁS ORGÁNICO Y SUTIL
  interactionRadius: 0.9,     // Radio de efecto más amplio para bordes suaves
  interactionStrength: 2.25,  // Intensidad reducida para sutileza
  interactionFreq: 4.5,       // Ondas más anchas y gentiles
  interactionSpeed: 2.5,      // Propagación más lenta y serena
  interactionDecay: 1.8,      // Desvanecimiento más gradual
  interactionWobble: 0.18,    // Más distorsión orgánica (menos círculos perfectos)
  
  // Distorsión visual (Refracción)
  refractionStrength: 0.065,  // Cuánto distorsiona la imagen de fondo (más sutil)

  // Color y Atmósfera - MEJORADO con variación de profundidad
  waterTint: [0.02, 0.18, 0.42],   // Color del tinte azul profundo
  shallowTint: [0.08, 0.28, 0.52], // Color en zonas "superficiales"
  tintIntensity: 0.48,             // Intensidad de la mezcla (más sutil)
  depthColorVariation: 0.25,       // Variación de color según altura de onda
  colorBalance: [0.85, 0.95, 1.25], // Balance de color más natural
  contrast: 1.5,                   // Contraste reducido para look más natural
  brightness: 0.85,                // Ligeramente más oscuro
  
  // Cáusticas (patrones de luz refractada) - NUEVO
  causticsIntensity: 0.05,    // Intensidad de cáusticas (sutil)
  causticsScale: 29.0,         // Tamaño del patrón
  causticsSpeed: 0.4,         // Velocidad de movimiento
  
  // Textura y Grano
  noiseIntensity: 0.08,       // Intensidad del grano (más sutil)

  // Iluminación (Reflejos Especulares)
  specularIntensity: 0.8,     // Intensidad de los reflejos de luz (más sutil)
  specularShininess: 55.0,    // Brillo más suave y natural
  lightDirection: [-0.4, -0.6, 1.0], // Dirección de la luz virtual [x, y, z]

  // Cámara
  cameraZoom: 1.0,            // Zoom de la cámara (1.0 = normal)



  // Enfoque (Blur Radial / Tilt-Shift)
  blurStrength: 2.5,          // Cantidad de desenfoque en los bordes
  focusRadius: 0.45,          // Tamaño del área central nítida
  baseBlur: 0.6               // Desenfoque base en toda la imagen
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

      // ================================================
      // SIMPLEX NOISE - Para ondas orgánicas naturales
      // ================================================
      vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
      vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
      vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }

      float snoise(vec2 v) {
        const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                           -0.577350269189626, 0.024390243902439);
        vec2 i  = floor(v + dot(v, C.yy));
        vec2 x0 = v - i + dot(i, C.xx);
        vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
        vec4 x12 = x0.xyxy + C.xxzz;
        x12.xy -= i1;
        i = mod289(i);
        vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
        vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
        m = m*m; m = m*m;
        vec3 x = 2.0 * fract(p * C.www) - 1.0;
        vec3 h = abs(x) - 0.5;
        vec3 ox = floor(x + 0.5);
        vec3 a0 = x - ox;
        m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
        vec3 g;
        g.x = a0.x * x0.x + h.x * x0.y;
        g.yz = a0.yz * x12.xz + h.yz * x12.yw;
        return 130.0 * dot(m, g);
      }

      // Fractal Brownian Motion para ondas más complejas (Optimized: 3 octaves)
      float fbm(vec2 p, float t) {
        float f = 0.0;
        float w = 0.5;
        float noiseSpeed = ${SHADER_CONFIG.organicNoiseSpeed.toFixed(2)};
        for (int i = 0; i < 3; i++) {
          f += w * snoise(p + t * noiseSpeed);
          p *= 2.0;
          w *= 0.5;
          noiseSpeed *= 0.8;
        }
        return f;
      }

      // ================================================
      // FUNCIONES AUXILIARES
      // ================================================
      float rand(vec2 co) {
        return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
      }



      // Cáusticas (patrones de luz bajo el agua)
      float caustics(vec2 uv, float t) {
        float scale = ${SHADER_CONFIG.causticsScale.toFixed(1)};
        float speed = ${SHADER_CONFIG.causticsSpeed.toFixed(2)};
        
        vec2 p = uv * scale;
        float c1 = snoise(p + t * speed);
        float c2 = snoise(p * 1.5 - t * speed * 0.7 + vec2(1.7, 2.3));
        float c3 = snoise(p * 2.0 + t * speed * 0.5 + vec2(3.1, 1.4));
        
        // Combinar para crear patrón de red de luz
        float caustic = c1 * c2 * c3;
        caustic = pow(abs(caustic), 0.5) * sign(caustic);
        
        return caustic * ${SHADER_CONFIG.causticsIntensity.toFixed(2)};
      }

      // ================================================
      // FUNCIÓN PRINCIPAL DE ALTURA DE ONDA
      // ================================================
      float height(vec2 pos, float t) {
        float speed = ${SHADER_CONFIG.baseWaveSpeed.toFixed(1)};
        float amp = ${SHADER_CONFIG.waveAmplitude.toFixed(1)};
        float freq = ${SHADER_CONFIG.waveFrequency.toFixed(1)};
        float noiseScale = ${SHADER_CONFIG.organicNoiseScale.toFixed(1)};
        float noiseStrength = ${SHADER_CONFIG.organicNoiseStrength.toFixed(2)};
        
        float w = 0.0;
        
        // === ONDAS ORGÁNICAS CON RUIDO SIMPLEX ===
        // Capa base: ondas grandes y suaves con ruido
        float noiseOffset = fbm(pos * noiseScale * 0.3, t * 0.2);
        w += 0.45 * amp * sin(dot(pos + noiseOffset * 0.3, vec2(0.7, 0.4)) * freq + t * speed);
        
        // Capa secundaria: ondas cruzadas con variación
        float noiseOffset2 = snoise(pos * noiseScale * 0.5 + t * 0.15);
        w += 0.30 * amp * sin(dot(pos, vec2(-0.6, 0.8)) * (freq * 1.3) + t * speed * 0.9 + noiseOffset2 * 0.5);
        
        // Capa de turbulencia orgánica (reemplaza senos anidados)
        w += noiseStrength * amp * fbm(pos * noiseScale, t * speed * 0.4);
        
        // === MICRO-ONDAS DE SUPERFICIE ===
        float microWave = snoise(pos * 15.0 + t * ${SHADER_CONFIG.microWaveSpeed.toFixed(1)});
        microWave += 0.5 * snoise(pos * 25.0 - t * ${SHADER_CONFIG.microWaveSpeed.toFixed(1)} * 1.3);
        w += microWave * ${SHADER_CONFIG.microWaveIntensity.toFixed(2)} * amp;




        
        return w;
      }

      // Calcular normal de superficie
      vec2 normalV(vec2 pos, float t) {
        float e = 0.008; // Epsilon más pequeño para normales más suaves
        return vec2(
          height(pos - vec2(e, 0.0), t) - height(pos, t),
          height(pos - vec2(0.0, e), t) - height(pos, t)
        );
      }

      // Color de fondo (fallback simple sin cámara)
      vec3 baseColor(vec2 uv) {
        return vec3(0.02, 0.18, 0.42); // Color base del agua (Deep Blue)
      }

      // ================================================
      // MAIN
      // ================================================
      void main() {
        vec2 fragCoord = gl_FragCoord.xy;
        vec2 uv = fragCoord / uResolution.xy;
        vec2 uvn = 2.0 * uv - vec2(1.0);

        // Calcular altura y normal
        float h = height(uvn, uTime);
        vec2 n = normalV(uvn, uTime);
        vec2 duv = n * ${SHADER_CONFIG.refractionStrength.toFixed(3)};

        vec2 suv = vec2(1.0 - (uv.x + duv.x), uv.y + duv.y);
        
        // --- Aspect Ratio Correction & Zoom ---
        float screenAspect = uResolution.x / uResolution.y;
        float videoAspect = uVideoReady > 0.5 ? uVideoRes.x / uVideoRes.y : 1.77; 
        
        vec2 texScale = vec2(1.0);
        if (screenAspect > videoAspect) {
          texScale.y = videoAspect / screenAspect;
        } else {
          texScale.x = screenAspect / videoAspect;
        }
        
        texScale *= ${SHADER_CONFIG.cameraZoom.toFixed(2)};
        vec2 texUv = (suv - 0.5) * texScale + 0.5;
        texUv = clamp(texUv, 0.0, 1.0);
        
        // --- Radial Blur / Focus Effect ---
        float distToCenter = length(uvn);
        float radialBlur = smoothstep(${SHADER_CONFIG.focusRadius.toFixed(2)}, 1.15, distToCenter);
        float blurStr = ${SHADER_CONFIG.baseBlur.toFixed(1)} + (radialBlur * ${SHADER_CONFIG.blurStrength.toFixed(1)});
        
        vec3 camCol;
        
        if (blurStr > 0.01) {
          vec3 acc = texture2D(uChannel0, texUv).rgb * 4.0;
          float off = 0.0025 * blurStr;
          
          acc += texture2D(uChannel0, clamp(texUv + vec2(off, 0.0), 0.0, 1.0)).rgb;
          acc += texture2D(uChannel0, clamp(texUv + vec2(-off, 0.0), 0.0, 1.0)).rgb;
          acc += texture2D(uChannel0, clamp(texUv + vec2(0.0, off), 0.0, 1.0)).rgb;
          acc += texture2D(uChannel0, clamp(texUv + vec2(0.0, -off), 0.0, 1.0)).rgb;
          acc += texture2D(uChannel0, clamp(texUv + vec2(off, off), 0.0, 1.0)).rgb;
          acc += texture2D(uChannel0, clamp(texUv + vec2(-off, off), 0.0, 1.0)).rgb;
          acc += texture2D(uChannel0, clamp(texUv + vec2(off, -off), 0.0, 1.0)).rgb;
          acc += texture2D(uChannel0, clamp(texUv + vec2(-off, -off), 0.0, 1.0)).rgb;
          
          camCol = acc / 12.0;
        } else {
          camCol = texture2D(uChannel0, texUv).rgb;
        }
        
        // --- Color Grading Subacuático ---
        camCol = (camCol - 0.5) * ${SHADER_CONFIG.contrast.toFixed(2)} + 0.55;
        camCol += (${SHADER_CONFIG.brightness.toFixed(2)} - 1.0);
        camCol.r *= 0.85; // Absorción de rojo
        
        // --- Variación de color según profundidad de onda ---
        vec3 deepColor = vec3(${SHADER_CONFIG.waterTint.join(', ')});
        vec3 shallowColor = vec3(${SHADER_CONFIG.shallowTint.join(', ')});
        float depthFactor = clamp(h * ${SHADER_CONFIG.depthColorVariation.toFixed(2)} + 0.5, 0.0, 1.0);
        vec3 waterColor = mix(deepColor, shallowColor, depthFactor);
        
        camCol = mix(camCol, waterColor, ${SHADER_CONFIG.tintIntensity.toFixed(2)});
        
        // --- Añadir cáusticas sutiles ---
        float causticsVal = caustics(uv, uTime);
        camCol += vec3(0.8, 0.9, 1.0) * causticsVal * 0.15;
        
        // --- Grano/Ruido sutil ---
        float noise = (rand(uv + uTime * 0.1) - 0.5) * ${SHADER_CONFIG.noiseIntensity.toFixed(2)} * 2.0;
        camCol += vec3(noise);
        
        camCol *= vec3(${SHADER_CONFIG.colorBalance.join(', ')});
        
        vec3 col = mix(baseColor(fract(suv)), camCol, step(0.5, uVideoReady));

        // --- Reflejos Especulares ---
        vec3 normal3D = normalize(vec3(-n.x * 4.0, -n.y * 4.0, 1.0));
        vec3 lightDir = normalize(vec3(${SHADER_CONFIG.lightDirection.join(', ')}));
        vec3 viewDir = vec3(0.0, 0.0, 1.0);
        vec3 reflectDir = reflect(-lightDir, normal3D);
        float specular = pow(max(dot(viewDir, reflectDir), 0.0), ${SHADER_CONFIG.specularShininess.toFixed(1)});
        
        // Reflejos más suaves y naturales
        col += vec3(0.95, 0.97, 1.0) * specular * ${SHADER_CONFIG.specularIntensity.toFixed(2)};

        // --- Viñeta suave ---
        float vignette = smoothstep(1.3, 0.25, length(uvn));
        col *= 0.8 + 0.2 * vignette;

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
      // PERFORMANCE OPTIMIZATION:
      // Cap DPR to 1.5 to reduce GPU load on Retina screens (iPad). 
      // Rendering at native 2x/3x resolution generates excessive heat with this complex shader.
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      
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

  const handleOpenGallery = useCallback((e) => {
    e.stopPropagation();
    if (recentPoems.length > 0) {
      handleSelectHistoryPoem(recentPoems[0]);
    }
  }, [recentPoems, handleSelectHistoryPoem]);

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
          
          {/* Gallery Link (Restored) */}
          {!isPoemsLoading && recentPoems.length > 0 && (
            <button 
              className="btn btn-ghost" 
              style={{ marginTop: '2rem', fontSize: '0.9rem', opacity: 0.8, zIndex: 10 }}
              onPointerUp={(e) => { e.stopPropagation(); }}
              onClick={handleOpenGallery}
            >
              Ver galería de poemas ({recentPoems.length})
            </button>
          )}
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
            onOpenGallery={handleOpenGallery}
            galleryCount={recentPoems.length}
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
