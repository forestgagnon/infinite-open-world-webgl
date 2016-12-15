//========== Forest Gagnon - CS461 Final Project - assignment7.js ==========\\
/* Extra features: Mouse Look & camera with proper pitch this time (hooray!), Anisotropic Filtering for the mipmap,
 Running with SHIFT key, Basic Movement Clipping (for walls) (you can clip through corners sometimes if you really try),
 Objective: Kill yourself by reaching the end of the maze and getting trapped in the fire pit
*
*/

let vertexShader = `
attribute vec4 a_Position;
attribute vec4 a_Normal;
attribute vec2 a_TexCoord;
attribute vec3 a_Offset;

uniform mat4 u_View;
uniform mat4 u_Projection;
uniform mat4 u_Transform;
uniform float u_Blocksize;

varying vec2 v_TexCoord;
varying vec4 v_Position;

void main(){
  vec4 offset = vec4(a_Offset, 1) * u_Blocksize;
  vec4 position = u_Transform * (offset + a_Position);

  gl_Position = u_Projection * u_View * position;
  v_TexCoord = a_TexCoord;
  v_Position = (u_Transform * a_Position);
}`;

var fragmentShader = `
precision mediump float;

uniform sampler2D u_Sampler;

varying vec4 v_Position;
varying vec2 v_TexCoord;

void main(){
  gl_FragColor = texture2D(u_Sampler, v_TexCoord);
  // gl_FragColor = vec4(1.0, 1.0, 1.0, 1.0);
}`;

function rgbToFloats(r, g, b) {
  return { r: r/255, g: g/255, b: b/255 };
}

const BLOCK_TYPES = {

};

//========== Color pallete ==========\\
const DARK_RED = rgbToFloats(240, 59, 32);
const BURNT_ORANGE = rgbToFloats(254, 178, 76);
const DARK_BLUE = rgbToFloats(44, 127, 184);
const SKY_BLUE = rgbToFloats(127, 205, 187);
const DARK_PINK = rgbToFloats(197, 27, 138);
const LIGHT_PINK = rgbToFloats(250, 159, 181);
const DARK_GREEN = rgbToFloats(49, 163, 84);
const LIGHT_GREEN = rgbToFloats(173, 221, 142);

const GRID_SIZE = 12;
const BLOCKSIZE = 0.5;
const TERRAIN_CHUNK_SIZE = 64;

const HALF_GRID_SIZE = GRID_SIZE / 2; //don't compute this everywhere
const PERSPECTIVE_NEAR_PLANE = 0.1;
const PERSPECTIVE_FAR_PLANE = 100;
const TURN_DEGREES = Math.PI / 75;
const MOUSE_SENSITIVITY = 0.00025;
const NOCLIP = false;
const WALL_CLIP_DISTANCE = 0.2;
const MOVEMENT_SPEED_FACTOR = 0.025;
const MOVEMENT_SPEED_FACTOR_RUNNING = MOVEMENT_SPEED_FACTOR * 2;

const createScenegraph = function(gl, program){
  let stack = [];
  let currentMatrix = mat4.create();
  let u_Transform = gl.getUniformLocation(program, 'u_Transform');

  let createTransformationNode = function(matrix){
    let children = [];
    return {
      add: function(type, data){
        let node;
        if (type === "transformation"){
          node = createTransformationNode(data);
        }else if (type === "shape"){
          node = createShapeNode(data.shapeFunc, data.params);
        }
        children.push(node);
        node.parent = this;
        return node;
      },
      apply: () =>{

        stack.push(mat4.clone(currentMatrix));
        let newMatrix = mat4.create();
        mat4.mul(newMatrix, currentMatrix, matrix);
        currentMatrix = newMatrix;
        gl.uniformMatrix4fv(u_Transform, false, currentMatrix);
        children.forEach((child) => {
          child.apply();
        });
        currentMatrix = stack.pop();

      }

    };
  };

  let createShapeNode = function(shapeFunc, params){
    return {
      apply: () =>{
        shapeFunc(params);
      }

    };
  };

  let root = createTransformationNode(mat4.create());

  return root;
};

