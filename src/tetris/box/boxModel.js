/**
 * @module tetris/box/boxModel
 */

import {MISSING_FOREIGN_KEY} from "../../extension/relationalModelType.js";

export { Box, NO_BOX}

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
