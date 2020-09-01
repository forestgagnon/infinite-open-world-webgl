
var middUtils = (function () {


  /**
  Given a canvas object, this gets the WebGL context from it. It also sets the
  viewport to fill the canvas.

  @arg canvas - A reference to a valid canvas object in the DOM
  @return webgl context
  */
  let initializeGL = function (canvas) {
    // get the context handle for rendering webgl in the canvas
    let gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");

    // set the resolution of the context to match the canvas
    gl.viewport(0, 0, canvas.width, canvas.height);
    return gl;
  };


  /**
    Creates, loads and compiles a shader.

    This will probably not need to be called directly.

    @arg gl - a webgl context
    @arg shaderSource - a string containing source for a shader
    @arg type - type of shader; gl.VERTEX_SHADER or gl.FRAGMENT_SHADER
    @return reference to compiled shader

    @throws error if shader cannot be compiled
  */
  let initializeShader = function (gl, shaderSource, type) {
    let shader = gl.createShader(type);
    gl.shaderSource(shader, shaderSource);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      var error = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw "Unable to compile " + (type === gl.VERTEX_SHADER ? 'vertex' : 'fragment') + " shader: " + error;
    }

    return shader;
  };


  /**
    Create a new program given vertex and fragment shaders.

    The vertex and fragment shaders are passed in as strings.

    @arg gl - the webgl context
    @arg vertexShaderSource - string containg the vertex shader
    @arg fragmentShaderSource - string containing the fragment shader
    @return reference to the compiled and linked program

    @throws error if program cannot be linked
    */
  let initializeProgram = function (gl, vertexShaderSource, fragmentShaderSource) {
    let vertexShader = initializeShader(gl, vertexShaderSource, gl.VERTEX_SHADER);
    let fragmentShader = initializeShader(gl, fragmentShaderSource, gl.FRAGMENT_SHADER);

    let program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);

    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw "Unable to initialize the shader program: " + gl.getProgramInfoLog(program);
    }

    gl.useProgram(program);

    return program;
  };

  return {
    initializeGL: initializeGL,
    initializeShader: initializeShader,
    initializeProgram: initializeProgram
  };

})();
