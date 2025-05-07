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
import {Walk}                                        from "../kolibri/sequence/constructors/range/range.js";
import {Scheduler}                                     from "../kolibri/dataflow/dataflow.js";
import {
    active,
    passive,
    POISON_PILL,
    POISON_PILL_VALUE,
    PREFIX_IMMORTAL
} from "../server/S7-manyObs-SSE/remoteObservableMap.js";
import {clientId}                                      from "../kolibri/version.js";
import {LoggerFactory}                               from "../kolibri/logger/loggerFactory.js";
import {projectNewTetronimo}                         from "./tetronimoProjector.js";
import {select}                                      from "../kolibri/util/dom.js";
import {ObservableList}                              from "../kolibri/observable.js";

export {
    startGame, turnShape, movePosition, // for general use outside
    checkAndHandleFullLevel,            // exported only for the unit-testing
    PLAYER_SELF_ID
};

const log = LoggerFactory("ch.fhnw.tetris.gameController");

const TETROMINO_CURRENT = "currentTetronimo";
const PLAYER_ACTIVE     = PREFIX_IMMORTAL + "PLAYER_ACTIVE"; // will never be removed once created
const PLAYER_PREFIX     = "PLAYER-";

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

const PLAYER_SELF_ID = PLAYER_PREFIX + clientId;

/**
 * @type { RemoteObservableType<PlayerNameType | undefined> }
 * The Player record that represents ourselves in the game.
 */
let selfPlayerObs;

/** @type { RemoteObservableType<ActivePlayerIdType | undefined> }
 * foreign key (playerId) to the id of the player that is currently in charge of the game.
 */
let activePlayerIdObs;

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
    if (playerRemoteObs === undefined) {
        log.warn("Cannot find name for active player.");
        return "unknown";
    }
    return playerRemoteObs.getValue().value;
};

/**
 * Whether we are in charge of moving the current tetronimo.
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
    movePosition(moveDown);
    if (isEndOfGame(currentTetrominoObs.getValue(), spaceBoxes)) {
        log.info("The End");// handle the end of the game
        return;
    }
    // re-schedule fall Task
    setTimeout( () => scheduler.add(fallTask), 1 * 1000 );
    done();
};

/**
 * @impure sets the currentTetrominoObs
 */
const handleNewCurrentTetroObsAvailable = (createdTetrominoObs) => {
    currentTetrominoObs = createdTetrominoObs;                      // side effect! put the observable in module scope
};

const monitorActivePlayer = remoteObservable => {
    activePlayerIdObs = remoteObservable;                         // side effect! put the observable in module scope
};

/** @type { () => void } */
const restart = () => {
    // todo: do not allow starting a second time, resp. reset the game
    scheduler.add( fallTask ); // start the game loop
};

/** lazy initialization of the observable map */
let observableGameMap;
let setupFinished = false;

/**
 * @typedef GameControllerType
 * @property { RemoteObservableType<String>    }                             selfPlayerObs
 * @property { RemoteObservableType<String>    }                             activePlayerIdObs
 * @property { RemoteObservableType<Tetronimo> }                             currentTetrominoObs
 * @property { IObservableList<NamedRemoteObservableType<PlayerNameType>> }  playerListObs
 * @property { (String) => String }  getPlayerName
 * @property { () => Boolean } weAreInCharge
 * @property { () => void    } takeCharge
 * @property { () => void    } restart
 */

/**
 * @type { () => GameControllerType }
 */
const newGameController = () => ( { // we need to bind late such that the obs references are set
    selfPlayerObs,
    activePlayerIdObs,
    playerListObs,
    getPlayerName,
    currentTetrominoObs,
    weAreInCharge,
    takeCharge,
    restart,
});


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
        selfPlayerObs.setValue( active(PLAYER_SELF_ID.substring(PLAYER_PREFIX.length, PLAYER_PREFIX.length+10)));
        return;
    }
    // it is someone else
    log.info(`new player ${namedObservable.id}`);
    playerListObs.add(namedObservable);
    namedObservable.observable.onChange( remoteValue => { // centralized handling of removing players
        if (POISON_PILL === remoteValue) {
            playerListObs.del(namedObservable);
        }
    });
};



/**
 * Start the game loop.
 * @param { ObservableMapCtorType        } observableMapCtor  - constructor of an observable map (remote or local)
 * @param { (GameControllerType) => void } afterStartCallback - what to do after start action is finished
 */
const startGame = (observableMapCtor, afterStartCallback) => {

    // will only get called once a new, named Observable becomes available.
    // Lazily setting up the respective local observables when the obsMap notifies
    // us about available named observables
    const onNewNamedObservable = namedObservable => {
        log.info(`new named observable '${namedObservable.id}'`);
        if (namedObservable.id.startsWith(PLAYER_PREFIX)) {
            handleNewPlayer(namedObservable);
            return;
        }
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

    observableGameMap = observableMapCtor(onNewNamedObservable);

    observableGameMap.ensureAllObservableIDs( initialMap => {
        setupFinished = true;

        if (selfPlayerObs) {
            log.debug(`self player obs was created from remote observable`);
        } else {
            log.debug(`as expected, we are not yet represented as a player`);
            observableGameMap.addObservableForID(PLAYER_SELF_ID);
        }

        if (activePlayerIdObs) {
            log.debug(`active player obs was created from remote observable`);
            const activeId = activePlayerIdObs.getValue().value;
            if (undefined === activeId) { // there is no active player
                takeCharge();
            }
        } else {
            log.debug(`no active player obs, creating one and putting ourselves in charge`);
            observableGameMap.addObservableForID(PLAYER_ACTIVE);
            takeCharge();
        }

        if (currentTetrominoObs) {
            log.debug(`current tetronimo was created or will be created from remote observable`);
        } else {
            log.debug(`no current tetronimo obs, creating one`);
            observableGameMap.addObservableForID(TETROMINO_CURRENT);
        }

        afterStartCallback( newGameController() );

        for (const [id, observable] of Object.entries(initialMap) ) {
            onNewNamedObservable( {id, observable} );
        }

        window.onbeforeunload = (_evt) => {
            if (weAreInCharge()) { // if we are in charge while leaving, put someone else in charge
                activePlayerIdObs.setValue(active(knownPlayersBackingList?.at(0)?.id));
            }
            observableGameMap.removeObservableForID(PLAYER_SELF_ID);
        };

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
