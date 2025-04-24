/**
 * @module tetris/model
 * The data structure and types for a Tetronimo, constructors, and its constituent parts.
 */

import "../kolibri/util/array.js"
import {Observable} from "../kolibri/observable.js";
import {normalize}  from "./tetronimoController.js";

export { makeRandomTetromino, Tetronimo, zeroPosition };

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
 * @typedef { IObservable<Position3dType> } BoxType
 */

/**
 * @typedef TetronimoType
 * @property { Number }                      id          - must be unique
 * @property { () => Position3dType }        getPosition - anchoring position in the 3D game space in logical space units
 * @property { (Position3dType) => void }    setPosition - anchoring position in the 3D game space in logical space units
 * @property { String }                      shapeName   - will be used for the css styling
 * @property { () => ShapeType }             getShape    - relative logical units for the boxes that change with alignment
 * @property { (ShapeType) => void }         setShape    - relative logical units for the boxes that change with alignment
 * @property { [ BoxType, BoxType, BoxType, BoxType ] } boxes - absolute positions in logical space units
 * that are updated whenever the shape or the position changes. Box positions are independently observable.
 * @property { () => void }                  unlinkBoxes - shape or position changes have nor more effect on the boxes,
 * they move independently.
 */

/**
 * Constructor for a {@link TetronimoType}.
 * @param { Number } shapeIndex - index into 'shapes' array
 * @param { Number } tetroId
 * @return { TetronimoType }
 * @constructor
 */
const Tetronimo = (shapeIndex, tetroId) => {
    if (shapeIndex < 0 || shapeIndex >= shapes.length) throw Error("no such shape with index "+shapeIndex);

    let boxesUnlinked = false;
    let position      = { x: 0, y: 0, z: 12 } ;
    let shape         = normalize(shapes[shapeIndex]);

    const id          = tetroId;
    const shapeName   = shapeNames[shapeIndex];
    const boxes       = 4..times(_ => Observable(zeroPosition)); // the box constructor // todo: Observable

    const unlinkBoxes = () => boxesUnlinked = true;

    const updateBoxPositions = () => {
      if (boxesUnlinked) { console.error("with unlinked boxes, position or shape should no longer change") ;return;}
      boxes.forEach( (box, boxIndex) => {
          const pos    = position;
          const offset = shape[boxIndex];
          box.setValue( {
             x: pos.x + offset.x ,
             y: pos.y + offset.y ,
             z: pos.z + offset.z ,
          } );
      });
    };
    updateBoxPositions();

    const getPosition = () => position;
    const setPosition = newPosition => {
        position = newPosition;
        updateBoxPositions();
    };

    const getShape = () => shape;
    const setShape = newShape => {
        shape = normalize(newShape);
        updateBoxPositions();
    };

    return { id, shapeName, setPosition, getPosition, setShape, getShape, boxes, unlinkBoxes };
};

/** @private local singleton state **/
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
/** @type { ShapeType } */
const shape3d = [
    {x: 0, y: 0, z: 0},
    {x: 1, y: 0, z: 0},
    {x: 0, y: 1, z: 0},
    {x: 0, y: 0, z: 1},
];
/** @type { ShapeType } */
const shapeQR = [
    {x: 0, y: 0, z: 0},
    {x: 1, y: 0, z: 0},
    {x: 1, y: 1, z: 0},
    {x: 1, y: 1, z: 1},
];
/** @type { ShapeType } */
const shapeQL = [
    {x: 0, y: 1, z: 0},
    {x: 1, y: 1, z: 0},
    {x: 1, y: 0, z: 0},
    {x: 1, y: 0, z: 1},
];

/** @type { Array<ShapeType> } */
const shapes     = [  shapeI,   shapeT,   shape0,   shapeS,   shapeZ,   shapeL,   shapeF,   shape3d,   shapeQR,   shapeQL ];

/** @type { Array<String> } */
const shapeNames = [ "shapeI", "shapeT", "shape0", "shapeS", "shapeZ", "shapeL", "shapeF", "shape3d", "shapeQR", "shapeQL"];
