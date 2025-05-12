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

import {moveDown, normalize}                                     from "./tetrominoController.js";
import {shapeNames, shapesByName}                                from "./shape.js";
import {Walk}                                                    from "../kolibri/sequence/constructors/range/range.js";
import {MISSING_FOREIGN_KEY, POISON_PILL_VALUE, PREFIX_IMMORTAL} from "../server/S7-manyObs-SSE/remoteObservableMap.js";
import {clientId}                                                from "../kolibri/version.js";
import {LoggerFactory}                                           from "../kolibri/logger/loggerFactory.js";
import {ObservableList}                                          from "../kolibri/observable.js";
import {INITIAL_OBS_VALUE}                                       from "./observableMap/observableMap.js";
import {missing}                                                 from "./util.js";
import * as activePlayerObservable                               from "../kolibri/lambda/church.js";

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
    PLAYER_ALL_IDS
};

const log = LoggerFactory("ch.fhnw.tetris.gameController");

const TETROMINO_PREFIX      = "TETROMINO-";
const TETROMINO_CURRENT_ID  = PREFIX_IMMORTAL + "TETROMINO_CURRENT_ID"; // will never be removed once created

const GAME_STATE            = PREFIX_IMMORTAL + "GAME_STATE";

const BOX_PREFIX            = "BOX-";

const PLAYER_PREFIX         = "PLAYER-";
const PLAYER_ACTIVE_ID      = PREFIX_IMMORTAL + "PLAYER_ACTIVE_ID";
const PLAYER_SELF_ID        = PLAYER_PREFIX + clientId;
const PLAYER_ALL_IDS        = PREFIX_IMMORTAL + "PLAYER_ALL_IDS";


// --- boxes --- --- --- --- --- --- --- --- --- ---

/** @type { Array<MappedObservableType<BoxModelType>> }
 * Contains all the boxes that live in our 3D space after they have been unlinked from their tetromino
 * such that they can fall and disappear independently.
 * We maintain them separately because they are needed for detection and handling of collisions.
 */
const boxesBackingList = [];

/**
 * Decorator. Making the list of space boxes observable.
 * @type {IObservableList<MappedObservableType<BoxModelType>>}
 */
const boxesListObs= ObservableList( boxesBackingList );

// --- tetrominos --- --- --- --- --- --- --- --- ---

/** @type { Array<MappedObservableType<TetrominoModelType>> } */
const tetrominoBackingList = [];

/** @type {IObservableList<MappedObservableType<TetrominoModelType>>}
*/
const tetrominoListObs = ObservableList( tetrominoBackingList );

/** @type { MappedObservableType<ForeignKeyType> }
 * The current tetromino is the one that the player can control with the arrow keys and that falls down
 * at a given rate (1 s). When it collides, a new one gets created and becomes the current tetromino.
 * Observable to keep the projected views separate from the controller.
 * The value is undefined before any player has started the game.
 */
let tetrominoCurrentIdObs;


// --- players --- --- --- --- --- --- --- --- ---

/**
 * @type { MappedObservableType<AllPlayerIdsType> }
 * The observable that keep us up to date, which player ids are known in the game.
 */
let allPlayerIDsObs;

/**
 * @type { MappedObservableType<PlayerNameType> }
 * The Player record that represents ourselves in the game.
 */
let selfPlayerObs;

/** @type { MappedObservableType<ActivePlayerIdType> }
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
 * @type {IObservableList<MappedObservableType<PlayerNameType>>}
 */
const playerListObs = ObservableList(knownPlayersBackingList);

const getPlayerName = (playerId) => {
    const playerRemoteObs =
              PLAYER_SELF_ID === playerId
            ? selfPlayerObs
            : knownPlayersBackingList.find( ({id}) => id === playerId );
    if (undefined === playerRemoteObs) {
        log.warn("Cannot find name for player " + playerId);
        return "unknown";
    }
    console.warn("---",playerRemoteObs.id, playerRemoteObs.getValue());
    if (POISON_PILL_VALUE === playerRemoteObs.getValue()) {
        console.error("*** ***");
    }
    return playerRemoteObs.getValue();
};

