const http = require('http');
const url = require('url');
const path = require('path');
const fs = require('fs');
const port = process.argv[2] || 3001;
const debug = require('debug')('server');

http
  .createServer((request, response) => {
    const uri = url.parse(request.url).pathname;
    let filename = path.join(`${process.cwd()}/build`, uri);

    fs.exists(filename, exists => {
      if (!exists) {
        response.writeHead(404, { 'Content-Type': 'text/plain' });
        response.write('404 Not Found\n');
        response.end();
        return;
      }

      if (fs.statSync(filename).isDirectory()) filename += '/index.html';

      debug(filename);

      fs.readFile(filename, 'binary', (err, file) => {
        if (err) {
          response.writeHead(500, { 'Content-Type': 'text/plain' });
          response.write(err + '\n');
          response.end();
          return;
        }

        response.writeHead(200);
        response.write(file, 'binary');
        response.end();
      });
    });
  })
  .listen(parseInt(port, 10));

debug(`Static file server running at => http://localhost:${port}/
CTRL + C to shutdown`);
