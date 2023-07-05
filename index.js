/**
 * Static site generator generating HTML and XML (for RSS) from markdown articles using ejs templating.
 * @author  Vincent Bruijn <v@y-a-v-a.org>
 */
const startTime = Date.now();
const fs = require('fs');
const path = require('path');

const debug = require('debug')('eigenkunsteerst');
const ejs = require('ejs');
const fse = require('fs-extra');
const marked = require('marked');
const frontMatter = require('front-matter');
const postcss = require('postcss');
const cssnano = require('cssnano');

const config = require('./data/config');

const fsWriteCallback = (msg) => (error) => {
  if (error) throw error;
  debug(msg);
};

const DATE_FORMATTER = {
  weekday: 'long',
  year: 'numeric',
  month: 'long',
  day: 'numeric',
};

// config.baseUrl = 'http://eigenkunsteerst.test';
// config.baseUrl = 'http://localhost:3000';

const destPath = './build';
const articleSrc = './data/articles';
const images = {
  src: './data/images/',
  dest: `${destPath}/uploads/assets/`,
};

const assets = {
  src: './layout/assets/',
  dest: `${destPath}/`,
};

const data = {
  currentYear: new Date().getUTCFullYear(),
  site: {
    baseUrl: config.baseUrl,
    title: config.siteTitle,
    keywords: config.metaKeywords,
    description: config.metaDescription,
    navigationItems: [],
    image: '',
  },
  channel: {
    title: config.rssTitle,
    baseUrl: config.baseUrl,
    description: config.description,
    language: config.language,
    copyright: config.copyright,
    lastBuildDate: new Date().toString(),
    license: config.license,
  },
};

// always empty dest dir first
fse.emptyDirSync(destPath);

// prepare dest folder by copying assets
fse.copySync(images.src, images.dest);
fse.copySync(assets.src, assets.dest);

const cssSrcPath = `${assets.src}/css/main.css`;
const cssDestPath = `${assets.dest}/css/main.css`;
const css = fs.readFileSync(cssSrcPath);
postcss(cssnano)
  .process(css, { from: cssSrcPath, to: cssDestPath })
  .then((result) => {
    fs.writeFile(cssDestPath, result.css, () => true);
  });

fse.mkdirsSync(`${destPath}/feeds`);
debug('Set up some directories');

