
import {createServer}      from 'node:http';
import {handleFileRequest} from "../S2-file-server/fileRequestHandler.js";

import {
    KEY_ACTION, KEY_DATA,
    PARAM_KEY,
    KEY_PAYLOAD, PATH_REMOVE_ACTION,
    PATH_REMOTE_OBSERVABLE,
    PATH_UPDATE_ACTION,
    PARAM_UPDATE_ACTION, KEY_VERSION, KEY_ORIGIN
} from "./romConstants.js";
import {addToAppenderList, setLoggingContext, setLoggingLevel} from "../../kolibri/logger/logging.js";
import * as loglevel                                           from "../../kolibri/logger/logLevel.js";
import {ConsoleAppender}                                       from "../../kolibri/logger/appender/consoleAppender.js";
import {LoggerFactory}                                         from "../../kolibri/logger/loggerFactory.js";
import {ownPropEqual}                                          from "../../tetris/util/util.js";
import {ObservableMap}                                         from "../../kolibri/observable/observableMap.js";

addToAppenderList(ConsoleAppender());
setLoggingContext("ch.fhnw.kolibri.remote");
setLoggingLevel(loglevel.LOG_DEBUG);

const log = LoggerFactory("ch.fhnw.kolibri.remote.romServer");

const port      = 8080;
const hostname  = 'localhost';
const baseURL   = `http://${hostname}:${port}`;

const rom = ObservableMap("server");

// internal counter
let eventId = 1;

/**
 * Handling all connection attempts, disconnection, errors and value publishing on the SSE.
 */
const handleSSE = (req, res) => {
    log.debug(`client accepts ${req.headers['accept']}`);   // should contain "text/event-stream"
    let removeFromObservableOnNextUpdate = false;             // closure state for deferred removal
    const lastEventId = req.headers['last-event-id'];
    if (lastEventId) {                                      // we can resurrect the state of an old connection
        log.info("got a last event id: " + lastEventId);
        // todo: consider sending a notification to the client that he might want to re-read all data or
        // simply close and re-connect.
    } else {
        // we have a new connection - set up for what to do when the connection closes or fails.
        req.on('close', ()  => {
            log.info("connection closed");
            removeFromObservableOnNextUpdate = true;
            res.end(); // not really needed. Just to be clean.
        });
        req.on('error', err => {
            if("aborted" === err.message) return; // socket closed => connection closed
            log.info(err.stack);
            removeFromObservableOnNextUpdate = true;
            res.end(); // not really needed. Just to be clean.
        });
        log.info("new SSE connection");
    }
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/event-stream');
    const sendChange = (key, value) => {  // how to listen for text changes
        // todo: there is still a memory lead wrt clients that have disconnected
        // if (removeFromObservableOnNextUpdate) {         // connection was lost ->
        //     removeMe();                                 // remove ourselves to avoid too many listeners (memory leak)
        //     return;
        // }
        eventId++;
        res.write('id:'    + eventId + '\n');
        res.write('event:' + PATH_REMOTE_OBSERVABLE + '\n');
        const data = {
            [KEY_ACTION]:  PATH_UPDATE_ACTION,
            [KEY_PAYLOAD]: {key, value}
        };
        log.debug(_=> `sending ${JSON.stringify( data )} `);
        res.write('data:'  + JSON.stringify( data ) + '\n\n');
    };
    rom.onChange(sendChange); // flush whenever some key has a new value and when connecting
    const sendRemove = (key, removedValue) => {
        eventId++;
        res.write('id:'    + eventId + '\n');
        res.write('event:' + PATH_REMOTE_OBSERVABLE + '\n');
        const data = {
            [KEY_ACTION]:  PATH_REMOVE_ACTION,
            [KEY_PAYLOAD]: { key, value: removedValue }
        };
        res.write('data:'  + JSON.stringify( data ) + '\n\n');
    };
    rom.onKeyRemoved(sendRemove);
};


/**
 * Remove the respective key from the store.
 */
const handleKeyRemoval = (req, res) => {
    res.statusCode = 202; // accepted for deletion, but it will take time before it is published to all consumers
    res.setHeader('Content-Type', 'application/json');
    let incomingData = "";
    req.on("data", input => incomingData += String(input));
    req.on("end",  input => {
        incomingData += input ? String(input) : "";
        const data  = JSON.parse(incomingData);
        rom.removeKey(data[PARAM_KEY]);
        res.end(JSON.stringify("ok"));
    })
};

/**
 * update actions may come as POST which allows for better cache control and large values
 */
const handleValueUpdate = (req, res) => {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');

    if (req.method === "POST") {
        let incomingData = "";       // get params from input stream
        req.on("data", input => incomingData += String(input));
        req.on("end",  input => {
            incomingData += input ? String(input) : "";
            const incoming = JSON.parse(incomingData);
            log.debug(`handling post: ${incomingData}`);
            const contentToBeStored = {
                [KEY_VERSION]: incoming[KEY_VERSION],
                [KEY_ORIGIN] : incoming[KEY_ORIGIN],
                [KEY_DATA]   : incoming[PARAM_UPDATE_ACTION]
            };
            const key = incoming[PARAM_KEY];

            // the rom.setValue has its own value-really-changed guard
            // but since we store the version number with the data, this guard would always
            // consider this to be a change and notify the (remote) observers.

            rom.getValue(key)  // set value only if version is higher than old version and data has really changed
               (_nothing => {
                   rom.setValue(key, contentToBeStored); // we have a new key - just add.
               })
               (oldContent => {
                   const oldVersion = Number(oldContent[KEY_VERSION]);
                   const newVersion = Number(contentToBeStored[KEY_VERSION]);
                   if (newVersion <= oldVersion) {
                       log.debug(_=>`new version ${newVersion} <= old version ${oldVersion} - not setting key ${key}`);
                       return;
                   }
                   const oldData = oldContent[KEY_DATA];
                   const newData = contentToBeStored[KEY_DATA];
                   if ( oldData === newData || ownPropEqual(oldData, newData)) { // todo: nested objects (we dont have them atm)
                       log.debug(_=>`version ${newVersion} is new but data did not change - not setting key ${key}`);
                   } else {
                       rom.setValue(key, contentToBeStored);
                   }
                });
            res.end(JSON.stringify("ok"));
        });
        return;
    }
    log.error(`unsupported request method ${req.method}`);
    res.statusCode = 404;
    res.end(JSON.stringify("unsupported request"));
};

const server = createServer( (req, res) => {
  log.debug(`${req.method} ${req.url}`);
  if ("/" + PATH_REMOTE_OBSERVABLE === req.url) {
      handleSSE(req, res);
      return;
  }
  if ( req.url.startsWith("/" + PATH_UPDATE_ACTION) ) {
      handleValueUpdate(req, res);
      return;
  }
  if ( "DELETE" === req.method ) {
      handleKeyRemoval(req, res);
      return;
  }
  handleFileRequest(req, res);
});

server.listen(port, () => {
  console.log(`Server running at ${baseURL}`);
  console.log(`http://localhost:8080/server/S8-OM-SSE/index.html`);
});