//========== CAMERA ==========\\
const createCamera = function(gl, program, eyeVector) {
  const CAMERA_PITCH_FACTOR = PERSPECTIVE_FAR_PLANE - PERSPECTIVE_NEAR_PLANE;
  const STRAFE_FACTOR = MOVEMENT_SPEED_FACTOR;

  let eye = eyeVector;
  let up = vec3.fromValues(0, 1, 0);
  let at = vec3.create();
  let tiltedAt;
  vec3.add(at, eye, vec3.fromValues(10, 0, 10));
  let pitch = 0;
  let view;
  return {
    apply: () => {
      view = mat4.create();

      let rotationAxis = vec3.create();
      let directionNormal = vec3.create();
      vec3.subtract(directionNormal, eye, at);
      vec3.normalize(directionNormal, directionNormal);
      vec3.cross(rotationAxis, directionNormal, up);

      let q = quat.create();
      quat.setAxisAngle(q, rotationAxis, pitch);
      tiltedAt = vec3.create();
      vec3.subtract(tiltedAt, at, eye);
      vec3.transformQuat(tiltedAt, tiltedAt, q);
      vec3.add(tiltedAt, tiltedAt, eye);

      mat4.lookAt(view, eye, tiltedAt, up);
      gl.uniformMatrix4fv(program.u_View, false, view);
    },

    moveForward: (params) => {
      let direction = vec3.create();
      vec3.subtract(direction, at, eye);
      vec3.normalize(direction, direction);
      movementVec = vec3.create();
      vec3.multiply(movementVec, direction, vec3.fromValues(params.movementSpeed, params.movementSpeed, params.movementSpeed));
      vec3.add(eye, eye, movementVec);
      vec3.add(at, at, movementVec);
    },
    moveBackward: (params) => {
      let direction = vec3.create();
      vec3.subtract(direction, eye, at);
      vec3.normalize(direction, direction);
      movementVec = vec3.create();
      vec3.multiply(movementVec, direction, vec3.fromValues(params.movementSpeed, params.movementSpeed, params.movementSpeed));
      vec3.add(eye, eye, movementVec);
      vec3.add(at, at, movementVec);
    },

    strafeRight: (params) => {
      let strafeAxis = vec3.create();
      let directionNormal = vec3.create();
      vec3.subtract(directionNormal, at, eye);
      directionNormal[1] = 0; //don't care about y values
      vec3.normalize(directionNormal, directionNormal);
      vec3.cross(strafeAxis, directionNormal, up);

      let movementVec = vec3.create();
      vec3.add(movementVec, movementVec, strafeAxis)
      vec3.multiply(movementVec, movementVec, vec3.fromValues(STRAFE_FACTOR, 0, STRAFE_FACTOR));
      vec3.add(eye, eye, movementVec);
      vec3.add(at, at, movementVec);
    },

    strafeLeft: (params) => {
      let strafeAxis = vec3.create();
      let directionNormal = vec3.create();
      vec3.subtract(directionNormal, at, eye);
      directionNormal[1] = 0; //don't care about y values
      vec3.normalize(directionNormal, directionNormal);
      vec3.cross(strafeAxis, directionNormal, up);

      let movementVec = vec3.create();
      vec3.add(movementVec, movementVec, strafeAxis)
      vec3.multiply(movementVec, movementVec, vec3.fromValues(-STRAFE_FACTOR, 0, -STRAFE_FACTOR));
      vec3.add(eye, eye, movementVec);
      vec3.add(at, at, movementVec);
    },

    turn: (radians) => {
      vec3.rotateY(at, at, eye, radians);
    },

    tilt: (radians) => {
      if (radians < 0) {
        let newPitch = pitch + radians;
        if (newPitch > -Math.PI/2 + Math.PI/16) {
          pitch = newPitch;
        }
      }
      else if (radians > 0) {
        let newPitch = pitch + radians;
        if (newPitch < Math.PI/2 - Math.PI/16) {
          pitch = newPitch;
        }
      }
    },

    moveUp: () => {
      movementVec = vec3.fromValues(0, MOVEMENT_SPEED_FACTOR, 0);
      vec3.add(eye, eye, movementVec);
      vec3.add(at, at, movementVec);
    },
    moveDown: () => {
      movementVec = vec3.fromValues(0, MOVEMENT_SPEED_FACTOR, 0);
      vec3.subtract(eye, eye, movementVec);
      vec3.subtract(at, at, movementVec);
    },

    getEyeVector: () => {
      return eye;
    },

    getAtVector: () => {
      return tiltedAt;
    },

    getUpVector: () => {
      return up;
    },

    getViewMatrix: () => {
      return view;
    },

    setEye: (newEye) => {
      eye = newEye;
    }
  }
};


