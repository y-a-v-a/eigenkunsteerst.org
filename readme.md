# SSG for eigenkunsteerst.org

Static Site Generator that will output a set of plain HTML and XML files based upon ejs templates, which I upload to the domain http://www.eigenkunsteerst.org. Comments present in code for those who want to learn how to create a SSG.

## Build

To build the static sites call `npm run build`. To run a simple debug server call `npm start`.

Images should be 982px wide.

## Inspiration

https://medium.com/douglas-matoso-english/build-static-site-generator-nodejs-8969ebe34b22

## License

(c) copyright 2008-2018 Vincent Bruijn <vebruijn@gmail.com>

```sh
docker build -t eigenkunsteerst:1 .

docker run -id -p 3001:3001 --name eigenkunsteerst -v "$PWD":/usr/src/app eigenkunsteerst:1
```