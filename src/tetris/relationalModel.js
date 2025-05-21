/**
 * @module tetris/relationalModel
 * The tetris game has a relational presentation model used for both,
 * the local game and the collaborative game.
 */

import {shapesByName}        from "./shape.js";
import {MISSING_FOREIGN_KEY} from "../extension/relationalModelType.js";

export { Player, NO_PLAYER, Tetromino, NO_TETROMINO, Box, NO_BOX, GameState, NO_GAME_STATE }

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
 * Boxes start their life in the "current" (or upcoming) tetromino where their final x,y,z position
 * is calculated as the tetro shape plus the tetro position. After detaching from the
 * "current" tetromino (when a new one becomes current), they move independently in the game space
 * (that is: only their offsets change and no longer the tetro position or shape).
 * After the last box of a tetro is removed, the tetro is removed as well.
 *
 * Remotely stored with a key like "BOX-<boxId>". {@link BOX_PREFIX}
 *
 * @typedef BoxModelType
 * @property { ForeignKeyType } id
 * @property { ForeignKeyType } tetroId - the id of the tetromino this box belongs to, foreign key,
 *                                        is {@link MISSING_FOREIGN_KEY} for "unlinked" boxes
 * @property { Number } xPos - final x position in logical space units
 * @property { Number } yPos - final y position in logical space units
 * @property { Number } zPos - final z position in logical space units
 */

/**
 * @constructor
 * @param { BoxModelType } paramObj - Parameter Object Pattern
 * @return {BoxModelType}
 */
const Box = paramObj => paramObj; // for the type safety

/**
 * Null-Object Pattern
 * @type { BoxModelType }
 */
const NO_BOX = Box({id:MISSING_FOREIGN_KEY, tetroId: MISSING_FOREIGN_KEY, xPos:0, yPos:0, zPos:0});


/**
 *
 * Remotely stored with a unique key see {@link TETROMINO_CURRENT_ID}
 *
 * @typedef CurrentTetronimoModelType
 * @property { ForeignKeyType } tetroId - the id of tetromino that is considered the "current" one, foreign key
 */

/**
 * @typedef PlayerType
 * @property { ForeignKeyType } id
 * @property { String }  name
 * Remotely stored with a key like "PLAYER-<playerId>". {@link PLAYER_PREFIX}
 */

/**
 * @param { ForeignKeyType } id
 * @param { String } name
 * @constructor
 * @return {PlayerType}
 */
const Player = (id, name) => ({id, name}); // for the type safety

/**
 * Null-Object Pattern
 * @type { PlayerType }
 */
const NO_PLAYER = Player(MISSING_FOREIGN_KEY, "no name");

/**
 * @typedef { ForeignKeyType } ActivePlayerIdType
 * Remotely stored with a unique key see {@link PLAYER_ACTIVE_ID}
 * The id of the player that is considered the "active" one, foreign key
 */


/**
 * Game state. The active user has to care for updating this.
 * @typedef GameStateModelType
 * @property { ForeignKeyType } id
 * @property { Boolean } fallingDown - Whether the current tetronimo is supposed to be falling.
 * @property { Number  } score
 */

/**
 * @param { ForeignKeyType } id
 * @param { Boolean } fallingDown
 * @param { Number } score
 * @constructor
 * @return {GameStateModelType}
 */
const GameState = (id, fallingDown, score) => ({id, fallingDown, score}); // for the type safety

/**
 * Null-Object Pattern
 * @type { GameStateModelType }
 */
const NO_GAME_STATE = GameState(MISSING_FOREIGN_KEY, false, 0);


// todo: it might need more types for game state (running, ended, etc. plus score, etc.)
// todo: it might need "upcoming" tetromino

