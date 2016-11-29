//========== Forest Gagnon - CS461 HW07 - assignment7.js ==========\\
/* Extra features: Mouse look & camera with proper pitch this time (hooray!), anisotropic filtering for the mipmap,
 running with SHIFT key,
*
*/

let vertexShader = `
attribute vec4 a_Position;
attribute vec4 a_Normal;
attribute vec2 a_TexCoord;

uniform mat4 u_View;
uniform mat4 u_Projection;
uniform mat4 u_Transform;

varying vec2 v_TexCoord;
varying vec4 v_Position;
varying vec4 v_Normal;

void main(){
  gl_Position = u_Projection * u_View * u_Transform * a_Position;
  v_TexCoord = a_TexCoord;
  v_Position = (u_Transform * a_Position);
  v_Normal = normalize(u_Transform * a_Normal);
}`;

var fragmentShader = `
precision mediump float;

uniform sampler2D u_Sampler;
uniform mat4 frag_u_Transform;
uniform mat4 frag_u_View;
uniform vec3 u_LightPosition;
uniform vec3 u_LightAxis;

// varying vec4 v_Luminance;
varying vec4 v_Position;
varying vec4 v_Normal;
varying vec2 v_TexCoord;

vec4 luminance;
vec3 ambient, diffuse, light_position;
float lightAngleAttn;

vec3 L, N, V, H, P;

float diffuseLightFalloff, diffuseLightFalloffMultiplier, lampSpreadFactor;

void main(){
  light_position = (frag_u_Transform * vec4(u_LightPosition, 1.0)).xyz;

	vec3 light_ambient = vec3(0.1, 0.1, 0.1);
	vec3 light_diffuse = vec3(0.9, 0.9, 0.9);
	vec3 light_specular = vec3(0.9, 0.9, 0.9);
	float shininess = 60.0;

	P = (frag_u_Transform*v_Position).xyz;

	N = (frag_u_Transform * v_Normal).xyz;
	L = normalize(light_position - P);
	V = normalize( -P);
	H = normalize(L+V);


	ambient = light_ambient;
  diffuseLightFalloff = pow(2.0, distance(light_position, (frag_u_Transform*v_Position).xyz));
  diffuseLightFalloffMultiplier = 40.0;
	diffuse = (max(dot(L, u_LightAxis), 0.0) * light_diffuse) / (diffuseLightFalloff * diffuseLightFalloffMultiplier);

  lightAngleAttn = acos(dot(normalize(u_LightAxis), L));

  lampSpreadFactor = 4.0 / diffuseLightFalloffMultiplier;
  luminance = vec4((diffuse) / (lightAngleAttn * lampSpreadFactor * vec3(0.5, 0.7, 0.9)), 1.0);
  gl_FragColor = texture2D(u_Sampler, v_TexCoord) * luminance;
}`;

function rgbToFloats(r, g, b) {
  return { r: r/255, g: g/255, b: b/255 };
}

