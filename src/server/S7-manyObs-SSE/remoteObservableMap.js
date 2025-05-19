import {
    OBSERVABLE_ID_PARAM,
    READ_ACTION_NAME,
    READ_ACTION_PARAM,
    REMOVE_ACTION_NAME,
    UPDATE_ACTION_NAME,
    UPDATE_ACTION_PARAM
}                                            from "./remoteObservableConstants.js";
import {Scheduler}                           from "../../kolibri/dataflow/dataflow.js";
import {client}                              from "../../kolibri/rest/restClient.js";
import {LoggerFactory}                       from "../../kolibri/logger/loggerFactory.js";
import "../../kolibri/util/array.js";
import {PLAYER_SELF_ID}                      from "../../tetris/gameController.js";

// todo: think about remote observable map as a decorator of the local observable map
// todo: refactor types in a common section that is to be shared between local and remote

export { RemoteObservableMapCtor, passive, active,
    POISON_PILL, POISON_PILL_VALUE,
    MISSING_FOREIGN_KEY,
    PREFIX_IMMORTAL, OBSERVABLE_IDs_KEY }

const log = LoggerFactory("ch.fhnw.kolibri.remote.remoteObservableMap");

/**
 * todo: docs
 * @type {string}
 */
const PREFIX_IMMORTAL = "immortal-";

/** request and response parameter that contains the key for accessing the list of all IDs of all remote observables */
const OBSERVABLE_IDs_KEY  = PREFIX_IMMORTAL  + "remoteObservableNames";

/**
 * @typedef RemoteValueType
 * @property { "active" | "passive" } mode - whether we only apply value changes locally
 *   and **passive**ly wait for value changes from remote
 *   or also **active**ly send the current value to the server.
 *   The passive mode is needed when we create a new observable remote value on the client side where
 *   a value might already exist on the remote, and we do not want to override the existing value.
 *   Passive mode is also needed to avoid re-sending a value change that we received from remote
 *   (which could otherwise lead to infinite loops).
 * @template _T_
 * @property { _T_ } value              - anything that can be put into {@link JSON.stringify }
 */

/**
 * Create a {@link RemoteValueType remote value} in passive mode
 * @pure
 * @constructor
 * @template _T_
 * @type { <_T_> (value:_T_) => RemoteValueType<_T_> }
 */
const passive = value => ( {mode: "passive", value} );

/**
 * Create a {@link RemoteValueType remote value} in active mode
 * @pure
 * @constructor
 * @template _T_
 * @type { <_T_> (value:_T_) => RemoteValueType<_T_> }
 */
const active = value => ( {mode:"active", value} ); // todo: the remote value type screams for becoming an attribute type
                                                    // active/passive is a property of the value
                                                    // as a named observable they have an ID that we can use as a qualifier for stable binding
/** @type { SignalValueType } */
const POISON_PILL_VALUE = "__POISON_PILL_VALUE__";
/**
 * Local observers that see this value can remove themselves.
 * @type { RemoteValueType<String> }
 */
const POISON_PILL = ( {mode:undefined, value: POISON_PILL_VALUE} );

/**
 * Signal that a foreign key is missing. Support for referential integrity.
 * @type { ForeignKeyType }
 */
const MISSING_FOREIGN_KEY = "__MISSING_FOREIGN_KEY__";

/**
 * @typedef { IObservable<RemoteValueType<_T_>> } RemoteObservableType
 * @template _T_
 * @impure mutable value
 */

/**
 * @typedef { ConsumerType<MappedObservableType<_T_>> } NewNameCallback
 * Will be called whenever a new, named remote observable becomes available.
 * @template _T_
 * @impure will change DOM and bindings
 * @callback
 */

/**
 * @typedef NamedRemoteObservableType
 * @template _T_
 * @property { String }                    id - should be unique
 * @property { RemoteObservableType<_T_> } observable - an {@link IObservable } of {@link RemoteValueType}s
 */

/**
 * Creates a constructor for a remotely backed {@link ObservableMapCtorType } by
 * "injecting" the base URL and the topic name through means of partial application.
 * @param { String } baseUrl   - start of a URL: protocol, server, port, base path without trailing slashes
 * @param { String } topicName - must be the same on client and server
 * @return { ObservableMapCtorType }
 * @constructor
 */
