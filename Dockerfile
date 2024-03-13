FROM node:20-slim

RUN npm i -g npm && \
    apt-get update && \
    apt-get upgrade -y

ENV DEBUG=*

WORKDIR /usr/src/app