/**
 * Whether we are in charge of moving the current tetromino.
 * @type { () => Boolean }
 * NB: when joining as a new player, the value might not yet be present,
 * but we are, of course, not in charge in that situation.
 */
const weAreInCharge = () => activePlayerIdObs?.getValue() === PLAYER_SELF_ID;

/**
 * @impure puts us in charge and notifies all (remote) listeners.
 * @warn assumes that {@link activePlayerIdObs} is available
 * @type { () => void }
 */
const takeCharge = () => activePlayerIdObs.setValue(PLAYER_SELF_ID );

// --- game state --- --- --- --- --- --- --- --- ---

/** @type { MappedObservableType<GameStateModelType> } */
let gameStateObs;

/** @type { GameStateModelType } */
const initialGameState = { fallingDown: false , score: 0};

const currentOrInitialGameState = () => gameStateObs?.getValue() ?? initialGameState;

const addToScore = n => {
    const oldGameState = currentOrInitialGameState();
    const newGameState = /** @type { GameStateModelType } */ { ...oldGameState };
    newGameState.score = oldGameState.score + n ;
    gameStateObs.setValue(newGameState);
};

const fallingDown = newValue => {
    const oldGameState = currentOrInitialGameState();
    const newGameState = /** @type { GameStateModelType } */ { ...oldGameState };
    newGameState.fallingDown = newValue;
    gameStateObs.setValue(newGameState);
};

