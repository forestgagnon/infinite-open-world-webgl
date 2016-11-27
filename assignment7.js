//========== Forest Gagnon - CS461 HW07 - assignment7.js ==========\\
/* Extra features:
*/

let vertexShader = `
attribute vec4 a_Position;
attribute vec4 a_Color;

uniform mat4 u_View;
uniform mat4 u_Projection;
uniform mat4 u_Transform;

varying vec4 v_Color;

void main(){
  v_Color = a_Color;
  gl_Position = u_Projection * u_View * u_Transform * a_Position;
}`;

var fragmentShader = `
precision mediump float;
varying vec4 v_Color;
void main(){
  gl_FragColor = v_Color;
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

const GRID_SIZE = 32;
const HALF_GRID_SIZE = GRID_SIZE / 2; //don't compute this everywhere
const PERSPECTIVE_NEAR_PLANE = 0.1;
const PERSPECTIVE_FAR_PLANE = 100;
const TURN_DEGREES = Math.PI / 75;
const MOUSE_SENSITIVITY = 0.00025;
const BLOCKSIZE = 2.0;
const NOCLIP = false;

function buildMaze(size) {
  let maze = [];
  let wallsToExplore = [];
  for(let row = 0; row < size; row++) {
    maze[row] = [];
    for(let col = 0; col < size; col++) {
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

var createScenegraph = function(gl, program){
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
  const MOVEMENT_SPEED_FACTOR = 0.05;
  const STRAFE_FACTOR = MOVEMENT_SPEED_FACTOR;

  let eye = eyeVector;
  let up = vec3.fromValues(0, 1, 0);
  let at = vec3.create();
  vec3.add(at, eye, vec3.fromValues(10, 0, 10));
  let pitch = 0;
  return {
    apply: () => {
      let view = mat4.create();

      let rotationAxis = vec3.create();
      let directionNormal = vec3.create();
      vec3.subtract(directionNormal, eye, at);
      vec3.normalize(directionNormal, directionNormal);
      vec3.cross(rotationAxis, directionNormal, up);

      let q = quat.create();
      quat.setAxisAngle(q, rotationAxis, pitch);
      let newAt = vec3.create;
      vec3.subtract(newAt, at, eye);
      vec3.transformQuat(newAt, newAt, q);
      vec3.add(newAt, newAt, eye);

      mat4.lookAt(view, eye, newAt, up);
      gl.uniformMatrix4fv(program.u_View, false, view);
    },

    moveForward: (disableVerticalMovement = false) => {
      let direction = vec3.create();
      vec3.subtract(direction, at, eye);
      if (disableVerticalMovement) {
        direction[1] = 0;
      }
      vec3.normalize(direction, direction);
      movementVec = vec3.create();
      vec3.multiply(movementVec, direction, vec3.fromValues(MOVEMENT_SPEED_FACTOR, MOVEMENT_SPEED_FACTOR, MOVEMENT_SPEED_FACTOR));
      vec3.add(eye, eye, movementVec);
      vec3.add(at, at, movementVec);
    },
    moveBackward: (disableVerticalMovement = false) => {
      let direction = vec3.create();
      vec3.subtract(direction, eye, at);
      if (disableVerticalMovement) {
        direction[1] = 0;
      }
      vec3.normalize(direction, direction);
      movementVec = vec3.create();
      vec3.multiply(movementVec, direction, vec3.fromValues(MOVEMENT_SPEED_FACTOR, MOVEMENT_SPEED_FACTOR, MOVEMENT_SPEED_FACTOR));
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
      movementVec = vec3.fromValues(0, 15*MOVEMENT_SPEED_FACTOR, 0);
      vec3.add(eye, eye, movementVec);
      vec3.add(at, at, movementVec);
    },
    moveDown: () => {
      movementVec = vec3.fromValues(0, 15*MOVEMENT_SPEED_FACTOR, 0);
      vec3.subtract(eye, eye, movementVec);
      vec3.subtract(at, at, movementVec);
    }
  }
};


//========== DRAWING FUNCTION GENERATORS ==========\\
function createGrid(gl, program) {
  gl.enableVertexAttribArray(program.a_Position);
  gl.enableVertexAttribArray(program.a_Color);

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
  const WALL_COLOR = [240/255, 59/255, 32/255];
  let wall = {
    vertices : new Float32Array([
          BLOCKSIZE,  BLOCKSIZE,  BLOCKSIZE,
          0.0,  BLOCKSIZE,  BLOCKSIZE,
          0.0,  0.0,  BLOCKSIZE,
          BLOCKSIZE, 0.0,  BLOCKSIZE,

          BLOCKSIZE,  BLOCKSIZE,  0.0,
          0.0,  BLOCKSIZE,  0.0,
          0.0,  0.0,  0.0,
          BLOCKSIZE,  0.0,  0.0
    ]),
    colors: new Float32Array([
      WALL_COLOR[0], WALL_COLOR[1], WALL_COLOR[2],
      WALL_COLOR[0], WALL_COLOR[1], WALL_COLOR[2],
      WALL_COLOR[0], WALL_COLOR[1], WALL_COLOR[2],
      WALL_COLOR[0], WALL_COLOR[1], WALL_COLOR[2],

      WALL_COLOR[0], WALL_COLOR[1], WALL_COLOR[2],
      WALL_COLOR[0], WALL_COLOR[1], WALL_COLOR[2],
      WALL_COLOR[0], WALL_COLOR[1], WALL_COLOR[2],
      WALL_COLOR[0], WALL_COLOR[1], WALL_COLOR[2]
    ]),

    indices: new Uint8Array([
       0,1,2,  0,2,3, // front face
       0,7,4,  0,3,7,   // right face
       1,5,6,  1,6,2, // left face
      //  0,4,5,  0,5,1, // top face
      //  3,2,6,  3,6,7, // bottom face
       4,7,6,  4,6,5 // back face

    ]),
    dimensions: 3,
    numPoints: 8
  };
  wall.vertexBuffer = gl.createBuffer();
  wall.colorBuffer = gl.createBuffer();
  wall.indexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, wall.vertexBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, wall.vertices, gl.STATIC_DRAW);

  gl.bindBuffer(gl.ARRAY_BUFFER, wall.colorBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, wall.colors, gl.STATIC_DRAW);

  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, wall.indexBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, wall.indices, gl.STATIC_DRAW);

  return () => {
    gl.bindBuffer(gl.ARRAY_BUFFER, wall.vertexBuffer);
    // associate it with our position attribute
    gl.vertexAttribPointer(program.a_Position, wall.dimensions, gl.FLOAT, false, 0,0);

    gl.bindBuffer(gl.ARRAY_BUFFER, wall.colorBuffer);
    // associate it with our position attribute
    gl.vertexAttribPointer(program.a_Color, wall.dimensions, gl.FLOAT, false, 0,0);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, wall.indexBuffer);
    gl.drawElements(gl.TRIANGLES, wall.indices.length, gl.UNSIGNED_BYTE, 0);
  };
}

function createOpenSquare(gl, program) {
  let open = {
    vertices : new Float32Array([
          BLOCKSIZE,  BLOCKSIZE,  BLOCKSIZE,
          0.0,  BLOCKSIZE,  BLOCKSIZE,
          0.0,  0.0,  BLOCKSIZE,
          BLOCKSIZE, 0.0,  BLOCKSIZE,

          BLOCKSIZE,  BLOCKSIZE,  0.0,
          0.0,  BLOCKSIZE,  0.0,
          0.0,  0.0,  0.0,
          BLOCKSIZE,  0.0,  0.0
    ]),
    colors: new Float32Array([
      DARK_GREEN.r, DARK_GREEN.g, DARK_GREEN.b,
      DARK_GREEN.r, DARK_GREEN.g, DARK_GREEN.b,
      DARK_GREEN.r, DARK_GREEN.g, DARK_GREEN.b,
      DARK_GREEN.r, DARK_GREEN.g, DARK_GREEN.b,

      DARK_GREEN.r, DARK_GREEN.g, DARK_GREEN.b,
      DARK_GREEN.r, DARK_GREEN.g, DARK_GREEN.b,
      DARK_GREEN.r, DARK_GREEN.g, DARK_GREEN.b,
      DARK_GREEN.r, DARK_GREEN.g, DARK_GREEN.b
    ]),

    indices: new Uint8Array([
      //  0,1,2,  0,2,3, // front face
      //  0,7,4,  0,3,7,   // right face
      //  1,5,6,  1,6,2, // left face
       0,4,5,  0,5,1, // top face
       3,2,6,  3,6,7, // bottom face
      //  4,7,6,  4,6,5 // back face

    ]),
    dimensions: 3,
    numPoints: 8
  };
  open.vertexBuffer = gl.createBuffer();
  open.colorBuffer = gl.createBuffer();
  open.indexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, open.vertexBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, open.vertices, gl.STATIC_DRAW);

  gl.bindBuffer(gl.ARRAY_BUFFER, open.colorBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, open.colors, gl.STATIC_DRAW);

  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, open.indexBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, open.indices, gl.STATIC_DRAW);

  return () => {
    gl.bindBuffer(gl.ARRAY_BUFFER, open.vertexBuffer);
    // associate it with our position attribute
    gl.vertexAttribPointer(program.a_Position, open.dimensions, gl.FLOAT, false, 0,0);

    gl.bindBuffer(gl.ARRAY_BUFFER, open.colorBuffer);
    // associate it with our position attribute
    gl.vertexAttribPointer(program.a_Color, open.dimensions, gl.FLOAT, false, 0,0);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, open.indexBuffer);
    gl.drawElements(gl.TRIANGLES, open.indices.length, gl.UNSIGNED_BYTE, 0);
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
  program.a_Color = gl.getAttribLocation(program, 'a_Color');
  program.u_Projection = gl.getUniformLocation(program, 'u_Projection');
  program.u_View = gl.getUniformLocation(program, 'u_View');

  gl.enable(gl.DEPTH_TEST);
  gl.clearColor(0,0,0,1);

  let keyMap = {};
  let mouseMovementInfo = {
    turnRadians: 0,
    tiltRadians: 0
  };

  window.onkeydown = function(e){
      keyMap[e.which] = true;
  }

  window.onkeyup = function(e){
       keyMap[e.which] = false;
  }

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

  let mazeObject = buildMaze(GRID_SIZE);
  console.log(mazeObject);
  let camera = createCamera(gl, program, vec3.fromValues(mazeObject.initRow * BLOCKSIZE + BLOCKSIZE/2, 0.5, mazeObject.initCol * BLOCKSIZE + BLOCKSIZE/2));
  let grid = createGrid(gl, program);
  let wall = createWall(gl, program);
  let openSquare = createOpenSquare(gl, program);

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
      camera.moveForward(true);
    }else if (keyMap['S'.charCodeAt(0)]){
      camera.moveBackward(true);
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

    //Initialize scenegraph and drawing functions
    let rootNode = createScenegraph(gl, program);

    //Place grid
    // let gridNode = rootNode.add("shape", grid);


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
            transformNode.add('shape', openSquare);
            break;
          case MAZE_CONSTANTS.START:
            transformNode.add('shape', openSquare);
            break;
          case MAZE_CONSTANTS.END:
            transformNode.add('shape', openSquare);
            break;
        }
      }
    }

    rootNode.apply();

    requestAnimationFrame(render);
  };

  render();

};

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
