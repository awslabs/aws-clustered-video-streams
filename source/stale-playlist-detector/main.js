// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

'use strict';

/*
Required environment Variables:
SPD_ORIGIN_URL = origin endpoint (http or https)

Optional environment Variables:
SPD_CDN_URL = CDN endpoint (http or https)
SPD_DURATION_MULTIPLIER = segment duration * multipler = maximum time allowed between playlist changes (default: 1.5)
SPD_NAME = anything to identify this instance of the SPD for humans (default: Stale Playlist Detector)
SPD_REGION = desired AWS region string (default: us-west-2)
SPD_SQS_URL = queue endpoint (https)
SPD_SNS_TOPIC = topic arn (AWS ARN) (default 1.5)
SPD_STALE_TOLERANCE = fraction of playlists that must be stale to notify (default: 0.95)
SPD_CHANGE_DETECT = MEDIASEQUENCE or CONTENTHASH (method to determine when playlist changes, default: MEDIASEQUENCE)
SPD_SEGMENT_PAUSE_DIVISOR = the segment time (like 2,4,6 seconds) / this number = time to wait between playlist samples (default: 5)
SPD_RELOAD_ON_TOP_LEVEL_CHANGE = reload the configuration of the top-level playlist changes (default: true)

Setting SPD_SQS_URL or SPD_SNS_TOPIC variables also requires access to a role or credentials
by the AWS SDK that grants permissions to these services for use.

Environment Variables Related to the AWS SDK:
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
AWS_SESSION_TOKEN
AWS_DEFAULT_REGION
AWS_DEFAULT_OUTPUT
AWS_DEFAULT_PROFILE
AWS_CA_BUNDLE
AWS_SHARED_CREDENTIALS_FILE
AWS_CONFIG_FILE

https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-envvars.html

*/

let detector_options = {
    "cdn_url": process.env.SPD_CDN_URL || process.env.SPD_ORIGIN_URL,
    "duration_multiplier": process.env.SPD_DURATION_MULTIPLIER ? Number.parseFloat(process.env.SPD_DURATION_MULTIPLIER) : 1.5,
    "name": process.env.SPD_NAME || "Stale Playlist Detector",
    "origin_url": process.env.SPD_ORIGIN_URL,
    "region": process.env.SPD_REGION || "us-west-2",
    "sns_topic": process.env.SPD_SNS_TOPIC,
    "sqs_url": process.env.SPD_SQS_URL,
    "stale_tolerance": process.env.SPD_STALE_TOLERANCE ? Number.parseFloat(process.env.SPD_STALE_TOLERANCE) : 0.95,
    "change_detect": process.env.SPD_CHANGE_DETECT || "MEDIASEQUENCE",
    "segment_pause_divisor": process.env.SPD_SEGMENT_PAUSE_DIVISOR ? Number.parseInt(process.env.SPD_SEGMENT_PAUSE_DIVISOR) : 5,
    "reload_on_top_level_change": process.env.SPD_RELOAD_ON_TOP_LEVEL_CHANGE ? process.env.SPD_RELOAD_ON_TOP_LEVEL_CHANGE.toLowerCase() == "true" : false
};

const Detector = require("./detector").Detector;
let detector = new Detector(detector_options);
detector.start();