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
 * @param { ObservableMapType } observableMap
 * @param { Function }          omPublishStrategy - the observableMap set value strategy
 * @param { BoxControllerType } boxController
 * @returns { TetrominoControllerType }
 */
const TetrominoController = (observableMap, omPublishStrategy, boxController) => {

    // We use local observables as a convenience for the binding.

    /**
     * Internal list of all known tetrominos.
     * It includes the current tetromino, which is the only one that has all four boxes still attached.
     * @private
     * @type { Array<TetrominoModelType> }
     * */
    const tetrominoBackingList = [];

    /**
     * Observable decorator over the tetromino backing list
     * @private functions are relayed
     * @type {IObservableList<TetrominoModelType>}
     * */
    const tetrominoListObs = ObservableList( tetrominoBackingList );

    /** @type { IObservable<ForeignKeyType> }
    * The current tetromino is the one that the player can control with the arrow keys and that falls down
    * at a given rate (1 s). When it collides, a new one gets created and becomes the current tetromino.
    * Observable to keep the projected views separate from the controller.
    * The value is undefined before any player has started the game.
    */
    const tetrominoCurrentIdObs = Observable(MISSING_FOREIGN_KEY);

    /**
     * Changes when there is a new current tetromino (current tetro should be an immutable value)
     * or the current tetromino changes any of its values (usually the position).
     * For the special case of Tetris, there is only ever one tetromino to be observed - the current one.
     * @type { IObservable<TetrominoModelType>} */
    const currentTetrominoObs = Observable(NO_TETROMINO);

    const getCurrentTetrominoFromObservableMap = id => {
        let result = NO_TETROMINO;
        if(NO_TETROMINO.id === id) { return result; }
        observableMap.getValue(id)
          ( _     => log.warn("no tetromino with current id "+id))
          ( tetro => result = tetro);
        return result;
    };
    tetrominoCurrentIdObs.onChange( newId => currentTetrominoObs.setValue(getCurrentTetrominoFromObservableMap(newId)));

    /**
     * Whenever the observable map changes, we have to synchronize our local observables.
     */
    const startListening = () => {

        observableMap.onKeyRemoved( key => {
            if (key.startsWith(TETROMINO_PREFIX)){
                const tetromino = tetrominoBackingList.find( it => it.id === key);
                tetrominoListObs.del(tetromino);
            }
        });

        observableMap.onChange( (key,value) => {
            if (key.startsWith(TETROMINO_PREFIX)){
                handleTetrominoUpdate(value);
                return;
            }
            if (TETROMINO_CURRENT_ID === key){
                tetrominoCurrentIdObs.setValue(value.toString()); // value is the id but OM stores it as an object
            }
        });
    };

    const handleTetrominoUpdate = tetromino => {

        const knownTetroIndex = tetrominoBackingList.findIndex( it => it.id === tetromino.id);
        if (knownTetroIndex >= 0) {
            tetrominoBackingList[knownTetroIndex] = tetromino;
            currentTetrominoObs.setValue(tetromino);
            publishUpdatedBoxPositions(tetromino); // whenever a tetromino changes, we have to update its boxes
            return;
        }
        log.info(`new tetromino: ${JSON.stringify(tetromino)}`);
        tetrominoListObs.add(tetromino);
    };


// --- Observable Map centralized access --- --- ---

    /**
     * @param { TetrominoModelType } tetromino
     */
    const publish = tetromino => omPublishStrategy ( _=> {
        observableMap.setValue(tetromino.id, tetromino);
    }) ;
    const publishReferrer = (referrer, reference) =>
        omPublishStrategy ( _=>
             observableMap.setValue(referrer, Object(reference)) ); // ensure reference is an object
    /** @param {TetrominoModelType} tetromino */
    const publishRemove = tetromino => omPublishStrategy( _ => observableMap.removeKey(tetromino.id));

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
        return currentTetrominoObs.getValue();
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


    const findTetrominoById = tetroId => {
        return tetrominoBackingList.find( it => it.id === tetroId);
    };

    let runningNum  = 0;
    const makeNewCurrentTetromino = () => {
        const shapeName = shapeNames[Math.floor(Math.random() * shapeNames.length)];
        const shape     = shapesByName[shapeName];
        const tetroId   = /** @type { ForeignKeyType } */ TETROMINO_PREFIX + clientId + "-" + (runningNum++);
        const tetromino = Tetromino({id:tetroId, shapeName, shape, xPos:0, yPos:0, zPos:12});
        updateTetromino(tetromino);
        publishReferrer(TETROMINO_CURRENT_ID, tetroId); // must come after tetro with this id is known
    };

    const publishUpdatedBoxPositions = tetromino => {
        [0, 1, 2, 3].map( boxIndex => {
            const tetroId = tetromino.id;
            const boxId  = /** @type { ForeignKeyType } */ BOX_PREFIX + tetroId + "-" + boxIndex;
            const {xPos, yPos, zPos} = finalBoxPosition(tetromino, boxIndex);
            const box = Box({id:boxId, tetroId, xPos, yPos, zPos });
            boxController.updateBox(box);
        });
    };

    return {
        startListening,
        onTetrominoAdded            : tetrominoListObs.onAdd,
        onTetrominoRemoved          : tetrominoListObs.onDel,
        onTetrominoChanged          : currentTetrominoObs.onChange,
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
