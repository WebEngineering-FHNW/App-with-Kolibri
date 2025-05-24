/**
 * @module tetris/game/gameContoller
 * Manages game-wide state and rules.
 * Here is where the game rules are enforced:
 * - what defines a collision
 * - what happens on collision
 * - what moves are allowed
 * - by which rules boxes drop down
 * The effects are communicated by updating box position and publishing
 * newly available tetrominos.
 */

import {
    moveBack, moveDown, moveForw, moveLeft, moveRight,
    normalize, rotateYaw, topplePitch, toppleRoll
}                            from "../shape/shapeController.js";
import {Walk}                from "../../kolibri/sequence/constructors/range/range.js";
import {LoggerFactory}       from "../../kolibri/logger/loggerFactory.js";
import {PlayerController}    from "../player/playerController.js";
import {GameStateController} from "../gameState/gameStateController.js";
import {TetrominoController} from "../tetromino/tetrominoController.js";
import {BoxController}       from "../box/boxController.js";

export {
    GameController
};

const log = LoggerFactory("ch.fhnw.tetris.game.gameController");

/**
 * @typedef GameControllerType
 * @property playerController
 * @property boxController
 * @property tetrominoController
 * @property gameStateController
 * @property startGame
 * @property restart
 */

/**
 * @constructor
 * @param { OMType } om
 * @returns { GameControllerType }
 */
