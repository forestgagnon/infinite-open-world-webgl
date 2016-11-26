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

/*
  This creates the scenegraph. Calling this returns the root node.

  Note that the scenegraph has a stack and a current transformation.

  There are two kinds of nodes, shape and transformation.

  The transformation nodes take in a transformation matrix as data. They also have two functions:
    add(type data) - creates a new node of type "type", adds it to its child list and returns it.
    apply() - applies its associated transformation by multiplying it with the current matrix. Calls apply on all children

  The shape node takes in a function to be called to draw the associated shape. It has one function:
    apply() - calls its associated drawing method to draw the shape with the current transformation.

*/

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
        /* YOUR CODE HERE */
        /* This needs to multiply in the node's matrix with the current transform and then iterate over all of the children, calling their apply() functions.

        Make use of the stack to preserve the state of the current matrix.
        */

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
  let eye = vec3.fromValues(-HALF_GRID_SIZE - 1, 0.5, -HALF_GRID_SIZE - 1);
  let up = vec3.fromValues(0, 1, 0);
  let at = vec3.fromValues(0, 0.5, 0);
  const MOVEMENT_SPEED_FACTOR = 0.005;
  const STRAFE_FACTOR = MOVEMENT_SPEED_FACTOR * 0.75;
  const TURN_DEGREES = Math.PI / 75;
  return {
    apply: () => {
      let view = mat4.create();
      mat4.lookAt(view, eye, at, up);
      gl.uniformMatrix4fv(program.u_View, false, view);
    },

    moveForward: () => {
      let direction = vec3.create();
      vec3.subtract(direction, at, eye);
      movementVec = vec3.create();
      vec3.multiply(movementVec, direction, vec3.fromValues(MOVEMENT_SPEED_FACTOR, MOVEMENT_SPEED_FACTOR, MOVEMENT_SPEED_FACTOR));
      vec3.add(eye, eye, movementVec);
      vec3.add(at, at, movementVec);
    },
    moveBackward: () => {
      let direction = vec3.create();
      vec3.subtract(direction, eye, at);
      movementVec = vec3.create();
      vec3.multiply(movementVec, direction, vec3.fromValues(MOVEMENT_SPEED_FACTOR, MOVEMENT_SPEED_FACTOR, MOVEMENT_SPEED_FACTOR));
      vec3.add(eye, eye, movementVec);
      vec3.add(at, at, movementVec);
    },

    strafeRight: () => {
      let direction = vec3.create();
      vec3.subtract(direction, at, eye);
      let originalX = direction[0];
      direction[0] = -direction[2];
      direction[2] = originalX;
      movementVec = vec3.create();
      vec3.multiply(movementVec, direction, vec3.fromValues(STRAFE_FACTOR, 0, STRAFE_FACTOR));
      vec3.add(eye, eye, movementVec);
      vec3.add(at, at, movementVec);
    },

    strafeLeft: () => {
      let direction = vec3.create();
      vec3.subtract(direction, at, eye);
      let originalX = direction[0];
      direction[0] = direction[2];
      direction[2] = -originalX;
      movementVec = vec3.create();
      vec3.multiply(movementVec, direction, vec3.fromValues(STRAFE_FACTOR, 0, STRAFE_FACTOR));
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
      movementVec = vec3.fromValues(0, MOVEMENT_SPEED_FACTOR*CAMERA_PITCH_FACTOR, 0)
      vec3.add(at, at, movementVec);
    },
    tiltDown: () => {
      movementVec = vec3.fromValues(0, MOVEMENT_SPEED_FACTOR*CAMERA_PITCH_FACTOR, 0)
      vec3.subtract(at, at, movementVec);
    },

    moveUp: () => {
      movementVec = vec3.fromValues(0, 15*MOVEMENT_SPEED_FACTOR, 0)
      vec3.add(eye, eye, movementVec);
      vec3.add(at, at, movementVec);
    },
    moveDown: () => {
      movementVec = vec3.fromValues(0, 15*MOVEMENT_SPEED_FACTOR, 0)
      vec3.subtract(eye, eye, movementVec);
      vec3.subtract(at, at, movementVec);
    }
  }
};

