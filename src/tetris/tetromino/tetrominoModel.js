/**
 * @module tetris/relationalModel
 * The tetris game has a relational presentation model used for both,
 * the local game and the collaborative game.
 */

import {shapesByName}        from "../shape/shapeModel.js";
import {MISSING_FOREIGN_KEY} from "../../extension/relationalModelType.js";

export { Tetromino, NO_TETROMINO }

/**
 *
 * Remotely stored with a key like "TETROMINO-<tetroId>". {@link TETROMINO_PREFIX}
 *
 * @typedef TetrominoModelType
 * @property { ForeignKeyType } id
 * @property { ShapeNameType } shapeName - will be used for styling
 * @property { ShapeType } shape - capture the relative rotation shape
 * @property { Number } xPos - x position in logical space units
 * @property { Number } yPos - y position in logical space units
 * @property { Number } zPos - z position in logical space units
 */

/**
 * @constructor
 * @param { TetrominoModelType } paramObj - Parameter Object Pattern
 * @return {TetrominoModelType}
 */
const Tetromino = paramObj => paramObj; // for the type safety

/**
 * Null-Object Pattern
 * @type { TetrominoModelType }
 */
const NO_TETROMINO = Tetromino({id:MISSING_FOREIGN_KEY, shapeName:"char0", shape:shapesByName.charO,
                               xPos:0, yPos:0, zPos:0});

/**
 *
 * Remotely stored with a unique key see {@link TETROMINO_CURRENT_ID}
 *
 * @typedef CurrentTetronimoModelType
 * @property { ForeignKeyType } tetroId - the id of tetromino that is considered the "current" one, foreign key
 */
