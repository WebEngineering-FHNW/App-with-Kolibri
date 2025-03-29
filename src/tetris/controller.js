/**
 * @module controller
 */

export { normalize, swapXZ, swapYZ, intersects, disallowed };

/**
 * Make sure that the relative positions sit in the lowest (z), leftmost (x), farthest (y) non-negative position.
 * @param { ShapeType } shape - will not be modified
 * @return { ShapeType } a new shape object
 */
const normalize = shape => {
    const minX = Math.min(...shape.map(box => box.x));
    const minY = Math.min(...shape.map(box => box.y));
    const minZ = Math.min(...shape.map(box => box.z));
    return shape.map( box => ({x: box.x - minX, y: box.y - minY, z: box.z - minZ}));
};

const swapXZ  = shape => shape.map( box => ({x:  -box.z, y: box.y, z:  box.x}));
const swapYZ  = shape => shape.map( box => ({x:   box.x, y: box.z, z: -box.y}));

/**
 * Tells whether the tetronimo intersects with any of the spaceBoxes.
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
 * Tells whether this tetronimo configuration is not a correct move (outside bounds).
 * @param { TetronimoType  } tetronimo
 * @return { Boolean }
 */
const disallowed = tetronimo =>
    tetronimo.boxes.some( box =>{
        const pos = box.getValue();
        if (pos.x < 0 || pos.x > 6) return true;// todo put board size in config
        // noinspection RedundantIfStatementJS
        if (pos.y < 0 || pos.y > 6) return true;
        return false;
    });

