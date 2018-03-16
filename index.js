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

fs.readdir(articleSrc, function(error, yearDirs) {
  if (error) {
    throw error;
  }
  yearDirs.forEach(function(yearDir) {
    const articleSrcYearDir = `${articleSrc}/${yearDir}`;
    if (!/[0-9]{4}/.test(articleSrcYearDir)) {
      return;
    }

    const yearCollection = [];

    fs.readdir(articleSrcYearDir, function(error, files) {
      console.log(files.length);
      if (error) {
        throw error;
      }
      files.forEach(function(file) {

        const articleFileMd = `${articleSrcYearDir}/${file}`;

        const articleMd = fs.readFileSync(articleFileMd, 'utf8');

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
        };

        ejs.renderFile('./layout/partials/article.ejs', ejsData, {}, function(error, resultHTML) {
          const pageData = Object.assign({}, ejsData);
          pageData.body = resultHTML;
          yearCollection.push(resultHTML);

          ejs.renderFile('./layout/master.ejs', pageData, {}, function(error, pageHTML) {
            fse.mkdirsSync(`${destPath}/${yearDir}`);
            fs.writeFileSync(`${destPath}/${yearDir}/${file.replace('md', 'html')}`, pageHTML);

            console.log(`Wrote HTML for ${file}`);
          });
        });
      });

      console.log(yearCollection.length);

      if (yearCollection.length) {
        let pageData = {
          article: {
            title: yearDir
          },
          body: yearCollection.join('\n')
        };

        ejs.renderFile('./layout/master.ejs', pageData, {}, function(error, pageHTML) {
          fs.writeFileSync(`${destPath}/${yearDir}.html`, pageHTML);

          console.log(`Wrote HTML for ${yearDir}`);
        });
      }

    });
  });
});