const MAZE_CONSTANTS = {
  OPEN: "OPEN",
  WALL: "WALL",
  START: "START",
  END: "END"
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

const GRID_SIZE = 36;
const HALF_GRID_SIZE = GRID_SIZE / 2; //don't compute this everywhere
const PERSPECTIVE_NEAR_PLANE = 0.1;
const PERSPECTIVE_FAR_PLANE = 100;
const TURN_DEGREES = Math.PI / 75;
const MOUSE_SENSITIVITY = 0.00025;
const BLOCKSIZE = 2.0;
const NOCLIP = false;
const MOVEMENT_SPEED_FACTOR = 0.025;
const MOVEMENT_SPEED_FACTOR_RUNNING = MOVEMENT_SPEED_FACTOR * 2;

function buildMaze(size) {
  let maze = [];
  let wallsToExplore = [];
  for(let row = 0; row < size+1; row++) {
    maze[row] = [];
    for(let col = 0; col < size+1; col++) {
      maze[row][col] = MAZE_CONSTANTS.WALL;
    }
  }

  let initCellRow = getRandomInt(0, Math.floor(size/2)) * 2 + 1;
  let initCellCol = getRandomInt(0, Math.floor(size/2)) * 2 + 1;

  maze[initCellRow][initCellCol] = MAZE_CONSTANTS.START;
  wallsToExplore.push({ wallPos: [initCellRow - 1, initCellCol], nextCell: [initCellRow - 2, initCellCol] });
  wallsToExplore.push({ wallPos: [initCellRow + 1, initCellCol], nextCell: [initCellRow + 2, initCellCol] });
  wallsToExplore.push({ wallPos: [initCellRow, initCellCol + 1], nextCell: [initCellRow, initCellCol + 2] });
  wallsToExplore.push({ wallPos: [initCellRow, initCellCol - 1], nextCell: [initCellRow, initCellCol - 2] });

  let lastDrawnCell = [initCellRow, initCellCol];

  while(wallsToExplore.length > 0) {
    const wallIndex = getRandomInt(0, wallsToExplore.length);
    let wall = wallsToExplore[wallIndex];
    wallsToExplore.splice(wallIndex, 1);
    if(wall.nextCell[0] >= 0 && wall.nextCell[0] < size && wall.nextCell[1] >= 0 && wall.nextCell[1] < size &&
      maze[wall.nextCell[0]][wall.nextCell[1]] === MAZE_CONSTANTS.WALL) {

      maze[wall.nextCell[0]][wall.nextCell[1]] = MAZE_CONSTANTS.OPEN;
      lastDrawnCell = [wall.nextCell[0], wall.nextCell[1]];

      wallsToExplore.push({ wallPos: [wall.nextCell[0] - 1, wall.nextCell[1]], nextCell: [wall.nextCell[0] - 2, wall.nextCell[1]] });
      wallsToExplore.push({ wallPos: [wall.nextCell[0] + 1, wall.nextCell[1]], nextCell: [wall.nextCell[0] + 2, wall.nextCell[1]] });
      wallsToExplore.push({ wallPos: [wall.nextCell[0], wall.nextCell[1] - 1], nextCell: [wall.nextCell[0], wall.nextCell[1] - 2] });
      wallsToExplore.push({ wallPos: [wall.nextCell[0], wall.nextCell[1] + 1], nextCell: [wall.nextCell[0], wall.nextCell[1] + 2] });

      maze[wall.wallPos[0]][wall.wallPos[1]] = MAZE_CONSTANTS.OPEN;

    }
  }

  maze[lastDrawnCell[0]][lastDrawnCell[1]] = MAZE_CONSTANTS.END;

  return { maze: maze, initRow: initCellRow, initCol: initCellCol };
}

const createScenegraph = function(gl, program){
  let stack = [];
  let currentMatrix = mat4.create();
  let u_Transform = gl.getUniformLocation(program, 'u_Transform');
  let frag_u_Transform = gl.getUniformLocation(program, 'frag_u_Transform');

  let createTransformationNode = function(matrix){
    let children = [];
    return {
      add: function(type, data){
        let node;
        if (type === "transformation"){
          node = createTransformationNode(data);
        }else if (type === "shape"){
          node = createShapeNode(data);
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
        gl.uniformMatrix4fv(frag_u_Transform, false, currentMatrix);
        children.forEach((child) => {
          child.apply();
        });
        currentMatrix = stack.pop();

      }

    };
  };

  let createShapeNode = function(shapeFunc){
    return {
      apply: () =>{
        shapeFunc();
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
       tiltedAt = vec3.create;
      vec3.subtract(tiltedAt, at, eye);
      vec3.transformQuat(tiltedAt, tiltedAt, q);
      vec3.add(tiltedAt, tiltedAt, eye);

      mat4.lookAt(view, eye, tiltedAt, up);
      gl.uniformMatrix4fv(program.u_View, false, view);
      gl.uniformMatrix4fv(program.frag_u_View, false, view);
    },

    moveForward: (params) => {
      let direction = vec3.create();
      vec3.subtract(direction, at, eye);
      if (params.disableVerticalMovement) {
        direction[1] = 0;
      }
      vec3.normalize(direction, direction);
      movementVec = vec3.create();
      vec3.multiply(movementVec, direction, vec3.fromValues(params.movementSpeed, params.movementSpeed, params.movementSpeed));
      vec3.add(eye, eye, movementVec);
      vec3.add(at, at, movementVec);
    },
    moveBackward: (params) => {
      let direction = vec3.create();
      vec3.subtract(direction, eye, at);
      if (params.disableVerticalMovement) {
        direction[1] = 0;
      }
      vec3.normalize(direction, direction);
      movementVec = vec3.create();
      vec3.multiply(movementVec, direction, vec3.fromValues(params.movementSpeed, params.movementSpeed, params.movementSpeed));
      vec3.add(eye, eye, movementVec);
      vec3.add(at, at, movementVec);
    },

    strafeRight: () => {
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

    strafeLeft: () => {
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

function createWall(gl, program) {
  let wall = {
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
    //  16,17,18, 16,18,19, // top face
    //  20,21,22, 20,22,23 // bottom face

    ]),
    dimensions: 3
  };
  wall.vertexBuffer = gl.createBuffer();
  wall.normalBuffer = gl.createBuffer();
  wall.indexBuffer = gl.createBuffer();
  wall.textureBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, wall.vertexBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, wall.vertices, gl.STATIC_DRAW);

  gl.bindBuffer(gl.ARRAY_BUFFER, wall.normalBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, wall.normals, gl.STATIC_DRAW);

  gl.bindBuffer(gl.ARRAY_BUFFER, wall.textureBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, wall.textureCoordinates, gl.STATIC_DRAW);

  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, wall.indexBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, wall.indices, gl.STATIC_DRAW);

  return () => {
    gl.uniform1i(program.u_Sampler, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, wall.vertexBuffer);
    gl.vertexAttribPointer(program.a_Position, wall.dimensions, gl.FLOAT, false, 0,0);

    gl.bindBuffer(gl.ARRAY_BUFFER, wall.normalBuffer);
    gl.vertexAttribPointer(program.a_Normal, wall.dimensions, gl.FLOAT, false, 0,0);

    gl.bindBuffer(gl.ARRAY_BUFFER, wall.textureBuffer);
    gl.vertexAttribPointer(program.a_TexCoord, 2, gl.FLOAT, false, 0,0);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, wall.indexBuffer);
    gl.drawElements(gl.TRIANGLES, wall.indices.length, gl.UNSIGNED_BYTE, 0);
  };
}

function createFloor(gl, program) {
  let floor = {
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

    textureCoordinates : new Float32Array([
      BLOCKSIZE, BLOCKSIZE,  0.0, BLOCKSIZE, 0.0, 0.0, BLOCKSIZE, 0.0, // front face
      0.0, BLOCKSIZE, 0.0, 0.0, BLOCKSIZE, 0.0, BLOCKSIZE, BLOCKSIZE, // right face
      0.0, BLOCKSIZE, 0.0, 0.0, BLOCKSIZE, 0.0, BLOCKSIZE, BLOCKSIZE,  // back face
      0.0, BLOCKSIZE, 0.0, 0.0, BLOCKSIZE, 0.0, BLOCKSIZE, BLOCKSIZE, // left face
      BLOCKSIZE, BLOCKSIZE,  0.0, BLOCKSIZE, 0.0, 0.0, BLOCKSIZE, 0.0, // top face
      BLOCKSIZE, BLOCKSIZE,  0.0, BLOCKSIZE, 0.0, 0.0, BLOCKSIZE, 0.0, // bottom face
    ]),

    indices: new Uint8Array([
      // 0,1,2,  0,2,3, // front face
      // 4,5,6,  4,6,7,   // right face
    //  8,9,10, 8,10,11, // back face
    //  12,13,14,  12,14,15, // left face
    //  16,17,18, 16,18,19, // top face
     20,21,22, 20,22,23 // bottom face

    ]),
    dimensions: 3,
    numPoints: 8
  };
  floor.vertexBuffer = gl.createBuffer();
  floor.normalBuffer = gl.createBuffer();
  floor.indexBuffer = gl.createBuffer();
  floor.textureBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, floor.vertexBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, floor.vertices, gl.STATIC_DRAW);

  gl.bindBuffer(gl.ARRAY_BUFFER, floor.normalBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, floor.normals, gl.STATIC_DRAW);

  gl.bindBuffer(gl.ARRAY_BUFFER, floor.textureBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, floor.textureCoordinates, gl.STATIC_DRAW);

  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, floor.indexBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, floor.indices, gl.STATIC_DRAW);

  return () => {
    gl.uniform1i(program.u_Sampler, 1);

    gl.bindBuffer(gl.ARRAY_BUFFER, floor.vertexBuffer);
    gl.vertexAttribPointer(program.a_Position, floor.dimensions, gl.FLOAT, false, 0,0);

    gl.bindBuffer(gl.ARRAY_BUFFER, floor.normalBuffer);
    gl.vertexAttribPointer(program.a_Normal, floor.dimensions, gl.FLOAT, false, 0,0);

    gl.bindBuffer(gl.ARRAY_BUFFER, floor.textureBuffer);
    gl.vertexAttribPointer(program.a_TexCoord, 2, gl.FLOAT, false, 0,0);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, floor.indexBuffer);
    gl.drawElements(gl.TRIANGLES, floor.indices.length, gl.UNSIGNED_BYTE, 0);
  };
}

