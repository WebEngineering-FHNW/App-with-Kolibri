
import { createServer }      from 'node:http';
import { handleFileRequest } from "../S2-file-server/fileRequestHandler.js";

import { channelName, updateActionName, updateActionParam } from "./sharedConstants.js";
import { Observable }                                       from "../../kolibri/observable.js";


const port      = 8080;
const hostname  = 'localhost';
const baseURL   = `http://${hostname}:${port}`;

const textObservable = Observable("");

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
        console.log("new SSE connection");
    }
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/event-stream');
    const sendText = (newText, oldText, removeMe) => {  // how to listen for text changes
        if (removeFromObservableOnNextUpdate) {         // connection was lost ->
            removeMe();                                 // remove ourselves to avoid too many listeners (memory leak)
            return;
        }
        eventId++;
        res.write('id:'    + eventId + '\n');
        res.write('event:' + channelName + '\n');
        res.write('data:'  + JSON.stringify( { [updateActionParam]: newText } ) + '\n\n');
    };
    textObservable.onChange(sendText);
    sendText(textObservable.getValue());
};

const handleTextUpdate = (req, res) => {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/plain');
    const text = new URL(baseURL + req.url).searchParams.get(updateActionParam);
    textObservable.setValue(text);
    res.end("ok");
};

const server = createServer( (req, res) => {
  console.log(req.method, req.url);
  if ( req.url === "/"+channelName) {
      handleSSE(req, res);
      return;
  }
  if ( req.url.startsWith("/"+updateActionName+"?") ) {
      handleTextUpdate(req, res);
      return;
  }
  handleFileRequest(req, res);
});

server.listen(port, () => {
  console.log(`Server running at ${baseURL}`);
});