//========== DRAWING FUNCTION GENERATORS ==========\\
function createGrid(gl, program) {
  let grid = [];
  for (let i = -HALF_GRID_SIZE; i <= HALF_GRID_SIZE; i += BLOCKSIZE) {
    grid.push(
      i, 0.0, -HALF_GRID_SIZE, 1.0, 1.0, 1.0,
      i, 0.0, HALF_GRID_SIZE, 1.0, 1.0, 1.0,
      HALF_GRID_SIZE, 0.0, i, 1.0, 1.0, 1.0,
      -HALF_GRID_SIZE, 0.0, i, 1.0, 1.0, 1.0
    );
  }

  let gridArray = new Float32Array(grid);
  const FSIZE = gridArray.BYTES_PER_ELEMENT;
  let vertexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, gridArray, gl.STATIC_DRAW);

  return () => {
    const originalWidth = gl.getParameter(gl.LINE_WIDTH);
    gl.lineWidth(5);
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.vertexAttribPointer(program.a_Position, 3, gl.FLOAT, false, FSIZE * 6, 0);
    gl.vertexAttribPointer(program.a_Color, 3, gl.FLOAT, false,  FSIZE * 6, FSIZE * 3);
    gl.drawArrays(gl.LINES, 0, gridArray.length / 6);

    gl.lineWidth(originalWidth);
  }
}

