import {LoggerFactory}       from "../../kolibri/logger/loggerFactory.js";
import {client}              from "../../kolibri/rest/restClient.js";
import {
    ACTION_KEY, KEY_PARAM,
    PAYLOAD_KEY,
    REMOVE_ACTION_NAME,
    TOPIC_REMOTE_OBSERVABLE,
    UPDATE_ACTION_NAME, UPDATE_ACTION_PARAM
} from "./romConstants.js";

export { connect }

const log = LoggerFactory("ch.fhnw.kolibri.remote.connect");

/**
 * Setting up the connection between the observable map and the romServer such that
 * changes in the map will be sent to the server and changes from the server side are
 * published to the map. This handles adding and removing keys as well as value changes.
 * @param { String } baseUrl - connection target
 * @param { OMType } om      - the observable map that connects to the server
 */
const connect = (baseUrl, om) => {
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
                om.setValue(payload.key, payload.value);
                break;
            case REMOVE_ACTION_NAME:
                om.removeKey(payload.key);
                break;
            default:
                log.error(`cannot process received data: ${event.data}`)
        }
    });

    om.onChange( ( key, value ) => { // also handles the keyAdded case implicitly
        const data = {
            [KEY_PARAM] :           key,
            [UPDATE_ACTION_PARAM] : value
        };
        log.debug(`sending update key ${key} value ${value}`);
        client(baseUrl + '/' + UPDATE_ACTION_NAME, "POST", data)
            .then(  _ => log.debug("done sending update"))
            .catch( e => log.error("error sending update data: "+ JSON.stringify(data) + " " + e));
    } );

    om.onKeyRemoved( ( key ) => {
        const data = {
            [KEY_PARAM] :           key
        };
        log.debug(`sending remove key ${key}`);
        client(baseUrl + '/' + REMOVE_ACTION_NAME, "DELETE", data)
            .then(  _ => log.debug("done sending remove"))
            .catch( e => log.error("error sending remove data: "+ JSON.stringify(data) + " " + e));
    } );
};
