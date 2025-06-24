/**
 * @module tetris/tetrominoContoller
 */

import {shapeNames, shapesByName}             from "../shape/shapeModel.js";
import {clientId}                             from "../../kolibri/version.js";
import {LoggerFactory}                        from "../../kolibri/logger/loggerFactory.js";
import {Observable, ObservableList}           from "../../kolibri/observable.js";
import {NO_TETROMINO, Tetromino}              from "./tetrominoModel.js";
import {MISSING_FOREIGN_KEY, PREFIX_IMMORTAL} from "../../extension/relationalModelType.js";
import {BOX_PREFIX}                           from "../box/boxController.js";
import {Box}                                  from "../box/boxModel.js";

export {
    TetrominoController,
    TETROMINO_PREFIX,
    TETROMINO_CURRENT_ID,
};

const log = LoggerFactory("ch.fhnw.tetris.tetromino.tetrominoController");

const TETROMINO_PREFIX      = "TETROMINO-";
const TETROMINO_CURRENT_ID  = /** @type { ForeignKeyType } */ PREFIX_IMMORTAL + "TETROMINO_CURRENT_ID"; // will never be removed once created


/**
 * @typedef TetrominoControllerType
 * @property startListening
 * @property onTetrominoAdded
 * @property onTetrominoRemoved
 * @property onTetrominoChanged
 * @property findTetrominoById
 * @property onCurrentTetrominoIdChanged
 * @property isCurrentTetrominoId
 * @property updateTetromino
 * @property expectedBoxPositions
 * @property makeNewCurrentTetromino
 * @property getCurrentTetromino
 * @property setNoCurrentTetromino
 * @property isEmpty
 * @property removeAll
 */

/**
 * @constructor
 * @param { ObservableMapType } om
 * @param { Function }          omPublishStrategy - the om set value strategy
 * @param { BoxControllerType } boxController
 * @returns { TetrominoControllerType }
 */
const TetrominoController = (om, omPublishStrategy, boxController) => {

// --- Observable Map centralized access --- --- ---

    /**
     * @param { TetrominoModelType } tetromino
     */
    const publish = tetromino => omPublishStrategy ( _=> {
        console.warn(tetromino.zPos);
        handleTetrominoUpdate(tetromino);
        om.setValue(tetromino.id, tetromino);
    }) ;
    const publishReferrer = (referrer, reference) => omPublishStrategy ( _=> om.setValue(referrer, reference) );
    /** @param {TetrominoModelType} tetromino */
    const publishRemove = tetromino => omPublishStrategy( _ => om.removeKey(tetromino.id));

    // whenever there is a new box, we have to set its position (if possible)
    boxController.onBoxAdded(box => {
        const tetromino = tetrominoBackingList.find(tetro => tetro.id === box.tetroId);
        if (tetromino) {
            publishUpdatedBoxPositions(tetromino);
        } else {
            log.warn("cannot find tetro for box with tetroId " + box.tetroId);
        }
    });



    const isEmpty = () => {
        return tetrominoBackingList.length < 1;
    };
    const setNoCurrentTetromino = () => {
        publishReferrer(TETROMINO_CURRENT_ID, MISSING_FOREIGN_KEY);
    };

    const removeAll = () => {
        tetrominoBackingList.forEach( tetromino => {
            publishRemove(tetromino);
        })
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

    const updateTetromino = tetromino => {
        publish(tetromino);
    };

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

    const expectedBoxPositions = (shape, position) => {
        const shadowTetromino = {};
        shadowTetromino.shape = shape;
        shadowTetromino.xPos  = position.xPos;
        shadowTetromino.yPos  = position.yPos;
        shadowTetromino.zPos  = position.zPos;
        return [0, 1, 2, 3].map(shapeIndex => finalBoxPosition(shadowTetromino, shapeIndex));
    };

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
    const tetrominoCurrentIdObs = Observable(MISSING_FOREIGN_KEY);

    const findTetrominoById = tetroId => {
        return tetrominoBackingList.find( it => it.id === tetroId);
    };

    const handleTetrominoUpdate = tetromino => {
        console.warn("handleTetrominoUpdate");
        publishUpdatedBoxPositions(tetromino);

        const knownTetroIndex = tetrominoBackingList.findIndex( it => it.id === tetromino.id);
        if (knownTetroIndex >= 0) {
            console.warn("known tetro update");
            tetrominoBackingList[knownTetroIndex] = tetromino; // todo: is this really needed?
            tetrominoChangedObs.setValue({...tetromino}); // todo: does it need a new object identity to enforce onChange?
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
            const {xPos, yPos, zPos} = finalBoxPosition(tetromino, boxIndex);
            const box = Box({id:boxId, tetroId, xPos, yPos, zPos });
            boxController.updateBox(box);
        });
        publishReferrer(TETROMINO_CURRENT_ID, tetroId);
    };

    const publishUpdatedBoxPositions = tetromino => {
        const boxes = [0, 1, 2, 3].map( n => boxController.findBox(tetromino.id, n));
        if (boxes.some( box => box === undefined)){ // not all boxes ready for update
            return;
        }
        [0, 1, 2, 3]
            .map(n => ({...boxes[n], ...finalBoxPosition(tetromino, n)}))
            .forEach(boxController.updateBox);
    };

    const startListening = () => {
        om.onKeyRemoved( key => {
            if (key.startsWith(TETROMINO_PREFIX)){
                const tetromino = tetrominoBackingList.find( it => it.id === key);
                tetrominoListObs.del(tetromino);
            }
        });
        om.onChange( (key,value) => {
            if (key.startsWith(TETROMINO_PREFIX)){
                handleTetrominoUpdate(value);
                return;
            }
            if (TETROMINO_CURRENT_ID === key){
                tetrominoCurrentIdObs.setValue(value.toString()); // value is the id but OM stores it as an object
            }
        });

    };

    return {
        startListening,
        onTetrominoAdded            : tetrominoListObs.onAdd,
        onTetrominoRemoved          : tetrominoListObs.onDel,
        onTetrominoChanged          : tetrominoChangedObs.onChange,
        findTetrominoById,
        onCurrentTetrominoIdChanged : tetrominoCurrentIdObs.onChange,
        isCurrentTetrominoId        : id => id === tetrominoCurrentIdObs.getValue(),
        updateTetromino,
        expectedBoxPositions,
        makeNewCurrentTetromino,
        getCurrentTetromino,
        setNoCurrentTetromino,
        isEmpty,
        removeAll,
    }
};