function createBlock(gl, program, texNum, offsets) {

  let block = {
    vertices: new Float32Array([
      BLOCKSIZE, BLOCKSIZE, BLOCKSIZE, 0, BLOCKSIZE, BLOCKSIZE, 0,0, BLOCKSIZE,  BLOCKSIZE,0, BLOCKSIZE, // front face
      BLOCKSIZE, BLOCKSIZE, BLOCKSIZE,  BLOCKSIZE,0, BLOCKSIZE,  BLOCKSIZE,0,0,  BLOCKSIZE, BLOCKSIZE,0, // right face
      BLOCKSIZE, BLOCKSIZE,0,  BLOCKSIZE,0,0, 0,0,0, 0, BLOCKSIZE,0, // back face
     0, BLOCKSIZE,0, 0,0,0, 0,0, BLOCKSIZE, 0, BLOCKSIZE, BLOCKSIZE, // left face
      BLOCKSIZE, BLOCKSIZE, BLOCKSIZE,  BLOCKSIZE, BLOCKSIZE,0, 0, BLOCKSIZE,0, 0, BLOCKSIZE, BLOCKSIZE, // top face
      BLOCKSIZE,0, BLOCKSIZE, 0,0, BLOCKSIZE, 0,0,0,  BLOCKSIZE,0,0, // bottom face
    ]),

    normals: new Float32Array([
      0.0, 0.0, 1.0,  0.0, 0.0, 1.0,  0.0, 0.0, 1.0,  0.0, 0.0, 1.0, // front face
      1.0, 0.0, 0.0,  1.0, 0.0, 0.0,  1.0, 0.0, 0.0,  1.0, 0.0, 0.0, // right face
      0.0, 0.0,-1.0,  0.0, 0.0,-1.0,  0.0, 0.0,-1.0,  0.0, 0.0,-1.0, // back face
     -1.0, 0.0, 0.0, -1.0, 0.0, 0.0, -1.0, 0.0, 0.0, -1.0, 0.0, 0.0, // left face
      0.0, 1.0, 0.0,  0.0, 1.0, 0.0,  0.0, 1.0, 0.0,  0.0, 1.0, 0.0, // top face
      0.0,-1.0, 0.0,  0.0,-1.0, 0.0,  0.0,-1.0, 0.0,  0.0,-1.0, 0.0, // bottom face
    ]),

    textureCoordinates: new Float32Array([
      BLOCKSIZE, BLOCKSIZE,  0.0, BLOCKSIZE, 0.0, 0.0, BLOCKSIZE, 0.0, // front face
      0.0, BLOCKSIZE, 0.0, 0.0, BLOCKSIZE, 0.0, BLOCKSIZE, BLOCKSIZE, // right face
      0.0, BLOCKSIZE, 0.0, 0.0, BLOCKSIZE, 0.0, BLOCKSIZE, BLOCKSIZE,  // back face
      0.0, BLOCKSIZE, 0.0, 0.0, BLOCKSIZE, 0.0, BLOCKSIZE, BLOCKSIZE, // left face
      BLOCKSIZE, BLOCKSIZE,  0.0, BLOCKSIZE, 0.0, 0.0, BLOCKSIZE, 0.0, // top face
      BLOCKSIZE, BLOCKSIZE,  0.0, BLOCKSIZE, 0.0, 0.0, BLOCKSIZE, 0.0, // bottom face
    ]),

    indices: new Uint8Array([
      0,1,2,  0,2,3, // front face
      4,5,6,  4,6,7,   // right face
     8,9,10, 8,10,11, // back face
     12,13,14,  12,14,15, // left face
     16,17,18, 16,18,19, // top face
     20,21,22, 20,22,23 // bottom face

    ]),

    offsets: new Float32Array(offsets),
    dimensions: 3
  };

  block.vertexBuffer = gl.createBuffer();
  // block.normalBuffer = gl.createBuffer();
  block.indexBuffer = gl.createBuffer();
  block.textureBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, block.vertexBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, block.vertices, gl.STATIC_DRAW);

  // gl.bindBuffer(gl.ARRAY_BUFFER, block.normalBuffer);
  // gl.bufferData(gl.ARRAY_BUFFER, block.normals, gl.STATIC_DRAW);

  gl.bindBuffer(gl.ARRAY_BUFFER, block.textureBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, block.textureCoordinates, gl.STATIC_DRAW);

  block.offsetBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, block.offsetBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, block.offsets, gl.STATIC_DRAW);

  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, block.indexBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, block.indices, gl.STATIC_DRAW);

  return (params) => {
    gl.uniform1i(program.u_Sampler, texNum);

    gl.bindBuffer(gl.ARRAY_BUFFER, block.vertexBuffer);
    gl.vertexAttribPointer(program.a_Position, block.dimensions, gl.FLOAT, false, 0,0);

    // gl.bindBuffer(gl.ARRAY_BUFFER, block.normalBuffer);
    // gl.vertexAttribPointer(program.a_Normal, block.dimensions, gl.FLOAT, false, 0,0);

    gl.bindBuffer(gl.ARRAY_BUFFER, block.textureBuffer);
    gl.vertexAttribPointer(program.a_TexCoord, 2, gl.FLOAT, false, 0,0);

    gl.bindBuffer(gl.ARRAY_BUFFER, block.offsetBuffer);
    gl.vertexAttribPointer(program.a_Offset, 3, gl.FLOAT, false, 0, 0);
    gl.instanceExt.vertexAttribDivisorANGLE(program.a_Offset, 1);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, block.indexBuffer);

    // gl.drawElements(gl.TRIANGLES, block.indices.length, gl.UNSIGNED_BYTE, 0);
    gl.instanceExt.drawElementsInstancedANGLE(gl.TRIANGLES, block.indices.length, gl.UNSIGNED_BYTE, 0, block.offsets.length / 3);
  };
}

function generateTerrainChunk(gl, program, x, z) {
  let grassOffsets = [];
  const xModifier = TERRAIN_CHUNK_SIZE * x;
  const zModifier = TERRAIN_CHUNK_SIZE * z;
  let chunk = [];
  for (let row = 0; row < TERRAIN_CHUNK_SIZE; row++) {
    chunk[row] = [];
    for (let col = 0; col < TERRAIN_CHUNK_SIZE; col++) {
      let height = Math.round(2 * noise.simplex2(xModifier + row, zModifier + col));
      chunk[row][col] = height;
      while (height > -5) {
        grassOffsets.push(row, height, col);
        height--;
      }
    }
  }
  return {
    positions: chunk,
    blocks: {
      grass: createBlock(gl, program, 0, grassOffsets)
    }
  }
}

function addTerrainChunkToNode(node, chunk) {
  let { positions, blocks } = chunk;
  node.add('shape', {
    shapeFunc: blocks.grass,
    params: {
    }
  });
}

function positionAndAddChunk(gl, program, node, x, z) {
  let chunk = generateTerrainChunk(gl, program, x, z);
  addTerrainChunkToNode(node, chunk);
  let translate = mat4.create();
  let xTranslate = (TERRAIN_CHUNK_SIZE * BLOCKSIZE) / 2 * x;
  let zTranslate = (TERRAIN_CHUNK_SIZE * BLOCKSIZE) / 2 * z;
  mat4.translate(translate, translate, vec3.fromValues(xTranslate, 0, zTranslate));
  let translateNode = node.add('transformation', translate);
  addTerrainChunkToNode(translateNode, chunk);
  return chunk;
}


