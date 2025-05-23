/**
 * @module tetris/playerModel
 */

import {MISSING_FOREIGN_KEY} from "../../extension/relationalModelType.js";

export { Player, NO_PLAYER}

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
