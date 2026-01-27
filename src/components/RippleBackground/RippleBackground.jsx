import React, { useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { WaterSimulation } from './WaterSimulation';

// --- CONFIGURACIÓN DE EFECTOS VISUALES (AGUA) ---
// Ajusta estos valores para cambiar el aspecto del shader
const WATER_FX = {
  // Fuerza de las ondas automáticas (cuando el agua está en reposo)
  autoWaveStrength: 0.24, // Mayor valor = ondas automáticas más fuertes
  // Intensidad de la distorsión del agua (Refracción)
  refraction: 0.035, // 0.0 = sin distorsión

  // Intensidad y radio del desenfoque en los bordes
  blurIntensity: 16.0, // Mayor valor = más borroso en las esquinas
  blurStart: 0.15, // Radio desde el centro donde empieza el blur (0 = centro, 1 = borde)
  blurEnd: 0.75,   // Radio donde el blur llega a su máximo

  // Color del filtro azul (R, G, B) - Valores de 0.0 a 1.0
  filterColor: [0.0, 0.25, 0.55], // Azul profundo
  filterOpacity: 0.6, // 0.0 = transparente, 1.0 = color sólido

  // Color del reflejo del cielo (R, G, B)
  // Presets sugeridos:
  // - [0.7, 0.85, 1.0] -> Celeste claro (original)
  // - [0.4, 0.5, 0.7]  -> Azul suave / Atardecer gris
  // - [0.2, 0.35, 0.5] -> Azul acero profundo (más oscuro)
  // - [0.1, 0.2, 0.4]  -> Azul medianoche (muy oscuro)
  skyColor: [0.2, 0.35, 0.5], 

  // Brillos (Reflejos de luz)
  shineIntensity: 1.9, // Brillo principal (destellos) - (Aumentado para más brillo)
  shineSharpness: 100.0, // Que tan pequeño es el punto de luz (mayor = más nítido)
  
  wetnessIntensity: 1.5, // Brillo suave general (aspecto mojado)
  wetnessSpread: 10.0,   // Dispersión del brillo suave
};

const RippleBackground = forwardRef(({ enabled, sharedPointerRef }, ref) => {
  const canvasRef = useRef(null);
  const videoRef = useRef(null);
  const simulationRef = useRef(null);

  // Snapshot functionality for AI (Face analysis)
  useImperativeHandle(ref, () => ({
    getSnapshot: () => {
      if (!videoRef.current || videoRef.current.readyState < 2) return null;
      try {
          const v = videoRef.current;
          const c = document.createElement('canvas');
          c.width = v.videoWidth || 640;
          c.height = v.videoHeight || 480;
          const ctx = c.getContext('2d');
          
          // Mirror the image
          ctx.translate(c.width, 0);
          ctx.scale(-1, 1);
          
          ctx.drawImage(v, 0, 0, c.width, c.height);
          return c.toDataURL('image/jpeg', 0.8); 
      } catch(e) {
          console.error("Snapshot failed", e);
          return null;
      }
    }
  }));

  useEffect(() => {
    if (!enabled) return;

    const canvas = canvasRef.current;
    
    // Try to get WebGL context with float support
    const gl = canvas.getContext('webgl', { 
        alpha: false, 
        premultipliedAlpha: false, 
        antialias: false, 
        depth: false 
    }) || canvas.getContext('experimental-webgl');

    if (!gl) {
        console.error('WebGL not supported');
        return;
    }

    // Check strict requirements for float textures (needed for physics)
    // Some iOS devices need specific extensions enabled
    gl.getExtension('OES_texture_float');
    gl.getExtension('OES_texture_float_linear');
    gl.getExtension('OES_texture_half_float');
    gl.getExtension('OES_texture_half_float_linear');

    // Initialize Physics Simulation
    // We use a lower resolution for valid physics simulation (256x256 is enough for fluid)
    // but we can scale it up. 256 is usually plenty and fast.
    const simRes = 256; 
    let waterSim;
    try {
        waterSim = new WaterSimulation(gl, simRes, simRes);
        simulationRef.current = waterSim;
    } catch (e) {
        console.error("Failed to init water sim", e);
        return;
    }

    // --- SETUP VIDEO TEXTURE ---
    const videoTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, videoTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    // --- SETUP RENDER QUAD ---
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        -1, -1,
         1, -1,
        -1,  1,
         1,  1
    ]), gl.STATIC_DRAW);

    // --- COMPILE FINAL RENDER SHADER ---
    const vertSrc = `
      attribute vec2 aPos;
      varying vec2 vUv;
      void main() {
        vUv = aPos * 0.5 + 0.5;
        gl_Position = vec4(aPos, 0.0, 1.0);
      }
    `;

    // This shader mixes the Camera Feed with the Water Heightmap
    const fragSrc = `
      precision highp float;
      varying vec2 vUv;
      
      uniform sampler2D uWater; // Physics Simulation (Height in R, Normal in BA)
      uniform sampler2D uVideo; // Camera Feed
      uniform vec2 uResolution;
      uniform vec2 uVideoRes;
      uniform float uVideoReady;
      
      // Inyectamos valores de configuración desde JS
      const float REFRACTION = ${WATER_FX.refraction.toFixed(4)};
      const float BLUR_MAX = ${WATER_FX.blurIntensity.toFixed(1)};
      const float BLUR_START = ${WATER_FX.blurStart.toFixed(2)};
      const float BLUR_END = ${WATER_FX.blurEnd.toFixed(2)};
      const vec3 FILTER_COLOR = vec3(${WATER_FX.filterColor[0]}, ${WATER_FX.filterColor[1]}, ${WATER_FX.filterColor[2]});
      const float FILTER_OPACITY = ${WATER_FX.filterOpacity.toFixed(2)};
      const float SHINE_INT = ${WATER_FX.shineIntensity.toFixed(2)};
      const float SHINE_SHARP = ${WATER_FX.shineSharpness.toFixed(1)};
      const float WET_INT = ${WATER_FX.wetnessIntensity.toFixed(2)};
      const float WET_SPREAD = ${WATER_FX.wetnessSpread.toFixed(1)};
      const vec3 SKY_COLOR = vec3(${WATER_FX.skyColor[0]}, ${WATER_FX.skyColor[1]}, ${WATER_FX.skyColor[2]});
      
      const vec3 underwaterColor = vec3(0.0, 0.5, 0.8); // Adjusted for more depth
      const vec3 lightDir = normalize(vec3(0.5, 0.7, 0.5));
      const vec3 light2Dir = normalize(vec3(-0.8, 0.4, 0.2)); // Rim light source

      void main() {
         vec2 uv = vUv;
         
         // 1. Sample Water Physics
         vec4 waterInfo = texture2D(uWater, uv);
         float height = waterInfo.r;
         
         // Decode Normal
         float d = dot(waterInfo.ba, waterInfo.ba);
         vec3 normal = vec3(waterInfo.b, sqrt(max(0.0, 1.0 - d)), waterInfo.a);
         
         // 2. Base Color from Video
         vec3 color = vec3(0.0);
         vec2 vidUv = uv;
         
         if (uVideoReady > 0.5) {
             // Calculate video UVs with Aspect Ratio preservation and Mirroring
             float screenAspect = uResolution.x / uResolution.y;
             float vW = max(uVideoRes.x, 1.0);
             float vH = max(uVideoRes.y, 1.0);
             float videoAspect = vW / vH;
             
             vec2 texScale = vec2(1.0);
             if (screenAspect > videoAspect) {
                 texScale.y = videoAspect / screenAspect;
             } else {
                 texScale.x = screenAspect / videoAspect;
             }
             
             // Center and scale
             vidUv = (uv - 0.5) * texScale + 0.5;
             vidUv.x = 1.0 - vidUv.x; // Mirror X
             
             // Refraction with Chromatic Aberration
             vec2 refr = normal.xz * REFRACTION;
             
             // Radial Blur based on distance from center
             float distFromCenter = distance(vidUv, vec2(0.5));
             float blurFactor = smoothstep(BLUR_START, BLUR_END, distFromCenter); 
             float appliedBlur = BLUR_MAX * blurFactor;
             vec2 px = vec2(1.0) / max(uVideoRes, vec2(1.0));
             
             // Multi-tap sample for RGB channels with slight offsets (aberration)
             vec3 finalColor = vec3(0.0);
             float r = texture2D(uVideo, clamp(vidUv - refr * 1.1, 0.002, 0.998)).r;
             float g = texture2D(uVideo, clamp(vidUv - refr * 1.0, 0.002, 0.998)).g;
             float b = texture2D(uVideo, clamp(vidUv - refr * 0.9, 0.002, 0.998)).b;
             vec3 baseSample = vec3(r, g, b);

             // Apply blur if needed
             if (appliedBlur > 0.1) {
                 for(float i = -1.0; i <= 1.0; i+=1.0) {
                     for(float j = -1.0; j <= 1.0; j+=1.0) {
                         vec2 off = vec2(i, j) * appliedBlur * px;
                         vec3 s;
                         s.r = texture2D(uVideo, clamp(vidUv - refr * 1.1 + off, 0.002, 0.998)).r;
                         s.g = texture2D(uVideo, clamp(vidUv - refr * 1.0 + off, 0.002, 0.998)).g;
                         s.b = texture2D(uVideo, clamp(vidUv - refr * 0.9 + off, 0.002, 0.998)).b;
                         finalColor += s;
                     }
                 }
                 color = finalColor / 9.0;
             } else {
                 color = baseSample;
             }

         } else {
             color = mix(underwaterColor * 0.2, underwaterColor * 0.5, height * 0.5 + 0.5);
         }

         // 3. Lighting (Specular highlights & Reflections)
         vec3 viewDir = vec3(0.0, 0.0, 1.0); 
         vec3 reflectDir = reflect(-lightDir, normal);
         vec3 reflect2Dir = reflect(-light2Dir, normal);
         
         // Fresnel effect: more reflective at grazing angles
         float fresnel = pow(1.0 - max(dot(normal, viewDir), 0.0), 4.0);
         
         // Specular 1 (Main light)
         float broadSpecular = pow(max(dot(viewDir, reflectDir), 0.0), WET_SPREAD);
         float sharpSpecular = pow(max(dot(viewDir, reflectDir), 0.0), SHINE_SHARP);
         
         // Specular 2 (Rim light)
         float rimSpecular = pow(max(dot(viewDir, reflect2Dir), 0.0), WET_SPREAD * 0.5);
         
         // 4. Combined Effects
         // Base Color + Tint
         color = mix(color, FILTER_COLOR, FILTER_OPACITY);
         
         // Add "Surface depth" - subtle dark/light based on height
         color += height * 0.15; 
         
         // Add lighting
         vec3 lighting = vec3(broadSpecular) * WET_INT;
         lighting += vec3(sharpSpecular) * SHINE_INT;
         lighting += vec3(rimSpecular) * (WET_INT * 0.4);
         
         // Fake environment reflection (Sky-like gradient)
         color = mix(color, SKY_COLOR, fresnel * 0.5 * (normal.y * 0.5 + 0.5));
         
         color += lighting;
         
         // Add extra blue depth based on water height/waves
         float tintStrength = clamp(height * 0.3, 0.0, 0.4);
         color = mix(color, underwaterColor, tintStrength);

         // 5. Vignette (Dark corners)
         float distV = distance(vUv, vec2(0.5));
         float vignette = smoothstep(0.85, 0.25, distV); 
         color *= vignette;

         gl_FragColor = vec4(color, 1.0);
      }
    `;

    const createShader = (type, src) => {
        const s = gl.createShader(type);
        gl.shaderSource(s, src);
        gl.compileShader(s);
        if(!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(s));
        return s;
    };

    const program = gl.createProgram();
    gl.attachShader(program, createShader(gl.VERTEX_SHADER, vertSrc));
    gl.attachShader(program, createShader(gl.FRAGMENT_SHADER, fragSrc));
    gl.linkProgram(program);
    gl.useProgram(program);

    // Attribute Locations
    const aPos = gl.getAttribLocation(program, 'aPos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    // Uniform Locations
    const locs = {
        uWater: gl.getUniformLocation(program, 'uWater'),
        uVideo: gl.getUniformLocation(program, 'uVideo'),
        uResolution: gl.getUniformLocation(program, 'uResolution'),
        uVideoRes: gl.getUniformLocation(program, 'uVideoRes'),
        uVideoReady: gl.getUniformLocation(program, 'uVideoReady')
    };
    
    // Set texture slots
    gl.uniform1i(locs.uWater, 0);
    gl.uniform1i(locs.uVideo, 1);

    // Ensure textures are flipped correctly for WebGL
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

    // --- SETUP VIDEO ELEMENT ---
    const video = document.createElement('video');
    videoRef.current = video;
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
    video.setAttribute('muted', '');
    video.muted = true;
    video.autoplay = true;
    video.style.position = 'fixed'; // Hidden but in DOM
    video.style.opacity = '0.01';
    video.style.pointerEvents = 'none';
    video.style.zIndex = '-1';
    document.body.appendChild(video);

    let stream = null;
    let videoReady = false;

    const startCamera = async () => {
        if (!navigator.mediaDevices?.getUserMedia) return;
        try {
            stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
                audio: false
            });
            video.srcObject = stream;
            video.onloadedmetadata = () => {
                video.width = video.videoWidth;
                video.height = video.videoHeight;
            };
            try {
                await video.play();
                videoReady = true;
            } catch (e) {
                // Handle iOS Touch-to-play requirement if needed
                console.warn("Autoplay failed", e);
                const forcePlay = () => {
                    video.play().then(() => { 
                        videoReady = true; 
                        document.removeEventListener('click', forcePlay); 
                        document.removeEventListener('touchstart', forcePlay);
                    });
                };
                document.addEventListener('click', forcePlay);
                document.addEventListener('touchstart', forcePlay);
            }
        } catch (e) { console.error("Camera fail", e); }
    };
    startCamera();

    // --- INTERACTION HANDLING ---
    const localMouse = { x: 0, y: 0, down: false };
    
    const handleInteraction = () => {
        // Read either shared pointer (from WritingCanvas) or local events
        const pointer = sharedPointerRef ? sharedPointerRef.current : null;
        const x = pointer ? pointer.x : localMouse.x;
        const y = pointer ? pointer.y : localMouse.y;

        // Wait, WaterSimulation expects coordinates in local space? No, usually -1 to 1 or 0 to 1.
        // Let's check DropShader in WaterSimulation: expects coords relative to texture.
        
        // Convert screen pixels to -1..1 range for the simulation
        const px = (x / gl.canvas.width) * 2 - 1;
        const py = (y / gl.canvas.height) * 2 - 1; 

        // Check if down
        const isDown = pointer ? pointer.down : localMouse.down;
        
        if (isDown) {
             // Add drop
             // In screen space (0-1) or NDCs (-1 to 1)?
             // The simulation `dropShader` uses `length(center * 0.5 + 0.5 - coord)`. 
             // `coord` is 0..1 in the texture.
             // So if we pass center as -1..1 (NDC), the formula `center * 0.5 + 0.5` converts it to 0..1.
             // Correct.
             
             // Radius: 0.03 is good. Strength: 0.04.
             waterSim.addDrop(px, py, 0.04, 0.02);
        }
    };
    
    // Add random drops occasionally to keep it alive
    const addRandomDrops = () => {
        if (Math.random() < 0.02) {
             waterSim.addDrop(
                 Math.random() * 2 - 1, 
                 Math.random() * 2 - 1, 
                 0.03, 
                 (Math.random() - 0.5) * WATER_FX.autoWaveStrength
             );
        }
    };

    // --- RENDER LOOP ---
    const resize = () => {
        const dpr = window.devicePixelRatio || 1;
        const w = Math.floor(window.innerWidth * dpr);
        const h = Math.floor(window.innerHeight * dpr);
        if (canvas.width !== w || canvas.height !== h) {
            canvas.width = w;
            canvas.height = h;
            gl.viewport(0, 0, w, h);
        }
        gl.uniform2f(locs.uResolution, w, h);
    };
    window.addEventListener('resize', resize);
    resize();

    let raf;
    const render = () => {
        // 1. Simulation Steps (Physics)
        if (waterSim) {
            // Interact
            handleInteraction();
            addRandomDrops();
            
            // Run Physics
            waterSim.stepSimulation();
            waterSim.updateNormals();
        }

        // 2. Render to Screen
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, canvas.width, canvas.height);

        // Activamos el programa principal ANTES de configurar los uniforms
        gl.useProgram(program);
        
        // Bind Water Texture
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, waterSim ? waterSim.textureA : null);
        
        // Bind Video Texture
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, videoTexture);
        if (videoReady && video.readyState >= 2) {
             gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
             gl.uniform2f(locs.uVideoRes, video.videoWidth || 1280, video.videoHeight || 720);
             gl.uniform1f(locs.uVideoReady, 1.0);
        } else {
             gl.uniform1f(locs.uVideoReady, 0.0);
        }

        // Re-bind Buffer for Main Render Pass (Safety measure)
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer); 
        gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

        raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);


    // Cleanup
    return () => {
        cancelAnimationFrame(raf);
        window.removeEventListener('resize', resize);
        if (video.parentNode) document.body.removeChild(video);
        if (stream) stream.getTracks().forEach(t => t.stop());
    };

  }, [enabled, sharedPointerRef]);

  if (!enabled) return null;
  return <canvas ref={canvasRef} className="ripple-bg" style={{width:'100%', height:'100%', display:'block'}} aria-hidden="true" />;
});

export default RippleBackground;