function createRoof(gl, program) {
  let roof = {
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

    textureCoordinates : new Float32Array([
      BLOCKSIZE, BLOCKSIZE,  0.0, BLOCKSIZE, 0.0, 0.0, BLOCKSIZE, 0.0, // front face
      0.0, BLOCKSIZE, 0.0, 0.0, BLOCKSIZE, 0.0, BLOCKSIZE, BLOCKSIZE, // right face
      0.0, BLOCKSIZE, 0.0, 0.0, BLOCKSIZE, 0.0, BLOCKSIZE, BLOCKSIZE,  // back face
      0.0, BLOCKSIZE, 0.0, 0.0, BLOCKSIZE, 0.0, BLOCKSIZE, BLOCKSIZE, // left face
      BLOCKSIZE, BLOCKSIZE,  0.0, BLOCKSIZE, 0.0, 0.0, BLOCKSIZE, 0.0, // top face
      BLOCKSIZE, BLOCKSIZE,  0.0, BLOCKSIZE, 0.0, 0.0, BLOCKSIZE, 0.0, // bottom face
    ]),

    indices: new Uint8Array([
      // 0,1,2,  0,2,3, // front face
      // 4,5,6,  4,6,7,   // right face
    //  8,9,10, 8,10,11, // back face
    //  12,13,14,  12,14,15, // left face
     16,17,18, 16,18,19, // top face
    //  20,21,22w, 20,22,23 // bottom face

    ]),
    dimensions: 3,
    numPoints: 8
  };
  roof.vertexBuffer = gl.createBuffer();
  roof.normalBuffer = gl.createBuffer();
  roof.indexBuffer = gl.createBuffer();
  roof.textureBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, roof.vertexBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, roof.vertices, gl.STATIC_DRAW);

  gl.bindBuffer(gl.ARRAY_BUFFER, roof.normalBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, roof.normals, gl.STATIC_DRAW);

  gl.bindBuffer(gl.ARRAY_BUFFER, roof.textureBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, roof.textureCoordinates, gl.STATIC_DRAW);

  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, roof.indexBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, roof.indices, gl.STATIC_DRAW);

  return () => {
    gl.uniform1i(program.u_Sampler, 2);

    gl.bindBuffer(gl.ARRAY_BUFFER, roof.vertexBuffer);
    gl.vertexAttribPointer(program.a_Position, roof.dimensions, gl.FLOAT, false, 0,0);

    gl.bindBuffer(gl.ARRAY_BUFFER, roof.normalBuffer);
    gl.vertexAttribPointer(program.a_Normal, roof.dimensions, gl.FLOAT, false, 0,0);

    gl.bindBuffer(gl.ARRAY_BUFFER, roof.textureBuffer);
    gl.vertexAttribPointer(program.a_TexCoord, 2, gl.FLOAT, false, 0,0);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, roof.indexBuffer);
    gl.drawElements(gl.TRIANGLES, roof.indices.length, gl.UNSIGNED_BYTE, 0);
  };
}


