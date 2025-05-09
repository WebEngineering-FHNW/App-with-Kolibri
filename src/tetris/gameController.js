/**
 * @module tetris/gameContoller
 * Manages game-wide state.
 * Here is where the game rules are enforced:
 * - what defines a collision
 * - what happens on collision
 * - what moves are allowed
 * - by which rules boxes drop down
 * The effects are communicated by updating box position and publishing
 * newly available tetrominos.
 */

import {moveDown, normalize}      from "./tetrominoController.js";
import {shapeNames, shapesByName} from "./shape.js";
import {
    Walk
}                                 from "../kolibri/sequence/constructors/range/range.js";
import {Scheduler}                from "../kolibri/dataflow/dataflow.js";
import {
    active,
    MISSING_FOREIGN_KEY,
    passive,
    POISON_PILL,
    PREFIX_IMMORTAL
}                                 from "../server/S7-manyObs-SSE/remoteObservableMap.js";
import {clientId}                 from "../kolibri/version.js";
import {LoggerFactory}            from "../kolibri/logger/loggerFactory.js";
import {ObservableList}           from "../kolibri/observable.js";
import {str}                      from "./util.js";

export {
    startGame, turnShape, movePosition, // for general use outside
    checkAndHandleFullLevel,            // exported only for the unit-testing
    TETROMINO_PREFIX,
    TETROMINO_CURRENT_ID,               // todo: think about retrieving this info from the current boxes
    GAME_STATE,
    BOX_PREFIX,
    PLAYER_SELF_ID,
    PLAYER_ACTIVE_ID,
    PLAYER_PREFIX,
};

const log = LoggerFactory("ch.fhnw.tetris.gameController");

const TETROMINO_PREFIX      = "TETROMINO-";
const TETROMINO_CURRENT_ID  = PREFIX_IMMORTAL + "TETROMINO_CURRENT_ID"; // will never be removed once created

const GAME_STATE            = PREFIX_IMMORTAL + "GAME_STATE";

const BOX_PREFIX            = "BOX-";

const PLAYER_PREFIX         = "PLAYER-";
const PLAYER_ACTIVE_ID      = PREFIX_IMMORTAL + "PLAYER_ACTIVE_ID";
const PLAYER_SELF_ID        = PLAYER_PREFIX + clientId;

// todo: there is a pattern evolving around an observable list of named remote observables (tetros, boxes, players)
// ... and foreign keys that pick out a special ones (current tetro, current boxes, active  player)

// --- boxes --- --- --- --- --- --- --- --- --- ---

/** @type { Array<NamedRemoteObservableType<BoxModelType>> }
 * Contains all the boxes that live in our 3D space after they have been unlinked from their tetromino
 * such that they can fall and disappear independently.
 * We maintain them separately because they are needed for detection and handling of collisions.
 */
const boxesBackingList = [];

/**
 * Decorator. Making the list of space boxes observable.
 * @type {IObservableList<NamedRemoteObservableType<BoxModelType>>}
 */
const boxesListObs= ObservableList( boxesBackingList );

// --- tetrominos --- --- --- --- --- --- --- --- ---

/** @type { Array<NamedRemoteObservableType<TetrominoModelType>> } */
const tetrominoBackingList = [];

/** @type {IObservableList<NamedRemoteObservableType<TetrominoModelType>>}
*/
const tetrominoListObs = ObservableList( tetrominoBackingList );

/** @type { RemoteObservableType<String | undefined> }
 * The current tetromino is the one that the player can control with the arrow keys and that falls down
 * at a given rate (1 s). When it collides, a new one gets created and becomes the current tetromino.
 * Observable to keep the projected views separate from the controller.
 * The value is undefined before any player has started the game.
 */
let tetrominoCurrentIdObs;


// --- players --- --- --- --- --- --- --- --- ---

/**
 * @type { RemoteObservableType<PlayerNameType | undefined> }
 * The Player record that represents ourselves in the game.
 */
let selfPlayerObs;

/** @type { RemoteObservableType<ActivePlayerIdType | undefined> }
 * foreign key (playerId) to the id of the player that is currently in charge of the game.
 */
let activePlayerIdObs;

/**
 * @private
 */
const knownPlayersBackingList = [];

/** This is a local observable list to model the list of known players.
 *  Each entry is a remotely observable player name, such that we can change
 *  the name in place.
 * @type {IObservableList<NamedRemoteObservableType<PlayerNameType>>}
 */
