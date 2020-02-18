// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

'use strict';

const _ = require("lodash");
const crypto = require('crypto');
const epoch = require("./epoch").timeseconds;
const http_get = require("./http").http_get;
const jstat = require('jStat').jStat;
const logger = require("./logger").logger;
const machina = require("machina");
const m3u8_parser = require('m3u8-parser');

let playlist_hash = (text) => {
    let hash = crypto.createHash('md5');
    hash.update(text);
    return hash.digest('hex');
};

let lowest_duration = (manifest) => {
    // take the lowest duration from the segments or playlist
    let duration = Number.MAX_SAFE_INTEGER;
    if (manifest.segments) {
        for (let segment of manifest.segments) {
            if (segment.duration) {
                duration = Math.min(duration, segment.duration);
            }
        }
    }
    if (duration == Number.MAX_SAFE_INTEGER) {
        duration = Math.min(manifest.targetDuration, duration);
    }
    return Number.parseInt(duration);
};

class Playlist {
    state() {
        return this.fsm.state;
    }

    start() {
        this.fsm.start();
    }

    refresh() {
        this.fsm.transition("refresh");
    }

    changed(input) {
        // compare based on the hash of the playlist content
        if (this.options.detector_options.change_detect == "CONTENTHASH") {
            logger.info(`checking computed hash [${this.options.url}]`);
            return (input.hash != this.last_sample.hash);
        } else
        if (this.options.detector_options.change_detect == "MEDIASEQUENCE") {
            logger.info(`check media sequence value [${this.options.url}]`);
            return (input.media_sequence != this.last_sample.media_sequence);
        } else {
            throw "unknown change detection specified";
        }
    }

    constructor(options) {
        this.options = options;
        this.duration_multiplier = options.duration_multiplier ? Number.parseFloat(options.duration_multiplier) : 1.5;
        this.last_sample = {
            "timeseconds": 0,
            "hash": "",
            "media_sequence": 0,
            "duration": 0
        };
        this.change_durations = [];
        this.change_durations_max = 25;
        this.min_duration = 0;
        this.max_duration = 0;
        this.median_duration = 0;
        this.mean_duration = 0;
        let classobject = this;
        this.fsm = new machina.Fsm({
            initialize: function(options) {},
            namespace: options.url,
            initialState: "uninitialized",
            states: {
                uninitialized: {
                    "start": function() {
                        this.deferUntilTransition();
                        this.transition("validate");
                    }
                },
                "validate": {
                    _onEnter: function() {
                        // check that we have minimal configuration to run
                        if (!classobject.options.url) {
                            logger.error("options.url is missing");
                            this.transition("configuration-problem");
                        } else {
                            this.transition("configure")
                        }
                    }
                },
                "configure": {
                    _onEnter: function() {
                        this.transition("refresh");
                    }
                },
                "refresh": {
                    _onEnter: async function() {
                        try {
                            let data = await http_get(classobject.options.url);
                            let parser = new m3u8_parser.Parser();
                            parser.push(data.body);
                            parser.end();
                            let now = epoch();
                            // get the segment duration
                            // let duration = (parser.manifest && parser.manifest.targetDuration) ? Number.parseFloat(parser.manifest.targetDuration) : 0;
                            let duration = lowest_duration(parser.manifest);
                            logger.info(`specified duration is ${duration}s [${classobject.options.url}]`);
                            let hex = playlist_hash(data.body);
                            logger.info(`playist hash is ${hex} [${classobject.options.url}]`);
                            let media_sequence = Number.parseInt(parser.manifest.mediaSequence);
                            logger.info(`media sequence is ${media_sequence} [${classobject.options.url}]`);
                            this.transition("check", {
                                "timeseconds": now,
                                "hash": hex,
                                "media_sequence": media_sequence,
                                "duration": duration
                            });
                        } catch (error) {
                            logger.error(error);
                            this.transition("check", classobject.last_sample);
                        }
                    }
                },
                "check": {
                    _onEnter: async function(input) {
                        // compare current sample to last changed sample
                        if (classobject.changed(input)) {
                            // changed
                            let change_duration_seconds = input.timeseconds - classobject.last_sample.timeseconds;
                            classobject.last_sample = input;
                            logger.info(`changed after ${change_duration_seconds}s [${classobject.options.url}]`);
                            classobject.change_durations.push(change_duration_seconds);
                            while (classobject.change_durations.length > classobject.change_durations_max) {
                                classobject.change_durations.shift();
                            }
                            // logger.info(JSON.stringify(classobject.change_durations));
                            classobject.p90_duration = jstat.percentile(classobject.change_durations, 0.90).toFixed(1);
                            classobject.mean_duration = jstat.mean(classobject.change_durations).toFixed(1);
                            classobject.median_duration = jstat.median(classobject.change_durations).toFixed(1);
                            classobject.min_duration = jstat.min(classobject.change_durations).toFixed(1);
                            classobject.max_duration = jstat.max(classobject.change_durations).toFixed(1);
                            logger.info(`p90 duration is ${classobject.p90_duration}s from ${classobject.change_durations.length} samples [${classobject.options.url}]`);
                            logger.info(`mean duration is ${classobject.mean_duration}s from ${classobject.change_durations.length} samples [${classobject.options.url}]`);
                            logger.info(`median duration is ${classobject.median_duration}s from ${classobject.change_durations.length} samples [${classobject.options.url}]`);
                            logger.info(`min duration is ${classobject.min_duration}s from ${classobject.change_durations.length} samples [${classobject.options.url}]`);
                            logger.info(`max duration is ${classobject.max_duration}s from ${classobject.change_durations.length} samples [${classobject.options.url}]`);
                            this.transition("fresh");
                        } else {
                            // not changed
                            let max_duration = Number.parseInt(classobject.last_sample.duration * classobject.options.detector_options.duration_multiplier);
                            logger.info(`maximum allowed duration is ${max_duration}s [${classobject.options.url}]`);
                            let expected_update = classobject.last_sample.timeseconds + max_duration;
                            logger.info(`change due by ${new Date(expected_update * 1000).toTimeString()} ${expected_update} [${classobject.options.url}]`);
                            if (input.timeseconds > expected_update) {
                                this.transition("stale");
                            } else {
                                this.transition("fresh");
                            }
                        }
                    }
                },
                "stale": {
                    _onEnter: function() {
                        logger.error(`stale playlist [${classobject.options.url}]`);
                        this.emit("stale", classobject);
                    }
                },
                "fresh": {
                    _onEnter: function() {
                        logger.info(`fresh playlist [${classobject.options.url}]`);
                        this.emit("fresh", classobject);
                    }
                },
                "configuration-problem": {
                    _onEnter: function() {
                        logger.error("unable to proceed");
                        // stop here until start message
                    }
                }
            },
            "start": function() {
                this.handle("start");
            }
        });
        this.fsm.on("transition", function(event, data) {
            logger.info(JSON.stringify(event), JSON.stringify(data));
        });
    }
}

exports.Playlist = Playlist;