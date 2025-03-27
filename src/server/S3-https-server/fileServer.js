
import { createServer }       from 'node:https'; // <- note this change
import { readFileSync }       from 'node:fs';
import { handleFileRequest }  from "../S2-file-server/fileRequestHandler.js";

const port     = 443;
const hostname = 'localhost';

const options = {
  key:  readFileSync('./private-key.pem'),
  cert: readFileSync('./certificate.pem')
};

const server = createServer( options, (req, res) => {
  console.log(req.method, req.url);

  handleFileRequest(req, res);

});

server.listen(port, () => {
  console.log(`Server running at https://${hostname}:${port}/`);
});
