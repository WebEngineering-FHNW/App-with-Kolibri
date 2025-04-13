// after the example of https://adrianmejia.com/building-a-node-js-static-file-server-files-over-http-using-es6/

import url  from 'node:url';
import fs   from 'node:fs';
import path from 'node:path';

export {handleFileRequest};

console.warn("Make sure to run the server under a user with limited file permissions!");

const mimeType = {
    '.ico':  'image/x-icon',
    '.html': 'text/html',
    '.js':   'text/javascript',
    '.json': 'application/json',
    '.css':  'text/css',
    '.png':  'image/png',
    '.jpg':  'image/jpeg',
    '.svg':  'image/svg+xml',
    '.eot':  'application/vnd.ms-fontobject',
    '.ttf':  'application/x-font-ttf',
};

const handleFileRequest = (req, res) => {
    const parsedUrl = url.parse(req.url);

    // Avoid https://en.wikipedia.org/wiki/Directory_traversal_attack
    // by disallowing parent dir path entries like "../".
    // This is of course still not safe and file permissions are needed !

    const sanitizePath = path.normalize(parsedUrl.pathname).replace(/^(\.\.[\/\\])+/, '');
    const __dirname    = ".";
    let pathname       = path.join(__dirname, sanitizePath);

    fs.exists(pathname, exists => {
        if (!exists) {                  // if the file is not found, return 404
            res.statusCode = 404;
            res.end(`File ${pathname} not found!`);
            return;
        }
        // if is a directory, then look for index.html
        if (fs.statSync(pathname).isDirectory()) {
            pathname += '/index.html';
        }
        // another sanity check
        // we do not reveal whether an unauthorized file would potentially exist (403)
        const ext = path.parse(pathname).ext;
        if (null == mimeType[ext]) {
            res.statusCode = 404;
            res.end(`File ${pathname} not found!`);
            return;
        }

        fs.readFile(pathname, (err, data) => {
            if (err) {
                // do not reveal the error stack !
                const msg = `Error getting file: ${err.name} ${err.message}.`;
                console.error(msg);
                res.statusCode = 500;
                res.end(msg);
                return;
            }
            console.debug("Serving file", pathname);
            res.setHeader('Content-Type', mimeType[ext]);
            res.end(data);
        });
    });
};
