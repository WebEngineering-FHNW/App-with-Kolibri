import {ObservableMap}          from "./observableMap.js";

export { LocalObservableFactory };


/**
 * @private
 * @return NamedObservableCoordinatorType
 */
const LocalObservableFactoryImpl = (projectionCallback)  => {
    const observableMap = ObservableMap(projectionCallback);
    return {
        addObservableForID    : observableMap.addObservableForID,
        removeObservableForID : observableMap.removeObservableForID
    }
};

/**
 * @constructor
 * @return NamedObservableCoordinatorFactoryType
 */
const LocalObservableFactory = ()  => {
    return {
        Coordinator: LocalObservableFactoryImpl
    }
};
