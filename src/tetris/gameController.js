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

import {moveDown, normalize}                                            from "./tetrominoController.js";
import {shapeNames, shapesByName}                                       from "./shape.js";
import {
    Walk
}                                                                       from "../kolibri/sequence/constructors/range/range.js";
import {clientId}                                                       from "../kolibri/version.js";
import {LoggerFactory}                                                  from "../kolibri/logger/loggerFactory.js";
import {Observable, ObservableList}                                     from "../kolibri/observable.js";
import {Box, GameState, NO_BOX, NO_GAME_STATE, NO_TETROMINO, Tetromino} from "./relationalModel.js";
import {MISSING_FOREIGN_KEY, PREFIX_IMMORTAL}                           from "../extension/relationalModelType.js";
import {PlayerController}                                               from "./player/playerController.js";

export {
    GameController,
    TETROMINO_PREFIX,
    TETROMINO_CURRENT_ID,
    GAME_STATE,
    BOX_PREFIX,
};

const log = LoggerFactory("ch.fhnw.tetris.gameController");

const TETROMINO_PREFIX      = "TETROMINO-";
const TETROMINO_CURRENT_ID  = /** @type { ForeignKeyType } */ PREFIX_IMMORTAL + "TETROMINO_CURRENT_ID"; // will never be removed once created

const GAME_STATE            = /** @type { ForeignKeyType } */ PREFIX_IMMORTAL + "GAME_STATE";

const BOX_PREFIX            = "BOX-";

// --- game controller --- --- --- --- --- --- --- --- --- --- --- --- --- ---

/**
 * @typedef GameControllerType
 * @property playerController
 * @property startGame
 * @property onTetrominoAdded
 * @property onTetrominoRemoved
 * @property onTetrominoChanged
 * @property findTetrominoById
 * @property onCurrentTetrominoIdChanged
 * @property isCurrentTetrominoId
 * @property onBoxAdded
 * @property onBoxRemoved
 * @property onBoxChanged
 * @property onGameStateChanged
 * @property turnShape
 * @property movePosition
 */

/**
 * @constructor
 * @param { OMType } om
 * @returns { GameControllerType }
 */
