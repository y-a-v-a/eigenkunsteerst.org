/**
 * This file was used to process the contents of the former database into Markdown files.
 * @author  Vincent Bruijn <v@y-a-v-a.org>
 */
const mysql = require('mysql');
const fs = require('fs');

// connection basics
const connection = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'blog',
  socketPath: '/opt/local/var/run/mysql55/mysqld.sock',
  charset: 'LATIN1_GENERAL_CI'
});

// destination for resulting .md files
const articleDest = './data/articles';

connection.connect();

// query MySQL
connection.query('SELECT `title`, `content`, `image`, `created_at` FROM `blogitems` WHERE `publish` = 1', function (error, results, fields) {
  if (error) throw error;

  if (!results.length) {
    throw new Error('No results!');
  }

  // replace template variables with contents from database
  results.forEach((result) => {
    const template = `---
title: ${result.title}
image: ${result.image}
date: ${result.created_at}
---

${result.content}
`;

    const year = (new Date(result.created_at)).getFullYear();
    const fileName = result.title;

    // write to disc synchronously

    fs.writeFileSync(`${articleDest}/${year}/${fileName}.md`, template);
    console.log(`Writing MarkDown for ${fileName}`);
  });
});

// close connection
connection.end();
