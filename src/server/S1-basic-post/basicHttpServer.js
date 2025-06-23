// start/debug through IDE or from console via
// node basicHttpServer.js

import http from 'node:http';

const port     = 8080;
const hostname = 'localhost';

const handleGET = (req, res, data ="") => {
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
        Object.entries(req.headers).map(([name, value]) =>
                                            "<div>" + name + "</div>" +
                                            "<div>" + value + "</div>"
        ).join("")
    }
    </div>    
    <div>
    <form action="/" method="POST">
      <label for="data">data</label>
      <input type="text" id="data" name="myKey">
      <input type="submit" value="POST">
    </form>
    </div>
    <pre>
        DATA: &lt;${data}&gt;
    </pre>
  </body>
  </html>
    `);
    res.end("");
};

const handlePOST = (req, res) => {
    let incomingData = "";
    req.on("data", arg => {
        incomingData += String(arg);
    });
    req.on("end", arg => {
        if (arg) {
            incomingData += String(arg);
        }
        handleGET(req, res, incomingData);
    });
};

const server = http.createServer( (req, res) => {
    console.log(req.method, req.url);
    switch (req.method) {
        case "GET":
            handleGET(req, res);
            return;
        case "POST":
            handlePOST(req, res);
            return;
        default:
            console.error("cannot handle request method", req.method);
    }
});

server.listen(port, hostname, () => {
  console.log(`Server running at http://${hostname}:${port}/`);
});
