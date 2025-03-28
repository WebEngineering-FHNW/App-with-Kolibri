/**
 * @module controller
 */

export { normalize, swapXZ, swapYZ };

const normalize = shape => {
    const minX = Math.min(...shape.map(box => box.x));
    const minY = Math.min(...shape.map(box => box.y));
    const minZ = Math.min(...shape.map(box => box.z));
    return shape.map( box => ({x: box.x - minX, y: box.y - minY, z: box.z - minZ}));
};

const swapXZ  = shape => shape.map( box => ({x:  -box.z, y: box.y, z:  box.x}));
const swapYZ  = shape => shape.map( box => ({x:   box.x, y: box.z, z: -box.y}));
