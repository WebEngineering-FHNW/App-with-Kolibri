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
import {Scheduler}                                     from "../kolibri/dataflow/dataflow.js";
import {active, passive, POISON_PILL, PREFIX_IMMORTAL} from "../server/S7-manyObs-SSE/remoteObservableMap.js";
import {clientId}                                      from "../kolibri/version.js";
import {LoggerFactory}                               from "../kolibri/logger/loggerFactory.js";

export {
    startGame, turnShape, movePosition, // for general use outside
    checkAndHandleFullLevel                                     // only for the unit-testing
};

const log = LoggerFactory("ch.fhnw.tetris.gameController");

const TETROMINO_CURRENT = "currentTetronimo";
const PLAYER_ACTIVE     = PREFIX_IMMORTAL + "activePlayer";
const PING              = "ping-" + clientId;

/** @type { Array<BoxType> }
 * Contains all the boxes that live in our 3D space after they have been unlinked from their tetronimo
 * such that they can fall and disappear independently.
 */
const spaceBoxes = [];

/** @type { RemoteObservableType<TetronimoType | undefined> }
 * The current tetromino is the one that the player can control with the arrow keys and that falls down
 * at a given rate (1 s). When it collides, a new one gets created and becomes the current tetronimo.
 * Observable to keep the projected views separate from the controller.
 */
let currentTetrominoObs;

/** @type { RemoteObservableType<String | undefined> }
 * Name (unique clientId) of the player that is currently in charge
 */
let activePlayerObs;

/** @return Boolean */
const weAreInCharge = () => activePlayerObs?.getValue()?.value === clientId;

/**
 * @impure puts us in charge and notifies all (remote) listeners.
 * @warn assumes that {@link activePlayerObs} is available
 */
const takeCharge = () => activePlayerObs.setValue( /** @type { RemoteValueType<String> } */ active(clientId));

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
    if (! weAreInCharge()) { return; }
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

const monitorActivePlayer = (remoteObservable) => {
    activePlayerObs = remoteObservable;                         // side effect! put the observable in module scope

    activePlayerObs.onChange(({value}) => {                    // destructure remote value
        // the value might be undefined when:
        // - we have created the remote obs ourselves and the initial callback comes along (even after setup is finished)
        // - there is a remote value but the setup is not yet finished
        // In both cases, the real value will eventually come later
        log.info(`+++ active player value: ${value} setupFinished: ${setupFinished}`);

        if (! setupFinished || ! value) {
            return;
        }
        // the real work comes here
        // quick hack, don't judge me
        const view = document.getElementById("PLAYER_ACTIVE");
        view.textContent = weAreInCharge() ? "myself" : value ?? "unknown";

        const button = document.getElementById("BUTTON_START");
        button.disabled = ! weAreInCharge();


    });
};


let observableGameMap;
let setupFinished = false;
/**
 * Start the game loop.
 */
const startGame = (factory, projectNewTetronimo) => {

    // will only get called once a new named Observable becomes available
    // lazily setting up the respective local observables when the obsMap notifies
    // us about available named observables
    const onNewNamedObservable = namedObservable => {
        log.info(`new named observable '${namedObservable.id}'`);
        switch (namedObservable.id) {
            case TETROMINO_CURRENT:
                handleNewCurrentTetroObsAvailable(namedObservable.observable, projectNewTetronimo);
                break;
            case PLAYER_ACTIVE:
                monitorActivePlayer(namedObservable.observable);
                break;
            default:
                log.warn(`unknown named observable with id:${namedObservable.id}`);
        }

    };
    observableGameMap = factory.newMap(onNewNamedObservable);

    observableGameMap.ensureAllObservableIDs( _=> {
        log.info("after initial setup");
        setupFinished = true;

        log.info("starting...");

        if (!activePlayerObs) {
            log.info(`no active player obs, creating one and putting ourselves in charge`);
            observableGameMap.addObservableForID(PLAYER_ACTIVE);
            takeCharge();
        } else {
            log.info(`active player obs was created from remote observable`);
        }
        document.querySelector("main").onmousedown = _ => takeCharge();

        const button = document.getElementById("BUTTON_START");
        // button.onclick = _ => fallTask( _=> {}); // make sure we have a current tetro
        button.onclick = _ => alert("start to be implemented");

    });


    // todo: we should only add a new tetro at start
    // - if there isn't one, yet (and we are in charge)
    // observableGameMap.addObservableForID(TETROMINO_CURRENT);

    // there is some game state that needs to be agreed upon by all clients:
    // - the current tetronimo (id, shapeName)
    // - the next available unique tetro id
    // - the shape of the current tetronimo (changes with actions)
    // - the position of the current tetronimo (changes with actions)
    // - for each box (incl. the ones of the current tetronimo) their relative position
    // - the list of all players (optional)
    // - the currently active player




};
