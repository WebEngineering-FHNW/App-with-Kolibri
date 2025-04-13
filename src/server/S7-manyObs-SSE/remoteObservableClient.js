import {
    OBSERVABLE_ID_PARAM,
    READ_ACTION_NAME,
    READ_ACTION_PARAM,
    UPDATE_ACTION_NAME,
    UPDATE_ACTION_PARAM
}                      from "./remoteObservableConstants.js";
import {Scheduler}     from "../../kolibri/dataflow/dataflow.js";
import {client}        from "../../kolibri/rest/restClient.js";
import {Observable}    from "../../kolibri/observable.js";
import {clientId}      from "../../kolibri/version.js";
import {LoggerFactory} from "../../kolibri/logger/loggerFactory.js";

export { RemoteObservableClient, passive, active }

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
 * @property { Object } value              - anything that can be put into {@link JSON.stringify }
 */

/**
 * Create a {@link RemoteValueType remote value} in passive mode
 * @pure
 * @constructor
 * @type { (value:*) => RemoteValueType }
 */
const passive = value => ( {mode: "passive", value} );

/**
 * Create a {@link RemoteValueType remote value} in active mode
 * @pure
 * @constructor
 * @type { (value:*) => RemoteValueType }
 */
const active = value => ( {mode:"active", value} );

/**
 * @typedef { IObservable<RemoteValueType> } RemoteObservableType
 * @impure mutable value
 */

/**
 * @typedef { ConsumerType<NamedRemoteObservableType> } ProjectionCallbackType
 * @impure will change DOM and bindings
 * @callback
 */

/**
 * @typedef NamedRemoteObservableType
 * @property { String }               id - should be unique
 * @property { RemoteObservableType } observable - an {@link IObservable } of {@link RemoteValueType}s
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
 */

/**
 * Create the {@link RemoteObservableClientType client} that manages remote observables for a given topic such that we
 * can add new remote observables and bind to existing ones.
 * @param { String } baseUrl   - start of a URL: protocol, server, port, base path without trailing slashes
 * @param { String } topicName - must be the same on client and server
 * @param { ProjectionCallbackType } projectionCallback - will change DOM and binding
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
     *  A scheduler that puts all async remote observable actions in strict sequence.
     *  This is needed because the UI might otherwise send async requests such that they appear
     *  out of order on the server side and/or the respective completion callbacks are out of order on the client side.
     * @type {SchedulerType}
     */
    const remoteObsScheduler = Scheduler();

    /**
     * The remote observable that keeps the array of known IDs of dynamically created remote observables.
     * It publishes to all clients, which IDs are now available for projection (display and binding).
     * Always the full array of IDs is published (less efficient but more reliable than diffs).
     * @type { RemoteObservableType }
     * */
    const remoteObservableOfIDs = Observable( passive( [] ) );

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
        eventSource.addEventListener(topicName + "/" + id, event => {
            // scheduling the local effect means that we have at least some control over any conflicting updates that
            // might appear when we receive updates before any
            // locally buffered (and applied) changes have been published.
            // The UIs can be different for a small amount of time but should be identical when all events
            // have been delivered.
            remoteObsScheduler.addOk( _ => {
                // when we receive a value, we make the value change passive such that it doesn't get send again
                observable.setValue( passive(JSON.parse(event.data)[UPDATE_ACTION_PARAM] ) );
            } )
        });
        // at this point we are set up to receive any updates from the server and
        // often (but not always) also receive the last known value if the outgoing
        // server caches are not exhausted or outdated.
        if (undefined === observable.getValue().value ) { // we have not received any updates, yet
            remoteObsScheduler.add( done => {
                fetch(baseUrl + '/' + READ_ACTION_NAME + '?' + OBSERVABLE_ID_PARAM + "=" + id)
                    .then(res => res.json())
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
        const notifyRemote = ( {mode, value} ) => {
            if ("passive" === mode) return; // guard against hysterese
            const data = {
                [OBSERVABLE_ID_PARAM] : id,
                [UPDATE_ACTION_PARAM] : value
            };
            remoteObsScheduler.add( done =>
                client(baseUrl + '/' + UPDATE_ACTION_NAME, "POST", data)
                .then( _ => done()));
        };
        observable.onChange( notifyRemote );
    };

    const projectAllUnknownObsIDs = observableIDs => {
        // if there is a new one that we haven't projected, yet, we have to do so.
        observableIDs
            .filter(  id => boundObs[id] === undefined)
            .forEach( id => {
                const remoteObservable = ({ id, observable: Observable(passive(undefined)) });
                bindRemoteObservable( remoteObservable );
                projectionCallback  ( remoteObservable );
            });
        // todo: if we have more than what is in obsNames, we might want to delete..
    };

    remoteObservableOfIDs.onChange( ({ /** @type { Array<String> } */ value }) => {
        // if we created the new obsName ourselves, then we first get notified locally
        // in any case, we get notified (possibly a second time) from remote,
        // but then we already know the id and do not project a second time.
        log.debug("new list of observable names (IDs) " + value);
        projectAllUnknownObsIDs(value);
    });

    /**
     * just in case there are issues with the initial read, which might be the case when the
     * connection gets stale or the server is otherwise outdated, or we have to catch up after
     * a temporary silent time
     */
    const ensureAllObservableIDs = () => {
        remoteObsScheduler.add( done => {
            fetch(baseUrl + '/' + READ_ACTION_NAME + '?' + OBSERVABLE_ID_PARAM + "=" + OBSERVABLE_IDs_KEY)
                .then(res => res.json())
                .then(data => {
                    const observableIDs = data && data[READ_ACTION_PARAM] ? data[READ_ACTION_PARAM] : [] ;
                    log.debug("ensureAllObsNames: " + observableIDs);
                    projectAllUnknownObsIDs(observableIDs);
                })
                .then(_ => done());
        });
    };

    /** @type { ConsumerType<String> } */
    const addObservableForID = newName => {
        const names = remoteObservableOfIDs.getValue().value;
        names.push(newName + "-" + clientId);
        remoteObservableOfIDs.setValue( active(names) );
    };

    // we assume immediate start
    bindRemoteObservable( { id: OBSERVABLE_IDs_KEY, observable: remoteObservableOfIDs });
    ensureAllObservableIDs();

    return { bindRemoteObservable, addObservableForID }
};
