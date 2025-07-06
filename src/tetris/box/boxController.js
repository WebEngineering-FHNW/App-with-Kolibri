/**
 * @module tetris/box/boxController
 */

import {LoggerFactory}                        from "../../kolibri/logger/loggerFactory.js";
import {Observable, ObservableList}           from "../../kolibri/observable.js";
import {NO_BOX}                               from "./boxModel.js";

export {
    BoxController,
    BOX_PREFIX,
};

const log = LoggerFactory("ch.fhnw.tetris.box.boxController");

const BOX_PREFIX = "BOX-";

/**
 * @typedef BoxControllerType
 * @property startListening
 * @property onBoxAdded
 * @property onBoxRemoved
 * @property onBoxChanged
 * @property findAllBoxesWhere
 * @property removeBoxesWhere
 * @property updateBox
 * @property findBox
 * @property isEmpty
 */

/**
 * @constructor
 * @param { ObservableMapType } om
 * @param { Function } omPublishStrategy - strategy
 * @returns { BoxControllerType }
 */
const BoxController = (om, omPublishStrategy) => {

// --- Observable Map centralized access --- --- ---

    /** @param {BoxModelType} box */
    const publish = box => omPublishStrategy ( _=> om.setValue(box.id, box) ) ;
    /** @param {BoxModelType} box */
    const publishRemove = box => omPublishStrategy( _ => om.removeKey(box.id));


    const isEmpty = () => {
       return boxesBackingList.length < 1;
    };

    /**
     * @private util
     * @return {BoxModelType}
     */
    const findBox = (tetroId, boxIndex) => {
        const boxId = BOX_PREFIX + tetroId + "-" + boxIndex;
        return boxesBackingList.find(({id}) => id === boxId);
    };

    const findAllBoxesWhere = predicate => {
        return boxesBackingList.filter(predicate);
    };

    const removeBoxesWhere = predicate => {
      const toRemove = findAllBoxesWhere(predicate);
      toRemove.forEach( box => {
          publishRemove(box);
      });
    };

    const updateBox = newBox => {
        // boxChangedObs.setValue(newBox);
        publish(newBox);
    };

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
    };

    const startListening = () => {

        om.onKeyRemoved( key => {
            if (key.startsWith(BOX_PREFIX)){
                const box = boxesBackingList.find( it => it.id === key);
                boxesListObs.del(box);
            }
        });
        om.onChange( (key,value) => {
            if (key.startsWith(BOX_PREFIX)){
                handleBoxUpdate(value);
            }
        });
    };


    return {
        startListening,
        onBoxAdded                  : boxesListObs.onAdd,
        onBoxRemoved                : boxesListObs.onDel,
        onBoxChanged                : boxChangedObs.onChange,
        findAllBoxesWhere,
        removeBoxesWhere,
        updateBox,
        findBox,
        isEmpty
    }
};
