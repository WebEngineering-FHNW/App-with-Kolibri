// start/debug through IDE or from console via
// node basicHttpServer.js

import {createServer} from 'node:http';

const port     = 8080;
const hostname = 'localhost';

const server = createServer( (req, res) => {
  console.log(req.method, req.url);

  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/html');

  res.write(`
  <!doctype html>
  <html lang=en>
  <head>
    <meta charset="UTF-8">
    <title>Basic Html Page</title>
  </head>
  <body>
    <h1>Basic Html Page</h1>
    <p>
      Basic page delivered from 
      <script>document.writeln(window.location.origin)</script>.    
    </p>
    <p>
      Server received the headers:      
    </p>
    <div style="display:grid; grid-template-columns: max-content 1fr;gap: .3lh 2em;">      
      ${ 
        Object.entries(req.headers).map( ([name, value]) => 
             "<div>" + name  + "</div>" + 
             "<div>" + value + "</div>"
        ).join("")
      }
    </div>
    
  </body>
  </html>
    `);
  res.end("");
});

server.listen(port, hostname, () => {
  console.log(`Server running at http://${hostname}:${port}/`);
});
