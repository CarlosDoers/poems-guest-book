export class WaterSimulation {
  constructor(gl, width, height) {
    this.gl = gl;
    this.width = width;
    this.height = height;
    
    // Check for floating point texture support
    gl.getExtension('OES_texture_float');
    const linear = gl.getExtension('OES_texture_float_linear');
    
    // Helper to create a shader program
    this.createProgram = (vert, frag) => {
      const vs = gl.createShader(gl.VERTEX_SHADER);
      gl.shaderSource(vs, vert);
      gl.compileShader(vs);
      if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(vs));

      const fs = gl.createShader(gl.FRAGMENT_SHADER);
      gl.shaderSource(fs, frag);
      gl.compileShader(fs);
      if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(fs));

      const prog = gl.createProgram();
      gl.attachShader(prog, vs);
      gl.attachShader(prog, fs);
      gl.linkProgram(prog);
      return prog;
    };

    // Helper to create texture
    this.createTexture = () => {
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, linear ? gl.LINEAR : gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, linear ? gl.LINEAR : gl.NEAREST);
      
      // Use Half Float if possible for better mobile performance
      const ext = gl.getExtension('OES_texture_half_float');
      const type = ext ? ext.HALF_FLOAT_OES : gl.FLOAT;
      
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, type, null);
      return tex;
    };

    this.textureA = this.createTexture();
    this.textureB = this.createTexture();
    
    this.coordBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.coordBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1,
       1, -1,
      -1,  1,
       1,  1
    ]), gl.STATIC_DRAW);

    // Common Vertex Shader
    const vertexShader = `
      attribute vec2 aPos;
      varying vec2 coord;
      void main() {
        coord = aPos * 0.5 + 0.5;
        gl_Position = vec4(aPos, 0.0, 1.0);
      }
    `;

    // Drop Shader (Input interaction)
    this.dropProgram = this.createProgram(vertexShader, `
      precision mediump float;
      const float PI = 3.14159265;
      uniform sampler2D texture;
      uniform vec2 center;
      uniform float radius;
      uniform float strength;
      varying vec2 coord;
      void main() {
        vec4 info = texture2D(texture, coord);
        float drop = max(0.0, 1.0 - length(center * 0.5 + 0.5 - coord) / radius);
        drop = 0.5 - cos(drop * PI) * 0.5;
        info.r += drop * strength;
        gl_FragColor = info;
      }
    `);

    // Update Shader (Physics simulation)
    this.updateProgram = this.createProgram(vertexShader, `
      precision mediump float;
      uniform sampler2D texture;
      uniform vec2 delta;
      varying vec2 coord;
      void main() {
        vec4 info = texture2D(texture, coord);
        float average = (
          texture2D(texture, coord - vec2(delta.x, 0.0)).r +
          texture2D(texture, coord - vec2(0.0, delta.y)).r +
          texture2D(texture, coord + vec2(delta.x, 0.0)).r +
          texture2D(texture, coord + vec2(0.0, delta.y)).r
        ) * 0.25;
        info.g += (average - info.r) * 2.0;
        info.g *= 0.995;
        info.r += info.g;
        gl_FragColor = info;
      }
    `);
    
    // Normal Shader (Calculate normals from heightmap)
    // We store normal in BA components
    this.normalProgram = this.createProgram(vertexShader, `
      precision mediump float;
      uniform sampler2D texture;
      uniform vec2 delta;
      varying vec2 coord;
      void main() {
        vec4 info = texture2D(texture, coord);
        float hL = texture2D(texture, coord - vec2(delta.x, 0.0)).r;
        float hR = texture2D(texture, coord + vec2(delta.x, 0.0)).r;
        float hU = texture2D(texture, coord - vec2(0.0, delta.y)).r;
        float hD = texture2D(texture, coord + vec2(0.0, delta.y)).r;
        
        info.ba = normalize(vec3(hL - hR, 2.0 * delta.x, hU - hD)).xz;
        gl_FragColor = info;
      }
    `);

    this.framebuffer = gl.createFramebuffer();
  }

  swap() {
    const temp = this.textureA;
    this.textureA = this.textureB;
    this.textureB = temp;
  }

  renderToTexture(texture, action) {
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.framebuffer);
    this.gl.framebufferTexture2D(this.gl.FRAMEBUFFER, this.gl.COLOR_ATTACHMENT0, this.gl.TEXTURE_2D, texture, 0);
    this.gl.viewport(0, 0, this.width, this.height);
    action();
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
  }

  addDrop(x, y, radius, strength) {
    this.renderToTexture(this.textureB, () => {
      this.gl.useProgram(this.dropProgram);
      this.gl.activeTexture(this.gl.TEXTURE0);
      this.gl.bindTexture(this.gl.TEXTURE_2D, this.textureA);
      
      const aPos = this.gl.getAttribLocation(this.dropProgram, 'aPos');
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.coordBuffer);
      this.gl.vertexAttribPointer(aPos, 2, this.gl.FLOAT, false, 0, 0);
      this.gl.enableVertexAttribArray(aPos);

      this.gl.uniform1i(this.gl.getUniformLocation(this.dropProgram, 'texture'), 0);
      this.gl.uniform2f(this.gl.getUniformLocation(this.dropProgram, 'center'), x, y);
      this.gl.uniform1f(this.gl.getUniformLocation(this.dropProgram, 'radius'), radius);
      this.gl.uniform1f(this.gl.getUniformLocation(this.dropProgram, 'strength'), strength);

      this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);
    });
    this.swap();
  }

  stepSimulation() {
    this.renderToTexture(this.textureB, () => {
      this.gl.useProgram(this.updateProgram);
      this.gl.activeTexture(this.gl.TEXTURE0);
      this.gl.bindTexture(this.gl.TEXTURE_2D, this.textureA);
      
      const aPos = this.gl.getAttribLocation(this.updateProgram, 'aPos');
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.coordBuffer);
      this.gl.vertexAttribPointer(aPos, 2, this.gl.FLOAT, false, 0, 0);
      this.gl.enableVertexAttribArray(aPos);

      this.gl.uniform1i(this.gl.getUniformLocation(this.updateProgram, 'texture'), 0);
      this.gl.uniform2f(this.gl.getUniformLocation(this.updateProgram, 'delta'), 1 / this.width, 1 / this.height);

      this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);
    });
    this.swap();
  }
  
  updateNormals() {
      this.renderToTexture(this.textureB, () => {
      this.gl.useProgram(this.normalProgram);
      this.gl.activeTexture(this.gl.TEXTURE0);
      this.gl.bindTexture(this.gl.TEXTURE_2D, this.textureA);
      
      const aPos = this.gl.getAttribLocation(this.normalProgram, 'aPos');
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.coordBuffer);
      this.gl.vertexAttribPointer(aPos, 2, this.gl.FLOAT, false, 0, 0);
      this.gl.enableVertexAttribArray(aPos);

      this.gl.uniform1i(this.gl.getUniformLocation(this.normalProgram, 'texture'), 0);
      this.gl.uniform2f(this.gl.getUniformLocation(this.normalProgram, 'delta'), 1 / this.width, 1 / this.height);

      this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);
    });
    this.swap();
  }
}
