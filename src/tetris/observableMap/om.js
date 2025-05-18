
import {Just, Nothing} from "../../kolibri/stdlib.js";
import {LoggerFactory} from "../../kolibri/logger/loggerFactory.js";

export {OM}


const log = LoggerFactory("ch.fhnw.kolibri.observable.om");

/** @typedef { (key:String) => void}                    newKeyCallback  */
/** @typedef { (key:String) => void}                    keyRemovedCallback  */
/** @typedef { <_T_> (key:String, value:_T_) => void}   onChangeCallback - value is never nullish */


/**
 * A map (key-value store) that allows observing the adding and removal of keys along
 * with observing value changes for all keys.
 * Observable maps of this type can be synchronized via the {@link AsyncRelayType asynchronous relay}.
 * @typedef OMType
 * @template _T_
 * @property { (key:String, value:_T_) => void}     setValue - stores the value and
 * notifies all respective listeners about addition, deletion or value change if it is indeed a change.
 * Implicitly adds the key if it is new and removes the key if it is nullish.
 * @property { (key:String) => MaybeType<_T_>}      getValue  - the value is never nullish
 * @property { (key:String)=> void}                 removeKey - removes and notifies only if key is available
 * @property { (newKeyCallback)=> void}             onKeyAdded
 * @property { (keyRemovedCallback)=>void}          onKeyRemoved
 * @property { (onChangeCallback) => void }         onChange
 */

/**
 * @param { String? } name - to identify the OM (mainly for logging and debugging purposes)
 * @return { OMType }
 * @constructor
 */
const OM = name => {

    const backingMap      = {};
    const addListeners    = [];
    const removeListeners = [];
    const changeListeners = [];

    const onKeyAdded   = listener => addListeners   .push(listener);
    const onKeyRemoved = listener => removeListeners.push(listener);
    const onChange     = listener => {
        changeListeners.push(listener);
        for(const [key, value] of Object.entries(backingMap)){ // immediate callback
            listener(key, value); // oldValue? removeMe?
        }
    };

    const hasKey = key => backingMap.hasOwnProperty(key);

    const setKeyValue = (key, value) => {
        const keyIsNew   = !hasKey(key);
        const valueIsNew = keyIsNew
            ? true
            : JSON.stringify(backingMap[key]) !== JSON.stringify(value);

        if ( keyIsNew || valueIsNew) {
            log.debug(`OM.setKeyValue name ${name}, key ${key}, old ${backingMap[key]}, new ${value}, isNew ${valueIsNew}`);
            backingMap[key] = value;
        }

        if (keyIsNew) {
            addListeners.forEach( callback => callback(key));
        }
        if(valueIsNew) {
            changeListeners.forEach( callback => callback(key, value));
        }
    };

    const removeKey = key => {
        if(!hasKey(key)) {
            return;
        }
        delete backingMap[key];
        removeListeners.forEach( callback => callback(key));
    };

    const getValue = key =>
        hasKey(key)
        ? Just(backingMap[key])
        : Nothing;

    const setValue = (key, value) => {
        if (undefined === value || null === value ) {
            removeKey(key);
        } else {
            setKeyValue(key, value);
        }
    };

    return {
        getValue, setValue, removeKey, onKeyAdded, onKeyRemoved, onChange
    }
};
