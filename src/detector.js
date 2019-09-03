// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

'use strict';

const http_get = require("./http").http_get;
const logger = require("./logger").logger;
const m3u8_parser = require('m3u8-parser');
const machina = require("machina");
const notify = require("./notify").notify;
const url = require('url');
const Playlist = require("./playlist").Playlist;

var get_playlists_with_segments = async function(master_url, current_url, playlists) {
    let data = await http_get(current_url);
    let parser = new m3u8_parser.Parser();
    parser.push(data.body);
    parser.end();
    if (parser.manifest.segments && parser.manifest.segments.length > 0) {
        playlists.push(current_url);
    }
    if (parser.manifest.playlists && parser.manifest.playlists.length > 0) {
        for (let playlist of parser.manifest.playlists) {
            let absolute_url = url.resolve(master_url, playlist.uri);
            await get_playlists_with_segments(master_url, absolute_url, playlists);
        }
    }
}

class Detector {
    start() {
        this.fsm.start();
    };

    constructor(options) {
        // save a copy of the options used to initialize this detector
        this.options = options;
        // sequence is used to number outbound notifications
        this.internal_sequence = 0;
        // out playlist objects
        this.playlists = [];
        // last state we notified
        this.last_notified_state = "fresh";
        // default pause between samples
        this.pause_ms = 500;
        // calculated pause is 1/5 * segment time
        this.segment_pause_divisor = 5;
        let classobject = this;
        // create the detector's state machine
        this.fsm = new machina.Fsm({
            initialize: function(options) {},
            namespace: options.cdn_url,
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
                        // validate configuration data
                        if (!options.origin_url) {
                            logger.error("missing options.origin_url");
                            this.transition("configuration-problem");
                        } else {
                            if (!options.cdn_url) {
                                logger.error("missing options.cdn_url");
                                this.transition("configuration-problem");
                            } else {
                                this.transition("configure");
                            }
                        }
                    }
                },
                "configure": {
                    _onEnter: async function() {
                        // find the playlists with segments
                        let playlists = [];
                        await get_playlists_with_segments(classobject.options.origin_url, classobject.options.origin_url, playlists);
                        classobject.playlists = [];
                        // this handles the fresh and stale events emitted
                        var playlist_event_handler = (function() {
                            let detector = classobject;
                            return function(playlist) {
                                let total = detector.playlists.length;
                                let stale = 0;
                                let fresh = 0;
                                let report = {
                                    options: classobject.options,
                                    playlists: {}
                                };
                                for (let playlist of detector.playlists) {
                                    stale += (playlist.fsm.state == "stale");
                                    fresh += (playlist.fsm.state == "fresh");
                                    report.playlists[playlist.options.url] = {
                                        state: playlist.fsm.state,
                                        changed: playlist.last_sample.timeseconds,
                                        duration: playlist.last_sample.duration,
                                        mean_duration: playlist.mean_duration,
                                        median_duration: playlist.median_duration,
                                        min_duration: playlist.min_duration,
                                        max_duration: playlist.max_duration
                                    };
                                }
                                if (stale + fresh == total) {
                                    // only measure once all fsms have reported
                                    let fraction = stale / total;
                                    report.detector = {
                                        total: total,
                                        fresh: fresh,
                                        stale: stale,
                                        stale_playlist_percent: (fraction * 100),
                                        stale_tolerance_percent: (detector.options.stale_tolerance * 100)
                                    };
                                    logger.info(`${total} total playlists, ${fresh} fresh, ${stale} stale, ${fraction * 100}% stale, ${detector.options.stale_tolerance * 100}% stale tolerance`);
                                    if (fraction >= detector.options.stale_tolerance) {
                                        if (detector.last_notified_state != "stale") {
                                            report.detector.state = "stale";
                                            // notify
                                            report.detector.sequence = detector.internal_sequence++;
                                            notify(JSON.stringify(report), classobject.options);
                                            detector.last_notified_state = "stale";
                                        }
                                    } else {
                                        if (detector.last_notified_state != "fresh") {
                                            report.detector.state = "fresh";
                                            // notify
                                            report.detector.sequence = detector.internal_sequence++;
                                            notify(JSON.stringify(report), classobject.options);
                                            detector.last_notified_state = "fresh";
                                        }
                                    }
                                }
                            };
                        })();
                        for (let url of playlists) {
                            let playlist = new Playlist({
                                detector_options: options,
                                url: url,
                                description: url,
                                detector: classobject
                            });
                            playlist.fsm.on("fresh", playlist_event_handler);
                            playlist.fsm.on("stale", playlist_event_handler);
                            playlist.start();
                            classobject.playlists.push(playlist);
                        }
                        this.transition("check");
                    }
                },
                "check": {
                    _onEnter: function() {
                        for (let playlist of classobject.playlists) {
                            playlist.refresh();
                        }
                        this.transition("pause");
                    }
                },
                "pause": {
                    _onEnter: (options) => {
                        // use the default or calculate a better pause_ms value
                        if (classobject.playlists[0].last_sample && classobject.playlists[0].last_sample.duration) {
                            let duration = classobject.playlists[0].last_sample.duration;
                            if (duration) {
                                classobject.pause_ms = Number.parseInt((duration * 1000) / classobject.segment_pause_divisor);
                            }
                        }
                        logger.info(`pausing for ${classobject.pause_ms}ms [${classobject.options.origin_url}]`);
                        var f = (function() {
                            return function() {
                                classobject.fsm.transition("check");
                            };
                        })();
                        setTimeout(f, classobject.pause_ms);
                    }
                },
                "configuration-problem": {
                    _onEnter: function() {
                        logger.error("unable to proceed");
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

exports.Detector = Detector;