const resetGameState = () => {
    gameStateObs.setValue(initialGameState);
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
 * @return {{currentTetrominoObs: MappedObservableType<TetrominoModelType>, currentTetromino: TetrominoModelType}}
 */
const getCurrentTetrominoRefs = () => {
    const currentTetrominoId            = tetrominoCurrentIdObs.getValue();
    const currentTetrominoObs           = tetrominoBackingList.find(({id}) => id === currentTetrominoId);
    const currentTetromino              = currentTetrominoObs?.getValue();
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
    currentTetrominoObs.setValue(newTetromino);
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
    currentTetrominoObs.setValue(newTetromino);
};


/**
 * @private
 * Principle game loop implementation: let the current tetromino fall down slowly and check for the end of the game.
 */
const fallTask = () => {
    // todo: what if activePlayerId is initial or unknownFK
    if (! (activePlayerIdObs?.getValue() && weAreInCharge())) { // the active player is known and it is not ourselves
        log.info("stop falling since we are not in charge");
        return;
    }
    if (!currentOrInitialGameState().fallingDown) {
        log.info("falling is stopped");
        return;
    }
    movePosition(moveDown);
    registerNextFallTask();
};

const registerNextFallTask = () => setTimeout( fallTask, 1 * 1000 );

let runningNum  = 0;
const makeNewCurrentTetromino = () => {
    addToScore(4);

    let newTetroObs ;

    const shapeName   = shapeNames[Math.floor(Math.random() * shapeNames.length)];
    const startShape  = shapesByName[shapeName];
    const startTetrominoValue = {shapeName, shape: startShape, xPos: 0, yPos: 0, zPos: 12};

    let fourBoxObservables = [];

    // trigger the creation of a tetro and four boxes
    runningNum++;
    const newTetroId  = TETROMINO_PREFIX + clientId + "-" + (runningNum++);
    observableGameMap.addObservableForID(newTetroId);

    const boxIds = [0, 1, 2, 3].map(boxIndex => {
        const newBoxId  = BOX_PREFIX + newTetroId + "-" + boxIndex;
        observableGameMap.addObservableForID(newBoxId);
        return newBoxId;
    });

    // proceed when the respective observables have been created
    observableGameMap.ensureAllObservableIDs(
        () => {
            newTetroObs.setValue(startTetrominoValue);
            fourBoxObservables.forEach((boxObs, boxIndex) =>
                boxObs.setValue(updatedBoxValue(newTetroId, startTetrominoValue, boxIndex)));
            // set the current tetro id
            tetrominoCurrentIdObs.setValue(newTetroId);
        },
        () => { // check: make sure we have all observables that we need and update the references along the way
            newTetroObs        =                  tetrominoBackingList.find( ({id}) => id === newTetroId);
            fourBoxObservables = boxIds.map (boxId => boxesBackingList.find( ({id}) => id === boxId));
            return undefined !== newTetroObs && fourBoxObservables.every(boxObs => undefined !== boxObs);
        }
    );
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
        tetrominoCurrentIdObs.setValue(MISSING_FOREIGN_KEY);
        tetrominoBackingList.forEach( namedObs => {
            observableGameMap.removeObservableForID(namedObs.id);
        });

        if (stillToDelete > 0) {
            setTimeout( waitForCleanup, 500); // todo shorter delay for next call, todo: support bulk deletion
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
                  .filter( ({ id })   => ! id.includes(currentTetrominoId) )
                  .map   ( observable => observable.getValue());

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
 * @return {MappedObservableType<BoxModelType>}
 */
const getBoxNamedObs = (tetroId, boxIndex) => {
    const boxId = BOX_PREFIX + tetroId + "-" + boxIndex;
    return boxesBackingList.find( ( {id} ) => id === boxId);
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
        console.error("this check should no longer be needed.");
        return;
    }
    log.debug("try tetro / box sync " + tetroId);

    [0, 1, 2, 3].forEach (boxIndex => {
        const boxNamedObs = getBoxNamedObs(tetroId, boxIndex);
        if (!boxNamedObs) {
            log.debug(`cannot find box ${boxIndex} for tetro ${tetroId}. (can happen when tetro is added before its boxes)`);
            return;
        }
        const box = boxNamedObs.getValue();
        if (!box) {
            console.error("this check should no longer be needed.");
            return;
        }
        /** @type { BoxModelType } */ const newBox = updatedBoxValue(tetroId, tetromino, boxIndex);
        // we reach this part only when the boxes are still "linked"
        // which means we only have to update our box observables locally (while the tetro is updated remotely)
        boxNamedObs.setLocalValue(newBox); // we are local here since before unlinking, each client can update independently
    });
};

// --- keep remote observables in local references  --- --- --- --- --- --- --- --- ---

const handleNewTetromino = newTetroObservable => {
    if (tetrominoBackingList.find( ({id}) => id === newTetroObservable.id)) {
        console.error("already have an observable for id ", newTetroObservable.id);
        return
    }
    log.info("New Tetromino " + newTetroObservable.id);
    tetrominoListObs.add(newTetroObservable);
    newTetroObservable.onChange( /** @type { TetrominoModelType } */ newTetromino => {
        if (POISON_PILL_VALUE === newTetromino) {
            log.info(`tetromino removed: ${newTetroObservable.id}`);
            tetrominoListObs.del(newTetroObservable);
            return;
        }
        trySyncTetronimo(newTetromino, newTetroObservable.id);
    });
};

const handleNewBox = newBoxObservable => {
    if (boxesBackingList.find( ({id}) => id === newBoxObservable.id)) {
        console.error("already have an observable for id ", newBoxObservable.id);
        return
    }
    log.debug("New Box " + newBoxObservable.id);
    boxesListObs.add(newBoxObservable);
    let syncCheckDone = false;
    newBoxObservable.onChange( /** @type { BoxModelType } */ newBox => {
        if (POISON_PILL_VALUE === newBox) {
            log.info(`box removed: ${newBoxObservable.id}`);
            boxesListObs.del(newBoxObservable);
            return;
        }
        if (syncCheckDone) { // do it only once per new box change (otherwise unlimited recursion)
            return;          // the sync will make a new box object, triggering a change
        }
        syncCheckDone = true;
        const tetrominoId = newBox.tetroId;
        const tetrominoNamedObs = tetrominoBackingList.find( ({id}) => id === tetrominoId);
        trySyncTetronimo(tetrominoNamedObs?.getValue(), tetrominoId);
    });
};



// todo: it would perhaps work nicer to have ourselves also in the list of all players
// .. and jump over it in the ul list of other players

/**
 * handle that a new player has joined.
 * We maintain an observable list of known players.
 * @impure updates the selfPlayerObs and the playerListObs
 */
const handleNewPlayer = newPlayerObservable => {
    if (gameProjectorCalled) { // after projection, we should no longer allow obs identity changes
        if (knownPlayersBackingList.find( ({id}) => id === newPlayerObservable.id)) {
            console.error("already have an observable for id ", newPlayerObservable.id, "change not allowed after projection");
            return;
        }
    }

    if (PLAYER_SELF_ID === newPlayerObservable.id) {  // is is ourselves while joining
        selfPlayerObs = newPlayerObservable;
        return;
    }
    // it is someone else
    log.info(`player joined: ${newPlayerObservable.id}`);
    playerListObs.add(newPlayerObservable);
    newPlayerObservable.onChange( /** @type { PlayerNameType } */ newPlayer => {
        if (POISON_PILL_VALUE === newPlayer) {
            playerListObs.del(newPlayerObservable);
        }
    });
};

const handleActivePlayer = (newActivePlayerObservable) => {
    if (gameProjectorCalled) { // after projection, we should no longer allow obs identity changes
        if (activePlayerObservable) {
            console.error("already have an observable for id ", newActivePlayerObservable.id, "change not allowed after projection");
            return;
        }
    }
    activePlayerIdObs = newActivePlayerObservable;
    let weWereLastInCharge = false;
    activePlayerIdObs.onChange( /** @type { ActivePlayerIdType } */ activePlayerId => {
        if (MISSING_FOREIGN_KEY === activePlayerId || POISON_PILL_VALUE === activePlayerId || INITIAL_OBS_VALUE === activePlayerId) {
            weWereLastInCharge = false;
            takeCharge();
            return;
        }
        if (PLAYER_SELF_ID === activePlayerId) {
            if (weWereLastInCharge) {
                return; // only if we have newly _become_ in charge (prevent from starting the downfall twice)
            }
            log.info("we are now in charge, let's see if we have to start the downfall");
            weWereLastInCharge = true;
            registerNextFallTask();
            return;
        }
        weWereLastInCharge = false;
    });
};

const handleAllPlayerIDs = (newAllPlayerIdsObservable) => {
    // if (gameProjectorCalled) { // after projection, we should no longer allow obs identity changes
    //     if (allPlayerIDsObs) {
    //         console.error("already have an observable for id ", newAllPlayerIdsObservable.id, "change not allowed after projection");
    //         return;
    //     }
    // }
    allPlayerIDsObs = newAllPlayerIdsObservable;
    console.warn("handleAllPlayerIDs");
    allPlayerIDsObs.onChange( /** @type { AllPlayerIdsType } */ allPlayerIds => {
        console.warn("updated players ids list", allPlayerIds);

        if( ! allPlayerIds.includes(PLAYER_SELF_ID)) { // we are not yet in the list
            allPlayerIDsObs.setValue( allPlayerIds.concat([PLAYER_SELF_ID]) ); // self call should be safe from stack overflow
        }

    });
};

/**
 * will be called whenever a remote named Observable becomes available.
 * Lazily setting up the respective local observables when the obsMap notifies
 * us about available named observables.
 * @param { MappedObservableType } mappedObservable
 * @impure dispatches to the respective impure handlers
 */
const onNewMappedObservable = mappedObservable => {
    log.info(`received named observable '${mappedObservable.id}'`);
    if (mappedObservable.id.startsWith(PLAYER_PREFIX)) {
        handleNewPlayer(mappedObservable);
        return;
    }
    if (mappedObservable.id.startsWith(TETROMINO_PREFIX)) {
        handleNewTetromino(mappedObservable);
        return;
    }
    if (mappedObservable.id.startsWith(BOX_PREFIX)) {
        handleNewBox(mappedObservable);
        return;
    }
    // lazy init of local storage is a side effect and depends on timing
    // it should be safe to set the local references multiple times to the same remote observable
    switch (mappedObservable.id) {
        case PLAYER_ALL_IDS:
            handleAllPlayerIDs(mappedObservable);
            break;
        case GAME_STATE:
            if(gameStateObs) return;
            gameStateObs = /** @type { MappedObservableType<GameStateModelType> } */ mappedObservable;
            break;
        case TETROMINO_CURRENT_ID:
            if (tetrominoCurrentIdObs) return;
            tetrominoCurrentIdObs = mappedObservable;
            break;
        case PLAYER_ACTIVE_ID:
            handleActivePlayer(mappedObservable);
            break;
        default:
            log.warn(`unknown named observable with id:${mappedObservable.id}`);
    }

};

// --- game controller --- --- --- --- --- --- --- --- --- --- --- --- --- ---

/**
 * @typedef GameControllerType
 * @property { MappedObservableType<PlayerNameType>    }                        selfPlayerObs
 * @property { MappedObservableType<ForeignKeyType>    }                        activePlayerIdObs
 * @property { MappedObservableType<ForeignKeyType> }                           tetrominoCurrentIdObs
 * @property { MappedObservableType<GameStateModelType> }                       gameStateObs
 * @property { IObservableList<MappedObservableType<TetrominoModelType>> }      tetrominoListObs
 * @property { IObservableList<MappedObservableType<BoxModelType>> }            boxesListObs
 * @property { IObservableList<MappedObservableType<PlayerNameType>> }          playerListObs
 * @property { Array<MappedObservableType<PlayerNameType>> }                    initialPlayerList
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
    initialPlayerList: knownPlayersBackingList, // to transfer data that was read before the binding
    getPlayerName,
    weAreInCharge,
    takeCharge,
    restart,
});

/**
 * Needs lazy initialization and module-scoped access.
 * @type { ObservableMapType } */
let observableGameMap;

let gameProjectorCalled = false; // for debugging and finer control

/**
 * Start the game loop.
 * @param { ObservableMapCtorType        } observableMapCtor  - constructor of an observable map (remote or local)
 * @param { (GameControllerType) => void } afterStartCallback - what to do after start action is finished
 */
const startGame = (observableMapCtor, afterStartCallback) => {

    // preparing the map
    observableGameMap = observableMapCtor(onNewMappedObservable);

    // clean up when leaving (as good as possible - not 100% reliable)
    window.onbeforeunload = (_evt) => {
        if (weAreInCharge()) { // if we are in charge while leaving, put someone else in charge
            activePlayerIdObs.setValue(knownPlayersBackingList?.at(0)?.id ?? MISSING_FOREIGN_KEY);
        }
        observableGameMap.removeObservableForID(PLAYER_SELF_ID);
    };

    // make sure all observables are registered that we need for the binding

    // there are two cases:
    // either we are the first player in the game, and we have to set the shared game observables,
    // or we join a started game, and we have to use the existing shared game observables

    if (!allPlayerIDsObs) {
        observableGameMap.addObservableForID(PLAYER_ALL_IDS);
    }
    if (!activePlayerIdObs) {
        observableGameMap.addObservableForID(PLAYER_ACTIVE_ID);
    }
    if (!tetrominoCurrentIdObs) {
        observableGameMap.addObservableForID(TETROMINO_CURRENT_ID);
    }
    if (!gameStateObs) {
        observableGameMap.addObservableForID(GAME_STATE);
    }

    observableGameMap.addObservableForID(PLAYER_SELF_ID); // this is always new and fresh

    const onStartupFinished = initialMap => {

        Object.values(initialMap).forEach( mo => { // todo: this should become irrelevant
            console.warn(`binding  ${mo.id}`);
            onNewMappedObservable(mo);
        });

        console.warn("--- binding called --- ");
        // console.warn("back player list", knownPlayersBackingList.map(it=>it.id));

        afterStartCallback(GameController()); // all observables are set up, the UI can be bound
        gameProjectorCalled = true;

        if (missing(allPlayerIDsObs.getValue())) {
            log.info("there are no known players");
            allPlayerIDsObs.setValue([PLAYER_SELF_ID]);
        }

        if (missing(selfPlayerObs.getValue())) {
            log.info("we (self) have no name, yet. Setting a technical default");
            selfPlayerObs.setValue(PLAYER_SELF_ID.substring(PLAYER_PREFIX.length, PLAYER_PREFIX.length + 10));
        }

        if (missing(activePlayerIdObs.getValue())) {
            log.info("there is no one in charge, so we take charge.");
            takeCharge();
        }

    };

    observableGameMap.ensureAllObservableIDs(
        onStartupFinished,
        () => undefined !== selfPlayerObs && // try refresh remote values until observables are available
              undefined !== activePlayerIdObs &&
              undefined !== allPlayerIDsObs
    );


};
