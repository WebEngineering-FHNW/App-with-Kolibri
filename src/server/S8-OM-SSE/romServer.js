/*
cd src

*/

import {createServer}      from 'node:http';
import {handleFileRequest} from "../S2-file-server/fileRequestHandler.js";

import {
    TOPIC_REMOTE_OBSERVABLE,
    KEY_PARAM,
    READ_ACTION_NAME,
    READ_ACTION_PARAM,
    UPDATE_ACTION_NAME,
    UPDATE_ACTION_PARAM,
    REMOVE_ACTION_NAME, PAYLOAD_KEY, ACTION_KEY
} from "./romConstants.js";
import {addToAppenderList, setLoggingContext, setLoggingLevel} from "../../kolibri/logger/logging.js";
import * as loglevel from "../../kolibri/logger/logLevel.js";
import {ConsoleAppender}                                       from "../../kolibri/logger/appender/consoleAppender.js";
import {LoggerFactory} from "../../kolibri/logger/loggerFactory.js";
import {OM} from "../../tetris/observableMap/om.js";

addToAppenderList(ConsoleAppender());
setLoggingContext("ch.fhnw");
setLoggingLevel(loglevel.LOG_DEBUG);

const log = LoggerFactory("ch.fhnw.remote.romServer");

const port      = 8080;
const hostname  = 'localhost';
const baseURL   = `http://${hostname}:${port}`;

const rom = OM("server");

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
    const sendText = (key, value) => {  // how to listen for text changes
        // if (removeFromObservableOnNextUpdate) {         // connection was lost ->
        //     removeMe();                                 // remove ourselves to avoid too many listeners (memory leak)
        //     return;
        // }
        eventId++;
        res.write('id:'    + eventId + '\n');
        res.write('event:' + TOPIC_REMOTE_OBSERVABLE + '\n'); // this produces "channels" as needed.
        const data = {
            [ACTION_KEY]:  UPDATE_ACTION_NAME,
            [PAYLOAD_KEY]: {key, value}
        };
        res.write('data:'  + JSON.stringify( data ) + '\n\n');
    };
    rom.onChange(sendText); // flush whenever some key has a new value and when connecting
};

/**
 * what to do when clients wants to specifically read a remotely observable value
 * rather than relying on the SSE publishing.
 * This can be needed when the caches are exhausted or stale.
 * It is all handled via POST to avoid caching issues.
 */
const handleValueRead = (req, res) => {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    let incomingData = "";
    req.on("data", input => incomingData += String(input));
    req.on("end",  input => {
        incomingData += input ? String(input) : "";
        const data  = JSON.parse(incomingData);
        const id    = data[KEY_PARAM];
        const value = keyValueMap[id];
        log.debug(`requested key ${id} found value ${value}`);
        res.end(JSON.stringify({[READ_ACTION_PARAM]: value}));
    })
};

/**
 * Remove the respective key from the store.
 * If later connections want to read the key, they receive an `undefined` value.
 */
const handleKeyRemoval = (req, res) => {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    let incomingData = "";
    req.on("data", input => incomingData += String(input));
    req.on("end",  input => {
        incomingData += input ? String(input) : "";
        const data  = JSON.parse(incomingData);
        const id    = data[KEY_PARAM];
        delete keyValueMap[id];
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
            const data = JSON.parse(incomingData);
            log.debug(`handling post: ${incomingData}`);
            rom.setValue(data[KEY_PARAM], data[UPDATE_ACTION_PARAM]);
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
  if (req.url === "/" + TOPIC_REMOTE_OBSERVABLE) {
      handleSSE(req, res);
      return;
  }
  if ( req.url.startsWith("/" + READ_ACTION_NAME) ) {
      handleValueRead(req, res);
      return;
  }
  if ( req.url.startsWith("/" + UPDATE_ACTION_NAME) ) {
      handleValueUpdate(req, res);
      return;
  }
  if ( req.url.startsWith("/" + REMOVE_ACTION_NAME) ) {
      handleValueUpdate(req, res); // todo: handle remove ?
      return;
  }
  handleFileRequest(req, res);
});

server.listen(port, () => {
  console.log(`Server running at ${baseURL}`);
  console.log(`http://localhost:8080/server/S8-OM-SSE/index.html`);
});
