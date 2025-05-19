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
import {MISSING_FOREIGN_KEY, PREFIX_IMMORTAL}                    from "../server/S7-manyObs-SSE/remoteObservableMap.js"; // todo: clean import
import {clientId}                                                from "../kolibri/version.js";
import {LoggerFactory}                                           from "../kolibri/logger/loggerFactory.js";
import {Observable, ObservableList}                              from "../kolibri/observable.js";
import {Box, NO_BOX, NO_PLAYER, NO_TETROMINO, Player, Tetromino} from "./relationalModel.js";

export {
    GameController,
    TETROMINO_PREFIX,
    TETROMINO_CURRENT_ID,
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

// --- game controller --- --- --- --- --- --- --- --- --- --- --- --- --- ---

/**
 * @typedef GameControllerType
 * @property startGame
 * @property onPlayerAdded
 * @property onPlayerRemoved
 * @property onPlayerChanged
 * @property setPlayerChanged
 * @property onActivePlayerIdChanged
 * @property onTetrominoAdded
 * @property onTetrominoRemoved
 * @property onTetrominoChanged
 * @property onCurrentTetrominoIdChanged
 * @property onBoxAdded
 * @property onBoxRemoved
 * @property onBoxChanged
 * @property areWeInCharge
 * @property takeCharge
 * @property getPlayerName
 * @property turnShape
 * @property movePosition
 */

/**
 * @constructor
 * @param { OMType } om
 * @returns { GameControllerType }
 */
const GameController = om => {

// --- game state --- --- --- --- --- --- --- --- ---

    /** @type { MappedObservableType<GameStateModelType> } */
    let gameStateObs;

    /** @type { GameStateModelType } */
    const initialGameState = {fallingDown: false, score: 0};

    const currentOrInitialGameState = () => gameStateObs?.getValue() ?? initialGameState;

    const addToScore = n => {
        const oldGameState = currentOrInitialGameState();
        const newGameState = /** @type { GameStateModelType } */ {...oldGameState};
        newGameState.score = oldGameState.score + n;
        gameStateObs.setValue(newGameState);
    };

    const fallingDown = newValue => {
        const oldGameState       = currentOrInitialGameState();
        const newGameState       = /** @type { GameStateModelType } */ {...oldGameState};
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
        const isFull = level => spaceBoxes.filter(box => box.getValue().z === level).length === 7 * 7;
        const level  = [...Walk(12)].findIndex(isFull);
        if (level < 0) {
            return;
        }

        // remove all boxes that are on this level from the spaceBoxes and trigger the view update
        const toRemove = spaceBoxes.filter(box => box.getValue().z === level); // remove duplication
        toRemove.forEach(box => {
            spaceBoxes.removeItem(box);
            box.setValue({x: -1, y: -1, z: -1}); // will trigger listeners (e.g., the view) to self-remove
        });

        // move the remaining higher boxes one level down
        spaceBoxes.forEach(box => {
            const pos = box.getValue();
            if (pos.z > level) {
                box.setValue(moveDown(pos));
            }
        });
        // there might be more full levels
        checkAndHandleFullLevel(spaceBoxes);
    };

    /**
     * @private util
     * @return { TetrominoModelType }
     */
    const getCurrentTetromino = () => {
        let result = undefined;
        let id = undefined;
        om.getValue(TETROMINO_CURRENT_ID)
          ( _ => console.warn("no current tetromino id"))
          ( n => id = n);
        if (id) {
            om.getValue(id)
              ( _     => console.warn("no tetromino with current id "+id))
              ( tetro => result = tetro);
        }
        return result;
    };

    const onCollision = tetromino => {
        console.warn("onCollision");
        if(!areWeInCharge()) {
            return;
        }

        if (tetromino.zPos > 11) {
            fallingDown(false);
        }

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
        const currentTetromino = getCurrentTetromino();
        if (!currentTetromino) return;
        const oldShape = currentTetromino.shape;

        const newShape = normalize(turnFunction(oldShape));
        const position = {xPos: currentTetromino.xPos, yPos: currentTetromino.yPos, zPos: currentTetromino.zPos};

        if (isDisallowedTetroPosition(newShape, position)) {
            return;
        }
        if (willCollide(newShape, position, currentTetromino.id)) {
            onCollision(currentTetromino);
            return;
        }
        const newTetromino = {...currentTetromino}; // we might not actually need a copy, but it's cleaner
        newTetromino.shape = newShape;
        omSetValue(newTetromino.id, newTetromino);

    };

    /**
     * Moves the current tetromino to a new position if allowed.
     * @collaborator current tetromino and spaceBoxes
     * @impure everything might change.
     * @param { NewPositionType } moveFunction
     */
    const movePosition = moveFunction => {
        const currentTetromino = getCurrentTetromino();
        if (!currentTetromino) return;
        const newTetromino = {...currentTetromino}; // we might not actually need a copy, but it's cleaner

        const {x, y, z} = moveFunction({x: currentTetromino.xPos, y: currentTetromino.yPos, z: currentTetromino.zPos});

        if (isDisallowedTetroPosition(currentTetromino.shape, {xPos: x, yPos: y, zPos: z})) {
            return;
        }
        if (willCollide(currentTetromino.shape, {xPos: x, yPos: y, zPos: z}, newTetromino.id)) {
            onCollision(currentTetromino);
            return;
        }
        newTetromino.xPos = x;
        newTetromino.yPos = y;
        newTetromino.zPos = z;
        omSetValue(newTetromino.id, newTetromino);
    };

    const omSetValue = (key, value) => {
        setTimeout( _=> {
            om.setValue(key,value);
        },1);
    }

    /**
     * @private
     * Principle game loop implementation: let the current tetromino fall down slowly and check for the end of the game.
     */
    const fallTask = () => {
        // todo: what if activePlayerId is initial or unknownFK
        if (!(activePlayerIdObs?.getValue() && weAreInCharge())) { // the active player is known and it is not ourselves
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

    const registerNextFallTask = () => setTimeout(fallTask, 1 * 1000);

    /**
     * @pure calculates the final logical box coordinates
     * @param { ForeignKeyType }        tetroId
     * @param { TetrominoModelType }    tetromino
     * @param { Number }                boxIndex    - 0..3
     * @return { BoxModelType }
     */
    const updatedBoxValue = (tetroId, tetromino, boxIndex) => {
        const boxShapeOffset = (tetromino.shape)[boxIndex];
        const xPos           = tetromino.xPos + boxShapeOffset.x;
        const yPos           = tetromino.yPos + boxShapeOffset.y;
        const zPos           = tetromino.zPos + boxShapeOffset.z;
        return {tetroId, xPos, yPos, zPos};
    };

    const isDisallowedBoxPosition = ({xPos, yPos}) => {
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
        return expectedBoxPositions(shape, position).some(boxPos => isDisallowedBoxPosition(boxPos));
    };

    const willCollide = (shape, position, currentTetrominoId) => {
        const newBoxPositions = expectedBoxPositions(shape, position);
        if (newBoxPositions.some(({zPos}) => zPos < 0)) { // below the floor
            return true;
        }
        const nonCurrentTetroBoxes = boxesBackingList.filter( box => box.tetroId !== currentTetrominoId);

        // get all the current box positions but without the current tetro
        const collides = nonCurrentTetroBoxes.some(otherbox => {
            return newBoxPositions.some(newBox => {
                return otherbox.xPos === newBox.xPos &&
                       otherbox.yPos === newBox.yPos &&
                       otherbox.zPos === newBox.zPos;
            });
        });
        return collides;
    };

    /**
     * @private util
     * @return {MappedObservableType<BoxModelType>}
     */
    const findBox = (tetroId, boxIndex) => {
        const boxId = BOX_PREFIX + tetroId + "-" + boxIndex;
        return boxesBackingList.find(({id}) => id === boxId);
    };




    /** @type { () => void } */
    const restart  = () => {

        takeCharge();

        makeNewCurrentTetromino(); // todo: just for kicks

        // fallingDown(false);

        // // do not proceed before all backing Lists are empty
        // // todo: disable all user input and show cleanup state
        // const waitForCleanup = () => {
        //     const stillToDelete = boxesBackingList.length +  tetrominoBackingList.length;
        //     log.info(`still to delete: ${stillToDelete}`);
        //
        //     // remove all boxes
        //     boxesBackingList.forEach(namedObs => {
        //         observableGameMap.removeObservableForID(namedObs.id);
        //     });
        //
        //     // remove all tetros
        //     tetrominoCurrentIdObs.setValue(MISSING_FOREIGN_KEY);
        //     tetrominoBackingList.forEach( namedObs => {
        //         observableGameMap.removeObservableForID(namedObs.id);
        //     });
        //
        //     if (stillToDelete > 0) {
        //         setTimeout( waitForCleanup, 500); // todo shorter delay for next call, todo: support bulk deletion
        //     } else {
        //         // end of disabled state
        //         resetGameState();
        //         makeNewCurrentTetromino();
        //         fallingDown(true);
        //         registerNextFallTask();
        //     }
        // };
        // waitForCleanup();
    };


    // --- players --- --- --- --- --- --- --- --- ---

    /**
     * @private
     */
    const knownPlayersBackingList = [];
    /** This is a local observable list to model the list of known players.
     *  Each entry is a remotely observable player name, such that we can change
     *  the name in place.
     * @type {IObservableList<PlayerType>}
     */
    const playerListObs = ObservableList(knownPlayersBackingList);

    /** publish all player value changes
     * @type {IObservable<PlayerType>} */
    const playerChangeObs = Observable(NO_PLAYER);

    /**
     * handle that a potentially new player has joined.
     * We maintain an observable list of known players.
     * @impure updates the playerListObs
     */
    const handlePlayerUpdate = player => {
        if (knownPlayersBackingList.find( it => it.id === player.id)) {
            playerChangeObs.setValue(player);
            return;
        }
        log.info(`player joined: ${JSON.stringify(player)}`);
        playerListObs.add(player);
    };

    /** @type { IObservable<ActivePlayerIdType> }
     * foreign key (playerId) to the id of the player that is currently in charge of the game.
     */
    const activePlayerIdObs = Observable(MISSING_FOREIGN_KEY);

    /**
     * Whether we are in charge of moving the current tetromino.
     * @type { () => Boolean }
     * NB: when joining as a new player, the value might not yet be present,
     * but we are, of course, not in charge in that situation.
     */
    const areWeInCharge = () => activePlayerIdObs.getValue() === PLAYER_SELF_ID;

    /**
     * @impure puts us in charge and notifies all (remote) listeners.
     * @warn assumes that {@link activePlayerIdObs} is available
     * @type { () => void }
     */
    const takeCharge = () => omSetValue(PLAYER_ACTIVE_ID, PLAYER_SELF_ID );

    const getPlayerName = (playerId) => {
        let result;
        om.getValue(playerId)
          (_=> result = "n/a")
          (player => result = player.name);
        return result;
    };


    // --- tetrominos --- --- --- --- --- --- --- --- ---

    /** @type { Array<TetrominoModelType> } */
    const tetrominoBackingList = [];

    /** @type {IObservableList<TetrominoModelType>} */
    const tetrominoListObs = ObservableList( tetrominoBackingList );

    /** publish all tetromino changes
     * @type { IObservable<TetrominoModelType>} */
    const tetrominoChangedObs = Observable(NO_TETROMINO);

    /** @type { IObservable<ForeignKeyType> }
    * The current tetromino is the one that the player can control with the arrow keys and that falls down
    * at a given rate (1 s). When it collides, a new one gets created and becomes the current tetromino.
    * Observable to keep the projected views separate from the controller.
    * The value is undefined before any player has started the game.
    */
    let tetrominoCurrentIdObs = Observable(MISSING_FOREIGN_KEY);

    const handleTetrominoUpdate = tetromino => {
        // todo: find boxes and set their position
        updateBoxPositions(tetromino);

        if (tetrominoBackingList.find( it => it.id === tetromino.id)) {
            tetrominoChangedObs.setValue(tetromino);
            return;
        }
        log.info(`new tetromino: ${JSON.stringify(tetromino)}`);
        tetrominoListObs.add(tetromino);
    };

    let runningNum  = 0;
    const makeNewCurrentTetromino = () => {
        // addToScore(4); // todo: add game state

        const shapeName = shapeNames[Math.floor(Math.random() * shapeNames.length)];
        const shape     = shapesByName[shapeName];
        const tetroId   = TETROMINO_PREFIX + clientId + "-" + (runningNum++);

        const tetromino = Tetromino({id:tetroId, shapeName, shape, xPos:0, yPos:0, zPos:0});

        omSetValue(tetroId, tetromino);

        [0, 1, 2, 3].map( boxIndex => {
            const boxId  = BOX_PREFIX + tetroId + "-" + boxIndex;
            const box = Box({id:boxId, tetroId, xPos:0, yPos:0, zPos:0 });
            omSetValue(boxId, box);
        });

        omSetValue(TETROMINO_CURRENT_ID, tetroId);
    };

    const updateBoxPositions = tetromino => {
        const boxes = [0,1,2,3].map( n => findBox(tetromino.id, n));
        if (boxes.some( box => box === undefined)){// not all boxes ready for update
            return;
        }
        let n = 0;
        boxes.forEach( box => {
            const updatedBox = { ...box, ...updatedBoxValue(tetromino.id, tetromino, n++)};
            // if (
            //     box.xPos !== updatedBox.xPos ||
            //     box.yPos !== updatedBox.yPos ||
            //     box.zPos !== updatedBox.zPos ) { // only if there is a real change, publish it
                omSetValue(box.id, updatedBox);
            // }
        });
    };

    // --- boxes --- --- --- --- --- --- --- --- --- ---

    /** @type { Array<BoxModelType> }
     * Contains all the boxes that live in our 3D space after they have been unlinked from their tetromino
     * such that they can fall and disappear independently.
     * We maintain them separately because they are needed for detection and handling of collisions.
     */
    const boxesBackingList = [];

    /**
     * Decorator. Making the list of space boxes observable.
     * @type {IObservableList<BoxModelType>}
     */
    const boxesListObs= ObservableList( boxesBackingList );

    /** publish all box changes
     * @type {IObservable<BoxModelType>}
     */
    const boxChangedObs = Observable(NO_BOX);

    const handleBoxUpdate = box => {
        if (boxesBackingList.find( it => it.id === box.id)) {
            boxChangedObs.setValue(box);
            return;
        }
        log.debug(`new box: ${JSON.stringify(box)}`);
        boxesListObs.add(box);
        const tetromino = tetrominoBackingList.find( tetro => tetro.id === box.tetroId);
        if ( tetromino ) {
            updateBoxPositions(tetromino);
        } else {
            log.warn("cannot find tetro for box");
        }
    };



    /**
     * Start the game loop.
     * @param { () => void } afterStartCallback - what to do after start action is finished
     */
    const startGame = (afterStartCallback) => {


        // clean up when leaving (as good as possible - not 100% reliable)
        window.onbeforeunload = (_evt) => {
            if (areWeInCharge()) { // if we are in charge while leaving, put someone else in charge
                activePlayerIdObs.setValue(knownPlayersBackingList.at(0)?.id ?? MISSING_FOREIGN_KEY); // todo: do not pick ourselves
            }
            om.removeKey(PLAYER_SELF_ID);
        };

        // make ourselves known to the crowd
        omSetValue(PLAYER_SELF_ID, Player(PLAYER_SELF_ID, PLAYER_SELF_ID.slice(-7) ) );


        afterStartCallback(); // all observables are set up, the UI can be bound

        om.onKeyRemoved( key => {
            if (key.startsWith(PLAYER_PREFIX)){
                const player = knownPlayersBackingList.find( it => it.id === key);
                playerListObs.del(player);
                return;
            }
            if (key.startsWith(TETROMINO_PREFIX)){
                const tetromino = tetrominoBackingList.find( it => it.id === key);
                tetrominoListObs.del(tetromino);
                return;
            }
            if (key.startsWith(BOX_PREFIX)){
                const box = boxesBackingList.find( it => it.id === key);
                boxesListObs.del(box);
                return;
            }
            log.warn(`unhandled remove key ${key} `);
        });
        om.onChange( (key,value) => {
            if (key.startsWith(PLAYER_PREFIX)){
                handlePlayerUpdate(value);
                return;
            }
            if (PLAYER_ACTIVE_ID === key){
                activePlayerIdObs.setValue(value); // value is the id
                return;
            }
            if (key.startsWith(TETROMINO_PREFIX)){
                handleTetrominoUpdate(value);
                return;
            }
            if (TETROMINO_CURRENT_ID === key){
                tetrominoCurrentIdObs.setValue(value); // value is the id
                return;
            }
            if (key.startsWith(BOX_PREFIX)){
                handleBoxUpdate(value);
                return;
            }
            log.warn(`unhandled change key ${key} value ${value}`);
        });


    };

    return {
        startGame,
        onPlayerAdded               : playerListObs.onAdd,
        onPlayerRemoved             : playerListObs.onDel,
        onPlayerChanged             : playerChangeObs.onChange,
        setPlayerChanged            : player => omSetValue(player.id, player), // om is the master
        onActivePlayerIdChanged     : activePlayerIdObs.onChange,
        onTetrominoAdded            : tetrominoListObs.onAdd,
        onTetrominoRemoved          : tetrominoListObs.onDel,
        onTetrominoChanged          : tetrominoChangedObs.onChange,
        onCurrentTetrominoIdChanged : tetrominoCurrentIdObs.onChange,
        onBoxAdded                  : boxesListObs.onAdd,
        onBoxRemoved                : boxesListObs.onDel,
        onBoxChanged                : boxChangedObs.onChange,
        areWeInCharge,
        takeCharge,
        getPlayerName,
        restart,
        turnShape,
        movePosition,
    }
};