// read article data dir
fs.readdir(articleSrc, (error, yearDirs) => {
  if (error) throw error;

  const navigationItems = [];

  // filter out non-4-digit directories like .DS_Store etc.
  yearDirs = yearDirs.filter((year) => {
    return /^[0-9]{4}$/.test(year);
  });

  // create basic nav data object
  yearDirs
    .sort()
    .reverse()
    .forEach((year) => {
      navigationItems.push({
        URL: `/${year}.html`,
        name: `${year}`,
        active: false,
      });
    });

  // cache most recent year for index.html
  let [mostRecentYear] = yearDirs;
  const rssItems = [];
  let isRssBuilt = false;

  // loop over year named directories
  yearDirs.forEach((yearDir, yearIndex) => {
    const articleSrcYearDir = path.join(articleSrc, yearDir);

    let yearCollection = [];

    // read files from year directory
    fs.readdir(articleSrcYearDir, (error, files) => {
      if (error) throw error;

      debug('Prepare navigation');
      data.site.navigationItems = navigationItems.map((year) => {
        let { URL, name } = year;
        return {
          URL,
          name,
          active: year.name === yearDir,
        };
      });

      // process markdown files
      files.forEach((file, index) => {
        if (file.startsWith('_')) {
          return;
        }
        const articleFileMd = path.join(articleSrcYearDir, file);

        const articleMd = fs.readFileSync(articleFileMd, 'utf8');

        // read meta data from markdown document
        const pageData = frontMatter(articleMd);

        // render markdown into HTML
        const rendered = marked.parse(pageData.body, { pedantic: true });

        // apply some magic to filenames
        const fileName = file.replace(/ /g, '+').replace('md', 'html');
        const fileURI = encodeURIComponent(file)
          .replace(/%20/g, '+')
          .replace('md', 'html');

        // populate basic article data object
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
            permaLink: `${data.site.baseUrl}/${yearDir}/${fileURI}`,
            content: rendered,
            date: pageData.attributes.date,
            pubDate: pageData.attributes.date,
            dateString: new Date(pageData.attributes.date).toLocaleString(
              'nl-NL',
              DATE_FORMATTER
            ),
            license: data.channel.license,
            keywords: pageData.attributes.keywords || config.metaKeywords,
            description:
              pageData.attributes.description || config.metaDescription,
          },
        };

        // add last 5 articles to rssItems list
        if (rssItems.length < 5) {
          rssItems.push({ ...ejsArticleData.article });
        }
        if (rssItems.length === 5 && !isRssBuilt) {
          renderRssFeed(rssItems, data);
          isRssBuilt = true;
        }

        // process article template
        ejs.renderFile(
          './layout/partials/article.ejs',
          ejsArticleData,
          {},
          (error, resultHTML) => {
            if (error) throw error;

            const ejsPageData = Object.assign({}, data);
            ejsPageData.body = resultHTML;
            ejsPageData.article = ejsArticleData.article;

            debug('Rendered article for permaLink');

            ejs.renderFile(
              './layout/master.ejs',
              ejsPageData,
              {},
              (error, pageHTML) => {
                if (error) throw error;

                const yearDirName = `${destPath}/${yearDir}`;

                fse.mkdirsSync(yearDirName);
                fs.writeFile(
                  path.join(yearDirName, fileName),
                  pageHTML,
                  fsWriteCallback(`Wrote HTML for ${file}`)
                );
              }
            );
          }
        );

        ejsArticleData.article.isSingle = false;

        // process article template for year overview page
        ejs.renderFile(
          './layout/partials/article.ejs',
          ejsArticleData,
          {},
          (error, resultHTML) => {
            if (error) throw error;

            yearCollection.push([
              ejsArticleData.article.date,
              resultHTML,
              ejsArticleData.article.image,
            ]);
            debug('Rendered article for year archive');
          }
        );
      });

      if (yearCollection.length) {
        let ejsPageData = Object.assign({}, data);
        yearCollection = yearCollection
          .sort((a, b) => {
            let dateA = new Date(a[0]).getTime();
            let dateB = new Date(b[0]).getTime();
            return dateA > dateB ? 1 : dateA < dateB ? -1 : 0;
          })
          .reverse();

        ejsPageData.body = yearCollection.map((el) => el[1]).join('\n');
        ejsPageData.article = false;
        let [[, , firstImage]] = yearCollection;
        ejsPageData.site.image = firstImage;

        ejs.renderFile(
          './layout/master.ejs',
          ejsPageData,
          {},
          (error, pageHTML) => {
            if (error) throw error;

            fs.writeFile(
              path.join(destPath, `${yearDir}.html`),
              pageHTML,
              fsWriteCallback(`Wrote HTML for ${yearDir}`)
            );
            if (mostRecentYear === yearDir) {
              const fileName = path.join(destPath, 'index.html');

              fs.writeFile(
                fileName,
                pageHTML,
                fsWriteCallback(`Wrote HTML for index.html`)
              );
            }
          }
        );
      }
    });
  });
});

function renderRssFeed(rssItems, data) {
  const rssItemsHTML = [];
  const ejsChannelData = Object.assign({}, data);

  // sort rss items on date
  rssItems
    .sort((a, b) => {
      const dateA = new Date(a.date);
      const dateB = new Date(b.date);
      return dateA > dateB ? -1 : dateA < dateB ? 1 : 0;
    })
    .forEach((rssItemData) => {
      // render xml for each item
      rssItemData.content = rssItemData.content
        .replace(/<p>/g, '')
        .replace(/<\/p>/g, '<br>');
      ejs.renderFile(
        './layout/rss/item.ejs',
        { article: rssItemData },
        {},
        (error, resultXML) => {
          if (error) throw error;
          rssItemsHTML.push(resultXML);
          debug('Rendered RSS item');
        }
      );
    });

  // render channel meta data xml
  ejsChannelData.articles = rssItemsHTML.join('');
  ejs.renderFile(
    './layout/rss/channel.ejs',
    ejsChannelData,
    {},
    (error, resultXML) => {
      if (error) throw error;
      debug('Rendered RSS channel');

      // render and write whole rss xml
      ejs.renderFile(
        './layout/rss.ejs',
        { content: resultXML },
        {},
        (error, resultXML) => {
          if (error) throw error;
          fs.writeFile(
            path.join(destPath, 'feeds', 'rss.xml'),
            resultXML,
            fsWriteCallback(`Wrote XML for feed/rss`)
          );
        }
      );
    }
  );
}

process.on('exit', (code) => {
  debug(`Build took ${Date.now() - startTime}ms`);
});
