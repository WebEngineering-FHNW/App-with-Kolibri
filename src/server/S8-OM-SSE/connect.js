import {
    KEY_ACTION, KEY_DATA, PARAM_KEY,
    KEY_PAYLOAD,
    PATH_REMOVE_ACTION,
    PATH_REMOTE_OBSERVABLE,
    PATH_UPDATE_ACTION, PARAM_UPDATE_ACTION, KEY_VERSION, KEY_ORIGIN
}                      from "./romConstants.js";
import {LoggerFactory} from "../../kolibri/logger/loggerFactory.js";
import {client}        from "../../kolibri/rest/restClient.js";
import {clientId}      from "../../kolibri/version.js";
import {AsyncRelay}    from "../../kolibri/observable/asyncRelay.js";
import {ObservableMap} from "../../kolibri/observable/observableMap.js";
import {Scheduler}     from "../../kolibri/dataflow/dataflow.js";

export {connect};

const log = LoggerFactory("ch.fhnw.kolibri.remote.connect");

/**
 * Setting up the connection between the observable map and the romServer such that
 * changes in the map will be sent to the server and changes from the server side are
 * published to the map. This handles adding and removing keys as well as value changes.
 * @param { String } baseUrl - connection target
 * @param { ObservableMapType } om      - the observable map that connects to the server
 */
const connect = (baseUrl, om) => {

    const rom = ObservableMap("remote");

    const versions = {}; // keys to their latest known version number
    const remoteSymbol = Symbol("remote"); // used to tell whether a value was received from remote

    const scheduler = AsyncRelay(rom)(om); // todo dk: it might be more efficient to directly listen on the om and avoid the rom
    const sendingScheduler = Scheduler();  // make sure that we are sending at most one request at a time

    const eventSource = new EventSource(baseUrl + '/' + PATH_REMOTE_OBSERVABLE);

    eventSource.addEventListener('message', event =>
        log.warn("unknown event type " + event)
    );
    eventSource.addEventListener('error', err =>
        log.error("SSE error " + err)
    );
    eventSource.addEventListener(PATH_REMOTE_OBSERVABLE, event => {
        const data    = JSON.parse(event.data);
        const action  = data[KEY_ACTION];
        const payload = data[KEY_PAYLOAD];
        switch (action) {
            case PATH_UPDATE_ACTION:
                const key             = payload[PARAM_KEY];
                const value           = payload[PARAM_UPDATE_ACTION];
                const receivedVersion = value[KEY_VERSION];
                const receivedOrigin  = value[KEY_ORIGIN];
                if (!receivedOrigin) {
                    log.warn("no origin when receiving updates");
                }
                if (clientId === receivedOrigin) {
                    log.debug(`do not echo my own changes`);
                    return;
                }
                if (receivedVersion <= versions[key]) {
                    log.debug(`ignore update: new version < old version:  ${receivedVersion} <= ${versions[key]}.`);
                    return;
                }
                if (receivedVersion === versions[key]) {
                    log.debug("version is equal but value might still have changed (?)");
                }
                scheduler.addOk(_ => {
                    let dataValue = value[KEY_DATA];
                    if(! (dataValue  instanceof Object)) { // todo remove dupl with obsMap
                        dataValue = Object(dataValue);
                    }
                    dataValue[remoteSymbol] = true;        // tag the value with a symbol that we can pick up to avoid echo
                    rom.setValue(key, dataValue);
                    versions[key] = receivedVersion; // this line must be exactly here or data will get missing
                });
                break;
            case PATH_REMOVE_ACTION: {
                const key            = payload[PARAM_KEY];
                const value          = payload[PARAM_UPDATE_ACTION];
                const receivedOrigin = value[KEY_ORIGIN];
                if (!receivedOrigin) {
                    log.warn("no origin (remove)");
                }
                scheduler.addOk(_ => {
                    rom.removeKey(key);
                    delete versions[key]; // remove the version guard as late as possible
                });
            }
                break;
            default:
                log.error(`cannot process received data: ${event.data}`);
        }
    });

    // todo dk: value change should never imply adding (zombie issue)
    rom.onChange((key, value) => { // also handles the keyAdded case implicitly
        if(value[remoteSymbol]) {  // todo: think about enforcing immutable values for all obsMaps
            log.debug(`prevent echo of our own changes back to the server, key: ${key}`);
            return;
        }
        const version = versions[key] ?? 0;
        versions[key] = version + 1;
        const data    = {
            [KEY_VERSION]:         versions[key],
            [KEY_ORIGIN]:          clientId,
            [PARAM_KEY]:           key,
            [PARAM_UPDATE_ACTION]: value
        };
        sendingScheduler.add( done => {
            log.debug(`sending update key ${key} value ${value} version ${versions[key]}`);
            client(baseUrl + '/' + PATH_UPDATE_ACTION, "POST", data)
                .then(     _ => log.debug("done sending update"))
                .catch(    e => log.error("error sending update data: " + JSON.stringify(data) + " " + e))
                .finally( () => done() );
        });

    });

    rom.onKeyRemoved((key) => {
        const data = {
            [KEY_ORIGIN]: clientId,
            [PARAM_KEY]:  key
        };
        sendingScheduler.add( done => {
            log.debug(`sending remove key ${key}`);
            client(baseUrl + '/' + PATH_REMOVE_ACTION, "DELETE", data)
                .then(     _ => log.debug("done sending remove"))
                .catch(    e => log.error("error sending remove data: " + JSON.stringify(data) + " " + e))
                .finally( () => done() );
        });
    });
};
