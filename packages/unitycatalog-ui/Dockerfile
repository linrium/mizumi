# syntax=docker.io/docker/dockerfile:1.7-labs
FROM node:18-alpine

ARG PROXY_HOST=server
WORKDIR /ui

COPY package.json yarn.lock ./

RUN apk add --no-cache jq \
    && jq --arg proxy "http://$PROXY_HOST:8080" '.proxy = $proxy' package.json > temp.json \
    && mv temp.json package.json \
    && yarn install --network-timeout 1000000

COPY --exclude=package.json --exclude=yarn.lock . ./

CMD ["yarn", "start"]
