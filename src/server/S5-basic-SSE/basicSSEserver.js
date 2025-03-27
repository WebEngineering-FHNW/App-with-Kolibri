
import { createServer }      from 'node:http';
import { handleFileRequest } from "../S2-file-server/fileRequestHandler.js";

const port      = 8080;
const hostname  = 'localhost';

let counter = 0;
let eventId = 1;

const server = createServer( (req, res) => {
  console.dir(req.method, req.url);
  if ( req.url === "/counter") {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/event-stream');
    const lastEventId = req.headers['last-event-id'];
    if (lastEventId) {
      console.info("got a last event id: " + lastEventId);
    }

    setInterval( () => {
      counter++;
      eventId++;
      res.write('id:'     + eventId   + '\n');
      res.write('event:'  + "counter" +'\n');
      res.write('data:'   + JSON.stringify({counter}) +'\n\n');
    }, 1000);

    return;
  }
  handleFileRequest(req, res);
});

server.listen(port, hostname, () => {
  console.log(`Server running at http://${hostname}:${port}/`);
});
