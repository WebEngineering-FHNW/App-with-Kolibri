
import { createServer }       from 'node:http';
import { handleFileRequest }  from "./fileRequestHandler.js";

const port     = 8080;
const hostname = 'localhost';

const server = createServer( (req, res) => {
  console.log(req.method, req.url);

  handleFileRequest(req, res);

});

server.listen(port, () => {
  console.log(`Server running at http://${hostname}:${port}/`);
});