//========== MAIN ONLOAD FUNCTION ==========\\
window.onload = function(){

  let canvas = document.getElementById('canvas');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight - document.getElementById('description').getBoundingClientRect().height - 50;
  let gl;
  // catch the error from creating the context since this has nothing to do with the code
  try{
    gl = middUtils.initializeGL(canvas);
  } catch (e){
    alert('Could not create WebGL context');
    return;
  }

  // don't catch this error since any problem here is a programmer error
  let program = middUtils.initializeProgram(gl, vertexShader, fragmentShader);
  gl.instanceExt = gl.getExtension("ANGLE_instanced_arrays");

  program.a_Position = gl.getAttribLocation(program, 'a_Position');
  program.a_Color = gl.getAttribLocation(program, 'a_Color');
  program.a_TexCoord = gl.getAttribLocation(program, 'a_TexCoord');
  program.a_Offset = gl.getAttribLocation(program, 'a_Offset');
  program.u_Sampler = gl.getUniformLocation(program, 'u_Sampler');
  program.u_Projection = gl.getUniformLocation(program, 'u_Projection');
  program.u_View = gl.getUniformLocation(program, 'u_View');
  program.u_Blocksize = gl.getUniformLocation(program, 'u_Blocksize');

  gl.uniform1f(program.u_Blocksize, BLOCKSIZE);

  gl.enable(gl.DEPTH_TEST);
  gl.clearColor(0,0,0,1);

  let keyMap = {};
  let mouseMovementInfo = {
    turnRadians: 0,
    tiltRadians: 0
  };

  window.onkeydown = function(e){
      keyMap[e.which] = true;
      if(e.shiftKey) {
        keyMap['SHIFT'] = true;
      }
  };

  window.onkeyup = function(e){
       keyMap[e.which] = false;
       if(!e.shiftKey) {
         keyMap['SHIFT'] = false;
       }
  };

  const handleMouseMove = (e) => {
    if (e.movementX) {
      mouseMovementInfo.turnRadians -= Math.PI * e.movementX * MOUSE_SENSITIVITY;
    }
    if (e.movementY) {
      mouseMovementInfo.tiltRadians += Math.PI * e.movementY * MOUSE_SENSITIVITY;
    }
  };

  document.addEventListener('pointerlockchange', (e) => {
    if (document.pointerLockElement === canvas) {
      document.addEventListener("mousemove", handleMouseMove);
    }
    else {
      document.removeEventListener("mousemove", handleMouseMove);
    }
  });

  canvas.onclick = canvas.requestPointerLock;

  gl.enableVertexAttribArray(program.a_Position);
  gl.enableVertexAttribArray(program.a_TexCoord);
  gl.enableVertexAttribArray(program.a_Offset);

  noise.seed(Math.random());


  let camera = createCamera(gl, program, vec3.fromValues(0, 0.5, 0));
  // let grid = createGrid(gl, program);
  // const blocks = {
  //   grass: createBlock(gl, program, 0),
  //   fire: createBlock(gl, program, 1)
  // };

  //Initialize scenegraph and drawing functions
  let rootNode = createScenegraph(gl, program);

  let terrainTransform = mat4.create();
  // mat4.translate(terrainTransform, terrainTransform, vec3.fromValues(-TERRAIN_CHUNK_SIZE * BLOCKSIZE / 2, 0, -TERRAIN_CHUNK_SIZE * BLOCKSIZE / 2));
  let terrainNode = rootNode.add('transformation', terrainTransform);

  // terrainNode.add('shape', grid);


  let chunkArray = [];
  //generate initial chunks
  for (let x = 0; x < 2; x++) {
    chunkArray[x] = [];
    for (let z = 0; z < 2; z++) {
      chunkArray[x][z] = positionAndAddChunk(gl, program, terrainNode, x, z);
    }
  }


  let render = function(){

    if (mouseMovementInfo.turnRadians !== 0) {
      camera.turn(mouseMovementInfo.turnRadians);
      mouseMovementInfo.turnRadians = 0;
    }
    if (mouseMovementInfo.tiltRadians !== 0) {
      camera.tilt(mouseMovementInfo.tiltRadians);
      mouseMovementInfo.tiltRadians = 0;
    }

    // check which keys that we care about are down

    if (keyMap['W'.charCodeAt(0)]){
      camera.moveForward({
        movementSpeed: keyMap['SHIFT'] ? MOVEMENT_SPEED_FACTOR_RUNNING : MOVEMENT_SPEED_FACTOR
      });
    }else if (keyMap['S'.charCodeAt(0)]){
      camera.moveBackward({
        movementSpeed: keyMap['SHIFT'] ? MOVEMENT_SPEED_FACTOR_RUNNING : MOVEMENT_SPEED_FACTOR
      });
    }

    if (keyMap['A'.charCodeAt(0)]){
      camera.strafeLeft({

      });
    }else if (keyMap['D'.charCodeAt(0)]){
      camera.strafeRight({

      });
    }

    if(keyMap[38]) {
      camera.tilt(-TURN_DEGREES);
    } else if(keyMap[40]) {
      camera.tilt(TURN_DEGREES);
    }

    if(keyMap[37]) {
      camera.turn(TURN_DEGREES);
    } else if(keyMap[39]) {
      camera.turn(-TURN_DEGREES);
    }

    if(keyMap['R'.charCodeAt(0)]) {
      camera.moveUp();
    } else if(keyMap['F'.charCodeAt(0)]) {
      camera.moveDown();
    }

    // clear the canvas
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);


    // DRAW STUFF HERE

    let projection = mat4.create();
    mat4.perspective(projection, Math.PI/3, canvas.width/canvas.height, PERSPECTIVE_NEAR_PLANE, PERSPECTIVE_FAR_PLANE);
    gl.uniformMatrix4fv(program.u_Projection, false, projection);

    const eyeVector = camera.getEyeVector();
    // let currentChunk = { x: Math.floor(eyeVector[0] / (TERRAIN_CHUNK_SIZE * BLOCKSIZE / 2)), z: Math.floor(eyeVector[2] / (TERRAIN_CHUNK_SIZE * BLOCKSIZE / 2)) };
    // console.log(currentChunk);
    // console.log(TERRAIN_CHUNK_SIZE * BLOCKSIZE);

    // Code to set player height to current block height
    // if (mazeObject.maze[Math.floor(Math.abs(eyeVector[0]/BLOCKSIZE))][Math.floor(Math.abs(eyeVector[2]/BLOCKSIZE))] === MAZE_CONSTANTS.END) {
    //   camera.setEye(vec3.fromValues(mazeObject.endRow * BLOCKSIZE + BLOCKSIZE/2, 0.5-BLOCKSIZE, mazeObject.endCol * BLOCKSIZE + BLOCKSIZE/2));
    // }

    camera.apply();

    rootNode.apply();

    requestAnimationFrame(render);
  };

  Promise.all([
    initializeTexture(gl, gl.TEXTURE0, 'grass.png'),
     initializeTexture(gl, gl.TEXTURE1, 'fire2.jpg')
  ])
    .then(() => render())
    .catch(function (error) {alert('Failed to load texture '+  error.message);});

};

function initializeTexture(gl, textureid, filename) {
  //Borrowed from http://bl.ocks.org/ProfBlack/d65bc62402b50a8e46d67095eeaeb5f4
  return new Promise(function(resolve, reject){
    var texture = gl.createTexture();

    var image = new Image();
    image.onload = function(){
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
      gl.activeTexture(textureid);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);

      let ext = gl.getExtension("WEBKIT_EXT_texture_filter_anisotropic") || gl.getExtension("MOZ_EXT_texture_filter_anisotropic");
      gl.texParameterf(gl.TEXTURE_2D, ext.TEXTURE_MAX_ANISOTROPY_EXT, 9);

      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, image);
      gl.generateMipmap(gl.TEXTURE_2D);
      resolve();
    };


    image.onerror = function(error){

        reject(Error(filename));
    }

    image.src = filename;
  });
}

//========== UTILS ==========\\
function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min) + min);
}

function getRandom(min, max) {
  return Math.random() * (max - min) + min;
}

// from http://gizma.com/easing/
function easeInOutQuad (t, b, c, d) {
  t /= d/2;
  if (t < 1) return c/2*t*t + b;
  t--;
  return -c/2 * (t*(t-2) - 1) + b;
};
