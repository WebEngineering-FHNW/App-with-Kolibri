

export { shapesByName, shapeNames };

/**
 * @typedef {
 * "charI" |
 * "charT" |
 * "char0" |
 * "charS" |
 * "charZ" |
 * "charL" |
 * "charF" |
 * "branch" |
 * "screwRight" |
 * "screwLeft"
 * } ShapeNameType
 */

/**
 * @typedef Position3dType
 * Can be used as an absolute position or as a displacement vector.
 * @property { Number } x - 0 or positive integral number, mutable
 * @property { Number } y - 0 or positive integral number, mutable
 * @property { Number } z - 0 or positive integral number, mutable
 */

/**
 * @typedef { [ Position3dType, Position3dType, Position3dType, Position3dType ] } ShapeType
 * A shape is an array of exactly four relative positions (vectors).
 * The shape of a tetromino defines _relative_ positions of its boxes in logical space units.
 * Many tetrominos can refer to the same shape, the current tetromino can reuse a shape and modify it
 * (because there is only ever _one_ current tetrominos and finished tetrominos no longer rely on their shape).
 */

/** @type { ShapeType } */
const charO = [
    {x: 0, y: 0, z: 0},
    {x: 0, y: 1, z: 0},
    {x: 1, y: 0, z: 0},
    {x: 1, y: 1, z: 0},
];

/** @type { ShapeType } */
const charI = [
    {x: 0, y: 1, z: 0},
    {x: 1, y: 1, z: 0},
    {x: 2, y: 1, z: 0},
    {x: 3, y: 1, z: 0},
];

/** @type { ShapeType } */
const charT = [
    {x: 0, y: 0, z: 0},
    {x: 1, y: 0, z: 0},
    {x: 2, y: 0, z: 0},
    {x: 1, y: 1, z: 0},
];

/** @type { ShapeType } */
const charS = [
    {x: 2, y: 0, z: 0},
    {x: 1, y: 0, z: 0},
    {x: 1, y: 1, z: 0},
    {x: 0, y: 1, z: 0},
];

/** @type { ShapeType } */
const charZ = [
    {x: 0, y: 0, z: 0},
    {x: 1, y: 0, z: 0},
    {x: 1, y: 1, z: 0},
    {x: 2, y: 1, z: 0},
];

/** @type { ShapeType } */
const charL = [
    {x: 0, y: 1, z: 0},
    {x: 0, y: 0, z: 0},
    {x: 1, y: 0, z: 0},
    {x: 2, y: 0, z: 0},
];

/** @type { ShapeType } */
const charF = [
    {x: 1, y: 0, z: 0},
    {x: 0, y: 0, z: 0},
    {x: 0, y: 1, z: 0},
    {x: 0, y: 2, z: 0},
];
/** @type { ShapeType } */
const branch = [
    {x: 0, y: 0, z: 0},
    {x: 1, y: 0, z: 0},
    {x: 0, y: 1, z: 0},
    {x: 0, y: 0, z: 1},
];
/** @type { ShapeType } */
const screwRight = [
    {x: 0, y: 0, z: 0},
    {x: 1, y: 0, z: 0},
    {x: 1, y: 1, z: 0},
    {x: 1, y: 1, z: 1},
];
/** @type { ShapeType } */
const screwLeft = [
    {x: 0, y: 1, z: 0},
    {x: 1, y: 1, z: 0},
    {x: 1, y: 0, z: 0},
    {x: 1, y: 0, z: 1},
];

const shapesByName = {
    charI, charT, charO, charS, charZ, charL, charF, branch, screwRight, screwLeft
};

/** @type { Array<String> } */
const shapeNames = Object.keys(shapesByName);
