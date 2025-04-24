import {
    OBSERVABLE_ID_PARAM,
    READ_ACTION_NAME,
    READ_ACTION_PARAM,
    REMOVE_ACTION_NAME,
    UPDATE_ACTION_NAME,
    UPDATE_ACTION_PARAM
}                      from "./remoteObservableConstants.js";
import {Scheduler}     from "../../kolibri/dataflow/dataflow.js";
import {client}        from "../../kolibri/rest/restClient.js";
import {Observable}    from "../../kolibri/observable.js";
import {LoggerFactory} from "../../kolibri/logger/loggerFactory.js";
import "../../kolibri/util/array.js";

export { RemoteObservableClient, passive, active, POISON_PILL }

const log = LoggerFactory("ch.fhnw.kolibri.remote.remoteObservableClient");

/** request and response parameter that contains the key for accessing the list of all IDs of all remote observables */
const OBSERVABLE_IDs_KEY  = "remoteObservableNames";

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
 * @type { (value:_T_) => RemoteValueType<_T_> }
 */
const passive = value => ( {mode: "passive", value} );

/**
 * Create a {@link RemoteValueType remote value} in active mode
 * @pure
 * @constructor
 * @template _T_
 * @type { (value:_T_) => RemoteValueType<_T_> }
 */
const active = value => ( {mode:"active", value} );

/**
 * Local observers that see this value can remove themselves.
 * @type { RemoteValueType<void> }
 */
const POISON_PILL = ( {mode:undefined, value: undefined} );

/**
 * @typedef { IObservable<RemoteValueType<_T_>> } RemoteObservableType
 * @template _T_
 * @impure mutable value
 */

/**
 * @typedef { ConsumerType<NamedRemoteObservableType<_T_>> } NewNameCallback
 * Will be called whenever a new named remote observable becomes available.
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
 * @typedef RemoteObservableClientType
 * @impure  publishes to remote
 * @property { ConsumerType<NamedRemoteObservableType> } bindRemoteObservable - register the remote observable
 *  to send any value changes to the server (if value mode is "active") and receive any value changes
 *  from the server and proliferate locally
 * @property { ConsumerType<String> }                    addObservableForID - adding a new ID will
 *  publish the newly available ID (which should be **unique**)
 *  which in turn will trigger any projections (display and binding) first locally and then remotely
 * @property { ConsumerType<String> }                    removeObservableForID - publish first locally and then remotely
 * that a given id is no longer in the list of named remote observables, thus allowing all listeners to
 * clean up any local bindings and remove all other bound resources, esp. projected views.
 */

/**
 * Create the {@link RemoteObservableClientType client} that manages remote observables for a given topic such that we
 * can add new remote observables and bind to existing ones.
 * @param { String } baseUrl   - start of a URL: protocol, server, port, base path without trailing slashes
 * @param { String } topicName - must be the same on client and server
 * @param { NewNameCallback } projectionCallback - will change DOM and binding
 * @return { RemoteObservableClientType }
 * @constructor
 */
