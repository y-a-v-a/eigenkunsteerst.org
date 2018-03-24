const fs = require('fs');
const path = require('path');

const debug = require('debug')('eigenkunsteerst');
const ejs = require('ejs');
const fse = require('fs-extra');
const marked = require('marked');
const frontMatter = require('front-matter');

const fsWriteCallback = msg => error => {
  if (error) throw error;
  debug(msg);
};

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
};

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
debug('Set up some directories');

// read article data dir
fs.readdir(articleSrc, (error, yearDirs) => {
  if (error) throw error;

  const navigationItems = [];

  // filter out non-4-digit directories like .DS_Store etc
  yearDirs = yearDirs.filter(year => {
    return /^[0-9]{4}$/.test(year);
  });

  // create basic nav data
  yearDirs.sort().reverse().forEach(year => {
    navigationItems.push({
      URL: `/${year}.html`,
      name: `${year}`,
      active: false
    });
  });

  // cache most recent year for index.html
  let [mostRecentYear] = yearDirs;
  const rssItems = [];
  let isRssBuilt = false;

  yearDirs.forEach((yearDir, yearIndex) => {
    const articleSrcYearDir = path.join(articleSrc, yearDir);

    let yearCollection = [];

    fs.readdir(articleSrcYearDir, (error, files) => {
      if (error) throw error;

      debug('Prepare navigation');
      data.site.navigationItems = navigationItems.map(year => {
        let {URL, name} = year;
        return {
          URL,
          name,
          active: year.name == yearDir
        };
      });

      files.forEach((file, index) => {
        const articleFileMd = path.join(articleSrcYearDir, file);

        const articleMd = fs.readFileSync(articleFileMd, 'utf8');

        const pageData = frontMatter(articleMd);
        const rendered = marked(pageData.body);

        const fileName = encodeURIComponent(file).replace(/\%20/g, '+').replace('md', 'html');
        const dateFormatter = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };

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
            permaLink: `${data.site.baseUrl}/${yearDir}/${fileName}`,
            content: rendered,
            date: pageData.attributes.date,
            pubDate: pageData.attributes.date,
            dateString: (new Date(pageData.attributes.date)).toLocaleString('en-US',  dateFormatter),
            license: data.channel.license
          }
        };

        if (rssItems.length < 5) {
          rssItems.push(ejsArticleData);
        }
        if (rssItems.length === 5 && !isRssBuilt) {
          renderRssFeed(rssItems, data);
          isRssBuilt = true;
        }

        ejs.renderFile('./layout/partials/article.ejs', ejsArticleData, {}, (error, resultHTML) => {
          if (error) throw error;

          const ejsPageData = Object.assign({}, data);
          ejsPageData.body = resultHTML;
          ejsPageData.article = ejsArticleData.article;

          debug('Rendered article for permaLink');

          ejs.renderFile('./layout/master.ejs', ejsPageData, {}, (error, pageHTML) => {
            if (error) throw error;

            const yearDirName = `${destPath}/${yearDir}`;

            fse.mkdirsSync(yearDirName);
            fs.writeFile(`${yearDirName}/${fileName}`, pageHTML, fsWriteCallback(`Wrote HTML for ${file}`));
          });
        });

        ejsArticleData.article.isSingle = false;

        ejs.renderFile('./layout/partials/article.ejs', ejsArticleData, {}, (error, resultHTML) => {
          if (error) throw error;

          yearCollection.push([ejsArticleData.article.date, resultHTML]);
          debug('Rendered article for year archive');
        });
      });

      if (yearCollection.length) {
        let ejsPageData = Object.assign({}, data);
        yearCollection = yearCollection.sort((a, b) => {
          let dateA = new Date(a[0]);
          let dateB = new Date(b[0]);
          return dateA > dateB ? 1 : dateA < dateB ? -1 : 0;
        }).reverse();

        ejsPageData.body = yearCollection.map(el => el[1]).join('\n');
        ejsPageData.article = {};

        ejs.renderFile('./layout/master.ejs', ejsPageData, {}, (error, pageHTML) => {
          if (error) throw error;

          fs.writeFile(`${destPath}/${yearDir}.html`, pageHTML, fsWriteCallback(`Wrote HTML for ${yearDir}`));
          if (mostRecentYear === yearDir) {
            const fileName = `${destPath}/index.html`;

            fs.writeFile(fileName, pageHTML, fsWriteCallback(`Wrote HTML for index.html`));
          }
        });
      }
    });
  });
});


function renderRssFeed(rssItems, data) {
  const rssItemsHTML = [];
  const ejsChannelData = Object.assign({}, data);

  rssItems.sort((a, b) => {
    const dateA = a.article.date;
    const dateB = b.article.date;
    return dateA > dateB ? -1 : (dateA < dateB ? 1 : 0);
  }).forEach((rssItemData) => {
    rssItemData.article.content = rssItemData.article.content.replace(/<p>/g, '').replace(/<\/p>/g, '<br>');
    ejs.renderFile('./layout/rss/item.ejs', rssItemData, {}, (error, resultXML) => {
      if (error) throw error;
      rssItemsHTML.push(resultXML);
      debug('Rendered RSS item');
    });
  });

  ejsChannelData.articles = rssItemsHTML.join('');
  ejs.renderFile('./layout/rss/channel.ejs', ejsChannelData, {}, (error, resultXML) => {
    if (error) throw error;
    debug('Rendered RSS channel');

    ejs.renderFile('./layout/rss.ejs', { content: resultXML }, {}, (error, resultXML) => {
      if (error) throw error;
      fs.writeFile(`${destPath}/feeds/rss`, resultXML, fsWriteCallback(`Wrote XML for feed/rss`));
    });
  });
}
