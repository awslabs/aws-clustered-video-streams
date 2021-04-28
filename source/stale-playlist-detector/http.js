// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

'use strict';

const http = require('http');
const https = require('https');

exports.http_get = async(url) => {
    let client = (url.startsWith("https:") ? https : http);
    // wrap the HTTP request in a promise
    let promise = new Promise((resolve, reject) => {
        let buffer = '';
        let request = client.request(url, (response) => {
            response.on('data', (data) => {
                // receive data
                buffer += data;
            });
            response.on('end', () => {
                // finished
                resolve({
                    "headers": response.headers,
                    "code": response.statusCode,
                    "body": buffer
                });
            });
        });
        request.on('socket', (socket) => {
            // connection/transmission timeout
            socket.setTimeout(5000);
            socket.on('timeout', () => {
                request.destroy();
            });
        });
        request.on('error', (error) => {
            // boom
            reject(error);
        });
        request.end();
    });
    return promise;
};