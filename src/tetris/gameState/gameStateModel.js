/**
 * @module tetris/gameStateModel
 * The tetris game has a relational presentation model used for both,
 * the local game and the collaborative game.
 */

import {MISSING_FOREIGN_KEY} from "../../extension/relationalModelType.js";

export { GameState, NO_GAME_STATE }


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
// todo: it might need "upcoming" tetromino shape name

