import {LoggerFactory} from "../logger/loggerFactory.js";
import {Just, Nothing} from "../lambda/maybe.js";

export {
    ObservableMap,
    originSymbol, // exported for testing purposes only
}

const log = LoggerFactory("ch.fhnw.kolibri.observable.observableMap");

const originSymbol = Symbol("origin"); // singleton non-JSON-stringified property key

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
 * @typedef ObservableMapType
 * @template _T_
 * @property { (key:ForeignKeyType, value:_T_) => void}     setValue - stores the value and
 * notifies all respective listeners about addition, deletion or value change if it is indeed a change.
 * Implicitly adds the key if it is new and removes the key if it is nullish.
 * The key must be a proper Object (not a primitive value) such that we can add
 * meta-information like the "origin" Symbol without adding the value's properties.
 * @property { (key:ForeignKeyType) => MaybeType<_T_>}      getValue  - the value is never nullish
 * @property { (key:ForeignKeyType)=> void}                 removeKey - removes and notifies only if key is available
 * @property { (newKeyCallback)=> void}                     onKeyAdded
 * @property { (keyRemovedCallback)=>void}                  onKeyRemoved
 * @property { (onChangeCallback) => void }                 onChange
 */

/**
 * @param { String? } name - to identify the ObservableMap (mainly for logging and debugging purposes)
 * @return { ObservableMapType }
 * @constructor
 */
const ObservableMap = (name) => {

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

    const setKeyValue = (key, value) => {
        if (! (value instanceof Object)) {  // e.g. value is a plain String
            log.warn(`value '${value}' is not an object and will be wrapped. Consider Object(value).`);
            value = Object(value);
        }
        if ( value[originSymbol] === name) { // if this value change originated from ourselves, ignore
            log.debug(`value change originated from ourselves name ${name} key ${key} value ${value}`);
            return;                          // avoid infinite "echos"
        }
        if ( value[originSymbol] === undefined) { // this value change has no origin, yet
            Object.defineProperty(value, originSymbol, {
              enumerable:   false,                // origin should live through shallow copies
              configurable: false,
              writable:     false,
              value:        name,                 // ... therefore, we are the origin
            });
        }
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

            const notifyAll = () => {
                if (keyIsNew) {
                     addListeners.forEach( callback => callback(key));
                 }
                 if (valueIsNew) {
                     changeListeners.forEach( callback => callback(key, value));
                 }
            };
            backingMap[key] = value;
            notifyAll();
        }
    };

    const removeKey = key => {
        if (!hasKey(key)) {
            return;
        }
        const notifyAll = () => {
            const removedValue = backingMap[key];
            delete backingMap[key];
            removeListeners.forEach(callback => callback(key, removedValue));
        };
        notifyAll();
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
