//========== Forest Gagnon - CS461 Final Project - final-project.js ==========\\
/* This is a Minecraft-style infinite world which is procedurally generated in tiled chunks using simplex noise.
* As the player moves around, nearby chunks are generated and saved.
* Chunks which are not near the player (i.e. not visible) are disabled in the scenegraph and thus not rendered.
* If the player returns to the same chunk later, it will not have changed.
* I used a WebGL plugin which adds support for instancing, which allows for all blocks of the same type to be rendered
* with one draw call per chunk, which is crucial for rendering hundreds of thousands of cubes at a reasonable framerate.
* Fog has been added to counter the pop-in effect during the generation of new chunks, making it appear seamless.
* On my machine (Nvidia GTX 970M, i7 6820HK), player movement never outpaces the terrain generation unless flying high above the map,
* and it runs above 60FPS. Unfortunately, all chunks are stored in RAM, so it quickly starts to take up hundreds of megabytes
* (a good solution would be storing far away chunks more efficiently, and maybe on the disk)
*
* Gold is randomly scattered throughout the world... Despite the rarity, It's not TOO hard to find some on the surface
* if you fly around for a minute. The HUD will let you know if there's any gold in the current chunk you are on.
* There is also a compass in the HUD.
*
* There are many, many layers of noise involved in the terrain generation, both for height as well as the block types. There are arid flat deserts,
* snowy areas (with frozen lakes inland but not near the edges), grassy areas, and occasional mountains and even volcanos. Most of it is tiled
* separately from chunk boundaries (there are no obvious seams between chunks for things like sand, snow, rock, grass etc..)
*
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
float fogDensity = 0.035;

void main(){

  //Fog code taken from http://www.ozone3d.net/tutorials/glsl_fog/p04.php
  const float LOG2 = 1.442695;
  float z = gl_FragCoord.z / gl_FragCoord.w;
  float fogFactor = exp2( -fogDensity *
    fogDensity *
    z *
    z *
    LOG2 );
  fogFactor = clamp(fogFactor, 0.0, 1.0);
  vec4 fogColor = vec4(0,0,0,1);

  gl_FragColor = mix(fogColor, texture2D(u_Sampler, v_TexCoord), fogFactor);
}`;


const BLOCKSIZE = 0.5;
const TERRAIN_CHUNK_SIZE = 64;
const CHUNK_CUTOFF_DISTANCE = 2;
const TERRAIN_MAX_DEPTH = -4;
const WATER_LEVEL = TERRAIN_MAX_DEPTH + 1;
const FIRE_LEVEL = 3;
const GOLD_RARITY = 50000;

const PERSPECTIVE_NEAR_PLANE = 0.1;
const PERSPECTIVE_FAR_PLANE = 50;
const TURN_DEGREES = Math.PI / 75;
const MOUSE_SENSITIVITY = 0.00025;
const NOCLIP = false;
const WALL_CLIP_DISTANCE = 0.2;
const MOVEMENT_SPEED_FACTOR = 0.1;
const MOVEMENT_SPEED_FACTOR_RUNNING = MOVEMENT_SPEED_FACTOR * 2;

const createScenegraph = function (gl, program) {
  let stack = [];
  let currentMatrix = mat4.create();
  let u_Transform = gl.getUniformLocation(program, 'u_Transform');

  let createTransformationNode = function (matrix) {
    let enabled = true;
    let children = [];
    return {
      add: function (type, data) {
        let node;
        if (type === "transformation") {
          node = createTransformationNode(data);
        } else if (type === "shape") {
          node = createShapeNode(data.shapeFunc, data.params);
        }
        children.push(node);
        node.parent = this;
        return node;
      },
      apply: () => {
        if (!enabled) {
          return;
        }
        stack.push(mat4.clone(currentMatrix));
        let newMatrix = mat4.create();
        mat4.mul(newMatrix, currentMatrix, matrix);
        currentMatrix = newMatrix;
        gl.uniformMatrix4fv(u_Transform, false, currentMatrix);
        children.forEach((child) => {
          child.apply();
        });
        currentMatrix = stack.pop();

      },
      enable: () => {
        enabled = true;
      },
      disable: () => {
        enabled = false;
      }

    };
  };

  let createShapeNode = function (shapeFunc, params) {
    let enabled = true;
    return {
      apply: () => {
        if (enabled) {
          shapeFunc(params);
        }
      },
      enable: () => {
        enabled = true;
      },
      disable: () => {
        enabled = false;
      }

    };
  };

  let root = createTransformationNode(mat4.create());

  return root;
};

//========== CAMERA ==========\\
const createCamera = function (gl, program, eyeVector) {
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
      vec3.subtract(direction, tiltedAt, eye);
      vec3.normalize(direction, direction);
      movementVec = vec3.create();
      vec3.multiply(movementVec, direction, vec3.fromValues(params.movementSpeed, params.movementSpeed, params.movementSpeed));
      vec3.add(eye, eye, movementVec);
      vec3.add(at, at, movementVec);
    },
    moveBackward: (params) => {
      let direction = vec3.create();
      vec3.subtract(direction, eye, tiltedAt);
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
        if (newPitch > -Math.PI / 2 + Math.PI / 16) {
          pitch = newPitch;
        }
      }
      else if (radians > 0) {
        let newPitch = pitch + radians;
        if (newPitch < Math.PI / 2 - Math.PI / 16) {
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

    getCompassAngle: () => {
      let direction = vec3.create();
      vec3.sub(direction, eye, at);
      let normal = at[2] < eye[2] ? vec3.fromValues(1, 0, 0) : vec3.fromValues(-1, 0, 0);
      let radians = vec3.angle(direction, normal);
      if (at[2] < eye[2]) {
        radians += Math.PI;
      }
      let degrees = radians * (180 / Math.PI);
      return degrees;
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
function createBlock(gl, program, params) {
  let { texNum, offsets, enabledFaces } = params;
  let indices;

  if (enabledFaces !== undefined) {
    indices = new Uint8Array(enabledFaces);
  }
  else {
    indices = new Uint8Array([
      0, 1, 2, 0, 2, 3, // front face
      4, 5, 6, 4, 6, 7,   // right face
      8, 9, 10, 8, 10, 11, // back face
      12, 13, 14, 12, 14, 15, // left face
      16, 17, 18, 16, 18, 19, // top face
      20, 21, 22, 20, 22, 23 // bottom face

    ])
  }

  let block = {
    vertices: new Float32Array([
      BLOCKSIZE, BLOCKSIZE, BLOCKSIZE, 0, BLOCKSIZE, BLOCKSIZE, 0, 0, BLOCKSIZE, BLOCKSIZE, 0, BLOCKSIZE, // front face
      BLOCKSIZE, BLOCKSIZE, BLOCKSIZE, BLOCKSIZE, 0, BLOCKSIZE, BLOCKSIZE, 0, 0, BLOCKSIZE, BLOCKSIZE, 0, // right face
      BLOCKSIZE, BLOCKSIZE, 0, BLOCKSIZE, 0, 0, 0, 0, 0, 0, BLOCKSIZE, 0, // back face
      0, BLOCKSIZE, 0, 0, 0, 0, 0, 0, BLOCKSIZE, 0, BLOCKSIZE, BLOCKSIZE, // left face
      BLOCKSIZE, BLOCKSIZE, BLOCKSIZE, BLOCKSIZE, BLOCKSIZE, 0, 0, BLOCKSIZE, 0, 0, BLOCKSIZE, BLOCKSIZE, // top face
      BLOCKSIZE, 0, BLOCKSIZE, 0, 0, BLOCKSIZE, 0, 0, 0, BLOCKSIZE, 0, 0, // bottom face
    ]),

    normals: new Float32Array([
      0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 0.0, 0.0, 1.0, // front face
      1.0, 0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 0.0, 0.0, // right face
      0.0, 0.0, -1.0, 0.0, 0.0, -1.0, 0.0, 0.0, -1.0, 0.0, 0.0, -1.0, // back face
      -1.0, 0.0, 0.0, -1.0, 0.0, 0.0, -1.0, 0.0, 0.0, -1.0, 0.0, 0.0, // left face
      0.0, 1.0, 0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 0.0, // top face
      0.0, -1.0, 0.0, 0.0, -1.0, 0.0, 0.0, -1.0, 0.0, 0.0, -1.0, 0.0, // bottom face
    ]),

    textureCoordinates: new Float32Array([
      BLOCKSIZE, BLOCKSIZE, 0.0, BLOCKSIZE, 0.0, 0.0, BLOCKSIZE, 0.0, // front face
      0.0, BLOCKSIZE, 0.0, 0.0, BLOCKSIZE, 0.0, BLOCKSIZE, BLOCKSIZE, // right face
      0.0, BLOCKSIZE, 0.0, 0.0, BLOCKSIZE, 0.0, BLOCKSIZE, BLOCKSIZE,  // back face
      0.0, BLOCKSIZE, 0.0, 0.0, BLOCKSIZE, 0.0, BLOCKSIZE, BLOCKSIZE, // left face
      BLOCKSIZE, BLOCKSIZE, 0.0, BLOCKSIZE, 0.0, 0.0, BLOCKSIZE, 0.0, // top face
      BLOCKSIZE, BLOCKSIZE, 0.0, BLOCKSIZE, 0.0, 0.0, BLOCKSIZE, 0.0, // bottom face
    ]),

    indices: indices,

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
    gl.vertexAttribPointer(program.a_Position, block.dimensions, gl.FLOAT, false, 0, 0);

    // gl.bindBuffer(gl.ARRAY_BUFFER, block.normalBuffer);
    // gl.vertexAttribPointer(program.a_Normal, block.dimensions, gl.FLOAT, false, 0,0);

    gl.bindBuffer(gl.ARRAY_BUFFER, block.textureBuffer);
    gl.vertexAttribPointer(program.a_TexCoord, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, block.offsetBuffer);
    gl.vertexAttribPointer(program.a_Offset, 3, gl.FLOAT, false, 0, 0);
    gl.instanceExt.vertexAttribDivisorANGLE(program.a_Offset, 1);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, block.indexBuffer);

    gl.instanceExt.drawElementsInstancedANGLE(gl.TRIANGLES, block.indices.length, gl.UNSIGNED_BYTE, 0, block.offsets.length / 3);
  };
}

function generateTerrainChunk(gl, program, x, z) {
  let isVolcanic = getRandomInt(0, 10) === 1;
  let hasMountains = getRandomInt(0, 10) === 1;
  let goldLocations = [];
  let blockCount = 0;
  let grassOffsets = [], stoneOffsets = [], waterOffsets = [], frozenWaterOffsets = [], fireOffsets = [], snowOffsets = [], snowyStoneOffsets = [], sandOffsets = [], goldOffsets = [];
  const xModifier = TERRAIN_CHUNK_SIZE * x;
  const zModifier = TERRAIN_CHUNK_SIZE * z;
  let chunk = [];
  for (let row = 0; row < TERRAIN_CHUNK_SIZE; row++) {
    chunk[row] = [];
    for (let col = 0; col < TERRAIN_CHUNK_SIZE; col++) {
      let firstLevelNoise = noise.simplex2((xModifier + row) / 50, (zModifier + col) / 50);
      let secondLevelNoise = noise.simplex2((xModifier + row) / 25, (zModifier + col) / 25);
      let height = Math.round(5 * firstLevelNoise + (firstLevelNoise * secondLevelNoise));
      let thirdLevelNoise = noise.simplex2((xModifier + row) / 200, (zModifier + col) / 200);
      let snowNoise = noise.simplex2((xModifier + row) / 1000, (zModifier + col) / 1000);
      let sandNoise = noise.simplex2((xModifier + row) / 500, (zModifier + col) / 500);
      let isDesert = false, isSnow = false;

      if (snowNoise <= 0.05) {
        isSnow = true;
      }
      else if (sandNoise <= 0.4) {
        isDesert = true;
        if (sandNoise <= 0.1) {
          height = Math.round(height * 0.25);
        }
        else {
          height = Math.round(height * 0.75);
        }
      }

      if (hasMountains && !isVolcanic && !isDesert && height > 2) {
        height = Math.abs(Math.pow(height, 2)) * secondLevelNoise;
      }

      height = Math.round(height);
      chunk[row][col] = height;
      while (height > WATER_LEVEL) {
        blockCount++;
        if (getRandomInt(0, GOLD_RARITY) === 1) {
          goldOffsets.push(row, height, col);
          goldLocations.push({ chunkX: x, chunkZ: z });
        }
        else {
          if (isSnow) {
            if (thirdLevelNoise <= 0.5) {
              snowOffsets.push(row, height, col);
            }
            else {
              snowyStoneOffsets.push(row, height, col);
            }
          }
          else if (isDesert) {
            sandOffsets.push(row, height, col);
          }
          else if (thirdLevelNoise <= 0.5) {
            grassOffsets.push(row, height, col);
          }
          else {
            if (isVolcanic && height >= FIRE_LEVEL) {
              fireOffsets.push(row, height, col);
            }
            else {
              stoneOffsets.push(row, height, col);
            }
          }
        }
        height--;
      }
      if (isSnow && Math.abs(snowNoise) >= 0.1) {
        frozenWaterOffsets.push(row, WATER_LEVEL, col);
      }
      else if (isDesert) {
        sandOffsets.push(row, WATER_LEVEL, col);
      }
      else {
        waterOffsets.push(row, WATER_LEVEL, col);
      }
      stoneOffsets.push(row, TERRAIN_MAX_DEPTH, col);
      blockCount += 2;
    }
  }
  return {
    positions: chunk,
    goldLocations: goldLocations,
    numBlocks: blockCount,
    blocks: {
      grassTop: createBlock(gl, program, {
        texNum: 0,
        offsets: grassOffsets,
        enabledFaces: [
          16, 17, 18, 16, 18, 19, // top face
        ]
      }),
      grassSides: createBlock(gl, program, {
        texNum: 1,
        offsets: grassOffsets,
        enabledFaces: [
          0, 1, 2, 0, 2, 3, // front face
          4, 5, 6, 4, 6, 7,   // right face
          8, 9, 10, 8, 10, 11, // back face
          12, 13, 14, 12, 14, 15, // left face
          //  16,17,18, 16,18,19, // top face
          20, 21, 22, 20, 22, 23 // bottom face
        ]
      }),
      snowTop: createBlock(gl, program, {
        texNum: 6,
        offsets: snowOffsets,
        enabledFaces: [
          16, 17, 18, 16, 18, 19, // top face
        ]
      }),
      snowSides: createBlock(gl, program, {
        texNum: 1,
        offsets: snowOffsets,
        enabledFaces: [
          0, 1, 2, 0, 2, 3, // front face
          4, 5, 6, 4, 6, 7,   // right face
          8, 9, 10, 8, 10, 11, // back face
          12, 13, 14, 12, 14, 15, // left face
          //  16,17,18, 16,18,19, // top face
          20, 21, 22, 20, 22, 23 // bottom face
        ]
      }),
      snowyStoneTop: createBlock(gl, program, {
        texNum: 6,
        offsets: snowyStoneOffsets,
        enabledFaces: [
          16, 17, 18, 16, 18, 19, // top face
        ]
      }),
      snowyStoneSides: createBlock(gl, program, {
        texNum: 2,
        offsets: snowyStoneOffsets,
        enabledFaces: [
          0, 1, 2, 0, 2, 3, // front face
          4, 5, 6, 4, 6, 7,   // right face
          8, 9, 10, 8, 10, 11, // back face
          12, 13, 14, 12, 14, 15, // left face
          //  16,17,18, 16,18,19, // top face
          20, 21, 22, 20, 22, 23 // bottom face
        ]
      }),
      stone: createBlock(gl, program, {
        texNum: 2,
        offsets: stoneOffsets
      }),
      water: createBlock(gl, program, {
        texNum: 3,
        offsets: waterOffsets
      }),
      frozenWater: createBlock(gl, program, {
        texNum: 8,
        offsets: frozenWaterOffsets
      }),
      fire: createBlock(gl, program, {
        texNum: 4,
        offsets: fireOffsets
      }),
      sand: createBlock(gl, program, {
        texNum: 7,
        offsets: sandOffsets
      }),
      gold: createBlock(gl, program, {
        texNum: 5,
        offsets: goldOffsets
      })
    }
  }
}

function addTerrainChunkToNode(node, chunk) {
  let { positions, blocks } = chunk;
  let chunkNode = node.add('transformation', mat4.create());
  let grassTopNode = chunkNode.add('shape', {
    shapeFunc: blocks.grassTop,
    params: {
    }
  });
  let grassSidesNode = chunkNode.add('shape', {
    shapeFunc: blocks.grassSides,
    params: {
    }
  });
  let snowTopNode = chunkNode.add('shape', {
    shapeFunc: blocks.snowTop,
    params: {
    }
  });
  let snowSidesNode = chunkNode.add('shape', {
    shapeFunc: blocks.snowSides,
    params: {
    }
  });
  let snowyStoneTopNode = chunkNode.add('shape', {
    shapeFunc: blocks.snowyStoneTop,
    params: {
    }
  });
  let snowyStoneSidesNode = chunkNode.add('shape', {
    shapeFunc: blocks.snowyStoneSides,
    params: {
    }
  });
  let stoneNode = chunkNode.add('shape', {
    shapeFunc: blocks.stone,
    params: {
    }
  });
  let waterNode = chunkNode.add('shape', {
    shapeFunc: blocks.water,
    params: {
    }
  });
  let fireNode = chunkNode.add('shape', {
    shapeFunc: blocks.fire,
    params: {
    }
  });
  let sandNode = chunkNode.add('shape', {
    shapeFunc: blocks.sand,
    params: {
    }
  });
  let frozenWaterNode = chunkNode.add('shape', {
    shapeFunc: blocks.frozenWater,
    params: {
    }
  });
  let goldNode = chunkNode.add('shape', {
    shapeFunc: blocks.gold,
    params: {
    }
  });
  return chunkNode;
}

function positionAndAddChunk(gl, program, node, x, z) {
  let chunk = generateTerrainChunk(gl, program, x, z);
  let translate = mat4.create();
  let xTranslate = ((TERRAIN_CHUNK_SIZE * BLOCKSIZE) / 1.5 * x);
  let zTranslate = ((TERRAIN_CHUNK_SIZE * BLOCKSIZE) / 1.5 * z);
  mat4.translate(translate, translate, vec3.fromValues(xTranslate, 0, zTranslate));
  let translateNode = node.add('transformation', translate);
  let chunkNode = addTerrainChunkToNode(translateNode, chunk);
  return {
    chunk: chunk,
    node: chunkNode
  };
}


//========== MAIN ONLOAD FUNCTION ==========\\
window.onload = function () {

  let canvas = document.getElementById('canvas');
  let gameDiv = document.getElementById('game-div');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight - document.getElementById('description').getBoundingClientRect().height - 50;
  gameDiv.width = canvas.width;
  gameDiv.height = canvas.height;
  let gl;
  // catch the error from creating the context since this has nothing to do with the code
  try {
    gl = middUtils.initializeGL(canvas);
  } catch (e) {
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
  gl.clearColor(0, 0, 0, 1);

  let keyMap = {};
  let mouseMovementInfo = {
    turnRadians: 0,
    tiltRadians: 0
  };

  window.onkeydown = function (e) {
    keyMap[e.which] = true;
    if (e.shiftKey) {
      keyMap['SHIFT'] = true;
    }
  };

  window.onkeyup = function (e) {
    keyMap[e.which] = false;
    if (!e.shiftKey) {
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
  let rootNode = createScenegraph(gl, program);

  let terrainTransform = mat4.create();
  let terrainNode = rootNode.add('transformation', terrainTransform);

  let allGoldLocations = [];
  let totalChunkCount = 0;
  let totalBlockCount = 0;

  let allChunks = {};
  let allChunkNodes = {};
  for (let x = 0; x < 2; x++) {
    allChunks[x] = {};
    allChunkNodes[x] = {};
    for (let z = 0; z < 2; z++) {
      let { chunk, node } = positionAndAddChunk(gl, program, terrainNode, x, z);
      allChunks[x][z] = chunk
      allChunkNodes[x][z] = node;
      allGoldLocations = allGoldLocations.concat(chunk.goldLocations);
      totalChunkCount++;
      totalBlockCount += chunk.numBlocks;
    }
  }

  let lastDeepChunkCheck = 0;
  let render = function () {


    if (mouseMovementInfo.turnRadians !== 0) {
      camera.turn(mouseMovementInfo.turnRadians);
      mouseMovementInfo.turnRadians = 0;
    }
    if (mouseMovementInfo.tiltRadians !== 0) {
      camera.tilt(mouseMovementInfo.tiltRadians);
      mouseMovementInfo.tiltRadians = 0;
    }

    // check which keys that we care about are down

    if (keyMap['W'.charCodeAt(0)]) {
      camera.moveForward({
        movementSpeed: keyMap['SHIFT'] ? MOVEMENT_SPEED_FACTOR_RUNNING : MOVEMENT_SPEED_FACTOR
      });
    } else if (keyMap['S'.charCodeAt(0)]) {
      camera.moveBackward({
        movementSpeed: keyMap['SHIFT'] ? MOVEMENT_SPEED_FACTOR_RUNNING : MOVEMENT_SPEED_FACTOR
      });
    }

    if (keyMap['A'.charCodeAt(0)]) {
      camera.strafeLeft({

      });
    } else if (keyMap['D'.charCodeAt(0)]) {
      camera.strafeRight({

      });
    }

    if (keyMap[38]) {
      camera.tilt(-TURN_DEGREES);
    } else if (keyMap[40]) {
      camera.tilt(TURN_DEGREES);
    }

    if (keyMap[37]) {
      camera.turn(TURN_DEGREES);
    } else if (keyMap[39]) {
      camera.turn(-TURN_DEGREES);
    }

    if (keyMap['R'.charCodeAt(0)]) {
      camera.moveUp();
    } else if (keyMap['F'.charCodeAt(0)]) {
      camera.moveDown();
    }

    // clear the canvas
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);


    // DRAW STUFF HERE

    let projection = mat4.create();
    mat4.perspective(projection, Math.PI / 3, canvas.width / canvas.height, PERSPECTIVE_NEAR_PLANE, PERSPECTIVE_FAR_PLANE);
    gl.uniformMatrix4fv(program.u_Projection, false, projection);

    const eyeVector = camera.getEyeVector();
    let currentChunkCoords = { x: Math.floor(eyeVector[0] / ((TERRAIN_CHUNK_SIZE * BLOCKSIZE) / 1.5)), z: Math.floor(eyeVector[2] / ((TERRAIN_CHUNK_SIZE * BLOCKSIZE) / 1.5)) };
    let currentChunk = allChunks[currentChunkCoords.x][currentChunkCoords.z];


    let neighborChunks = [
      { x: currentChunkCoords.x, z: currentChunkCoords.z },
      { x: currentChunkCoords.x - 1, z: currentChunkCoords.z - 1 },
      { x: currentChunkCoords.x + 1, z: currentChunkCoords.z - 1 },
      { x: currentChunkCoords.x + 1, z: currentChunkCoords.z + 1 },
      { x: currentChunkCoords.x - 1, z: currentChunkCoords.z + 1 },
      { x: currentChunkCoords.x, z: currentChunkCoords.z + 1 },
      { x: currentChunkCoords.x, z: currentChunkCoords.z - 1 },
      { x: currentChunkCoords.x + 1, z: currentChunkCoords.z },
      { x: currentChunkCoords.x - 1, z: currentChunkCoords.z },
    ];

    const shouldCheckDeepNeighbors = Date.now() - lastDeepChunkCheck > 1000;

    neighborChunks.forEach((chunkCoordinate) => {
      if (allChunks[chunkCoordinate.x] === undefined) {
        allChunks[chunkCoordinate.x] = {};
        allChunkNodes[chunkCoordinate.x] = {};
      }
      if (allChunks[chunkCoordinate.x][chunkCoordinate.z] === undefined) {
        let { chunk, node, goldLocations } = positionAndAddChunk(gl, program, terrainNode, chunkCoordinate.x, chunkCoordinate.z);
        allChunks[chunkCoordinate.x][chunkCoordinate.z] = chunk;
        allChunkNodes[chunkCoordinate.x][chunkCoordinate.z] = node;
      }
      //Check deep neighbors every second, not every frame (expensive)
      if (shouldCheckDeepNeighbors) {
        let deepNeighborChunks = [
          { x: chunkCoordinate.x - 1, z: chunkCoordinate.z - 1 },
          { x: chunkCoordinate.x + 1, z: chunkCoordinate.z - 1 },
          { x: chunkCoordinate.x + 1, z: chunkCoordinate.z + 1 },
          { x: chunkCoordinate.x - 1, z: chunkCoordinate.z + 1 },
          { x: chunkCoordinate.x, z: chunkCoordinate.z + 1 },
          { x: chunkCoordinate.x, z: chunkCoordinate.z - 1 },
          { x: chunkCoordinate.x + 1, z: chunkCoordinate.z },
          { x: chunkCoordinate.x - 1, z: chunkCoordinate.z },
        ];
        deepNeighborChunks.forEach((chunkCoordinate) => {
          if (allChunks[chunkCoordinate.x] === undefined) {
            allChunks[chunkCoordinate.x] = {};
            allChunkNodes[chunkCoordinate.x] = {};
          }
          if (allChunks[chunkCoordinate.x][chunkCoordinate.z] === undefined) {
            let { chunk, node } = positionAndAddChunk(gl, program, terrainNode, chunkCoordinate.x, chunkCoordinate.z);
            allChunks[chunkCoordinate.x][chunkCoordinate.z] = chunk;
            allChunkNodes[chunkCoordinate.x][chunkCoordinate.z] = node;
            allGoldLocations = allGoldLocations.concat(chunk.goldLocations);
            totalChunkCount++;
            totalBlockCount += chunk.numBlocks;
          }
        });
        lastDeepChunkCheck = Date.now();
      }
    });

    //Don't render chunks that are far away
    _.each(allChunkNodes, (xNodeArray, x) => {
      _.each(xNodeArray, (node, z) => {
        if (Math.abs(currentChunkCoords.x - x) > CHUNK_CUTOFF_DISTANCE || Math.abs(currentChunkCoords.z - z) > CHUNK_CUTOFF_DISTANCE) {
          node.disable();
        }
        else {
          node.enable();
        }
      });
    });

    let goldNearby = false;
    allGoldLocations.forEach((location) => {
      if (currentChunkCoords.x === location.chunkX && currentChunkCoords.z === location.chunkZ) {
        goldNearby = true;
      }
    });

    document.getElementById('goldradar').innerHTML = goldNearby ? "THERE IS GOLD NEARBY!" : "Better keep looking...";
    document.getElementById('goldradar').style.fontWeight = goldNearby ? "bold" : "";
    document.getElementById('goldcount').innerHTML = allGoldLocations.length;
    document.getElementById('chunkcount').innerHTML = totalChunkCount;
    document.getElementById('blockcount').innerHTML = totalBlockCount;
    document.getElementById('current-chunk').innerHTML = "(" + currentChunkCoords.x + ", " + currentChunkCoords.z + ")";

    let compassAngle = camera.getCompassAngle();
    document.getElementById('compass').style.transform = "rotate(" + compassAngle + "deg)";


    camera.apply();

    rootNode.apply();

    requestAnimationFrame(render);
  };

  Promise.all([
    initializeTexture(gl, gl.TEXTURE0, 'grass.png'),
    initializeTexture(gl, gl.TEXTURE1, 'dirt.jpg'),
    initializeTexture(gl, gl.TEXTURE2, 'stone.png'),
    initializeTexture(gl, gl.TEXTURE3, 'water.png'),
    initializeTexture(gl, gl.TEXTURE4, 'fire2.jpg'),
    initializeTexture(gl, gl.TEXTURE5, 'gold.jpg'),
    initializeTexture(gl, gl.TEXTURE6, 'snow.jpg'),
    initializeTexture(gl, gl.TEXTURE7, 'sand.jpg'),
    initializeTexture(gl, gl.TEXTURE8, 'frozen-water.png')
  ])
    .then(() => render())
    .catch(function (error) { alert('Failed to load texture ' + error.message); });

};

function initializeTexture(gl, textureid, filename) {
  //Borrowed from http://bl.ocks.org/ProfBlack/d65bc62402b50a8e46d67095eeaeb5f4
  return new Promise(function (resolve, reject) {
    var texture = gl.createTexture();

    var image = new Image();
    image.onload = function () {
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
      gl.activeTexture(textureid);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);

      let ext = gl.getExtension("EXT_texture_filter_anisotropic") || gl.getExtension("WEBKIT_EXT_texture_filter_anisotropic") || gl.getExtension("MOZ_EXT_texture_filter_anisotropic");
      gl.texParameterf(gl.TEXTURE_2D, ext.TEXTURE_MAX_ANISOTROPY_EXT, 9);

      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, image);
      gl.generateMipmap(gl.TEXTURE_2D);
      resolve();
    };


    image.onerror = function (error) {

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

function rgbToFloats(r, g, b) {
  return { r: r / 255, g: g / 255, b: b / 255 };
}
