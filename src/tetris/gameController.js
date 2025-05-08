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

import {disallowed, intersects, moveDown, normalize} from "./tetrominoController.js";
import {shapesByName, Tetronimo}                     from "./model.js";
import {
    Walk
}                                                    from "../kolibri/sequence/constructors/range/range.js";
import {Scheduler}                                   from "../kolibri/dataflow/dataflow.js";
import {
    active,
    MISSING_FOREIGN_KEY,
    passive,
    POISON_PILL,
    PREFIX_IMMORTAL
}                                                    from "../server/S7-manyObs-SSE/remoteObservableMap.js";
import {clientId}                                    from "../kolibri/version.js";
import {LoggerFactory}                               from "../kolibri/logger/loggerFactory.js";
import {ObservableList}                              from "../kolibri/observable.js";

export {
    startGame, turnShape, movePosition, // for general use outside
    checkAndHandleFullLevel,            // exported only for the unit-testing
    TETROMINO_PREFIX,
    TETROMINO_CURRENT_ID,               // todo: think about retrieving this info from the current boxes
    BOX_PREFIX,
    PLAYER_SELF_ID,
    PLAYER_ACTIVE_ID,
    PLAYER_PREFIX,
};

const log = LoggerFactory("ch.fhnw.tetris.gameController");

const TETROMINO_PREFIX     = "TETROMINO-";
const TETROMINO_CURRENT_ID = PREFIX_IMMORTAL + "TETROMINO_CURRENT_ID"; // will never be removed once created

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



// --- game --- --- --- --- --- --- --- --- ---

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
    tetrominoCurrentIdObs.setValue(undefined);                // make room for new tetro
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
 * When a tetromino gets a new shape as the result of user input, we have to check the possible results of that move
 * and adapt, according to the game rules.
 * @impure everything might change.
 * @param { RemoteValueType<TetronimoType> } tetromino  - target
 * @param { ShapeType }                      newShape   - that new shape that might be applied to the target
 * @param { Array<BoxType>}                  spaceBoxes - environment
 */
const turnShapeImpl = (tetromino, newShape, spaceBoxes) => {
    newShape              = normalize(newShape);
    const shadowTetromino = /** @type { RemoteValueType<TetronimoType> } */ passive(Tetronimo(0, -1));
    shadowTetromino.value.setShape(newShape);
    shadowTetromino.value.setPosition(tetromino.value.getPosition());
    if (disallowed(shadowTetromino)) {
        return;
    }
    if (intersects(shadowTetromino, spaceBoxes)) {
        handleCollision(tetromino, spaceBoxes);
    } else {
        tetromino.value.setShape(newShape);
    }
};
/**
 * When a tetromino gets a new position as the result of user input or time,
 * we have to check the possible results of that move
 * and adapt according to the game rules.
 * @impure everything might change.
 * @param { RemoteValueType<TetronimoType> }    tetromino   - target
 * @param { Position3dType }                    newPosition - that new shape that might be applied to the target
 * @param { Array<BoxType>}                     spaceBoxes  - environment
 */
const movePositionImpl = (tetromino, newPosition, spaceBoxes) => {
    const shadowTetromino = /** @type { RemoteValueType<TetronimoType> } */ passive(Tetronimo(0, -1));
    shadowTetromino.value.setShape(tetromino.value.getShape());
    shadowTetromino.value.setPosition(newPosition);
    if (disallowed(shadowTetromino)) {
        return;
    }
    if (intersects(shadowTetromino, spaceBoxes)) {
        handleCollision(tetromino, spaceBoxes);
    } else {
        tetromino.value.setPosition(newPosition);
    }
};

/**
 * @private
 * @return {{currentTetrominoObs: RemoteObservableType<TetrominoModelType>, currentTetromino: TetrominoModelType}}
 */
const getCurrentTetrominoRefs = () => {
    const currentTetrominoId            = tetrominoCurrentIdObs.getValue().value;
    const currentTetrominoNamedValue    = tetrominoBackingList.find(({id}) => id === currentTetrominoId);
    const currentTetrominoObs           = currentTetrominoNamedValue.observable;
    const currentTetromino              = currentTetrominoObs.getValue().value;
    return {currentTetrominoObs, currentTetromino};
};


/**
 * Turns the current tetromino into a new direction if allowed.
 * @collaborator current tetromino and spaceBoxes
 * @impure everything might change.
 * @param { NewShapeType } turnFunction
 */
const turnShape = turnFunction => {

    const {currentTetrominoObs, currentTetromino} = getCurrentTetrominoRefs();
    const oldShape = currentTetromino.shape;

    const newShape = turnFunction(oldShape);

    const newTetromino = { ...currentTetromino }; // we might not actually need a copy, but it's cleaner
    newTetromino.shape = newShape;

    // todo: collision check

    currentTetrominoObs.setValue(active(newTetromino));

};


/**
 * Moves the current tetromino to a new position if allowed.
 * @collaborator current tetromino and spaceBoxes
 * @impure everything might change.
 * @param { NewPositionType } moveFunction
 */