//========== OBJECT PLACEMENT ==========\\
function generateObjectLocations() {
  let allLocations = {};
  for(x = -HALF_GRID_SIZE; x < HALF_GRID_SIZE; x+=2) {
    for(z = -HALF_GRID_SIZE; z < HALF_GRID_SIZE; z+=2) {
      allLocations[x.toString() + '--' + z.toString()] = {x: x, z: z};
    }
  }
  let cubeLocations = [];
  let pyramidLocations = [];
  let frustumLocations = [];
  let composedStackLocations = [];
  while(Object.keys(allLocations).length > 0) {
    let randomLocation = allLocations[Object.keys(allLocations)[getRandomInt(0, Object.keys(allLocations).length - 1)]];
    switch(getRandomInt(0, 4)) {
      case 0:
        cubeLocations.push({
          position: vec3.fromValues(randomLocation.x, 0, randomLocation.z),
          scale: vec3.fromValues(1, getRandom(0.1, 2), 1)
        });
        break;

      case 1:
        pyramidLocations.push({
          position: vec3.fromValues(randomLocation.x, 0, randomLocation.z),
          scale: vec3.fromValues(1, getRandom(0.1, 5), 1)
        });
        break;

      case 2:
        frustumLocations.push({
          position: vec3.fromValues(randomLocation.x, 0, randomLocation.z),
          scale: vec3.fromValues(1, getRandom(0.1, 1), 1)
        });
        break;

      case 3:
      let isAnimated = getRandomInt(0,1) === 1;
      let numSteps = getRandomInt(20, 50);
      let minStep = getRandomInt(10,  Math.floor(numSteps - numSteps/4));
        composedStackLocations.push({
          position: vec3.fromValues(randomLocation.x, 0, randomLocation.z),
          scale: vec3.fromValues(1, getRandom(0.1, 1), 1),
          animate: isAnimated,
          a_speed: getRandom(0.01, 0.2),
          a_currentStep: getRandomInt(minStep, numSteps),
          a_currentDirection: ['forward', 'backward'][getRandomInt(0, 1)],
          a_numSteps: numSteps,
          a_minStep: minStep

        });
        break;
    }

    delete allLocations[randomLocation.x + '--' + randomLocation.z];
  }

  return {
    cubeLocations: cubeLocations,
    pyramidLocations: pyramidLocations,
    frustumLocations: frustumLocations,
    composedStackLocations: composedStackLocations
  }
}

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

function createPyramid(gl, program) {
  let pyramid = {
    vertices : new Float32Array([
          0.0, 0.0,  0.0,
          0.0,  0.0,  1.0,
          1.0,  0.0,  0.0,
          1.0,  0.0,  1.0,

          0.5,  1.0,  0.5
    ]),
    colors: new Float32Array([
          DARK_RED.r, DARK_RED.g, DARK_RED.b,
          DARK_RED.r, DARK_RED.g, DARK_RED.b,
          DARK_RED.r, DARK_RED.g, DARK_RED.b,
          DARK_RED.r, DARK_RED.g, DARK_RED.b,

          BURNT_ORANGE.r, BURNT_ORANGE.g, BURNT_ORANGE.b
    ]),

    indices: new Uint8Array([
       0,1,2,  1,2,3, // bottom face
       0,1,4, //
       0,2,4, //
       1,3,4, //
       2,3,4, //

    ]),
    dimensions: 3,
    numPoints: 5
  };
  pyramid.vertexBuffer = gl.createBuffer();
  pyramid.colorBuffer = gl.createBuffer();
  pyramid.indexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, pyramid.vertexBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, pyramid.vertices, gl.STATIC_DRAW);

  gl.bindBuffer(gl.ARRAY_BUFFER, pyramid.colorBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, pyramid.colors, gl.STATIC_DRAW);

  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, pyramid.indexBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, pyramid.indices, gl.STATIC_DRAW);

  return () => {
    gl.bindBuffer(gl.ARRAY_BUFFER, pyramid.vertexBuffer);
    // associate it with our position attribute
    gl.vertexAttribPointer(program.a_Position, pyramid.dimensions, gl.FLOAT, false, 0,0);

    gl.bindBuffer(gl.ARRAY_BUFFER, pyramid.colorBuffer);
    // associate it with our position attribute
    gl.vertexAttribPointer(program.a_Color, pyramid.dimensions, gl.FLOAT, false, 0,0);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, pyramid.indexBuffer);
    gl.drawElements(gl.TRIANGLES, pyramid.indices.length, gl.UNSIGNED_BYTE, 0);
  };
}