function createCube(gl, program) {
  //Structure borrowed from Prof. Andrews' color cube code
  let cube = {
    vertices : new Float32Array([
          1.0,  1.0,  1.0,
          0.0,  1.0,  1.0,
          0.0,  0.0,  1.0,
          1.0, 0.0,  1.0,

          1.0,  1.0,  0.0,
          0.0,  1.0,  0.0,
          0.0,  0.0,  0.0,
          1.0,  0.0,  0.0
    ]),
    colors: new Float32Array([
      LIGHT_PINK.r, LIGHT_PINK.g, LIGHT_PINK.b,
      LIGHT_PINK.r, LIGHT_PINK.g, LIGHT_PINK.b,
      DARK_PINK.r, DARK_PINK.g, DARK_PINK.b,
      DARK_PINK.r, DARK_PINK.g, DARK_PINK.b,

      LIGHT_PINK.r, LIGHT_PINK.g, LIGHT_PINK.b,
      LIGHT_PINK.r, LIGHT_PINK.g, LIGHT_PINK.b,
      DARK_PINK.r, DARK_PINK.g, DARK_PINK.b,
      DARK_PINK.r, DARK_PINK.g, DARK_PINK.b
    ]),

    indices: new Uint8Array([
       0,1,2,  0,2,3, // front face
       0,7,4,  0,3,7,   // right face
       1,5,6,  1,6,2, // left face
       0,4,5,  0,5,1, // top face
       3,2,6,  3,6,7, // bottom face
       4,7,6,  4,6,5 // back face

    ]),
    dimensions: 3,
    numPoints: 8
  };
  cube.vertexBuffer = gl.createBuffer();
  cube.colorBuffer = gl.createBuffer();
  cube.indexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, cube.vertexBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, cube.vertices, gl.STATIC_DRAW);

  gl.bindBuffer(gl.ARRAY_BUFFER, cube.colorBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, cube.colors, gl.STATIC_DRAW);

  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, cube.indexBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, cube.indices, gl.STATIC_DRAW);

  return () => {
    gl.bindBuffer(gl.ARRAY_BUFFER, cube.vertexBuffer);
    // associate it with our position attribute
    gl.vertexAttribPointer(program.a_Position, cube.dimensions, gl.FLOAT, false, 0,0);

    gl.bindBuffer(gl.ARRAY_BUFFER, cube.colorBuffer);
    // associate it with our position attribute
    gl.vertexAttribPointer(program.a_Color, cube.dimensions, gl.FLOAT, false, 0,0);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, cube.indexBuffer);
    gl.drawElements(gl.TRIANGLES, cube.indices.length, gl.UNSIGNED_BYTE, 0);
  };
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

  program.a_Position = gl.getAttribLocation(program, 'a_Position');
  program.a_Normal = gl.getAttribLocation(program, 'a_Normal');
  program.a_Color = gl.getAttribLocation(program, 'a_Color');
  program.a_TexCoord = gl.getAttribLocation(program, 'a_TexCoord');
  program.u_Sampler = gl.getUniformLocation(program, 'u_Sampler');
  program.u_Projection = gl.getUniformLocation(program, 'u_Projection');
  program.u_View = gl.getUniformLocation(program, 'u_View');
  program.frag_u_View = gl.getUniformLocation(program, 'frag_u_View');
  program.u_LightPosition = gl.getUniformLocation(program, 'u_LightPosition');
  program.u_LightAxis = gl.getUniformLocation(program, 'u_LightAxis');

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

  let mazeObject = buildMaze(GRID_SIZE);
  let camera = createCamera(gl, program, vec3.fromValues(mazeObject.initRow * BLOCKSIZE + BLOCKSIZE/2, 0.5, mazeObject.initCol * BLOCKSIZE + BLOCKSIZE/2));
  let wall = createWall(gl, program);
  let floor = createFloor(gl, program);
  let roof = createRoof(gl, program);

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
        disableVerticalMovement: true,
        movementSpeed: keyMap['SHIFT'] ? MOVEMENT_SPEED_FACTOR_RUNNING : MOVEMENT_SPEED_FACTOR
      });
    }else if (keyMap['S'.charCodeAt(0)]){
      camera.moveBackward({
        disableVerticalMovement: true,
        movementSpeed: keyMap['SHIFT'] ? MOVEMENT_SPEED_FACTOR_RUNNING : MOVEMENT_SPEED_FACTOR
      });
    }

    if (keyMap['A'.charCodeAt(0)]){
      camera.strafeLeft();
    }else if (keyMap['D'.charCodeAt(0)]){
      camera.strafeRight();
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

    camera.apply();
    const eyeVector = camera.getEyeVector();
    const atVector = camera.getAtVector();
    const upVector = camera.getUpVector();
    const viewMatrix = camera.getViewMatrix();
    let lampVector = vec3.fromValues(eyeVector[0], eyeVector[1] + 0.15 , eyeVector[2]);
    gl.uniform3fv(program.u_LightPosition, lampVector);

    let lampDirectionVector = vec3.create();
    vec3.subtract(lampDirectionVector, lampVector, atVector);
    vec3.normalize(lampDirectionVector, lampDirectionVector);
    gl.uniform3fv(program.u_LightAxis, vec3.fromValues(lampDirectionVector[0], lampDirectionVector[1], lampDirectionVector[2]));

    //Initialize scenegraph and drawing functions
    let rootNode = createScenegraph(gl, program);

    let mazeTransform = mat4.create();
    //mat4.translate(mazeTransform, mazeTransform, vec3.fromValues(-HALF_GRID_SIZE, 0, -HALF_GRID_SIZE));
    let mazeNode = rootNode.add('transformation', mazeTransform)

    for (let row = 0; row < mazeObject.maze.length; row++) {
      for (let col = 0; col < mazeObject.maze.length; col++) {
        let translate = mat4.create();
        mat4.translate(translate, translate, vec3.fromValues(row * BLOCKSIZE, 0, col*BLOCKSIZE));
        let transformNode = mazeNode.add('transformation', translate);
        switch (mazeObject.maze[row][col]) {
          case MAZE_CONSTANTS.WALL:
            transformNode.add('shape', wall);
            break;
          case MAZE_CONSTANTS.OPEN:
            transformNode.add('shape', floor);
            transformNode.add('shape', roof);
            break;
          case MAZE_CONSTANTS.START:
            transformNode.add('shape', floor);
            transformNode.add('shape', roof);
            break;
          case MAZE_CONSTANTS.END:
            transformNode.add('shape', floor);
            transformNode.add('shape', roof);
            break;
        }
      }
    }

    rootNode.apply();

    requestAnimationFrame(render);
  };

  Promise.all([
    initializeTexture(gl, gl.TEXTURE0, 'rockfloorbig.jpg'),
     initializeTexture(gl, gl.TEXTURE1, 'floor.png'),
     initializeTexture(gl, gl.TEXTURE2, 'roof.jpg')
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
