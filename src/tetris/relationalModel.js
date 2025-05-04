/**
 * @module tetris/relationalModel
 * The tetris game has a relational presentation model that is used for both,
 * the local game and the collaborative game.
 */

/**
 * @typedef IdPropertyType
 * @type { String } -- must be unique throughout one game and across all players
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
 * "3dBranch" |
 * "3dScrewRight" |
 * "3dScrewLeft"
 * } ShapeNameType
 */

/**
 * @typedef TetronimoModelType
 * @property { IdPropertyType } id
 * @property { ShapeNameType } shapeName
 * @property { Number } xRot - number of x rotations (0..3) of the shape
 * @property { Number } yRot - number of y rotations (0..3) of the shape
 * @property { Number } zRot - number of z rotations (0..3) of the shape
 * @property { Number } xPos - x position in logical space units
 * @property { Number } yPos - y position in logical space units
 * @property { Number } zPos - z position in logical space units
 */

/**
 * Boxes start their life in the "current" (or upcoming) tetronimo where their final x,y,z position
 * is calculated as the tetro shape plus the tetro position. After detaching from the
 * "current" tetronimo (when a new one becomes current), they move independently in the game space.
 * @typedef BoxModelType
 * @property { IdPropertyType } id - tetroId plus dash plus the index of this box in the tetro's shape (0..3), e.g. "tetroxxx-0"
 * @property { IdPropertyType } tetroId - the id of the tetronimo this box belongs to
 * @property { Number } xPos - final x position in logical space units
 * @property { Number } yPos - final y position in logical space units
 * @property { Number } zPos - final z position in logical space units
 */

/**
 * @typedef CurrentTetronimoModelType
 * @property { IdPropertyType } id      - constant value "currentTetronimo" (must be unique per game)
 * @property { IdPropertyType } tetroId - the id of tetronimo that is considered the "current" one
 */

/**
 * @typedef PlayerModelType
 * @property { IdPropertyType } id   - the id of the player, considered to be unique and stable, e.g. "PLAYER-4711"
 * @property { String }         name - might change with user input as the player updates his name
 */

/**
 * @typedef ActivePlayerModelType
 * @property { IdPropertyType } id       - constant value "PLAYER_ACTIVE" (must be unique per game)
 * @property { IdPropertyType } playerId - the id of the player that is considered the "active" one
 */

// todo: provide the respective implementations, named values, remote values, etc.

// todo: it might need more types for game state (running, ended, etc. plus score, etc.)
// todo: it might need "upcoming" tetronimo

