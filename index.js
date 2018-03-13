const fs = require('fs');

const ejs = require('ejs');
const fse = require('fs-extra');
const marked = require('marked');
const frontMatter = require('front-matter');

const config = require('./data/config');

const destPath = './build';
const articleSrc = './data/articles';

fse.emptyDirSync(destPath);

fse.copySync('./layout/assets/', `${destPath}/`);
fse.copySync('./data/images/', `${destPath}/images/`);

fs.readdir(articleSrc, function(error, files) {
  files.forEach(function(file) {
    const articleFile = `${articleSrc}/${file}`;
    const articleMd = fs.readFileSync(articleFile, 'utf8');

    const pageData = frontMatter(articleMd);
    const rendered = marked(pageData.body);

    const ejsData = {
      article: {
        article: rendered,
        title: pageData.attributes.title,
        imageName: pageData.attributes.image,
        date: pageData.attributes.date,
        dateString: pageData.attributes.date.toLocaleString()
      }
    }

    ejs.renderFile('./layout/partials/article.ejs', ejsData, {}, function(error, resultHTML) {
      const pageData = Object.assign({}, ejsData);
      pageData.body = resultHTML;

      ejs.renderFile('./layout/master.ejs', pageData, {}, function(error, pageHTML) {
        fs.writeFileSync(`${destPath}/${file.replace('md', 'html')}`, pageHTML);

        console.log(`Wrote HTML for ${file}`);
      });
    });


  });
});
