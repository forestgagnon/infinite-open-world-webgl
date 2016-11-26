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
const createCamera = function(gl, program) {
  const CAMERA_PITCH_FACTOR = PERSPECTIVE_FAR_PLANE - PERSPECTIVE_NEAR_PLANE;
  const MOVEMENT_SPEED_FACTOR = 0.05;
  const STRAFE_FACTOR = MOVEMENT_SPEED_FACTOR;
  const TURN_DEGREES = Math.PI / 75;

  let eye = vec3.fromValues(-HALF_GRID_SIZE - 1, 0.5, -HALF_GRID_SIZE - 1);
  let up = vec3.fromValues(0, 1, 0);
  let at = vec3.fromValues(0, 0.5, 0);
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

    turnRight: () => {
      vec3.rotateY(at, at, eye, -TURN_DEGREES);
    },

    turnLeft: () => {
      vec3.rotateY(at, at, eye, TURN_DEGREES);
    },

    tiltUp: () => {
      let newPitch = pitch - TURN_DEGREES;
      if (newPitch > -Math.PI/2) {
        pitch = newPitch;
      }

    },
    tiltDown: () => {
      let newPitch = pitch + TURN_DEGREES;
      if (newPitch < Math.PI/2) {
        pitch = newPitch;
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
  for (let i = -HALF_GRID_SIZE; i <= HALF_GRID_SIZE; i += 1.0) {
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

  let camera = createCamera(gl, program);


  let keyMap = {};

  window.onkeydown = function(e){
      keyMap[e.which] = true;
  }

  window.onkeyup = function(e){
       keyMap[e.which] = false;
  }

  let render = function(){

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
      camera.tiltUp();
    } else if(keyMap[40]) {
      camera.tiltDown();
    }

    if(keyMap[37]) {
      camera.turnLeft();
    } else if(keyMap[39]) {
      camera.turnRight();
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
    let grid = createGrid(gl, program);

    //Place grid
    let gridNode = rootNode.add("shape", grid);

    rootNode.apply();

    requestAnimationFrame(render);
  };

  render();

};

//========== UTILS ==========\\
function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1) + min);
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
