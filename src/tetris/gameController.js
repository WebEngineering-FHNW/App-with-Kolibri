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
import {active, passive}     from "../server/S7-manyObs-SSE/remoteObservableClient.js";

export {
    startGame, turnShape, movePosition, // for general use outside
    checkAndHandleFullLevel                                     // only for the unit-testing
};

const TETROMINO_CURRENT = "currentTetronimo";
const PLAYER_ACTIVE     = "activePlayer";

/** @type { Array<BoxType> }
 * Contains all the boxes that live in our 3D space after they have been unlinked from their tetronimo
 * such that they can fall and disappear independently.
 */
const spaceBoxes = [];

/** @type { IObservable<RemoteValueType<TetronimoType>> }
 * The current tetromino is the one that the player can control with the arrow keys and that falls down
 * at a given rate (1 s). When it collides, a new one gets created and becomes the current tetronimo.
 * Observable to keep the projected views separate from the controller.
 */
let currentTetrominoObs;

/**
 * The game ends with a collision at the top.
 * @pure
 * @type { (currentTetronimo: RemoteValueType<TetronimoType>, spaceBoxes:Array<BoxType>) => Boolean }
 */
const isEndOfGame = (currentTetromino, spaceBoxes) =>
    currentTetromino.value.getPosition().z === 12
    && intersects(currentTetromino, spaceBoxes) ;

/**
 * @type { (currentTetronimo:RemoteValueType<TetronimoType> , spaceBoxes:Array<BoxType>) => void }
 * @impure side effects pretty much everything, directly or indirectly
 */
const handleCollision = (currentTetromino, spaceBoxes) => {
    currentTetromino.value.unlinkBoxes();                   // boxes will still keep their data binding
    spaceBoxes.push(...(currentTetromino.value.boxes));     // put the current tetro boxes in the space
    checkAndHandleFullLevel(spaceBoxes);
    currentTetrominoObs.setValue(undefined);                // make room for new tetro
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
        box.setValue( {x:-1,y:-1, z:-1} ); // will trigger listeners (e.g., the view) to self-remove
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
 * and adapt, according to the game rules.
 * @impure everything might change.
 * @param { RemoteValueType<TetronimoType> } tetronimo  - target
 * @param { ShapeType }                      newShape   - that new shape that might be applied to the target
 * @param { Array<BoxType>}                  spaceBoxes - environment
 */
const turnShapeImpl = (tetronimo, newShape, spaceBoxes) => {
    newShape              = normalize(newShape);
    const shadowTetromino = /** @type { RemoteValueType<TetronimoType> } */ passive(Tetronimo(0, -1));
    shadowTetromino.value.setShape(newShape);
    shadowTetromino.value.setPosition(tetronimo.value.getPosition());
    if (disallowed(shadowTetromino)) {
        return;
    }
    if (intersects(shadowTetromino, spaceBoxes)) {
        handleCollision(tetronimo, spaceBoxes);
    } else {
        tetronimo.value.setShape(newShape);
    }
};
/**
 * When a tetronimo gets a new position as the result of user input or time,
 * we have to check the possible results of that move
 * and adapt according to the game rules.
 * @impure everything might change.
 * @param { RemoteValueType<TetronimoType> }    tetronimo   - target
 * @param { Position3dType }                    newPosition - that new shape that might be applied to the target
 * @param { Array<BoxType>}                     spaceBoxes  - environment
 */
const movePositionImpl = (tetronimo, newPosition, spaceBoxes) => {
    const shadowTetromino = /** @type { RemoteValueType<TetronimoType> } */ passive(Tetronimo(0, -1));
    shadowTetromino.value.setShape(tetronimo.value.getShape());
    shadowTetromino.value.setPosition(newPosition);
    if (disallowed(shadowTetromino)) {
        return;
    }
    if (intersects(shadowTetromino, spaceBoxes)) {
        handleCollision(tetronimo, spaceBoxes);
    } else {
        tetronimo.value.setPosition(newPosition);
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
    const shape = currentTetronimo.value.getShape();
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
    const position = currentTetronimo.value.getPosition();
    movePositionImpl(currentTetronimo, moveFunction (position), spaceBoxes);
};

/**
 * Puts asynchronous tasks in a strict sequence.
 * @private local state
 * @type { SchedulerType }
 */
const scheduler = Scheduler();

/**
 * @private
 * Principle game loop implementation: let the current tetromino fall down slowly and check for the end of the game.
 * @param { () => void } done - callback when one iteration is done
 */
const fallTask = done => {
    movePosition(moveDown);// todo: only if we are in charge,
    if (isEndOfGame(currentTetrominoObs.getValue(), spaceBoxes)) {
        console.log("The End");// handle the end of the game
        return;
    }
    // re-schedule fall Task
    setTimeout( () => scheduler.add(fallTask), 1 * 1000 );
    done();
};

/**
 * @impure sets the currentTetrominoObs
 */
const handleNewCurrentTetroObsAvailable = (createdTetrominoObs, projectNewTetronimo) => {
    currentTetrominoObs = createdTetrominoObs;                      // side effect! put the observable in module scope
    currentTetrominoObs.onChange(remoteCurrentTetroValue => {
        // at this point it cannot be the poison pill since the current tetro obs itself is never removed -
        // even though its value can be undefined, which means a new one has to be created
        console.log(remoteCurrentTetroValue);
        const currentTetro = remoteCurrentTetroValue?.value;        // unpack the remote mode/value
        if (!currentTetro) { // current tetro is undefined
            // todo: only if we are in charge, active (?)
            currentTetrominoObs.setValue(/** @type { RemoteValueType<TetronimoType> } */ active(makeRandomTetromino()));
            // since we set our own value, we will call ourselves again and land in the else branch
            // while we make sure that other (remote) listeners are also notified
        } else {
            projectNewTetronimo(currentTetro);
        }
    });

};

/**
 * Start the game loop.
 */
const startGame = (factory, projectNewTetronimo) => {

    // will only get called once a new named Observable becomes available
    const onNewNamedObservable = namedObservable => {
        console.log(namedObservable);
        switch (namedObservable.id) {
            case TETROMINO_CURRENT:
                handleNewCurrentTetroObsAvailable(namedObservable.observable, projectNewTetronimo);
                break;
            default:
                console.warn("unknown named observable", namedObservable);
        }

        scheduler.add(fallTask); // only start the falling after all has been set up
    };
    const coordinator = factory.newMap(onNewNamedObservable);
    coordinator.addObservableForID(TETROMINO_CURRENT);
};