const RemoteObservableClient = (baseUrl, topicName, projectionCallback) => {

    /**
     * world of managed named remote observables, keys are the IDs of the named observable
     * @type { Object.< String, NamedRemoteObservableType> }
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
     * @note an empty array is a fully valid value while `undefined` indicates that no value has been set, yet.
     * @type { RemoteObservableType< Array<String> | undefined > }
     * */
    const remoteObservableOfIDs = Observable( /** @type { RemoteValueType< Array<String> | undefined> } */ passive( undefined ) );

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
     * @type { ConsumerType<NamedRemoteObservableType> }
     */
    const bindRemoteObservable = ( {id, observable} ) => {
        boundObs[id] = observable;

        const channelListener = event => {
            // scheduling the local effect means that we have at least some control over any conflicting updates that
            // might appear when we receive updates before any
            // locally buffered (and applied) changes have been published.
            // The UIs can be different for a small amount of time but should be identical when all events
            // have been delivered.
            remoteObsScheduler.addOk(_ => {
                // when we receive a value, we make the value change passive such that it doesn't get send again
                observable.setValue(passive(JSON.parse(event.data)[UPDATE_ACTION_PARAM]));
            });
        };
        eventSource.addEventListener(topicName + "/" + id, channelListener);
        channelListeners[id] = channelListener;                      // store reference for later removal of listeners

        // at this point, we are set up to receive any updates from the server and
        // often (but not always) also receive the last known value if the outgoing
        // server caches are not exhausted or outdated.
        if (undefined === observable.getValue().value ) { // we have not received any updates, yet
            remoteObsScheduler.add( done => {
                client(baseUrl + '/' + READ_ACTION_NAME, "POST", { [OBSERVABLE_ID_PARAM]: id } )
                    .then(data => {
                        const value = data && data[READ_ACTION_PARAM] ? data[READ_ACTION_PARAM] : undefined ;
                        if (undefined !== value) {
                            log.debug("initial value: " + id + " - "+ value);
                            observable.setValue( passive( value) );
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
            remoteObsScheduler.add( done =>
                client(baseUrl + '/' + UPDATE_ACTION_NAME, "POST", data)
                .then( _ => done()));
        };
        observable.onChange( notifyRemote );
    };

    const synchronizeObservableIDs = observableIDs => {
        // if there is a new remote observable id that we haven't bound and projected, yet, we have to do so.
        observableIDs
            .filter(  id    => boundObs[id] === undefined)
            .forEach( newID => {
                const remoteObservable = ({ id: newID, observable: Observable(passive(undefined)) });
                bindRemoteObservable( remoteObservable );
                projectionCallback  ( remoteObservable );
            });

        // if we have any bound observables that are no longer in the list of observableIDs, they should be removed.
        // There are a number of issues to consider when removing a bound remote observable:
        // - remove local SSE event listeners
        // - clean up the map of bound observables
        // - let the other listeners (mainly UI) know that this is a dead observable by sending the poison pill
        // - notify the server about the removal such that he can clean up his data structures
        Object.getOwnPropertyNames(boundObs)
            .filter(  boundID =>
                          boundID !== OBSERVABLE_IDs_KEY     &&         // the only key that is always observable
                          false   === observableIDs.includes(boundID) ) // boundID is no longer observable
            .forEach( oldID   => {
                log.debug("remove bound ID " + oldID);

                eventSource.removeEventListener(topicName + "/" + oldID, channelListeners[oldID]); // well, be a good citizen
                delete channelListeners[oldID];

                const observable = boundObs[oldID];
                delete boundObs[oldID];

                observable.setValue(POISON_PILL);

                remoteObsScheduler.add( done => {                                       // allow the server to clean up
                    client(baseUrl + '/' + REMOVE_ACTION_NAME, "POST", { [OBSERVABLE_ID_PARAM]: oldID } )
                        .then(_ => done());
                });
            })
    };

    remoteObservableOfIDs.onChange( ({ /** @type { Array<String> } */ value }) => {
        // if we created the new obsName ourselves, then we first get notified locally.
        // in any case, we get notified (possibly a second time) from remote,
        // but then we already know the id and do not project a second time.
        if (undefined === value) return;
        log.info("new list of observable names (IDs) " + value.length);
        synchronizeObservableIDs(value);
    });

    /**
     * just in case there are issues with the initial read, which might be the case when the
     * connection gets stale or the server is otherwise outdated, or we have to catch up after
     * a temporary silent time
     */
    const ensureAllObservableIDs = () => {
        remoteObsScheduler.add( done => {
            client(baseUrl + '/' + READ_ACTION_NAME, "POST", { [OBSERVABLE_ID_PARAM]: OBSERVABLE_IDs_KEY } )
                .then(data => {
                    const allIds = data ? data[READ_ACTION_PARAM] : undefined;
                    if (allIds) {
                        synchronizeObservableIDs(allIds);
                    } else {
                        log.info("no ids known, yet");
                    }
                })
                .then(_ => done());
        });
    };

    /** @type { ConsumerType<String> } */
    const addObservableForID = newID => {
        const names = remoteObservableOfIDs.getValue().value ?? [] ; // value is undefined at start
        names.push(newID);
        remoteObservableOfIDs.setValue( /** @type { RemoteValueType< Array<String> > } */ active(names) );
    };

    /** @type { ConsumerType<String> } */
    const removeObservableForID = oldID => {
        const names = remoteObservableOfIDs.getValue().value;
        if (undefined === names || names.length < 1) {
            log.warn("cannot remove from an empty array");
            return;
        }
        names.removeItem(oldID);
        remoteObservableOfIDs.setValue( /** @type { RemoteValueType< Array<String> > } */ active(names) );
    };

    // we assume immediate start
    bindRemoteObservable( { id: OBSERVABLE_IDs_KEY, observable: remoteObservableOfIDs });
    ensureAllObservableIDs();

    return { bindRemoteObservable, addObservableForID, removeObservableForID }
};
