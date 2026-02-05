import React, { useRef, useEffect, forwardRef, useImperativeHandle, useMemo } from 'react';
import { WaterSimulation } from './WaterSimulation';

// --- CONFIGURACIÓN POR DEFECTO ---
const DEFAULT_WATER_FX = {
  autoWaveStrength: 0.24,
  refraction: 0.05,
  blurIntensity: 16.0,
  blurStart: 0.15,
  blurEnd: 0.75,
  filterColor: [0.0, 0.25, 0.55],
  filterOpacity: 0.6,
  skyColor: [0.2, 0.35, 0.5], 
  shineIntensity: 1.9,
  shineSharpness: 100.0,
  wetnessIntensity: 1.5,
  wetnessSpread: 10.0,
  vignetteStart: 0.25,
  vignetteEnd: 0.85,
  useCamera: true,
  underwaterColor: [0.0, 0.15, 0.4], // Fondo azul profundo por defecto
};

const RippleBackground = forwardRef(({ enabled, sharedPointerRef, config = {} }, ref) => {
  const canvasRef = useRef(null);
  const videoRef = useRef(null);
  const simulationRef = useRef(null);

  // Mezclar configuración usando useMemo para evitar que el shader se reinicie en cada render
  const fx = useMemo(() => ({ ...DEFAULT_WATER_FX, ...config }), [config]);

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
      precision mediump float;
      varying vec2 vUv;
      
      uniform sampler2D uWater; // Physics Simulation (Height in R, Normal in BA)
      uniform sampler2D uVideo; // Camera Feed
      uniform vec2 uResolution;
      uniform vec2 uVideoRes;
      uniform float uVideoReady;
      uniform vec4 uVideoTransform; // [scaleX, scaleY, offsetX, offsetY]
      
      // Inyectamos valores de configuración dinámicos
      const float REFRACTION = ${fx.refraction.toFixed(4)};
      const float BLUR_MAX = ${fx.blurIntensity.toFixed(1)};
      const float BLUR_START = ${fx.blurStart.toFixed(2)};
      const float BLUR_END = ${fx.blurEnd.toFixed(2)};
      const vec3 FILTER_COLOR = vec3(${fx.filterColor[0]}, ${fx.filterColor[1]}, ${fx.filterColor[2]});
      const float FILTER_OPACITY = ${fx.filterOpacity.toFixed(2)};
      const float SHINE_INT = ${fx.shineIntensity.toFixed(2)};
      const float SHINE_SHARP = ${fx.shineSharpness.toFixed(1)};
      const float WET_INT = ${fx.wetnessIntensity.toFixed(2)};
      const float WET_SPREAD = ${fx.wetnessSpread.toFixed(1)};
      const vec3 SKY_COLOR = vec3(${fx.skyColor[0]}, ${fx.skyColor[1]}, ${fx.skyColor[2]});
      const float VIGNETTE_START = ${fx.vignetteStart.toFixed(2)};
      const float VIGNETTE_END = ${fx.vignetteEnd.toFixed(2)};
      
      const vec3 underwaterColor = vec3(${fx.underwaterColor[0]}, ${fx.underwaterColor[1]}, ${fx.underwaterColor[2]});
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
             // Optimized UV calculation using pre-calculated transform
             vidUv = (uv - uVideoTransform.zw) * uVideoTransform.xy + uVideoTransform.zw;
             vidUv.x = 1.0 - vidUv.x; // Mirror X
             
             vec2 refr = normal.xz * REFRACTION;
             float distFromCenter = distance(vidUv, vec2(0.5));
             float blurFactor = smoothstep(BLUR_START, BLUR_END, distFromCenter); 
             float appliedBlur = BLUR_MAX * blurFactor;
             
             if (appliedBlur > 0.1) {
                 // Optimized 5-tap cross blur (much faster than 9-tap 2D loop)
                 // This reduces texture samples from 27 to 5
                 vec2 px = 1.0 / uVideoRes;
                 vec2 off = appliedBlur * px;
                 vec2 finalUv = vidUv - refr;
                 
                 vec3 blur = texture2D(uVideo, clamp(finalUv, 0.002, 0.998)).rgb;
                 blur += texture2D(uVideo, clamp(finalUv + vec2(off.x, 0.0), 0.002, 0.998)).rgb;
                 blur += texture2D(uVideo, clamp(finalUv - vec2(off.x, 0.0), 0.002, 0.998)).rgb;
                 blur += texture2D(uVideo, clamp(finalUv + vec2(0.0, off.y), 0.002, 0.998)).rgb;
                 blur += texture2D(uVideo, clamp(finalUv - vec2(0.0, off.y), 0.002, 0.998)).rgb;
                 color = blur * 0.2;
             } else {
                 // Simple 3-tap Chromatic Aberration (only when not blurred for sharpness)
                 color.r = texture2D(uVideo, clamp(vidUv - refr * 1.1, 0.002, 0.998)).r;
                 color.g = texture2D(uVideo, clamp(vidUv - refr * 1.0, 0.002, 0.998)).g;
                 color.b = texture2D(uVideo, clamp(vidUv - refr * 0.9, 0.002, 0.998)).b;
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
         float vignette = smoothstep(VIGNETTE_END, VIGNETTE_START, distV); 
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
        uVideoReady: gl.getUniformLocation(program, 'uVideoReady'),
        uVideoTransform: gl.getUniformLocation(program, 'uVideoTransform')
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
    if (fx.useCamera) {
        startCamera();
    }

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
                 (Math.random() - 0.5) * fx.autoWaveStrength
             );
        }
    };

    // --- RENDER LOOP ---
    const resize = () => {
        // Cap resolution to 1.5x for iPad Pro to avoid fill-rate bottleneck
        const dpr = Math.min(1.5, window.devicePixelRatio || 1);
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
             
             // Pre-calculate UV transform on CPU
             const screenAspect = canvas.width / canvas.height;
             const vW = video.videoWidth || 1280;
             const vH = video.videoHeight || 720;
             const videoAspect = vW / vH;
             let scaleX = 1, scaleY = 1;
             if (screenAspect > videoAspect) {
                 scaleY = videoAspect / screenAspect;
             } else {
                 scaleX = screenAspect / videoAspect;
             }
             gl.uniform4f(locs.uVideoTransform, scaleX, scaleY, 0.5, 0.5);
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

  }, [enabled, sharedPointerRef, fx]);

  if (!enabled) return null;
  return <canvas ref={canvasRef} className="ripple-bg" style={{width:'100%', height:'100%', display:'block'}} aria-hidden="true" />;
});

export default RippleBackground;