const GameController = om => {

// --- Observable Map centralized access --- --- ---

    const omPublishStrategy = callback => {
        setTimeout( _=> {
            callback();
        },1);
    };

    const checkAndHandleFullLevel = () => {
        const isFull = level => boxController.findAllBoxesWhere(box => box.zPos === level).length >= 7 * 7;
        const level  = [...Walk(12)].findIndex(isFull);
        if (level < 0) {
            return;
        }
        gameStateController.updateScore( score => score * 2);       // on full level, double the score
        boxController.removeBoxesWhere(box => box.zPos === level);  // clear the level
        boxController
            .findAllBoxesWhere(box => box.zPos > level)             // for all boxes above
            .forEach ( box => {
                const updatedBox = {...box, zPos: box.zPos -1};
                boxController.updateBox(updatedBox);
            });
        // there might be more full levels, but give it some time for the cleanup
        setTimeout( _=> {
            checkAndHandleFullLevel();
        },200);
    };

    const onCollision = tetromino => {
        if(! playerController.areWeInCharge()) {        // only the player in charge handles collisions
            return;
        }
        if (tetromino.zPos > 11) {                      // we collide at the very top => end of game
            gameStateController.setFallingDown(false);
            return;
        }
        gameStateController.updateScore( score => score + 4);
        checkAndHandleFullLevel();
        // todo: new upcoming tetro?
        tetrominoController.makeNewCurrentTetromino();
    };

    /**
     * Turns the current tetromino into a new direction if allowed.
     * @collaborator current tetromino and spaceBoxes
     * @impure everything might change.
     * @param { NewShapeType } turnFunction
     */
    const turnShape = turnFunction => {
        const currentTetromino = tetrominoController.getCurrentTetromino();
        if (!currentTetromino) return;
        const oldShape = currentTetromino.shape;
        const newShape = normalize(turnFunction(oldShape));
        const position = {xPos: currentTetromino.xPos, yPos: currentTetromino.yPos, zPos: currentTetromino.zPos};

        const nextBoxPositions = tetrominoController.expectedBoxPositions(newShape, position);

        if (isDisallowedTetroPosition(nextBoxPositions)) {
            return;
        }
        if (willCollide(nextBoxPositions, currentTetromino)) {
            onCollision(currentTetromino);
            return;
        }
        const updatedTetromino = {...currentTetromino, shape: newShape};
        tetrominoController.updateTetromino(updatedTetromino);
    };

    /**
     * Moves the current tetromino to a new position if allowed.
     * @collaborator current tetromino and spaceBoxes
     * @impure everything might change.
     * @param { NewPositionType } moveFunction
     */
    const movePosition = moveFunction => {
        const currentTetromino = tetrominoController.getCurrentTetromino();
        if (!currentTetromino) return;
        const newTetromino = {...currentTetromino}; // we might not actually need a copy, but it's cleaner

        const {x, y, z} = moveFunction({x: currentTetromino.xPos, y: currentTetromino.yPos, z: currentTetromino.zPos});

        const nextBoxPositions = tetrominoController.expectedBoxPositions(currentTetromino.shape, {xPos: x, yPos: y, zPos: z});

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
        tetrominoController.updateTetromino(newTetromino);
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
        if (!gameStateController.isFallingDown()) {
            log.info("falling is stopped");
            return;
        }
        movePosition(moveDown);
        registerNextFallTask();
    };

    const registerNextFallTask = () => setTimeout(fallTask, 1 * 1000);

    const isDisallowedBoxPosition = ({xPos, yPos}) => {
        if (xPos < 0 || xPos > 6) return true;
        if (yPos < 0 || yPos > 6) return true;
        return false;
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
        const otherBoxes = boxController.findAllBoxesWhere( box => box.tetroId !== tetromino.id);

        // a collision is when any two boxes would occupy the same position
        const collides = otherBoxes.some(otherBox => {
            return newBoxPositions.some(newBox => {
                return otherBox.xPos === newBox.xPos &&
                       otherBox.yPos === newBox.yPos &&
                       otherBox.zPos === newBox.zPos;
            });
        });
        return collides;
    };

    /**
     * Key binding for the game (view binding).
     * @collaborators document, game controller, and tetromino controller
     * @impure prevents the key default behavior, will indirectly change the game state and the visualization
     */
    const registerKeyListener = () => {
        document.onkeydown = keyEvt => {    // note: must be on document since not all elements listen for keydown
            if(keyEvt.ctrlKey || keyEvt.metaKey) { return; }  // allow ctrl-alt-c and other dev tool keys
            if(! playerController.areWeInCharge()) {
                playerController.takeCharge();
                return; // we want keystrokes only to be applied after we have become in charge
            }
            if (keyEvt.shiftKey) {
                switch (keyEvt.key) {
                    case "Shift":       break; // ignore the initial shift signal
                    case "ArrowRight":  keyEvt.preventDefault();turnShape(rotateYaw  ); break;
                    case "ArrowLeft":   keyEvt.preventDefault();turnShape(toppleRoll ); break;
                    case "ArrowUp":     keyEvt.preventDefault();turnShape(topplePitch); break;
                    case "ArrowDown":   keyEvt.preventDefault();movePosition(moveDown); break;
                }
            } else {
                switch (keyEvt.key) {
                    case "ArrowLeft":   keyEvt.preventDefault();movePosition(moveLeft ); break;
                    case "ArrowRight":  keyEvt.preventDefault();movePosition(moveRight); break;
                    case "ArrowUp":     keyEvt.preventDefault();movePosition(moveBack ); break;
                    case "ArrowDown":   keyEvt.preventDefault();movePosition(moveForw ); break;
                }
            }
        };
    };


    /** @type { () => void } */
    const restart  = () => {
        playerController   .takeCharge();               // we should already be in charge, but just to be clear
        gameStateController.setFallingDown(false);      // hold on
        tetrominoController.setNoCurrentTetromino();

        // do not proceed before all backing Lists are empty
        const waitForCleanup = () => {
            boxController      .removeBoxesWhere( _box => true); // remove all boxes
            tetrominoController.removeAll();

            const removalsFinished = tetrominoController.isEmpty() && boxController.isEmpty();
            if (removalsFinished) {
                gameStateController.resetGameState();
                tetrominoController.makeNewCurrentTetromino();
                gameStateController.setFallingDown(true);
                registerNextFallTask();                         // proceed
            } else {
                setTimeout(waitForCleanup, 300);
            }
        };
        waitForCleanup();
    };

    const onSetupFinished = () => {
        gameStateController.setup();
        if( ! playerController.isThereAnActivePlayer()) {
            log.info("there is no active player - we take charge");
            // playerController.takeCharge();
        }
        log.info("game ready to go");
    };

    const gameStateController = GameStateController(om, omPublishStrategy);
    const boxController       = BoxController      (om, omPublishStrategy);
    const tetrominoController = TetrominoController(om, omPublishStrategy, boxController);
    const playerController    = PlayerController   (om, omPublishStrategy, onSetupFinished);

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

        afterStartCallback(); // the UI can be bound

        gameStateController.startListening();
        boxController      .startListening();
        tetrominoController.startListening();
        playerController   .startListening();

        registerKeyListener();
    };

    return {
        startGame,
        playerController,
        gameStateController,
        boxController,
        tetrominoController,
        restart,
    }
};
