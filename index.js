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

// read article data dir
fs.readdir(articleSrc, function(error, yearDirs) {
  if (error) {
    throw error;
  }
  const navigationItems = [];

  // filter out non-4-digit directories like .DS_Store etc
  yearDirs = yearDirs.filter((year) => {
    return /^[0-9]{4}$/.test(year);
  });

  // create basic nav data
  yearDirs.sort().reverse().forEach(function(year) {
    navigationItems.push({
      url: `/${year}.html`,
      name: `${year}`,
      active: false
    });
  });

  // cache most recent year for index.html
  mostRecentYear = yearDirs[0];
  const rssItems = [];
  let isRssBuilt = false;

  yearDirs.forEach(function(yearDir, yearIndex) {
    const articleSrcYearDir = `${articleSrc}/${yearDir}`;
    const yearCollection = [];

    fs.readdir(articleSrcYearDir, function(error, files) {
      if (error) {
        throw error;
      }

      console.log('Prepare navigation');
      data.site.navigationItems = navigationItems.map((year) => {
        return {
          url: year.url,
          name: year.name,
          active: year.name == yearDir
        };
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
            pubDate: pageData.attributes.date,
            dateString: (new Date(pageData.attributes.date)).toLocaleString('nl-NL',  { timeZone: 'Europe/Amsterdam' }),
            license: data.channel.license
          }
        };

        if (rssItems.length < 5) {
          rssItems.push(ejsArticleData);
        }
        if (rssItems.length === 5 && !isRssBuilt) {
          renderRssFeed(rssItems);
          isRssBuilt = true;
        }

        ejs.renderFile('./layout/partials/article.ejs', ejsArticleData, {}, function(error, resultHTML) {
          if (error) {
            throw error;
          }
          const ejsPageData = Object.assign({}, data);
          ejsPageData.body = resultHTML;
          ejsPageData.article = ejsArticleData.article;
          console.log('Rendered article for permaLink');

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
          console.log('Rendered article for year archive');
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


function renderRssFeed(rssItems) {
  const rssItemsHTML = [];

  rssItems.sort((a, b) => {
    return a.article.date > b.article.date ? -1 : (a.article.date < b.article.data ? 1 : 0);
  }).forEach((rssItemData) => {
    rssItemData.article.content = rssItemData.article.content.replace(/<p>/g, '').replace(/<\/p>/g, '<br>');
    ejs.renderFile('./layout/rss/item.ejs', rssItemData, {}, function(error, resultXML) {
      if (error) {
        throw error;
      }
      rssItemsHTML.push(resultXML);
      console.log('Rendered RSS item');
    });
  });

  ejsChannelData = Object.assign({}, data);
  ejsChannelData.articles = rssItemsHTML.join('');
  ejs.renderFile('./layout/rss/channel.ejs', ejsChannelData, {}, function(error, resultXML) {
    if (error) {
      throw error;
    }
    console.log('Rendered RSS channel');

    ejs.renderFile('./layout/rss.ejs', { content: resultXML }, {}, (error, resultXML) => {
      if (error) {
        throw error;
      }
      fs.writeFileSync(`${destPath}/feeds/rss`, resultXML);

      console.log(`Wrote XML for feed/rss`);
    });
  });
}
