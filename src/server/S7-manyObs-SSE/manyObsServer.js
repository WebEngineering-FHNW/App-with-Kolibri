/*
cd src
node server/S7-manyObs-SSE/manyObsServer.js
http://localhost:8080/server/S7-manyObs-SSE/index.html
*/

import {createServer}      from 'node:http';
import {handleFileRequest} from "../S2-file-server/fileRequestHandler.js";

import {
    channelName,
    obsNameParam,
    readActionName,
    readActionParam,
    updateActionName,
    updateActionParam
}                   from "./sharedConstants.js";
import {Observable} from "../../kolibri/observable.js";

const port      = 8080;
const hostname  = 'localhost';
const baseURL   = `http://${hostname}:${port}`;

const keyValueObservable = Observable({key:"",value:""}); // tell whether a key/value pair has changed

const keyValueMap = {}; // for "persistent" storage

let eventId = 1;

const handleSSE = (req, res) => {
    console.log("client accepts", req.headers['accept']);   // should contain "text/event-stream"
    let removeFromObservableOnNextUpdate = false;           // closure state for deferred removal
    const lastEventId = req.headers['last-event-id'];
    if (lastEventId) {                                      // we can resurrect the state of an old connection
        console.info("got a last event id: " + lastEventId);
        // todo: consider sending a notification to the client that he might want to re-read all data or
        // simply close and re-connect.
    } else {
        // we have a new connection - set up for what to do when the connection closes or fails.
        req.on('close', ()  => {
            console.log("connection closed");
            removeFromObservableOnNextUpdate = true;
            res.end(); // not really needed. Just to be clean.
        });
        req.on('error', err => {
            if("aborted" === err.message) return; // socket closed => connection closed
            console.log(err.stack);
            removeFromObservableOnNextUpdate = true;
            res.end(); // not really needed. Just to be clean.
        });
        console.log("new SSE connection");
    }
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/event-stream');
    const sendText = (newKeyValuePair, _oldKey, removeMe) => {  // how to listen for text changes
        if (removeFromObservableOnNextUpdate) {         // connection was lost ->
            removeMe();                                 // remove ourselves to avoid too many listeners (memory leak)
            return;
        }
        eventId++;
        res.write('id:'    + eventId + '\n');
        res.write('event:' + channelName + "/" + newKeyValuePair.key + '\n');
        res.write('data:'  + JSON.stringify( { [updateActionParam]: keyValueMap[newKeyValuePair.key] } ) + '\n\n'); // todo: what if payload contains two newlines?
    };
    keyValueObservable.onChange(sendText); // flush whenever some key has a new value and when connecting
};

const handleTextRead = (req, res) => { // probably not needed
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    const obsName = new URL(baseURL + req.url).searchParams.get(obsNameParam);

    const value = keyValueMap[obsName];
    res.end(JSON.stringify( { [readActionParam]: value } ));
};

// update actions may come as GET (for small values) or as POST (for larger values)
const handleTextUpdate = (req, res) => {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/plain');

    const handleUpdate = (value, obsName) => {
        keyValueMap[obsName] = value;                               // store the value
        keyValueObservable.setValue({key: obsName, value: value});  // notify observers
        res.end("ok");
    };

    if (req.method === "GET") { // get params from URL
        const params = new URL(baseURL + req.url).searchParams;
        handleUpdate(params.get(updateActionParam), params.get(obsNameParam));
        return;
    }
    if (req.method === "POST") { // get params from input stream
        let incomingData = "";
        req.on("data", input => incomingData += String(input));
        req.on("end",  input => {
            incomingData += input ? String(input) : "";
            const data = JSON.parse(incomingData);
            console.log("handling post", data);
            handleUpdate(data[updateActionParam], data[obsNameParam]);
        });
        return;
    }
    console.error("unsupported request method", req.method);
    res.statusCode = 404;
    res.end("unsupported request");
};

const server = createServer( (req, res) => {
  console.log(req.method, req.url);
  if ( req.url === "/"+channelName) {
      handleSSE(req, res);
      return;
  }
  // todo: provide endpoint to get the whole map?
  // todo: provide endpoint to remove the observable (avoid memory leak)?
  if ( req.url.startsWith("/"+readActionName+"?") ) { // probably not needed
      handleTextRead(req, res);
      return;
  }
  if ( req.url.startsWith("/"+updateActionName) ) {
      handleTextUpdate(req, res);
      return;
  }
  handleFileRequest(req, res);
});

server.listen(port, () => {
  console.log(`Server running at ${baseURL}`);
  console.log(`http://localhost:8080/server/S7-manyObs-SSE/index.html`);
});
