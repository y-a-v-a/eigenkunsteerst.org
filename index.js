/**
 * Static site generator generating HTML, XML (for RSS) and Markdown (for LLMs) from markdown articles using ejs templating.
 * @author  Vincent Bruijn <v@y-a-v-a.org>
 */
const startTime = Date.now();
import fs from 'fs';
import path from 'path';

import debugModule from 'debug';
import ejs from 'ejs';
import fse from 'fs-extra';
import { marked } from 'marked';
import frontMatter from 'front-matter';
import postcss from 'postcss';
import cssnano from 'cssnano';

const config = JSON.parse(fs.readFileSync('./data/config.json', 'utf8'));

const debug = debugModule('eigenkunsteerst');

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

// collect all article metadata for markdown cross-references
const allArticles = {};

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

  // first pass: collect all article metadata and parsed content
  yearDirs.forEach((yearDir) => {
    const articleSrcYearDir = path.join(articleSrc, yearDir);
    const files = fs.readdirSync(articleSrcYearDir);
    allArticles[yearDir] = [];

    files.forEach((file) => {
      if (file.startsWith('_')) return;

      const articleFileMd = path.join(articleSrcYearDir, file);
      const articleMd = fs.readFileSync(articleFileMd, 'utf8');
      const pageData = frontMatter(articleMd);

      const mdFileName = file.replace(/ /g, '+');
      const dateString = new Date(pageData.attributes.date).toLocaleString(
        'nl-NL',
        DATE_FORMATTER
      );
      const description = pageData.attributes.description || '';

      // truncate at word boundary
      let shortDescription = description;
      if (description.length > 120) {
        shortDescription = description.substring(0, 120);
        const lastSpace = shortDescription.lastIndexOf(' ');
        if (lastSpace > 80) {
          shortDescription = shortDescription.substring(0, lastSpace);
        }
        shortDescription += '...';
      }

      allArticles[yearDir].push({
        title: pageData.attributes.title,
        date: pageData.attributes.date,
        dateString,
        image: pageData.attributes.image,
        description,
        shortDescription,
        markdownBody: pageData.body,
        parsedBody: marked.parse(pageData.body, { pedantic: true }),
        mdFileName,
        yearDir,
        file,
        keywords: pageData.attributes.keywords,
      });
    });

    // sort articles by date descending
    allArticles[yearDir].sort((a, b) => {
      const dateA = new Date(a.date).getTime();
      const dateB = new Date(b.date).getTime();
      return dateA > dateB ? -1 : dateA < dateB ? 1 : 0;
    });
  });

  debug('Collected all article metadata for markdown generation');

  // generate markdown pages
  renderMarkdownPages(yearDirs, navigationItems, mostRecentYear);

  // loop over year named directories, reusing parsed data from first pass
  yearDirs.forEach((yearDir) => {
    const articles = allArticles[yearDir];

    let yearCollection = [];

    debug('Prepare navigation');
    data.site.navigationItems = navigationItems.map((year) => {
      let { URL, name } = year;
      return {
        URL,
        name,
        active: year.name === yearDir,
      };
    });

    // process articles using cached parsed data
    articles.forEach((cached, index) => {
      // apply some magic to filenames
      const fileName = cached.file.replace(/ /g, '+').replace('md', 'html');
      const fileURI = encodeURIComponent(cached.file)
        .replace(/%20/g, '+')
        .replace('md', 'html');

      // populate basic article data object
      const ejsArticleData = {
        article: {
          index,
          isSingle: true,
          title: cached.title,
          pageTitle: `${cached.title} ${config.titleSuffix}`,
          image: cached.image,
          imageName: cached.image.replace(/\..*$/, ''),
          baseUrl: data.site.baseUrl,
          titleId: `${cached.title}`.replace(/\s+/g, '_'),
          permaLink: `${data.site.baseUrl}/${yearDir}/${fileURI}`,
          content: cached.parsedBody,
          date: cached.date,
          pubDate: cached.date,
          dateString: cached.dateString,
          license: data.channel.license,
          keywords: cached.keywords || config.metaKeywords,
          description: cached.description || config.metaDescription,
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
                fsWriteCallback(`Wrote HTML for ${cached.file}`)
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

/**
 * Generate markdown versions of all pages for LLM-friendly consumption.
 * Uses the original markdown source directly with EJS templates for navigation.
 */
const renderMarkdownPages = (yearDirs, navigationItems, mostRecentYear) => {
  const plainTitle = config.siteTitle.replace(/&bull;/g, '·');

  const mdSiteData = {
    plainTitle,
    description: config.description,
    copyright: config.copyright,
    license: config.license,
  };

  // render individual article markdown pages
  yearDirs.forEach((yearDir) => {
    const articles = allArticles[yearDir];
    const yearDirName = path.join(destPath, yearDir);
    fse.mkdirsSync(yearDirName);

    const mdNavItems = navigationItems.map((item) => ({
      name: item.name,
      active: item.name === yearDir,
    }));

    articles.forEach((article) => {
      const ejsData = {
        article,
        site: mdSiteData,
        navigationItems: mdNavItems,
        yearArticles: articles,
        currentYearDir: yearDir,
        mostRecentYear,
      };

      ejs.renderFile(
        './layout/markdown/article.ejs',
        ejsData,
        {},
        (error, resultMd) => {
          if (error) throw error;
          fs.writeFile(
            path.join(yearDirName, article.mdFileName),
            resultMd,
            fsWriteCallback(`Wrote Markdown for ${article.file}`)
          );
        }
      );
    });
  });

  // render year archive markdown pages
  yearDirs.forEach((yearDir) => {
    const articles = allArticles[yearDir];

    const mdNavItems = navigationItems.map((item) => ({
      name: item.name,
      active: item.name === yearDir,
    }));

    const ejsData = {
      yearDir,
      articles,
      site: mdSiteData,
      navigationItems: mdNavItems,
      mostRecentYear,
    };

    ejs.renderFile(
      './layout/markdown/year.ejs',
      ejsData,
      {},
      (error, resultMd) => {
        if (error) throw error;
        fs.writeFile(
          path.join(destPath, `${yearDir}.md`),
          resultMd,
          fsWriteCallback(`Wrote Markdown for ${yearDir}`)
        );
      }
    );
  });

  // render index.md with recent articles across all years
  const recentArticles = yearDirs
    .flatMap((yearDir) => allArticles[yearDir])
    .sort((a, b) => {
      const dateA = new Date(a.date).getTime();
      const dateB = new Date(b.date).getTime();
      return dateA > dateB ? -1 : dateA < dateB ? 1 : 0;
    })
    .slice(0, 10);

  const mdNavWithCounts = navigationItems.map((item) => ({
    name: item.name,
    articleCount: (allArticles[item.name] || []).length,
  }));

  const ejsData = {
    site: mdSiteData,
    navigationItems: mdNavWithCounts,
    recentArticles,
    mostRecentYear,
  };

  ejs.renderFile(
    './layout/markdown/index.ejs',
    ejsData,
    {},
    (error, resultMd) => {
      if (error) throw error;
      fs.writeFile(
        path.join(destPath, 'index.md'),
        resultMd,
        fsWriteCallback('Wrote Markdown for index.md')
      );
    }
  );

  debug('Generated all markdown pages');
};

const renderRssFeed = (rssItems, data) => {
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
