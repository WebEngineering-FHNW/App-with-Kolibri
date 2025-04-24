import {ObservableMap}          from "./observableMap.js";

export { LocalObservableMapFactory };


/**
 * @private
 * @return ObservableMapType
 */
const LocalObservableMapFactoryImpl = newNameCallback  => {
    const observableMap = ObservableMap(newNameCallback);
    return {
        addObservableForID    : observableMap.addObservableForID,
        removeObservableForID : observableMap.removeObservableForID
    }
};

/**
 * @constructor
 * @return ObservableMapFactoryType
 */
const LocalObservableMapFactory = ()  => {
    return {
        newMap: LocalObservableMapFactoryImpl
    }
};