const playerListObs = ObservableList(knownPlayersBackingList);

const getPlayerName = (playerId) => {
    const playerRemoteObs =
              PLAYER_SELF_ID === playerId
            ? selfPlayerObs
            : knownPlayersBackingList.find( ({id}) => id === playerId )?.observable;
    if (undefined === playerRemoteObs) {
        log.warn("Cannot find name for player " + playerId);
        return "unknown";
    }
    return playerRemoteObs.getValue().value;
};

/**
 * Whether we are in charge of moving the current tetromino.
 * @type { () => Boolean }
 * NB: when joining as a new player, the value might not yet be present,
 * but we are, of course, not in charge in that situation.
 */
const weAreInCharge = () => activePlayerIdObs?.getValue()?.value === PLAYER_SELF_ID;

/**
 * @impure puts us in charge and notifies all (remote) listeners.
 * @warn assumes that {@link activePlayerIdObs} is available
 * @type { () => void }
 */
const takeCharge = () => activePlayerIdObs.setValue( /** @type { RemoteValueType<ActivePlayerIdType> } */ active(PLAYER_SELF_ID) );

// --- game state --- --- --- --- --- --- --- --- ---

let gameStateObs;

const initialGameState = { fallingDown: false , score: 0};

const currentOrInitialGameState = () => gameStateObs.getValue().value ?? initialGameState;

const addToScore = n => {
    const oldGameState = currentOrInitialGameState();
    const newGameState = { ...oldGameState };
    newGameState.score = oldGameState.score + n ;
    gameStateObs.setValue(active(newGameState));
};

const fallingDown = newValue => {
    const oldGameState = currentOrInitialGameState();
    const newGameState = { ...oldGameState };
    newGameState.fallingDown = newValue;
    gameStateObs.setValue(active(newGameState));
};

const resetGameState = () => {
    gameStateObs.setValue(active(initialGameState));
};


// --- game --- --- --- --- --- --- --- --- ---

// let isGameRunning = false;


// todo: update to new model
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
 * @private util
 * @return {{currentTetrominoObs: RemoteObservableType<TetrominoModelType>, currentTetromino: TetrominoModelType}}
 */
const getCurrentTetrominoRefs = () => {
    const currentTetrominoId            = tetrominoCurrentIdObs.getValue().value;
    const currentTetrominoNamedValue    = tetrominoBackingList.find(({id}) => id === currentTetrominoId);
    const currentTetrominoObs           = currentTetrominoNamedValue?.observable;
    const currentTetromino              = currentTetrominoObs?.getValue().value;
    return {currentTetrominoObs, currentTetromino, currentTetrominoId};
};

const onCollision = tetromino => {
    console.warn("onCollision");

    if (tetromino.zPos > 11) {
        fallingDown(false);
    }

    // what does it now mean to unlink the boxes? for the moment: nothing as it does no harm

    // todo: check for end of game?
    // todo: check for full level?
    // todo: update score?
    // todo: new upcoming tetro?

    makeNewCurrentTetromino();

};

/**
 * Turns the current tetromino into a new direction if allowed.
 * @collaborator current tetromino and spaceBoxes
 * @impure everything might change.
 * @param { NewShapeType } turnFunction
 */
const turnShape = turnFunction => {
    const {currentTetrominoObs, currentTetromino, currentTetrominoId} = getCurrentTetrominoRefs();
    if (! currentTetromino) return;
    const oldShape = currentTetromino.shape;

    const newShape = normalize(turnFunction(oldShape));
    const position = {xPos:currentTetromino.xPos, yPos:currentTetromino.yPos, zPos:currentTetromino.zPos};

    if(isDisallowedTetroPosition(newShape, position)) {
        return;
    }
    if (willCollide(newShape, position, currentTetrominoId)) {
        onCollision(currentTetromino);
        return;
    }
    const newTetromino = { ...currentTetromino }; // we might not actually need a copy, but it's cleaner
    newTetromino.shape = newShape;
    currentTetrominoObs.setValue(active(newTetromino));
};


/**
 * Moves the current tetromino to a new position if allowed.
 * @collaborator current tetromino and spaceBoxes
 * @impure everything might change.
 * @param { NewPositionType } moveFunction
 */
