# CLAUDE.md for eigenkunsteerst.org

## Build and Run Commands
- Build static site: `npm run build` (DEBUG=* node index.js)
- Start local server: `npm start` (DEBUG=* node server.js)
- Docker build: `docker build -t eigenkunsteerst:1 .`
- Docker run: `docker run -id -p 3001:3001 --name eigenkunsteerst -v "$PWD":/usr/src/app eigenkunsteerst:1`

## Code Style Guidelines
- Modules: Uses ES Modules with import/export syntax
- JavaScript: ES6+ syntax, Node.js style
- Indentation: 2 spaces
- Error handling: Use callback pattern with consistent error-first callbacks
- Naming: camelCase for variables/functions, UPPER_CASE for constants
- File naming: kebab-case for files (except components)
- Image requirements: 982px wide for article images
- Debug logging: Use debug package with namespaces ('eigenkunsteerst', 'server')
- Date formatting: Use consistent DATE_FORMATTER object for localization
- Paths: Use path.join for cross-platform path handling
- Modern APIs: Use fs.access instead of fs.exists, URL API instead of url.parse

## Project Structure
- /data/articles/ - Markdown content organized by year
- /data/config.json - Site configuration 
- /layout/ - EJS templates and partials
- /build/ - Generated static site (not in repo)
- /index.js - Main build script for generating static HTML/XML
- /server.js - Simple development server