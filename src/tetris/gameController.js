/**
 * @module tetris/gameContoller
 * Manages game-wide state, esp. the {@link TetronimoType currentTetronimo} and the {@link spaceBoxes}.
 * Here is where the game rules are enforced:
 * - what defines a collision
 * - what happens on collision
 * - what moves are allowed
 * - by which rules boxes drop down
 * The effects are communicated by updating box position and publishing
 * newly available tetrominos.
 */

import {disallowed, intersects, moveDown, normalize} from "./tetronimoController.js";
import {makeRandomTetromino, Tetronimo}              from "./model.js";
import {Walk}       from "../kolibri/sequence/constructors/range/range.js";
import {Scheduler}  from "../kolibri/dataflow/dataflow.js";
import {Observable} from "../kolibri/observable.js";

export {
    startGame, onNewCurrentTetronimo, turnShape, movePosition, // for general use outside
    checkAndHandleFullLevel                                     // only for the unit-testing
};

/** @type { Array<BoxType> }
 * Contains all the boxes that live in our 3D space after they have been unlinked from their tetronimo
 * such that they can fall and disappear independently.
 */
const spaceBoxes = [];

/** @type { IObservable<TetronimoType> }
 * The current tetromino is the one that the player can control with the arrow keys and that falls down
 * at a given rate (1s). When it collides, a new one gets created and becomes the current tetronimo.
 * Observable to keep the projected views separate from the controller.
 */
const currentTetrominoObs = Observable(makeRandomTetromino());

/**
 * Allow listeners (esp. the view) to react on a newly available current tetronimo.
 * @type { (cb:ValueChangeCallback<TetronimoType>) => void }
 */
const onNewCurrentTetronimo = currentTetrominoObs.onChange; // do not expose setter

/**
 * The game ends with collision at the top.
 * @pure
 * @type { (currentTetronimo:TetronimoType, spaceBoxes:Array<BoxType>) => Boolean }
 */
const isEndOfGame = (currentTetromino, spaceBoxes) =>
    currentTetromino.getPosition().z === 12
    && intersects(currentTetromino, spaceBoxes) ;

/**
 * @type { (currentTetronimo:TetronimoType, spaceBoxes:Array<BoxType>) => void }
 * @impure side effects pretty much everything, directly or indirectly
 */
const handleCollision = (currentTetromino, spaceBoxes) => {
    currentTetromino.unlinkBoxes();                 // boxes will still keep their data binding
    spaceBoxes.push(...(currentTetromino.boxes));   // put the current tetro boxes in the space
    checkAndHandleFullLevel(spaceBoxes);
    currentTetrominoObs.setValue(makeRandomTetromino());
};

/**
 * @impure side effects the spaceBoxes and might call listeners that change the DOM if full level is detected
 * @param {Array<BoxType>} spaceBoxes
 */
const checkAndHandleFullLevel = spaceBoxes => {

    const isFull = level => spaceBoxes.filter( box => box.getValue().z === level).length === 7 * 7;
    const level = [...Walk(12)].findIndex(isFull);
    if (level < 0 ) { return; }

    // remove all boxes that are on this level from the spaceBoxes and trigger the view update
    const toRemove = spaceBoxes.filter(box => box.getValue().z === level); // remove duplication
    toRemove.forEach( box => {
        spaceBoxes.removeItem(box);
        box.setValue( {x:-1,y:-1, z:-1} ); // will trigger listeners (e.g. the view) to self-remove
    });

    // move the remaining higher boxes one level down
    spaceBoxes.forEach( box => {
        const pos = box.getValue();
        if (pos.z > level) {
            box.setValue( moveDown(pos) );
        }
    });
    // there might be more full levels
    checkAndHandleFullLevel(spaceBoxes);
};

/**
 * When a tetronimo gets a new shape as the result of user input, we have to check the possible results of that move
 * and adapt according to the game rules.
 * @impure everything might change.
 * @param { TetronimoType } tetronimo  - target
 * @param { ShapeType }     newShape   - that new shape that might be applied to the target
 * @param { Array<BoxType>} spaceBoxes - environment
 */
const turnShapeImpl = (tetronimo, newShape, spaceBoxes) => {
    newShape              = normalize(newShape);
    const shadowTetromino = Tetronimo(0, -1);
    shadowTetromino.setShape(newShape);
    shadowTetromino.setPosition(tetronimo.getPosition());
    if (disallowed(shadowTetromino)) {
        return;
    }
    if (intersects(shadowTetromino, spaceBoxes)) {
        handleCollision(tetronimo, spaceBoxes);
    } else {
        tetronimo.setShape(newShape);
    }
};
/**
 * When a tetronimo gets a new position as the result of user input or time,
 * we have to check the possible results of that move
 * and adapt according to the game rules.
 * @impure everything might change.
 * @param { TetronimoType }   tetronimo   - target
 * @param { Position3dType }  newPosition - that new shape that might be applied to the target
 * @param { Array<BoxType>}   spaceBoxes  - environment
 */
const movePositionImpl = (tetronimo, newPosition, spaceBoxes) => {
    const shadowTetromino = Tetronimo(0, -1);
    shadowTetromino.setShape(tetronimo.getShape());
    shadowTetromino.setPosition(newPosition);
    if (disallowed(shadowTetromino)) {
        return;
    }
    if (intersects(shadowTetromino, spaceBoxes)) {
        handleCollision(tetronimo, spaceBoxes);
    } else {
        tetronimo.setPosition(newPosition);
    }
};

/**
 * Turns the current tetronimo into a new direction if allowed.
 * @collaborator current tetronimo and spaceBoxes
 * @impure everything might change.
 * @param { NewShapeType } turnFunction
 */
const turnShape = turnFunction => {
    const currentTetronimo = currentTetrominoObs.getValue();
    const shape = currentTetronimo.getShape();
    turnShapeImpl(currentTetronimo, turnFunction (shape), spaceBoxes);
};
/**
 * Moves the current tetronimo to a new position if allowed.
 * @collaborator current tetronimo and spaceBoxes
 * @impure everything might change.
 * @param { NewPositionType } moveFunction
 */
const movePosition = moveFunction => {
    const currentTetronimo = currentTetrominoObs.getValue();
    const position = currentTetronimo.getPosition();
    movePositionImpl(currentTetronimo, moveFunction (position), spaceBoxes);
};

/**
 * Puts asynchronous tasks in strict sequence.
 * @private local state
 * @type { SchedulerType }
 */
const scheduler = Scheduler();

/**
 * @private
 * Principle game loop implementation: let the current tetromino fall down slowly and check for end of game.
 * @param { () => void } done - callback when one iteration is done
 */
const fallTask = done => {
    movePosition(moveDown);
    if (isEndOfGame(currentTetrominoObs.getValue(), spaceBoxes)) {
        console.log("The End");// handle end of game
        return;
    }
    // re-schedule fall Task
    setTimeout( () => scheduler.add(fallTask), 1 * 1000 );
    done();
};

/**
 * Start the game loop.
 */
const startGame = () => {
    scheduler.add(fallTask);
};