const movePosition = moveFunction => {
    const {currentTetrominoObs, currentTetromino, currentTetrominoId} = getCurrentTetrominoRefs();
    if (! currentTetromino) return;
    const newTetromino = { ...currentTetromino }; // we might not actually need a copy, but it's cleaner

    const {x,y,z} = moveFunction( {x:currentTetromino.xPos, y:currentTetromino.yPos, z:currentTetromino.zPos}  );

    if(isDisallowedTetroPosition(currentTetromino.shape, {xPos:x, yPos:y, zPos:z})){
        return;
    }
    if (willCollide(currentTetromino.shape, {xPos:x, yPos:y, zPos:z}, currentTetrominoId)) {
        onCollision(currentTetromino);
        return
    }
    newTetromino.xPos = x ;
    newTetromino.yPos = y ;
    newTetromino.zPos = z ;
    currentTetrominoObs.setValue(active(newTetromino));
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
 * @param { () => void } done - release indication when one iteration is done
 */
const fallTask = done => {
    if (! (activePlayerIdObs?.getValue() && weAreInCharge())) { // the active player is known and it is not ourselves
        log.info("stop falling since we are not in charge");
        done();
        return;
    }
    if (!currentOrInitialGameState().fallingDown) {
        log.info("falling is stopped");
        log.info("The End");// todo: handle the end of the game
        done();
        return;
    }
    movePosition(moveDown);
    registerNextFallTask();
    done();
};

const registerNextFallTask = () => setTimeout( () => scheduler.add(fallTask), 1 * 1000 );

let runningNum  = 0;
const makeNewCurrentTetromino = () => {
    addToScore(4);

    runningNum++;
    const newTetroId  = TETROMINO_PREFIX + clientId + "-" + (runningNum++);
    observableGameMap.addObservableForID(newTetroId);
    const newTetroObs = tetrominoBackingList.find(({id}) => id === newTetroId)?.observable;

    const shapeName   = shapeNames[Math.floor(Math.random() * shapeNames.length)];
    const startShape  = shapesByName[shapeName];
    const startTetrominoValue = {shapeName, shape: startShape, xPos: 0, yPos: 0, zPos: 12};
    newTetroObs.setValue(active(startTetrominoValue));

    // create four boxes for the new tetro
    [0, 1, 2, 3].forEach(boxIndex => {
        const newBoxId  = BOX_PREFIX + newTetroId + "-" + boxIndex;
        observableGameMap.addObservableForID(newBoxId);
        const newBoxObs = boxesBackingList.find(({id}) => id === newBoxId)?.observable;
        const startBox  = updatedBoxValue(newTetroId, startTetrominoValue, boxIndex);
        newBoxObs.setValue(active(startBox));
    });

    // set the current tetro id
    tetrominoCurrentIdObs.setValue(active(newTetroId));
};



/** @type { () => void } */
const restart   = () => {

    fallingDown(false);

    // do not proceed before all backing Lists are empty
    // todo: disable all user input and show cleanup state
    const waitForCleanup = () => {
        const stillToDelete = boxesBackingList.length +  tetrominoBackingList.length;
        log.info(`still to delete: ${stillToDelete}`);

        // remove all boxes
        boxesBackingList.forEach(namedObs => {
            observableGameMap.removeObservableForID(namedObs.id);
        });

        // remove all tetros
        tetrominoCurrentIdObs.setValue(active(MISSING_FOREIGN_KEY));
        tetrominoBackingList.forEach( namedObs => {
            observableGameMap.removeObservableForID(namedObs.id);
        });

        if (stillToDelete > 0) {
            setTimeout( waitForCleanup, 500);
        } else {
            // end of disabled state
            resetGameState();
            makeNewCurrentTetromino();
            fallingDown(true);
            registerNextFallTask();
        }
    };
    waitForCleanup();


};



/**
 * @pure calculates the final logical box coordinates
 * @param { ForeignKeyType }        tetroId
 * @param { TetrominoModelType }    tetromino
 * @param { Number }                boxIndex    - 0..3
 * @return { BoxModelType }
 */
const updatedBoxValue = (tetroId, tetromino, boxIndex) => {
    const boxShapeOffset = (tetromino.shape)[boxIndex];
    const xPos = tetromino.xPos + boxShapeOffset.x;
    const yPos = tetromino.yPos + boxShapeOffset.y;
    const zPos = tetromino.zPos + boxShapeOffset.z;
    return {tetroId, xPos, yPos, zPos};
};

const isDisallowedBoxPosition = ({ xPos, yPos }) => {
    if (xPos < 0 || xPos > 6) return true;
    if (yPos < 0 || yPos > 6) return true;
    return false;
};

const expectedBoxPositions = (shape, position) => {
    const shadowTetromino = {};
    shadowTetromino.shape = shape;
    shadowTetromino.xPos  = position.xPos;
    shadowTetromino.yPos  = position.yPos;
    shadowTetromino.zPos  = position.zPos;
    return [0, 1, 2, 3].map(shapeIndex => updatedBoxValue("shadow", shadowTetromino, shapeIndex));
};

const isDisallowedTetroPosition = (shape, position) => {
    return expectedBoxPositions(shape, position).some(boxPos => isDisallowedBoxPosition(boxPos) );
};

const willCollide = (shape, position, currentTetrominoId) => {
    const newBoxPositions = expectedBoxPositions(shape, position);
    if (newBoxPositions.some( ({zPos}) => zPos < 0)) {
        return true;
    }
    const existingBoxPositions =
              boxesBackingList
                  .filter( ({ id         }) => ! id.includes(currentTetrominoId) )
                  .map   ( ({ observable }) => observable.getValue().value);

    // get all the current box positions but without the current tetro
    const collides = existingBoxPositions.some( otherBoxPos => {
       return newBoxPositions.some(newBoxPos => {
           return otherBoxPos.xPos === newBoxPos.xPos &&
                  otherBoxPos.yPos === newBoxPos.yPos &&
                  otherBoxPos.zPos === newBoxPos.zPos;
       })
    });
    return collides;
};



/**
 * @private util
 * @return {NamedRemoteObservableType<BoxModelType>}
 */
const getBoxNamedObs = (tetroId, boxIndex) => {
    const boxId = BOX_PREFIX + tetroId + "-" + boxIndex;
    return boxesBackingList.find(({id}) => id === boxId);
};

/**
 * When a tetro changes, we have to find and update its boxes if possible.
 * This might be tried a number of times before all the boxes and their tetromino object
 * are eventually available.
 *
 * Note that it might happen that
 * - a new tetro is created before its boxes
 * - new boxes are created before their tetro
 *
 * solution:
 * - whenever a tetro is created or changed, _try_ a sync (which might fail due to missing boxes)
 * - whenever a box is created or changed, _try_ a sync (which might fail due to missing tetro)
 * @param { TetrominoModelType } tetromino
 * @param { ForeignKeyType }     tetroId
 */
const trySyncTetronimo = (tetromino, tetroId) => {
    if (!tetromino) { // happens at startup when the tetro was created but the value not yet set (todo: maybe check)
        return;
    }
    log.debug("tetro changed " + str(tetromino));

    [0, 1, 2, 3].forEach (boxIndex => {
        const boxNamedObs = getBoxNamedObs(tetroId, boxIndex);
        if (!boxNamedObs) {
            log.debug(`cannot find box ${boxIndex} for tetro ${tetroId}. (can happen when tetro is added before its boxes)`);
            return;
        }
        const box = boxNamedObs.observable.getValue().value;
        if (!box) {
            return;
        }
        /** @type { BoxModelType } */ const newBox = updatedBoxValue(tetroId, tetromino, boxIndex);
        log.debug("new " + str(newBox));

        // we reach this part only when the boxes are still "linked"
        // which means we only have to update our box observables locally (while the tetro is updated remotely)
        boxNamedObs.observable.setValue(passive(newBox)); // todo: not sure about being passive here

    });
};

// --- store remote observables in local references  --- --- --- --- --- --- --- --- ---

const handleNewTetromino = namedObservable => {
    log.info("New Tetromino " + namedObservable.id);
    tetrominoListObs.add(namedObservable);
    namedObservable.observable.onChange(remoteValue => {
        if (POISON_PILL === remoteValue) {
            log.info(`tetromino removed: ${namedObservable.id}`);
            tetrominoListObs.del(namedObservable);
            return;
        }
        const tetroId = namedObservable.id;
        /** @type { TetrominoModelType } */ const tetromino = remoteValue?.value;
        trySyncTetronimo(tetromino, tetroId);
    });
};

const handleNewBox = namedObservable => {
    log.info("New Box " + namedObservable.id);
    boxesListObs.add(namedObservable);
    let syncCheckDone = false;
    namedObservable.observable.onChange( remoteValue => { // this might not be needed since the other consumers can react to the pill
        if (POISON_PILL === remoteValue) {
            log.info(`box removed: ${namedObservable.id}`);
            boxesListObs.del(namedObservable);
            return;
        }
        /** @type { BoxModelType } */
        const box = remoteValue?.value;
        if (!box) return; // can happen on first call

        if (syncCheckDone) { // do it only once, when a first good value is available
            return;
        }
        syncCheckDone = true;
        const tetrominoId = box.tetroId;
        const tetrominoNamedObs = tetrominoBackingList.find(({id}) => id === tetrominoId);
        trySyncTetronimo(tetrominoNamedObs?.observable.getValue()?.value, tetrominoId);
    });
};



// todo: it would perhaps work nicer to have ourselves also in the list of all players
// .. and jump over it in the ul list of other players

/**
 * handle that a new player has joined.
 * We maintain an observable list of known players.
 * @impure updates the selfPlayerObs and the playerListObs
 */
const handleNewPlayer = namedObservable => {
    if (PLAYER_SELF_ID === namedObservable.id) {  // is is ourselves while joining
        selfPlayerObs = namedObservable.observable;
        // the initial value is just a technical reference - to be changed by the user through the UI
        selfPlayerObs.setValue( active(PLAYER_SELF_ID.substring(PLAYER_PREFIX.length, PLAYER_PREFIX.length+10)));
        return;
    }
    // it is someone else
    log.info(`player joined: ${namedObservable.id}`);
    playerListObs.add(namedObservable);
    namedObservable.observable.onChange( remoteValue => { // centralized handling of removing players
        if (POISON_PILL === remoteValue) {
            log.info(`player left: ${namedObservable.id}`);
            playerListObs.del(namedObservable);
        }
    });
};

const handleActivePlayer = (namedObservable) => {
    activePlayerIdObs = namedObservable.observable;
    let weWereLastInCharge = false;
    activePlayerIdObs.onChange(({value}) => {
        if (MISSING_FOREIGN_KEY === value) {
            weWereLastInCharge = false;
            takeCharge();
            return;
        }
        if (PLAYER_SELF_ID === value) {
            if (weWereLastInCharge) {
                return; // only if we have newly _become_ in charge (prevent from starting the downfall twice)
            }
            console.warn("we are now in charge, let's see if we have to start the downfall");
            weWereLastInCharge = true;
            registerNextFallTask();
            return;
        }
        weWereLastInCharge = false;
    });
};

const handleGameState = (namedObservable) => {
    gameStateObs = namedObservable.observable;
};
/**
 * will be called whenever a remote named Observable becomes available.
 * Lazily setting up the respective local observables when the obsMap notifies
 * us about available named observables.
 * @param { NamedRemoteObservableType } namedObservable
 * @impure dispatches to the respective impure handlers
 */
const onNewNamedObservable = namedObservable => {
    log.info(`received named observable '${namedObservable.id}'`);
    if (namedObservable.id.startsWith(PLAYER_PREFIX)) {
        handleNewPlayer(namedObservable);
        return;
    }
    if (namedObservable.id.startsWith(TETROMINO_PREFIX)) {
        handleNewTetromino(namedObservable);
        return;
    }
    if (namedObservable.id.startsWith(BOX_PREFIX)) {
        handleNewBox(namedObservable);
        return;
    }
    // lazy init of local storage is a side effect and depends on timing
    // it should be safe to set the local references multiple times to the same remote observable
    switch (namedObservable.id) {
        case TETROMINO_CURRENT_ID:  tetrominoCurrentIdObs = namedObservable.observable; break;
        case PLAYER_ACTIVE_ID:      handleActivePlayer(namedObservable);                break;
        case GAME_STATE:            handleGameState   (namedObservable);                break;
        default:
            log.warn(`unknown named observable with id:${namedObservable.id}`);
    }

};

// --- game controller --- --- --- --- --- --- --- --- --- --- --- --- --- ---

/**
 * @typedef GameControllerType
 * @property { RemoteObservableType<String>    }                                selfPlayerObs
 * @property { RemoteObservableType<String>    }                                activePlayerIdObs
 * @property { RemoteObservableType<TetrominoModelType> }                       tetrominoCurrentIdObs
 * @property { RemoteObservableType<GameStateModelType> }                       gameStateObs
 * @property { IObservableList<NamedRemoteObservableType<TetrominoModelType>> } tetrominoListObs
 * @property { IObservableList<NamedRemoteObservableType<BoxModelType>> }       boxesListObs
 * @property { IObservableList<NamedRemoteObservableType<PlayerNameType>> }     playerListObs
 * @property { (String) => String }                                             getPlayerName
 * @property { () => Boolean }                                                  weAreInCharge
 * @property { () => void    }                                                  takeCharge
 * @property { () => void    }                                                  restart
 */

/**
 * @constructor
 * @returns { GameControllerType }
 */
const GameController = () => ( { // we need to bind late such that the obs references are set
    tetrominoCurrentIdObs,
    tetrominoListObs,
    gameStateObs,
    boxesListObs,
    selfPlayerObs,
    activePlayerIdObs,
    playerListObs,
    getPlayerName,
    weAreInCharge,
    takeCharge,
    restart,
});


/**
 * Needs lazy initialization and module-scoped access.
 * @type { ObservableMapType } */
let observableGameMap;

let startupFinished = false;

/**
 * Start the game loop.
 * @param { ObservableMapCtorType        } observableMapCtor  - constructor of an observable map (remote or local)
 * @param { (GameControllerType) => void } afterStartCallback - what to do after start action is finished
 */
const startGame = (observableMapCtor, afterStartCallback) => {

    // preparing the map
    observableGameMap = observableMapCtor(onNewNamedObservable);

    // once we know what is available, fill in the missing pieces (esp. for the first player)
    observableGameMap.ensureAllObservableIDs( initialMap => {

        if (selfPlayerObs) {
            log.warn(`self player obs was created from remote observable - this should not happen.`);
        } else {
            log.debug(`as expected, we are not yet represented as a player`);
            observableGameMap.addObservableForID(PLAYER_SELF_ID);
        }

        if (activePlayerIdObs) {
            log.debug(`active player id obs was created from remote observable`);
            const activeId = activePlayerIdObs.getValue().value;
            if (undefined === activeId && undefined === initialMap[PLAYER_ACTIVE_ID]) {
                // there is no active player, which can happen on re-join after all previous players have left
                takeCharge();
            }
        } else {
            log.debug(`no active player id obs, creating one and putting ourselves in charge`);
            observableGameMap.addObservableForID(PLAYER_ACTIVE_ID);
            takeCharge();
        }

        // in particular for the first, starting player the immortal obs might not yet be there
        if (tetrominoCurrentIdObs) {
            log.debug(`${"current tetro id"} obs was created or will be created from remote observable`);
        } else {
            log.debug(`no ${"current tetro id"} obs, creating one`);
            observableGameMap.addObservableForID(TETROMINO_CURRENT_ID);
        }

        if (gameStateObs || initialMap[GAME_STATE]) {
            log.debug(`game state obs was created or will be created from remote observable`);
        } else {
            log.debug(`no game state obs, creating one`);
            observableGameMap.addObservableForID(GAME_STATE);
        }

        afterStartCallback( GameController() ); // this is where the UI is projected

        // process the remote named observables that were available initially
        // but need the binding to be in place before processing.
        for (const [id, observable] of Object.entries(initialMap) ) {
            onNewNamedObservable( {id, observable} );
        }

        // clean up when leaving (as good as possible - not 100% reliable)
        window.onbeforeunload = (_evt) => {
            if (weAreInCharge()) { // if we are in charge while leaving, put someone else in charge
                activePlayerIdObs.setValue(active( knownPlayersBackingList?.at(0)?.id ?? MISSING_FOREIGN_KEY ));
            }
            observableGameMap.removeObservableForID(PLAYER_SELF_ID);
        };

        startupFinished = true;
    });


    // todo: we should only add a new tetro at start
    // - if there isn't one, yet (and we are in charge)
    // observableGameMap.addObservableForID(TETROMINO_CURRENT);

    // there is some game state that needs to be agreed upon by all clients:
    // - the current tetromino (id, shapeName)
    // - the next available unique tetro id
    // - the shape of the current tetromino (changes with actions)
    // - the position of the current tetromino (changes with actions)
    // - for each box (incl. the ones of the current tetromino) their relative position
    // - the list of all players (optional)
    // - the currently active player


};
