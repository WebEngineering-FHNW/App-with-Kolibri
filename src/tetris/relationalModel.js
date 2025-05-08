/**
 * @module tetris/relationalModel
 * The tetris game has a relational presentation model used for both,
 * the local game and the collaborative game.
 */

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
 * @property { ShapeNameType } shapeName
 * @property { ShapeType } shape - capture the relative rotation shape
 * @property { Number } xPos - x position in logical space units
 * @property { Number } yPos - y position in logical space units
 * @property { Number } zPos - z position in logical space units
 */

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
 * @property { ForeignKeyType } tetroId - the id of the tetromino this box belongs to, foreign key,
 *                                        is {@link MISSING_FOREIGN_KEY} for "unlinked" boxes
 * @property { Number } xPos - final x position in logical space units
 * @property { Number } yPos - final y position in logical space units
 * @property { Number } zPos - final z position in logical space units
 */

/**
 *
 * Remotely stored with a unique key see {@link TETROMINO_CURRENT_ID}
 *
 * @typedef CurrentTetronimoModelType
 * @property { ForeignKeyType } tetroId - the id of tetromino that is considered the "current" one, foreign key
 */

/**
 * @typedef { String } PlayerNameType
 * Remotely stored with a key like "PLAYER-<playerId>". {@link PLAYER_PREFIX}
 */

/**
 * @typedef { ForeignKeyType } ActivePlayerIdType
 * Remotely stored with a unique key see {@link PLAYER_ACTIVE_ID}
 * The id of the player that is considered the "active" one, foreign key
 */



// todo: it might need more types for game state (running, ended, etc. plus score, etc.)
// todo: it might need "upcoming" tetromino

