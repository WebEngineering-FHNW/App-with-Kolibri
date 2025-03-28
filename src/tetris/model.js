/**
 * @module tetris/model
 */

import "../kolibri/util/array.js"
import {Observable} from "../kolibri/observable.js";

export { makeRandomTetromino, Tetronimo, zeroPosition, Box };

/**
 * @typedef Position3dType
 * Can be used as an absolute position or as a displacement vector.
 * @property { Number } x - 0 or positive integral number, mutable
 * @property { Number } y - 0 or positive integral number, mutable
 * @property { Number } z - 0 or positive integral number, mutable
 */

/**
 * @type { Position3dType }
 */
const zeroPosition = { x:0, y:0, z:0 };

/**
 * @typedef BoxType
 * @property { IObservable<Position3dType> } position - absolute position in the 3D game space in logical space units
 * @property { String }                      boxClass - usually the shape name for coloring, not supposed to change
 */

/**
 * Box constructor starting a zero position.
 * @param  { String } boxClass
 * @return { BoxType }
 * @constructor
 */
const Box = boxClass => {
    const position = Observable(zeroPosition);
    return { position, boxClass };
};

/**
 * @typedef TetronimoType
 * @property { Number }                      id       - must be unique
 * @property { IObservable<Position3dType> } position - anchoring position in the 3D game space in logical space units
 * @property { String }                      shapeName
 * @property { IObservable<ShapeType> }      shape    - relative logical units for the boxes that change with alignment
 * @property { [ BoxType, BoxType, BoxType, BoxType ] } boxes - absolute positions in logical space units
 * that are updated whenever the shape or the position changes. Box positions are independently observable.
 */

/**
 * Constructor for a {@link TetronimoType}.
 * @param { Number } shapeIndex - index into shapes array
 * @param { Number } tetroId
 * @return { TetronimoType }
 * @constructor
 */
const Tetronimo = (shapeIndex, tetroId) => {
    if (shapeIndex < 0 || shapeIndex >= shapes.length) throw Error("no such shape with index "+shapeIndex);
    const id        = tetroId;
    const position  = Observable( { x: 0, y: 0, z: 12 } );
    const shapeName = shapeNames[shapeIndex];
    const shape     = Observable(shapes[shapeIndex]);
    const boxes     = 4..times(_ => Box(shapeName));
    const updateBoxPositions = () => {
      boxes.forEach( (box, boxIndex) => {
          const pos    = position.getValue();
          const offset = shape   .getValue()[boxIndex];
          box.position.setValue( {
             x: pos.x + offset.x ,
             y: pos.y + offset.y ,
             z: pos.z + offset.z ,
          } );
      });
    };
    position.onChange(updateBoxPositions);
    shape   .onChange(updateBoxPositions);
    return { id, position, shapeName, shape, boxes };
};

let runningTetroNum = 0;
/**
 * @return { TetronimoType }
 */
const makeRandomTetromino = () => Tetronimo(Math.floor(Math.random() * shapes.length), runningTetroNum++);

/**
 * @typedef { [ Position3dType, Position3dType, Position3dType, Position3dType ] } ShapeType
 * A shape is an array of exactly four relative positions (vectors).
 * The shape of a tetronimo defines _relative_ positions of its boxes in logical space units.
 * Many tetronimos can refer to the same shape, the current tetronimo can reuse a shape and modify it
 * (because there is only ever _one_ current tetronimos and finished tetronimos no longer rely on their shape).
 */

/** @type { ShapeType } */
const shape0 = [
    {x: 0, y: 0, z: 0},
    {x: 0, y: 1, z: 0},
    {x: 1, y: 0, z: 0},
    {x: 1, y: 1, z: 0},
];

/** @type { ShapeType } */
const shapeI = [
    {x: 0, y: 1, z: 0},
    {x: 1, y: 1, z: 0},
    {x: 2, y: 1, z: 0},
    {x: 3, y: 1, z: 0},
];

/** @type { ShapeType } */
const shapeT = [
    {x: 0, y: 0, z: 0},
    {x: 1, y: 0, z: 0},
    {x: 2, y: 0, z: 0},
    {x: 1, y: 1, z: 0},
];

/** @type { ShapeType } */
const shapeS = [
    {x: 2, y: 0, z: 0},
    {x: 1, y: 0, z: 0},
    {x: 1, y: 1, z: 0},
    {x: 0, y: 1, z: 0},
];

/** @type { ShapeType } */
const shapeZ = [
    {x: 0, y: 0, z: 0},
    {x: 1, y: 0, z: 0},
    {x: 1, y: 1, z: 0},
    {x: 2, y: 1, z: 0},
];

/** @type { ShapeType } */
const shapeL = [
    {x: 0, y: 1, z: 0},
    {x: 0, y: 0, z: 0},
    {x: 1, y: 0, z: 0},
    {x: 2, y: 0, z: 0},
];

/** @type { ShapeType } */
const shapeF = [
    {x: 1, y: 0, z: 0},
    {x: 0, y: 0, z: 0},
    {x: 0, y: 1, z: 0},
    {x: 0, y: 2, z: 0},
];

/** @type { Array<ShapeType> } */
const shapes     = [  shapeI,   shapeT,   shape0,   shapeS,   shapeZ,   shapeL,   shapeF ];

/** @type { Array<String> } */
const shapeNames = [ "shapeI", "shapeT", "shape0", "shapeS", "shapeZ", "shapeL", "shapeF"];
