import http from 'http';
import path from 'path';
import fs from 'fs';
import debugModule from 'debug';

const debug = debugModule('server');
const port = process.argv[2] || 3001;

http
  .createServer((request, response) => {
    const uri = new URL(request.url, 'http://localhost').pathname;
    let filename = path.join(`${process.cwd()}/build`, uri);

    fs.access(filename, fs.constants.F_OK, (err) => {
      const exists = !err;
      
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
