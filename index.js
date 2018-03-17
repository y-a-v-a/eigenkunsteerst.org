const fs = require('fs');

const ejs = require('ejs');
const fse = require('fs-extra');
const marked = require('marked');
const frontMatter = require('front-matter');

const config = require('./data/config');

config.baseUrl = 'http://localhost:3000';

const destPath = './build';
const articleSrc = './data/articles';
const images = {
  src: './data/images/',
  dest: `${destPath}/uploads/assets/`
};

const assets = {
  src: './layout/assets/',
  dest: `${destPath}/`
}

const data = {
  currentYear: new Date().getUTCFullYear(),
  site: {
    baseUrl: config.baseUrl,
    title: config.title,
    navigationItems: [],
    image: ''
  },
  channel: {
    title: config.rssTitle,
    baseUrl: config.baseUrl,
    description: config.description,
    language: config.language,
    copyright: config.copyright,
    lastBuildDate: (new Date()).toString(),
    license: config.license
  }
};

fse.emptyDirSync(destPath);

fse.copySync(images.src, images.dest);
fse.copySync(assets.src, assets.dest);
fse.mkdirsSync(`${destPath}/feeds`);

const navigationItems = [];

fs.readdir(articleSrc, function(error, yearDirs) {
  if (error) {
    throw error;
  }
  yearDirs = yearDirs.filter((year) => {
    return /^[0-9]{4}$/.test(year);
  });

  yearDirs.sort().reverse().forEach(function(year, index, list) {
    navigationItems.push({
      url: `/${year}.html`,
      name: `${year}`,
      active: false
    });
  });

  mostRecentYear = yearDirs[0];

  yearDirs.forEach(function(yearDir, index, list) {
    const articleSrcYearDir = `${articleSrc}/${yearDir}`;
    if (!/[0-9]{4}/.test(articleSrcYearDir)) {
      return;
    }

    const yearCollection = [];

    fs.readdir(articleSrcYearDir, function(error, files) {
      if (error) {
        throw error;
      }

      data.site.navigationItems = [...navigationItems].map((year) => {
        year.active = false;
        if (year.name == yearDir) {
          year.active = true;
        }
        return year;
      });

      files.forEach(function(file, index) {

        const articleFileMd = `${articleSrcYearDir}/${file}`;

        const articleMd = fs.readFileSync(articleFileMd, 'utf8');

        const pageData = frontMatter(articleMd);
        const rendered = marked(pageData.body);

        const ejsArticleData = {
          article: {
            index,
            isSingle: true,
            title: pageData.attributes.title,
            pageTitle: `${pageData.attributes.title} ${config.titleSuffix}`,
            image: pageData.attributes.image,
            imageName: pageData.attributes.image.replace(/\..*$/, ''),
            baseUrl: data.site.baseUrl,
            titleId: `${pageData.attributes.title}`.replace(/\s+/g, '_'),
            permaLink: `${data.site.baseUrl}/${yearDir}/${file.replace('.md', '.html')}`,
            content: rendered,
            date: pageData.attributes.date,
            dateString: pageData.attributes.date.toLocaleString(),
          }
        };

        ejs.renderFile('./layout/partials/article.ejs', ejsArticleData, {}, function(error, resultHTML) {
          if (error) {
            throw error;
          }
          const ejsPageData = Object.assign({}, data);
          ejsPageData.body = resultHTML;
          ejsPageData.article = ejsArticleData.article;

          ejs.renderFile('./layout/master.ejs', ejsPageData, {}, function(error, pageHTML) {
            if (error) {
              throw error;
            }
            fse.mkdirsSync(`${destPath}/${yearDir}`);
            fs.writeFileSync(`${destPath}/${yearDir}/${file.replace('md', 'html')}`, pageHTML);

            console.log(`Wrote HTML for ${file}`);
          });
        });

        ejsArticleData.article.isSingle = false;

        ejs.renderFile('./layout/partials/article.ejs', ejsArticleData, {}, function(error, resultHTML) {
          if (error) {
            throw error;
          }

          yearCollection.push(resultHTML);
        });
      });

      if (yearCollection.length) {
        let ejsPageData = Object.assign({}, data);
        ejsPageData.body = yearCollection.join('\n');
        ejsPageData.article = {};

        ejs.renderFile('./layout/master.ejs', ejsPageData, {}, function(error, pageHTML) {
          if (error) {
            throw error;
          }

          fs.writeFileSync(`${destPath}/${yearDir}.html`, pageHTML);
          if (mostRecentYear === yearDir) {
            fs.writeFileSync(`${destPath}/index.html`, pageHTML);

            console.log(`Wrote HTML for index.html`);
          }

          console.log(`Wrote HTML for ${yearDir}`);
        });
      }
    });
  });
});
