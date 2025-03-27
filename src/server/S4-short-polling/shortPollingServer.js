
import { createServer }      from 'node:http';
import { handleFileRequest } from "../S2-file-server/fileRequestHandler.js";

const port      = 8080;
const hostname  = 'localhost';

let counter = 0;

const server = createServer( (req, res) => {
  console.dir(req.method, req.url);
  if ( req.url === "/counter") {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify('Count is: '+ (counter++) ));
    return;
  }
  handleFileRequest(req, res);
});

server.listen(port, hostname, () => {
  console.log(`Server running at http://${hostname}:${port}/`);
});
