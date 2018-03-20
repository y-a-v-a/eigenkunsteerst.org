const mysql = require('mysql');
const fs = require('fs');

const connection = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'blog',
  socketPath: '/opt/local/var/run/mysql55/mysqld.sock',
  charset: 'LATIN1_GENERAL_CI'
});

const articleDest = './data/articles';

connection.connect();

connection.query('SELECT `title`, `content`, `image`, `created_at` FROM `blogitems` WHERE `publish` = 1', function (error, results, fields) {
  if (error) throw error;

  if (!results.length) {
    throw new Error('No results!');
  }

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

    fs.writeFileSync(`${articleDest}/${year}/${fileName}.md`, template);

    console.log(`Writing MarkDown for ${fileName}`);
  });
});

connection.end();