const RemoteObservableMapCtor = (baseUrl, topicName) => newNameCallback => {

    /**
     * world of managed named remote observables, keys are the IDs of the named observable
     * @type { Object.< String, MappedObservableType> }
     */
    const boundObs = {}; //

    /**
     * Store the various channel-specific event listeners in a way that we can later
     * find them when they should be removed from the channel (the remote observable is no longer available)
     * @type { Object.< String, Function>}
     */
    const channelListeners = {};

    /**
     *  A scheduler that puts all async remote observable actions in a strict sequence.
     *  This is needed because the UI might otherwise send async requests such that they appear
     *  out of order on the server side and/or the respective completion callbacks are out of order on the client side.
     * @type {SchedulerType}
     */
    const remoteObsScheduler = Scheduler();

    /**
     * The remote observable that keeps the array of known IDs of dynamically created remote observables.
     * It publishes to all clients, which IDs are now available for projection (display and binding).
     * It is always the full array of IDs is published (less efficient but more reliable than diffs).
     * @note an empty array is a fully valid value while `undefined` or {@link INITIAL_OBS_VALUE } indicates that no value has been set, yet.
     * @type { MappedObservableType< Array<String> | undefined > } todo: streamline the types
     * */
    const remoteObservableOfIDs = MappedObservable( OBSERVABLE_IDs_KEY  );

    const eventSource = new EventSource(baseUrl + '/' + topicName);

    eventSource.addEventListener('message', event =>
        log.warn("unknown event type " + event)
    );
    eventSource.addEventListener('error', err =>
        log.error("SSE error " + err)
    );
    eventSource.addEventListener(topicName, event => {
        log.error("not supported " + event.data);
    });

    /**
     * @type { ConsumerType<MappedObservableType> }
     */
    const bindRemoteObservable = ( mappedObservable ) => {
        const id = mappedObservable.id;

        if (boundObs[id]) {
            // already known under this key, use the existing one
            console.error("*** bound obs id already exists, this can lead to serious trouble: " + id);
            mappedObservable = boundObs[id];
        } else {
            boundObs[id] = /** @type { MappedObservableType } */ mappedObservable;
            console.warn("*** added to boundObs:", id);
            // we tell the client that we have created the observable even though the values will come later
            newNameCallback(mappedObservable);
        }

        const channelListener = event => {
            // scheduling the local effect means that we have at least some control over any conflicting updates that
            // might appear when we receive updates before any
            // locally buffered (and applied) changes have been published.
            // The UIs can be different for a small amount of time but should be identical when all events
            // have been delivered.
            remoteObsScheduler.addOk(_ => {
                // when we receive a value, we make the value change passive such that it doesn't get send again
                const data = JSON.parse(event.data)[UPDATE_ACTION_PARAM];
                log.info(`received data for id ${id}: ${data}`);
                mappedObservable.setLocalValue(data);
            });
        };
        eventSource.addEventListener(topicName + "/" + id, channelListener);
        channelListeners[id] = channelListener;                      // store reference for later removal of listeners

        // at this point, we are set up to receive any updates from the server and
        // often (but not always) also receive the last known value if the outgoing
        // server caches are not exhausted or outdated.
        const value = mappedObservable.getValue();
        if (undefined === value || INITIAL_OBS_VALUE === value ) { // we have not received any updates, yet
            remoteObsScheduler.add( done => {
                client(baseUrl + '/' + READ_ACTION_NAME, "POST", { [OBSERVABLE_ID_PARAM]: id } )
                    .then(data => {
                        const value = data && data[READ_ACTION_PARAM] ? data[READ_ACTION_PARAM] : undefined ;
                        if (undefined !== value && INITIAL_OBS_VALUE !== value ) {
                            log.debug("we do have an initial value: " + id + " - "+ value);
                            mappedObservable.setLocalValue( value );
                        }
                    })
                    .then( done );
            });
        }

        /** @type { ConsumerType<RemoteValueType> } */
        const notifyRemote = ( remoteValue ) => {
            if ("active" !== remoteValue?.mode) return; // guard against hysterese
            const data = {
                [OBSERVABLE_ID_PARAM] : id,
                [UPDATE_ACTION_PARAM] : remoteValue.value
            };
            log.debug(`sending ${id} ${remoteValue.value}`);
            remoteObsScheduler.add( done =>
                client(baseUrl + '/' + UPDATE_ACTION_NAME, "POST", data)
                .then( _ => done()));
        };
        mappedObservable.onRemoteValueChange( notifyRemote );
    };

    const synchronizeObservableIDs = observableIDs => {

        observableIDs = [... new Set(observableIDs)]; // remove duplicates

        log.debug(`sync ${observableIDs.length} IDs: '${observableIDs}'`);

        // if there is a new remote observable id that we haven't bound and projected, yet, we have to do so.
        observableIDs
            .filter(  id    => boundObs[id] === undefined)
            .forEach( newID => {
                const remoteObservable = MappedObservable( newID );
                bindRemoteObservable( remoteObservable );
            });

        // if we have any bound observables that are no longer in the list of observableIDs, they should be removed.
        // There are a number of issues to consider when removing a bound remote observable:
        // - remove local SSE event listeners
        // - clean up the map of bound observables
        // - let the other listeners (mainly UI) know that this is a dead observable by sending the poison pill
        // - notify the server about the removal such that he can clean up his data structures
        const oldBoundIds = Object.getOwnPropertyNames(boundObs);

        const toDeleteIds = oldBoundIds.filter(  boundID =>
                          false   === boundID.startsWith(PREFIX_IMMORTAL)  &&  // do not remove immortal observables
                          false   === observableIDs.includes(boundID) ) // boundID is no longer observable
                                       ;
        console.warn("*** ids to remove:", toDeleteIds.length);

        if (toDeleteIds.length > 0) {
            console.warn("*** about to delete:", toDeleteIds.join("\n"));
            console.warn("*** old ids was:", oldBoundIds.join("\n"));
            console.warn("*** new ids was:", observableIDs.join("\n"));

        }

        toDeleteIds.forEach( oldID   => {
                log.debug("remove bound ID " + oldID);

                // TODO TODO TODO TODO TODO TODO TODO TODO TODO TODO TODO TODO TODO
                if(oldID === PLAYER_SELF_ID) {
                    console.error("---- deleting myself ??? ----");
                    addObservableForID(PLAYER_SELF_ID);
                    return;
                }

                eventSource.removeEventListener(topicName + "/" + oldID, channelListeners[oldID]); // well, be a good citizen
                delete channelListeners[oldID];

                const observable = boundObs[oldID];
                delete boundObs[oldID];

                observable.setLocalValue(POISON_PILL_VALUE);

                remoteObsScheduler.add( done => {                                       // allow the server to clean up
                    client(baseUrl + '/' + REMOVE_ACTION_NAME, "POST", { [OBSERVABLE_ID_PARAM]: oldID } )
                        .then(_ => done());
                });
            })
    };

    remoteObservableOfIDs.onChange(idArray => {
        // if we created the new obsName ourselves, then we first get notified locally.
        // in any case, we get notified (possibly a second time) from remote,
        // but then we already know the id and do not project a second time.
        if (undefined === idArray || INITIAL_OBS_VALUE === idArray) return;
        synchronizeObservableIDs(idArray);
    });

    /**
     * just in case there are issues with the initial read, which might be the case when the
     * connection gets stale or the server is otherwise outdated, or we have to catch up after
     * a temporary silent time
     */
    const ensureAllObservableIDs = (continuationCallback, checkCallback=()=>true) => {
        remoteObsScheduler.add( done => {
            client(baseUrl + '/' + READ_ACTION_NAME, "POST", { [OBSERVABLE_ID_PARAM]: OBSERVABLE_IDs_KEY } )
                .then(data => {
                    const allIds = data ? data[READ_ACTION_PARAM] : undefined;
                    log.debug(`ensure ObsIDs: ${allIds}`);
                    if (allIds) {
                        synchronizeObservableIDs(allIds);
                    }
                })
                .then(_ =>  {
                    if (! checkCallback()) {
                        return new Promise( (resolve, reject) => {
                            console.warn("*** try again");
                            setTimeout( () => {
                                ensureAllObservableIDs(continuationCallback, checkCallback);
                                resolve(true)
                            }, 500 );
                        } );
                    } else {
                        const boundObsCopy =  {...boundObs};// pass a copy to prevent messing with our internals
                        delete boundObsCopy[OBSERVABLE_IDs_KEY]; // remove the key from the copy because it shall not be shared
                        continuationCallback( boundObsCopy );
                    }
                })
                .then(_ =>  {
                    done()
                });
        });
    };

    const getIdNamesOrInitial = () => {
        const result = remoteObservableOfIDs.getValue();
        if (result === undefined || result === INITIAL_OBS_VALUE) {
            return [];
        }
        return result;
    };

    /**
     * @param {ForeignKeyType} newID
     * @return {void}
     * */
    const addObservableForID = newID => {
        const names = getIdNamesOrInitial() ; // value is undefined at start
        if( names.includes(newID)) {
            log.error(`trying to add the same id a second time ${newID}`);
            return ;
        }
        remoteObsScheduler.add( done => {
            const names = getIdNamesOrInitial() ;
            // no more double-value check since we are async anyway
            names.push(newID);
            remoteObservableOfIDs.setValue( names );
            done();
        })
    };

    /** @type { ConsumerType<String> } */
    const removeObservableForID = oldID => {
        log.debug(`trying to remove observable for ID ${oldID}`);
        remoteObsScheduler.add( done => {
            const names = getIdNamesOrInitial();
            if (names.length < 1) {
                log.warn(`cannot remove '${oldID}' from an empty array`);
                return;
            }
            names.removeItem(oldID);
            remoteObservableOfIDs.setValue( names );
            done();
        })
    };

    // we assume an immediate start
    bindRemoteObservable( remoteObservableOfIDs );

    return { addObservableForID, removeObservableForID, ensureAllObservableIDs }
};