const GameController = om => {

// --- Observable Map centralized access --- --- ---

    // todo: jsdoc types
    const omSetValue = (key, value) => {
        setTimeout( _=> {
            om.setValue(key,value);
        },1);
    };
    const publish = record => omSetValue(record.id, record);
    const publishReferrer = (referrer, reference) => omSetValue(referrer, reference);

// --- game state --- --- --- --- --- --- --- --- ---

    /** @type { IObservable<GameStateModelType> } */
    let gameStateObs = Observable(NO_GAME_STATE);

    const addToScore = n => {
        const oldGameState = gameStateObs.getValue();
        if(oldGameState.id === MISSING_FOREIGN_KEY) {
            console.error("cannot add to missing game state");
            return;
        }
        const newGameState = /** @type { GameStateModelType } */ {...oldGameState};
        newGameState.score = oldGameState.score + n;
        publish(newGameState);
    };

    const fallingDown = newValue => {
        const oldGameState = gameStateObs.getValue();
        if(oldGameState.id === MISSING_FOREIGN_KEY) {
            console.error("cannot add to missing game state");
            return;
        }
        if (oldGameState.fallingDown === newValue) { // no change, nothing to publish
            return;
        }
        const newGameState       = /** @type { GameStateModelType } */ {...oldGameState};
        newGameState.fallingDown = newValue;
        publish(newGameState);
    };

    const resetGameState = () => {
        publish(GameState(GAME_STATE, false, 0));
    };

// --- game --- --- --- --- --- --- --- --- ---


    const checkAndHandleFullLevel = boxes => {
        const isFull = level => boxes.filter(box => box.zPos === level).length === 7 * 7;
        // const isFull = level => boxes.filter(box => box.zPos === level).length >= 7; // for testing
        const level  = [...Walk(12)].findIndex(isFull);
        if (level < 0) {
            return;
        }

        // update game state to double the score
        const gameState = gameStateObs.getValue();
        const newGameState = {...gameState, score: gameState.score * 2};
        gameStateObs.setValue(newGameState); // to avoid missing updates // todo: think about extra function changeGameState
        publish(newGameState);

        // remove all boxes that are on this level from the boxes and trigger the view update
        const toRemove = boxes.filter(box => box.zPos === level); // remove duplication
        toRemove.forEach( box => {
            setTimeout( _=> {
                om.removeKey(box.id);
            },1)
        });

        // move the remaining higher boxes one level down
        boxes.forEach(box => {
            if (box.zPos > level) {
                const updatedBox = {...box, zPos: box.zPos - 1};
                publish(updatedBox);
            }
        });
        // there might be more full levels, but give it some time for the cleanup
        setTimeout( _=> {
            checkAndHandleFullLevel(boxes);
        },200);
    };

    /**
     * @private util
     * @return { TetrominoModelType }
     */
    const getCurrentTetromino = () => {
        let result = undefined;
        let id     = undefined;
        om.getValue(TETROMINO_CURRENT_ID)                               // find referrer
          ( _ => log.warn("no current tetromino id"))
          ( n => id = n);
        om.getValue(id)                                                 // find reference
          ( _     => log.warn("no tetromino with current id "+id))
          ( tetro => result = tetro);
        return result;
    };

    const onCollision = tetromino => {
        if(! playerController.areWeInCharge()) { // only the player in charge handles collisions
            return;
        }
        if (tetromino.zPos > 11) { // we collide at the very top => end of game
            fallingDown(false);
            return;
        }

        checkAndHandleFullLevel(boxesBackingList);

        // todo: new upcoming tetro?

        addToScore(4);
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

        const nextBoxPositions = expectedBoxPositions(newShape, position);

        if (isDisallowedTetroPosition(nextBoxPositions)) {
            return;
        }
        if (willCollide(nextBoxPositions, currentTetromino)) {
            onCollision(currentTetromino);
            return;
        }
        const newTetromino = {...currentTetromino}; // we might not actually need a copy, but it's cleaner
        newTetromino.shape = newShape;
        publish(newTetromino);

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

        const nextBoxPositions = expectedBoxPositions(currentTetromino.shape, {xPos: x, yPos: y, zPos: z});

        if (isDisallowedTetroPosition(nextBoxPositions)) {
            return;
        }
        if (willCollide(nextBoxPositions, newTetromino)) {
            onCollision(currentTetromino);
            return;
        }
        newTetromino.xPos = x;
        newTetromino.yPos = y;
        newTetromino.zPos = z;
        publish(newTetromino);
    };


    /**
     * @private
     * Principle game loop implementation: let the current tetromino fall down slowly and check for the end of the game.
     */
    const fallTask = () => {
        if (! playerController.areWeInCharge()) {
            log.info("stop falling since we are not in charge");
            return;
        }
        if (!gameStateObs.getValue().fallingDown) {
            log.info("falling is stopped");
            return;
        }
        movePosition(moveDown);
        registerNextFallTask();
    };

    const registerNextFallTask = () => setTimeout(fallTask, 1 * 1000);

    /**
     * @pure calculates the final logical box coordinates
     * @param { TetrominoModelType }    tetromino
     * @param { Number }                boxIndex    - 0..3
     * @return {{ xPos: *, yPos: *, zPos: *}}
     */

    const finalBoxPosition = (tetromino, boxIndex) => {
        const shapePosition  = (tetromino.shape)[boxIndex];
        const xPos           = tetromino.xPos + shapePosition.x;
        const yPos           = tetromino.yPos + shapePosition.y;
        const zPos           = tetromino.zPos + shapePosition.z;
        return {xPos, yPos, zPos};
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
        return [0, 1, 2, 3].map(shapeIndex => finalBoxPosition(shadowTetromino, shapeIndex));
    };

    const isDisallowedTetroPosition = nextBoxPositions => {
        return nextBoxPositions.some(boxPos => isDisallowedBoxPosition(boxPos));
    };

    const willCollide = (nextBoxPositions, tetromino) => {
        const newBoxPositions = nextBoxPositions;
        if (newBoxPositions.some(({zPos}) => zPos < 0)) { // "collision" with the floor
            return true;
        }
        // get all the other "non-moving" boxes, which is all boxes except the ones of the moving tetro
        const otherBoxes = boxesBackingList.filter( box => box.tetroId !== tetromino.id);

        // a collision is when any two boxes would occupy the same position
        const collides = otherBoxes.some(otherbox => {
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
     * @return {BoxModelType}
     */
    const findBox = (tetroId, boxIndex) => {
        const boxId = BOX_PREFIX + tetroId + "-" + boxIndex;
        return boxesBackingList.find(({id}) => id === boxId);
    };

    /** @type { () => void } */
    const restart  = () => {
        playerController.takeCharge(); // we should already be in charge, but just to be clear
        fallingDown(false);
        publishReferrer(TETROMINO_CURRENT_ID, MISSING_FOREIGN_KEY);  // no current tetro while we clean up

        // do not proceed before all backing Lists are empty
        const waitForCleanup = () => {
            const stillToDelete = boxesBackingList.length +  tetrominoBackingList.length;
            log.info(`still to delete: ${stillToDelete}`);

            boxesBackingList.forEach( box => {
                setTimeout(_=> {
                    om.removeKey(box.id);
                },1);
            });
            tetrominoBackingList.forEach( tetromino => {
                setTimeout(_=> {
                    om.removeKey(tetromino.id);
                },1);
            });

            if (stillToDelete > 0) {
                setTimeout( waitForCleanup, 300); // todo shorter delay for next call, todo: support bulk deletion
            } else {
                resetGameState();
                makeNewCurrentTetromino();
                fallingDown(true);
                registerNextFallTask();
            }

        };
        waitForCleanup();
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

    const findTetrominoById = tetroId => {
        return tetrominoBackingList.find( it => it.id === tetroId);
    };

    const handleTetrominoUpdate = tetromino => {
        publishUpdatedBoxPositions(tetromino);

        const knownTetroIndex = tetrominoBackingList.findIndex( it => it.id === tetromino.id);
        if (knownTetroIndex >= 0) {
            tetrominoBackingList[knownTetroIndex] = tetromino;
            tetrominoChangedObs.setValue(tetromino);
            return;
        }
        log.info(`new tetromino: ${JSON.stringify(tetromino)}`);
        tetrominoListObs.add(tetromino);
    };

    let runningNum  = 0;
    const makeNewCurrentTetromino = () => {
        const shapeName = shapeNames[Math.floor(Math.random() * shapeNames.length)];
        const shape     = shapesByName[shapeName];
        const tetroId   = /** @type { ForeignKeyType } */ TETROMINO_PREFIX + clientId + "-" + (runningNum++);
        const tetromino =  Tetromino({id:tetroId, shapeName, shape, xPos:0, yPos:0, zPos:12});
        publish(tetromino);

        [0, 1, 2, 3].map( boxIndex => {
            const boxId  = /** @type { ForeignKeyType } */ BOX_PREFIX + tetroId + "-" + boxIndex;
            const box    = Box({id:boxId, tetroId, xPos:0, yPos:0, zPos:12 });
            publish(box);
        });
        publishReferrer(TETROMINO_CURRENT_ID, tetroId);
    };

    const publishUpdatedBoxPositions = tetromino => {
        const boxes = [0, 1, 2, 3].map( n => findBox(tetromino.id, n));
        if (boxes.some( box => box === undefined)){ // not all boxes ready for update
            return;
        }
        [0, 1, 2, 3]
            .map(n => ({...boxes[n], ...finalBoxPosition(tetromino, n)}))
            .forEach(publish);
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
        const knownBoxIndex = boxesBackingList.findIndex(it => it.id === box.id);
        if (knownBoxIndex >= 0) {
            boxesBackingList[knownBoxIndex] = box;
            boxChangedObs.setValue(box);
            return;
        }
        log.debug(`new box: ${JSON.stringify(box)}`);
        boxesListObs.add(box);
        const tetromino = tetrominoBackingList.find( tetro => tetro.id === box.tetroId);
        if ( tetromino ) {
            publishUpdatedBoxPositions(tetromino);
        } else {
            log.warn("cannot find tetro for box");
        }
    };

    const onSetupFinished = () => {
        log.info("technical setup finished");

        if(gameStateObs.getValue().id === MISSING_FOREIGN_KEY) {
            log.info("we are the first user - creating game state");
            publish(GameState(GAME_STATE, false, 0));
        }

        if( ! playerController.isThereAnActivePlayer()) {
            log.info("there is no active player - we take charge");
            playerController.takeCharge();
        }

        log.info("game setup finished");
    };

    const playerController = PlayerController(om, omSetValue, onSetupFinished);

    playerController.onWeHaveBecomeActive( _ => {
        registerNextFallTask();  // we are now responsible for keeping the fall task alive
    });


    /**
     * Start the game loop.
     * @param { () => void } afterStartCallback - what to do after start action is finished
     */
    const startGame = (afterStartCallback) => {

        // clean up when leaving (as good as possible - not 100% reliable)
        window.onbeforeunload = (_evt) => {
            playerController.leave();
        };

        playerController.registerSelf();

        afterStartCallback(); // all observables are set up, the UI can be bound

        playerController.startListening();

        om.onKeyRemoved( key => {
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
        });
        om.onChange( (key,value) => {
            if (GAME_STATE === key) {
                gameStateObs.setValue(value);
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
        });


    };


    return {
        startGame,
        playerController,
        onTetrominoAdded            : tetrominoListObs.onAdd,
        onTetrominoRemoved          : tetrominoListObs.onDel,
        onTetrominoChanged          : tetrominoChangedObs.onChange,
        findTetrominoById,
        onCurrentTetrominoIdChanged : tetrominoCurrentIdObs.onChange,
        isCurrentTetrominoId        : id => id === tetrominoCurrentIdObs.getValue(),
        onBoxAdded                  : boxesListObs.onAdd,
        onBoxRemoved                : boxesListObs.onDel,
        onBoxChanged                : boxChangedObs.onChange,
        onGameStateChanged          : gameStateObs.onChange,
        restart,
        turnShape,
        movePosition,
    }
};