function createFrustum(gl, program) {
  let frustum = {
    vertices : new Float32Array([
          0.75,  1.0,  0.75,
          0.25,  1.0,  0.75,
          0.0,  0.0,  1.0,
          1.0, 0.0,  1.0,

          0.75,  1.0,  0.25,
          0.25,  1.0,  0.25,
          0.0,  0.0,  0.0,
          1.0,  0.0,  0.0
    ]),
    colors: new Float32Array([
      SKY_BLUE.r, SKY_BLUE.g, SKY_BLUE.b,
      SKY_BLUE.r, SKY_BLUE.g, SKY_BLUE.b,
      DARK_BLUE.r, DARK_BLUE.g, DARK_BLUE.b,
      DARK_BLUE.r, DARK_BLUE.g, DARK_BLUE.b,

      SKY_BLUE.r, SKY_BLUE.g, SKY_BLUE.b,
      SKY_BLUE.r, SKY_BLUE.g, SKY_BLUE.b,
      DARK_BLUE.r, DARK_BLUE.g, DARK_BLUE.b,
      DARK_BLUE.r, DARK_BLUE.g, DARK_BLUE.b

    ]),

    indices: new Uint8Array([
       0,1,2,  0,2,3, // front face
       0,7,4,  0,3,7,   // right face
       1,5,6,  1,6,2, // left face
       0,4,5,  0,5,1, // top face
       3,2,6,  3,6,7, // bottom face
       4,7,6,  4,6,5 // back facew

    ]),
    dimensions: 3,
    numPoints: 8
  };
  frustum.vertexBuffer = gl.createBuffer();
  frustum.colorBuffer = gl.createBuffer();
  frustum.indexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, frustum.vertexBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, frustum.vertices, gl.STATIC_DRAW);

  gl.bindBuffer(gl.ARRAY_BUFFER, frustum.colorBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, frustum.colors, gl.STATIC_DRAW);

  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, frustum.indexBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, frustum.indices, gl.STATIC_DRAW);

  return () => {
    gl.bindBuffer(gl.ARRAY_BUFFER, frustum.vertexBuffer);
    // associate it with our position attribute
    gl.vertexAttribPointer(program.a_Position, frustum.dimensions, gl.FLOAT, false, 0,0);

    gl.bindBuffer(gl.ARRAY_BUFFER, frustum.colorBuffer);
    // associate it with our position attribute
    gl.vertexAttribPointer(program.a_Color, frustum.dimensions, gl.FLOAT, false, 0,0);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, frustum.indexBuffer);
    gl.drawElements(gl.TRIANGLES, frustum.indices.length, gl.UNSIGNED_BYTE, 0);
  };
}

