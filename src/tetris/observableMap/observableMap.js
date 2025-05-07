
import {Observable}    from "../../kolibri/observable.js";
import {LoggerFactory} from "../../kolibri/logger/loggerFactory.js";
import "../../kolibri/util/array.js";
import {active, passive, POISON_PILL} from "../../server/S7-manyObs-SSE/remoteObservableMap.js";

export { ObservableMap }

const log = LoggerFactory("ch.fhnw.kolibri.localObservableClient");

/**
 * @callback ObsMapFinalization
 * @param { Array<String> } initialKeys
 * ®return void
 */


/**
 * @typedef ObservableMapType
 * @impure  publishes to listeners, changes internal state
 * @property { ConsumerType<String> }   addObservableForID - adding a new ID will
 *  publish the newly available ID (which should be **unique**)
 *  which in turn will trigger any projections (display and binding)
 * @property { ConsumerType<String> }   removeObservableForID - publish
 * that a given id is no longer in the list of named remote observables, thus allowing all listeners to
 * clean up any local bindings and remove all other bound resources, esp. projected views.
 * @property { ObsMapFinalization  } ensureAllObservableIDs - will call back the
 * provided callback function after all observable ids are properly loaded (can be async/lazy in the remote case)
 */

/**
 * @typedef ObservableMapCtorType
 * Create the {@link ObservableMapType map} that allows to add and remove observables by name (id).
 * @param { NewNameCallback } newNameCallback - will change DOM and binding
 * @return { ObservableMapType }
 * @constructor
 */

/**
 * @type { ObservableMapCtorType }
 */
const ObservableMap = newNameCallback => {

    /**
     * world of managed named observables, keys are the IDs of the named observable
     * @type { Object.< String, NamedRemoteObservableType> }
     */
    const boundObservablesByName = {}; //

    /**
     * The observable that keeps the array of known IDs of dynamically created observables.
     * It publishes to all observables, which IDs are now available for projection (display and binding).
     * It always publishes the full array of IDs (less efficient but more reliable than diffs).
     * @note an empty array is a fully valid value while `undefined` indicates that no value has been set, yet.
     * @type { RemoteObservableType< Array<String> | undefined > }
     * */
    const observableOfIDs = Observable( /** @type { RemoteValueType< Array<String> | undefined> } */ passive( undefined ) );

    const synchronizeObservableIDs = observableIDs => {
        // if there is a new observable id that we haven't bound and projected, yet, we have to do so.
        observableIDs
            .filter(  id    => boundObservablesByName[id] === undefined)
            .forEach( newID => {
                const newObservable = ({ id: newID, observable: Observable(passive(undefined)) });
                boundObservablesByName[newID] = newObservable; // deviation from remote case: where we keep track of obs
                newNameCallback  ( newObservable );
            });

        // if we have any bound observables that are no longer in the list of observableIDs, they should be removed.
        // There are a number of issues to consider when removing a bound observable (there is more to do in the remote case):
        // - clean up the map of bound observables
        // - let the other listeners (mainly UI) know that this is a dead observable by sending the poison pill
        Object.getOwnPropertyNames(boundObservablesByName)
            .filter(  boundID => false === observableIDs.includes(boundID) ) // boundID is no longer observable // todo: check against remote version wrt prefix-immortal
            .forEach( oldID   => {
                log.debug("remove bound ID " + oldID);

                const bound = boundObservablesByName[oldID];
                delete boundObservablesByName[oldID];

                bound.observable.setValue(POISON_PILL);
            })
    };

    observableOfIDs.onChange( namedObs => {
        const newNames = namedObs.value;
        if (undefined === newNames) return;                                 // initial callback
        log.info("new list of observable names (IDs) " + newNames.length);
        synchronizeObservableIDs(newNames);
    });

    /** @type { ConsumerType<String> } */
    const addObservableForID = newID => {
        const allIDs = observableOfIDs.getValue().value ?? [] ; // value is undefined at start
        allIDs.push(newID);
        observableOfIDs.setValue( /** @type { RemoteValueType< Array<String> > } */ active(allIDs) );
    };

    /** @type { ConsumerType<String> } */
    const removeObservableForID = oldID => {
        const allIDs = observableOfIDs.getValue().value;
        if (undefined === allIDs || allIDs.length < 1) {
            log.warn("cannot remove from an empty array");
            return;
        }
        allIDs.removeItem(oldID);
        observableOfIDs.setValue( /** @type { RemoteValueType< Array<String> > } */ active(allIDs) );
    };

    /** @type { ConsumerType<Function> } */
    const  ensureAllObservableIDs = continuationCallback => {
        const boundObsCopy =  {...boundObservablesByName};// pass a copy to prevent messing with our internals
        delete boundObsCopy[OBSERVABLE_IDs_KEY]; // remove the key from the copy because it shall not be shared
        continuationCallback( boundObsCopy );
    };

    return { addObservableForID, removeObservableForID, ensureAllObservableIDs }
};
