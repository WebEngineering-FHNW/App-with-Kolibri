
import { createServer }      from 'node:http';
import { handleFileRequest } from "../S2-file-server/fileRequestHandler.js";

import { channelName, updateActionName, updateActionParam, obsNameParam } from "./sharedConstants.js";
import { Observable }                                                     from "../../kolibri/observable.js";


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
        console.log("new SSE connection for observable named");
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
        res.write('data:'  + JSON.stringify( { [updateActionParam]: newKeyValuePair.value } ) + '\n\n'); // todo: what if payload contains two newlines?
    };
    keyValueObservable.onChange(sendText); // flush whenever some key has a new value
};

const handleTextUpdate = (req, res) => {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/plain');
    const value   = new URL(baseURL + req.url).searchParams.get(updateActionParam);
    const obsName = new URL(baseURL + req.url).searchParams.get(obsNameParam);

    keyValueMap[obsName] = value;
    keyValueObservable.setValue( {key:obsName, value:value});
    res.end("ok");
};

const server = createServer( (req, res) => {
  console.log(req.method, req.url);
  if ( req.url === "/"+channelName) {
      handleSSE(req, res);
      return;
  }
  // todo: provide endpoint to get a particular key?
  // todo: provide endpoint to get the whole map?
  // todo: provide endpoint to remove the observable (avoid memory leak)?
  if ( req.url.startsWith("/"+updateActionName+"?") ) {
      handleTextUpdate(req, res);
      return;
  }
  handleFileRequest(req, res);
});

server.listen(port, () => {
  console.log(`Server running at ${baseURL}`);
});
