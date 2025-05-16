
import {Just, Nothing} from "../../kolibri/stdlib.js";

export {OM}

/** @typedef { (key:String) => void}                    newKeyCallback  */
/** @typedef { (key:String) => void}                    keyRemovedCallback  */
/** @typedef { <_T_> (key:String, value:_T_) => void}   onChangeCallback - value is never undefined */


/**
 * @typedef OMType
 * @template _T_
 * @property { (key:String, value:_T_) => void}     setValue - implicit addKey
 * @property { (key:String) => MaybeType<_T_>}      getValue
 * @property { (key:String)=> void}                 removeKey
 * @property { (newKeyCallback)=> void}             onKeyAdded
 * @property { (keyRemovedCallback)=>void}          onKeyRemoved
 * @property { (onChangeCallback) => void }         onChange
 */

// ROM  = ObservableMap< RV <T> >
// getMode: (function injected) __mode__

/**
 * @return { OMType }
 * @constructor
 */
const OM = () => {

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
            : backingMap[key] !== value;

        backingMap[key] = value;

        if (keyIsNew) {
            addListeners.forEach( callback => callback(key));
        }
        if(valueIsNew) {
            changeListeners.forEach( callback => callback(key, value));
        }
    };

    const removeKey = key => {
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
