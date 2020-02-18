// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

'use strict';

const AWS = require('aws-sdk');
const logger = require("./logger").logger;

exports.notify = async(message, options) => {
    logger.info("notify message = " + message);
    if (options.sqs_url) {
        logger.info("sending SQS");
        try {
            send_sqs(options.sqs_url, options.region, message);
        } catch (error) {
            logger.error(error);
        }
    } else {
        logger.info("skipping SQS");
    }
    if (options.sns_topic) {
        logger.info("sending SNS");
        try {
            send_sns(options.sns_topic, options.region, message);
        } catch (error) {
            logger.error(error);
        }
    } else {
        logger.info("skipping SNS");
    }
};

let send_sqs = (sqs_url, region, message) => {
    // create the client
    let sqs = new AWS.SQS({
        region: region
    });
    // wrap in a promise
    return new Promise((resolve, reject) => {
        var params = {
            MessageBody: message,
            QueueUrl: sqs_url,
        };
        // send it
        sqs.sendMessage(params, function(err, data) {
            if (err) logger.error("error sending SQS"); // an error occurred
            else logger.info("successfully sent SQS"); // successful response
            resolve();
        });
    });
};

let send_sns = (topic_arn, region, message) => {
    // create the client
    let sns = new AWS.SNS({
        region: region
    });
    // wrap in a promise
    return new Promise((resolve, reject) => {
        var params = {
            Message: message,
            Subject: "Stale Playlist Detector Message",
            TopicArn: topic_arn
        };
        // send it
        sns.publish(params, function(err, data) {
            if (err) logger.error("error sending SNS"); // an error occurred
            else logger.info("successfully sent SNS"); // successful response
            resolve();
        });
    });
};