const movePosition = moveFunction => {
    const {currentTetrominoObs, currentTetromino} = getCurrentTetrominoRefs();
    const newTetromino = { ...currentTetromino }; // we might not actually need a copy, but it's cleaner

    const {x,y,z} = moveFunction( {x:currentTetromino.xPos, y:currentTetromino.yPos, z:currentTetromino.zPos}  );

    newTetromino.xPos = x ; // todo: (collision check?)
    newTetromino.yPos = y ; // todo: (collision check?)
    newTetromino.zPos = z ; // todo: (collision check?)

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
 * @param { () => void } done - callback when one iteration is done
 */
const fallTask = done => {
    if (! weAreInCharge()) { return; }
    movePosition(moveDown);
    // if (isEndOfGame(tetrominoCurrentIdObs.getValue(), spaceBoxes)) {
    //     log.info("The End");// handle the end of the game
    //     return;
    // }
    // re-schedule fall Task
    setTimeout( () => scheduler.add(fallTask), 1 * 1000 );
    done();
};

let runningNum = 0;
/** @type { () => void } */
const restart              = () => {

    // unset the current boxes and remove all boxes
    boxesBackingList.forEach( ({id}) => observableGameMap.removeObservableForID(id));

    // unset the current tetro and remove all tetros
    tetrominoCurrentIdObs.setValue(active(MISSING_FOREIGN_KEY));
    tetrominoBackingList.forEach( ({id}) => observableGameMap.removeObservableForID(id));

    // todo: reset game state, points, rewards, ... (if any)

    // create a new pristine tetro to start with

    runningNum++;
    const newTetroId = TETROMINO_PREFIX + clientId + "-" + (runningNum++);
    observableGameMap.addObservableForID(newTetroId);
    const newTetroObs = tetrominoBackingList.find( ({id}) => id === newTetroId)?.observable;

    const startShape = shapesByName["branch"]; // todo: random shape on new tetro
    const startTetrominoValue = {shapeName: "branch", shape: startShape, xPos: 0, yPos: 0, zPos: 0};// todo: start at zPos 12
    newTetroObs.setValue(active(startTetrominoValue ));

    // create four boxes for the new tetro
    [0,1,2,3].forEach( boxIndex => {
        const newBoxId = BOX_PREFIX + newTetroId+ "-" + boxIndex;
        observableGameMap.addObservableForID(newBoxId);
        const newBoxObs = boxesBackingList.find( ({id}) => id === newBoxId )?.observable;
        const startBox = updatedBoxValue(newTetroId, startTetrominoValue, boxIndex);
        newBoxObs.setValue( active(startBox) );
    });

    // set the current tetro id
    tetrominoCurrentIdObs.setValue( active(newTetroId));

    // todo: enable when checks are enabled
    // scheduler.add( fallTask ); // start the game loop
};


// --- store remote observables in local references  --- --- --- --- --- --- --- --- ---

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
    log.debug("tetro changed " + tetromino);
    const getBoxNamedObs = index => {
        const boxId = BOX_PREFIX + tetroId + "-" + index;
        return boxesBackingList.find(({id}) => id === boxId);
    };
    [0, 1, 2, 3].forEach (boxIndex => {
        const boxNamedObs = getBoxNamedObs(boxIndex);
        if (!boxNamedObs) {
            log.debug(`cannot find box ${boxIndex} for tetro ${tetroId}. (can happen when tetro is added before its boxes)`);
            return;
        }
        const box = boxNamedObs.observable.getValue().value;
        if (!box) {
            // this can happen in the rare case where the box was already added but the value not yet set
            log.warn(`box has no value (should happen very rarely) ${boxIndex} ${tetroId}`);
            return;
        }
        /** @type { BoxModelType } */ const newBox = updatedBoxValue(tetroId, tetromino, boxIndex);
        log.debug("new " + newBox);

        // we reach this part only when the boxes are still "linked"
        // which means we only have to update our box observables locally (while the tetro is updated remotely)
        boxNamedObs.observable.setValue(passive(newBox)); // todo: not sure about being passive here

    });
};

//
//
//
//
//
//
//
//

const handleNewTetromino = namedObservable => {
    // todo: special handling if it is (or becomes) the current tetro?
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
        /** @type { BoxModelType } */ const box = remoteValue?.value;
        if (!box) {
            log.debug("box value not yet set (happens at startup) "+namedObservable.id);
            return;
        }
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
    if (namedObservable.id === PLAYER_ACTIVE_ID) {
        activePlayerIdObs = namedObservable.observable;
        activePlayerIdObs.onChange( ({value}) => {
            if (MISSING_FOREIGN_KEY === value) {
                takeCharge();
            }
        });
        return;
    }
    // lazy init of local storage is a side effect and depends on timing
    // it should be safe to set the local references multiple times to the same remote observable
    switch (namedObservable.id) {
        case TETROMINO_CURRENT_ID:  tetrominoCurrentIdObs   = namedObservable.observable;break;
        default:
            log.warn(`unknown named observable with id:${namedObservable.id}`);
    }

};

// --- game controller --- --- --- --- --- --- --- --- --- --- --- --- --- ---

/**
 * @typedef GameControllerType
 * @property { RemoteObservableType<String>    }                                selfPlayerObs
 * @property { RemoteObservableType<String>    }                                activePlayerIdObs
 * @property { RemoteObservableType<Tetronimo> }                                tetrominoCurrentIdObs
 * @property { IObservableList<NamedRemoteObservableType<TetrominoModelType>> } tetrominoListObs
 * @property { IObservableList<NamedRemoteObservableType<BoxModelType>> }       boxesListObs
 * @property { IObservableList<NamedRemoteObservableType<PlayerNameType>> }     playerListObs
 * @property { (String) => String }  getPlayerName
 * @property { () => Boolean } weAreInCharge
 * @property { () => void    } takeCharge
 * @property { () => void    } restart
 */

/**
 * @constructor
 * @returns { GameControllerType }
 */
const GameController = () => ( { // we need to bind late such that the obs references are set
    tetrominoCurrentIdObs,
    tetrominoListObs,
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
