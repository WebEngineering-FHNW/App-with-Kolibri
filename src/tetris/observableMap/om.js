import {Just, Nothing} from "../../kolibri/stdlib.js";
import {LoggerFactory} from "../../kolibri/logger/loggerFactory.js";

export {OM}


const log = LoggerFactory("ch.fhnw.tetris.observable.om");

/**
 * @typedef { String } ForeignKeyType
 */

/** @typedef { (key:ForeignKeyType) => void}                    newKeyCallback  */
/** @typedef { <_T_> (key:ForeignKeyType, value:_T_) => void}   keyRemovedCallback  */
/** @typedef { <_T_> (key:ForeignKeyType, value:_T_) => void}   onChangeCallback - value is never nullish */


/**
 * A map (key-value store) that allows observing the adding and removal of keys along
 * with observing value changes for all keys.
 * Observable maps of this type can be synchronized via the {@link AsyncRelayType asynchronous relay}.
 * @typedef OMType
 * @template _T_
 * @property { (key:ForeignKeyType, value:_T_) => void}     setValue - stores the value and
 * notifies all respective listeners about addition, deletion or value change if it is indeed a change.
 * Implicitly adds the key if it is new and removes the key if it is nullish.
 * @property { (key:ForeignKeyType) => MaybeType<_T_>}      getValue  - the value is never nullish
 * @property { (key:ForeignKeyType)=> void}                 removeKey - removes and notifies only if key is available
 * @property { (newKeyCallback)=> void}                     onKeyAdded
 * @property { (keyRemovedCallback)=>void}                  onKeyRemoved
 * @property { (onChangeCallback) => void }                 onChange
 */

/**
 * @param { String? } name - to identify the OM (mainly for logging and debugging purposes)
 * @param { Number? } debounceMS - debounce time in milliseconds, defaults to 10, non-negative, 0 means "no debounce"
 * @return { OMType }
 * @constructor
 */
const OM = (name, debounceMS = 10) => {

    const backingMap      = {};
    const addListeners    = [];
    const removeListeners = [];
    const changeListeners = [];

    const onKeyAdded   = listener => addListeners   .push(listener);
    const onKeyRemoved = listener => removeListeners.push(listener);
    const onChange     = listener => {
        changeListeners.push(listener);
        for(const [key, value] of Object.entries(backingMap)){ // immediate callback
            const oldValue = backingMap[key];
            listener(key, value, oldValue); // todo removeMe? (not as critical since OMs are long-running)
        }
    };

    const hasKey = key => backingMap.hasOwnProperty(key);

    const timeoutMap = {}; // key => timeoutId

    const setKeyValue = (key, value) => {
        const keyIsNew   = !hasKey(key);
        const oldStr = JSON.stringify(backingMap[key]);
        const newStr = JSON.stringify(value);
        const valueIsNew = keyIsNew
            ? true
            : oldStr !== newStr;

        if ( keyIsNew || valueIsNew) {
            log.debug(_=>`OM.setKeyValue name ${name}, key ${key}, 
            old ${oldStr}, 
            new ${newStr}, 
            isNew ${valueIsNew}`);

            const timeoutId = timeoutMap[key]; // de-bouncing value updates that come in short succession
            if ( timeoutId ) {
                log.debug(_=>`bounced ${key} change, waiting: ${Object.keys(timeoutMap).length}`);
                clearTimeout(timeoutId);
            }
            const notifyAll = () => {
                if (keyIsNew) {
                     addListeners.forEach( callback => callback(key));
                 }
                 if(valueIsNew) {
                     changeListeners.forEach( callback => callback(key, value));
                 }
            };
            if (debounceMS <= 0 ) {
                notifyAll();
                return;
            }
            timeoutMap[key] = setTimeout( _=> {  // bounce
                delete timeoutMap[key];
                backingMap[key] = value;
                notifyAll();
            }, debounceMS); // too low: no effect, too high: slow updates
        }
    };

    const removeKey = key => {
        if (!hasKey(key)) {
            return;
        }
        // todo: think about removing duplication in debounce handling
        const timeoutId = timeoutMap[key]; // de-bouncing value updates that come in short succession
        if ( timeoutId ) {
            log.debug(_=>`de-bounced ${key} removal, waiting: ${Object.keys(timeoutMap).length}`);
            clearTimeout(timeoutId);
        }
        const notifyAll = () => {
            const removedValue = backingMap[key];
            delete backingMap[key];
            removeListeners.forEach(callback => callback(key, removedValue));
        };
        if (debounceMS <= 0) {
            notifyAll();
            return;
        }
        timeoutMap[key] = setTimeout(_ => {  // bounce
            delete timeoutMap[key];
            notifyAll();
        }, debounceMS); // too low: no effect, too high: slow updates

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
