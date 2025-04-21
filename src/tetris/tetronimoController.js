/**
 * @module tetris/tetronimoController
 * Provides (so far always pure) functions to manage the position and alignment of tetronimos
 * as well as how they move.
 */

export { normalize, intersects, disallowed, toppleRoll, topplePitch, rotateYaw,
         moveLeft , moveRight, moveBack, moveForw, moveDown
};

/**
 * Make sure that the relative positions sit in the lowest (z), leftmost (x), backmost (y) non-negative position.
 * @pure
 * @param { ShapeType } shape - will not be modified
 * @return { ShapeType } a new shape object
 */
const normalize = shape => {
    const minX = Math.min(...shape.map(box => box.x));
    const minY = Math.min(...shape.map(box => box.y));
    const minZ = Math.min(...shape.map(box => box.z));
    return shape.map( box => ({x: box.x - minX, y: box.y - minY, z: box.z - minZ}));
};

/**
 * Tells whether the tetronimo boxes intersect with any of the spaceBoxes.
 * @pure
 * @param { TetronimoType  } tetronimo
 * @param { Array<BoxType> } spaceBoxes
 * @return { Boolean }
 */
const intersects = (tetronimo, spaceBoxes) =>
    tetronimo.boxes.some( boxPos =>
        boxPos.getValue().z < 0 ||
        spaceBoxes.some( spaceBox =>
           spaceBox.getValue().x === boxPos.getValue().x &&
           spaceBox.getValue().y === boxPos.getValue().y &&
           spaceBox.getValue().z === boxPos.getValue().z ));

/**
 * Tells whether this tetronimo configuration should be forbidden (outside bounds).
 * @pure
 * @param { TetronimoType  } tetronimo
 * @return { Boolean }
 */
const disallowed = tetronimo =>
    tetronimo.boxes.some( box =>{
        const pos = box.getValue();
        if (pos.x < 0 || pos.x > 6) return true;
        if (pos.y < 0 || pos.y > 6) return true;
        return false;
    });

/** @private implementation is just swapping the coordinates **/
const swapXZ  = shape => shape.map( box => ({x:  -box.z, y: box.y, z:  box.x}));

/** @private implementation is just swapping the coordinates **/
const swapYZ  = shape => shape.map( box => ({x:   box.x, y: box.z, z: -box.y}));

/** @private implementation is just swapping the coordinates **/
const swapXY  = shape => shape.map( box => ({x:  box.y, y: -box.x, z: box.z}));

/**
 * @typedef { (ShapeType) => ShapeType } NewShapeType
 * @pure returns a new shape object
 */

/**
 * Make a new shape that reflects the effect of rolling to the left.
 * @pure returns a new shape
 * @type { NewShapeType }
 */
const toppleRoll  = swapXZ;
/**
 * Make new shape that reflects the effect of pitching upwards (salto back).
 * @pure returns a new shape
 * @type { NewShapeType }
 */
const topplePitch = swapYZ;

/**
 * Make a new shape that reflects the effect of rotating counter-clockwise around the z-axis.
 * You can also interpret this as looking at the shape with your head tilted to the left.
 * @pure returns a new shape
 * @type { NewShapeType }
 */
const rotateYaw = swapXY;

/**
 * @typedef { (Position3dType) => Position3dType } NewPositionType
 * @pure returns a new position object
 */

/** @type { NewPositionType } */ const moveLeft  = old => ({x: old.x - 1, y: old.y,     z: old.z     });
/** @type { NewPositionType } */ const moveRight = old => ({x: old.x + 1, y: old.y,     z: old.z     });
/** @type { NewPositionType } */ const moveBack  = old => ({x: old.x,     y: old.y - 1, z: old.z     });
/** @type { NewPositionType } */ const moveForw  = old => ({x: old.x,     y: old.y + 1, z: old.z     });
/** @type { NewPositionType } */ const moveDown  = old => ({x: old.x,     y: old.y,     z: old.z - 1 });
