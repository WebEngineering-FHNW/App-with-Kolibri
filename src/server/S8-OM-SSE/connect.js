
import {
    ACTION_KEY, DATA_KEY, KEY_PARAM,
    PAYLOAD_KEY,
    REMOVE_ACTION_NAME,
    TOPIC_REMOTE_OBSERVABLE,
    UPDATE_ACTION_NAME, UPDATE_ACTION_PARAM, VERSION_KEY
}                      from "./romConstants.js";
import {LoggerFactory} from "../../kolibri/logger/loggerFactory.js";
import {client}        from "../../kolibri/rest/restClient.js";
import {OM}            from "../../tetris/observableMap/om.js";
import {AsyncRelay}    from "../../tetris/observableMap/asyncRelay.js";

export { connect }

const log = LoggerFactory("ch.fhnw.tetris.remote.connect");

/**
 * Setting up the connection between the observable map and the romServer such that
 * changes in the map will be sent to the server and changes from the server side are
 * published to the map. This handles adding and removing keys as well as value changes.
 * @param { String } baseUrl - connection target
 * @param { OMType } om      - the observable map that connects to the server
 */
const connect = (baseUrl, om) => {

    const rom = OM("remote");

    const versions = {}; // keys to their latest known version number

    const scheduler = AsyncRelay(rom)(om);

    const eventSource = new EventSource(baseUrl + '/' + TOPIC_REMOTE_OBSERVABLE);

    eventSource.addEventListener('message', event =>
        log.warn("unknown event type " + event)
    );
    eventSource.addEventListener('error', err =>
        log.error("SSE error " + err)
    );
    eventSource.addEventListener(TOPIC_REMOTE_OBSERVABLE, event => {
        const data    = JSON.parse(event.data);
        const action  = data[ACTION_KEY];
        const payload = data[PAYLOAD_KEY];
        switch (action) {
            case UPDATE_ACTION_NAME:
                const key   = payload[KEY_PARAM];
                const value = payload[UPDATE_ACTION_PARAM];
                const receivedVersion = value[VERSION_KEY];
                if (receivedVersion <= versions[key]) {
                    log.debug(`ignore update: new version <= old version:  ${receivedVersion} <= ${versions[key]}.`);
                    return;
                }
                versions[key] = receivedVersion; // set the highest version as soon as possible
                scheduler.addOk( _=> {
                    rom.setValue(key, value[DATA_KEY]);
                });
                break;
            case REMOVE_ACTION_NAME:
                scheduler.addOk( _=> {
                    const key = payload[KEY_PARAM];
                    rom.removeKey(key);
                    delete versions[key]; // remove the version guard as late as possible
                });
                break;
            default:
                log.error(`cannot process received data: ${event.data}`)
        }
    });

    rom.onChange( ( key, value ) => { // also handles the keyAdded case implicitly
        const version = versions[key] ?? 0;
        versions[key] = version + 1;
        const data = {
            [VERSION_KEY]:          versions[key],
            [KEY_PARAM] :           key,
            [UPDATE_ACTION_PARAM] : value
        };
        log.debug(`sending update key ${key} value ${value} version ${versions[key]}`);
        client(baseUrl + '/' + UPDATE_ACTION_NAME, "POST", data)
            .then(  _ => log.debug("done sending update"))
            .catch( e => log.error("error sending update data: "+ JSON.stringify(data) + " " + e));
    } );

    rom.onKeyRemoved( ( key ) => {
        const data = {
            [KEY_PARAM] :           key
        };
        log.debug(`sending remove key ${key}`);
        client(baseUrl + '/' + REMOVE_ACTION_NAME, "DELETE", data)
            .then(  _ => log.debug("done sending remove"))
            .catch( e => log.error("error sending remove data: "+ JSON.stringify(data) + " " + e));
    } );
};
