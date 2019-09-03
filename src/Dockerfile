# Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

# start with long-term-support version of the node.js with alpine os docker image
FROM node:lts-alpine

# create the application directory
RUN mkdir /detector
WORKDIR /detector

# install application dependencies
RUN npm install aws-sdk jStat lodash m3u8-parser machina winston

# copy the application files
COPY *.js ./

# run it when the container starts -- requires environment vars
CMD node main.js