//========== MAIN ONLOAD FUNCTION ==========\\
window.onload = function(){

  let canvas = document.getElementById('canvas');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight - document.getElementById('description').getBoundingClientRect().height - 20;
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


  /*
  The conventional key handler detects when a key is held down for repeat actions, but it has a pause before it detects the repeat and it is flaky with two keys held down simultaneously. This avoids this by maintaining a mapping of the keys that are currently pressed.
  */
  var keyMap = {};

  window.onkeydown = function(e){
      keyMap[e.which] = true;
  }

  window.onkeyup = function(e){
       keyMap[e.which] = false;
  }

  objectLocations = generateObjectLocations();

  let animationDirection = 'forward';
  let currentStep = 0;

  // the render function
  let render = function(){

    // check which keys that we care about are down
    if (keyMap['W'.charCodeAt(0)]){
      camera.moveForward();
    }else if (keyMap['S'.charCodeAt(0)]){
      camera.moveBackward();
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
    let cube = createCube(gl, program);
    let pyramid = createPyramid(gl, program);
    let frustum = createFrustum(gl, program);

    //Place grid
    let gridNode = rootNode.add("shape", grid);

    //Place Cubes
    objectLocations.cubeLocations.forEach((location) => {
      let transform = mat4.create();
      mat4.translate(transform, mat4.create(), location.position);
      mat4.scale(transform, transform, location.scale);
      let transformed = rootNode.add("transformation", transform);
      transformed.add("shape", cube);
    });

    //Place Pyramids
    objectLocations.pyramidLocations.forEach((location) => {
      let transform = mat4.create();
      mat4.translate(transform, mat4.create(), location.position);
      mat4.scale(transform, transform, location.scale);
      let transformed = rootNode.add("transformation", transform);
      transformed.add("shape", pyramid);
    });

    //Place Frustums
    objectLocations.frustumLocations.forEach((location) => {
      let transform = mat4.create();
      mat4.translate(transform, mat4.create(), location.position);
      mat4.scale(transform, transform, location.scale);
      let transformed = rootNode.add("transformation", transform);
      transformed.add("shape", frustum);
    });

    //place Composed Stacks
    objectLocations.composedStackLocations.forEach((location) => {
      let animationScaleVector;
      if (location.animate) {
        animationScaleVector = vec3.fromValues(1, easeInOutQuad(location.a_currentStep, 0, location.a_speed * location.a_numSteps, location.a_numSteps), 1);
        if (location.a_currentDirection === 'forward' && location.a_currentStep === location.a_numSteps) {
          location.a_currentDirection = 'backward';
        }
        else if (location.a_currentDirection === 'backward' && location.a_currentStep === location.a_minStep) {
          location.a_currentDirection = 'forward';
        }
        location.a_currentDirection === 'forward' ? location.a_currentStep++ : location.a_currentStep--;
      }

      let translate = mat4.create();
      mat4.translate(translate, mat4.create(), location.position);
      let translated = rootNode.add("transformation", translate);

      let scale = mat4.create();
      mat4.scale(scale, mat4.create(), location.scale);
      let scaled = translated.add("transformation", scale);

      scaled.add('shape', frustum);

      let upperScaleFactor = vec3.create();
      vec3.mul(upperScaleFactor, vec3.fromValues(0.25, 0.5, 0.25), location.scale);
      let upperTransform = mat4.create();
      mat4.translate(upperTransform, mat4.create(), vec3.fromValues(upperScaleFactor[0] + upperScaleFactor[0]/2, location.scale[1], upperScaleFactor[2] + upperScaleFactor[2]/2));
      mat4.scale(upperTransform, upperTransform, upperScaleFactor);
      if (location.animate) {
        mat4.scale(upperTransform, upperTransform, animationScaleVector);
      }
      let upperTransformed = translated.add("transformation", upperTransform);
      upperTransformed.add('shape', cube);

      let topTransform = mat4.create();
      mat4.translate(topTransform, mat4.create(), vec3.fromValues(0, 1, 0));
      let topTransformed = upperTransformed.add('transformation', topTransform);
      topTransformed.add('shape', pyramid);
    });

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
