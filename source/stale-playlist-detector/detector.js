// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

'use strict';

const crypto = require('crypto');
const epoch = require("./epoch").timeseconds;
const http_get = require("./http").http_get;
const logger = require("./logger").logger;
const m3u8_parser = require('m3u8-parser');
const machina = require("machina");
const notify = require("./notify").notify;
const url = require('url');
const Playlist = require("./playlist").Playlist;


var get_playlists_with_segments = async function(top_level_url, current_url, playlists) {
    let data = await http_get(current_url);
    let parser = new m3u8_parser.Parser();
    parser.push(data.body);
    parser.end();
    if (parser.manifest.segments && parser.manifest.segments.length > 0) {
        playlists.push(current_url);
    }
    if (parser.manifest.playlists && parser.manifest.playlists.length > 0) {
        for (let playlist of parser.manifest.playlists) {
            let absolute_url = url.resolve(top_level_url, playlist.uri);
            await get_playlists_with_segments(top_level_url, absolute_url, playlists);
        }
    }
};


var url_contents_hash = async function(url) {
    let data = await http_get(url);
    let hash = crypto.createHash('md5');
    hash.update(data.body);
    return hash.digest('hex');
};

class Detector {
    constructor(options) {
        // save a copy of the options used to initialize this detector
        this.options = options;
        // sequence is used to number outbound notifications
        this.internal_sequence = 0;
        // out playlist objects
        this.playlists = [];
        this.top_level_playlist_hash = "";
        this.top_level_playlist_checked = epoch();
        // last state we notified
        this.last_notified_state = "";
        this.last_fresh_count = 0;
        this.last_stale_count = 0;
        // default pause between samples
        this.pause_ms = 500;
        // pause time during configuration back-off
        this.configure_back_off_pause_ms = 2500;
        // default pause is (segment time / segment_pause_divisor)
        this.segment_pause_divisor = options.segment_pause_divisor;
        let detector_object = this;
        // create the detector's state machine
        this.fsm = new machina.Fsm({
            initialize: function() {},
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
                        try {
                            detector_object.top_level_playlist_hash = await url_contents_hash(detector_object.options.origin_url);
                            detector_object.top_level_playlist_checked = epoch();
                            logger.info(`top-level playlist hash is ${detector_object.top_level_playlist_hash} [${detector_object.options.origin_url}]`);
                            // find the playlists with segments
                            let playlists = [];
                            await get_playlists_with_segments(detector_object.options.origin_url, detector_object.options.origin_url, playlists);
                            if (!playlists.length) {
                                logger.error(`no playlists [${detector_object.options.origin_url}]`);
                                if (detector_object.last_notified_state != "stale") {
                                    let report = {
                                        options: detector_object.options,
                                        playlists: {},
                                        detector: {
                                            total: 0,
                                            fresh: 0,
                                            stale: 0,
                                            stale_playlist_percent: 100,
                                            stale_tolerance_percent: (detector_object.options.stale_tolerance * 100),
                                            state: "stale",
                                            sequence: detector_object.internal_sequence++
                                        }
                                    };
                                    notify(JSON.stringify(report), detector_object.options);
                                    detector_object.last_notified_state = "stale";
                                }
                                this.transition("configure-pause");
                            } else {
                                detector_object.playlists = [];
                                // this handles the fresh and stale events emitted
                                var playlist_event_handler = (function() {
                                    let detector = detector_object;
                                    return function() {
                                        let total = detector.playlists.length;
                                        let stale = 0;
                                        let fresh = 0;
                                        let report = {
                                            options: detector.options,
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
                                        // only measure once all fsms have reported
                                        if (stale + fresh == total) {
                                            // tells us if the count of fresh and stale streams has changed
                                            const count_changed = (detector.last_fresh_count != fresh) || (detector.last_stale_count != stale);
                                            detector.last_fresh_count = fresh;
                                            detector.last_stale_count = stale;
                                            const stale_fraction = stale / total;
                                            report.detector = {
                                                total: total,
                                                fresh: fresh,
                                                stale: stale,
                                                stale_playlist_percent: (stale_fraction * 100),
                                                stale_tolerance_percent: (detector.options.stale_tolerance * 100)
                                            };
                                            logger.info(`${total} total playlists, ${fresh} fresh, ${stale} stale, ${stale_fraction * 100}% stale, ${detector.options.stale_tolerance * 100}% stale tolerance`);
                                            if (stale_fraction >= detector.options.stale_tolerance && detector.last_notified_state != "stale") {
                                                report.detector.reason = "stale tolerance exceeded";
                                                report.detector.state = "stale";
                                                // notify
                                                report.detector.sequence = detector.internal_sequence++;
                                                notify(JSON.stringify(report), detector.options);
                                                detector.last_notified_state = "stale";
                                            } else if (stale_fraction == 0 && detector.last_notified_state != "fresh") {
                                                report.detector.reason = "all streams fresh";
                                                report.detector.state = "fresh";
                                                // notify
                                                report.detector.sequence = detector.internal_sequence++;
                                                notify(JSON.stringify(report), detector.options);
                                                detector.last_notified_state = "fresh";
                                            } else if (count_changed) {
                                                detector.last_notified_state = (detector.last_notified_state == "") ? "stale" : detector.last_notified_state;
                                                report.detector.reason = "changed count of fresh or stale streams";
                                                report.detector.state = detector.last_notified_state;
                                                // notify
                                                report.detector.sequence = detector.internal_sequence++;
                                                notify(JSON.stringify(report), detector.options);
                                            }
                                        }
                                    };
                                })();
                                for (let url of playlists) {
                                    let playlist = new Playlist({
                                        detector_options: options,
                                        url: url,
                                        description: url,
                                        detector: detector_object
                                    });
                                    playlist.fsm.on("fresh", playlist_event_handler);
                                    playlist.fsm.on("stale", playlist_event_handler);
                                    playlist.start();
                                    detector_object.playlists.push(playlist);
                                }
                                this.transition("check-segment-playlists");
                            }
                        } catch (error) {
                            logger.error(error);
                            // logger.error(`unable to retrieve top-level playlist [${detector_object.options.origin_url}]`);
                            if (detector_object.last_notified_state != "stale") {
                                let report = {
                                    options: detector_object.options,
                                    playlists: {},
                                    detector: {
                                        total: 0,
                                        fresh: 0,
                                        stale: 0,
                                        stale_playlist_percent: 100,
                                        stale_tolerance_percent: (detector_object.options.stale_tolerance * 100),
                                        state: "stale",
                                        sequence: detector_object.internal_sequence++
                                    }
                                };
                                notify(JSON.stringify(report), detector_object.options);
                                detector_object.last_notified_state = "stale";
                            }
                            this.transition("configure-pause");
                        }
                    }
                },
                "configure-pause": {
                    _onEnter: () => {
                        logger.info(`pausing for ${detector_object.configure_back_off_pause_ms} ms`);
                        const f = (function() {
                            return function() {
                                detector_object.fsm.transition("configure");
                            };
                        })();
                        setTimeout(f, detector_object.configure_back_off_pause_ms);
                    }
                },
                "check-segment-playlists": {
                    _onEnter: function() {
                        for (let playlist of detector_object.playlists) {
                            playlist.refresh();
                        }
                        this.transition("check-top-level-playlist");
                    }
                },
                "check-top-level-playlist": {
                    _onEnter: async function() {
                        let hash = await url_contents_hash(detector_object.options.origin_url);
                        logger.info(`top-level playlist hash is ${hash} [${detector_object.options.origin_url}]`);
                        if (hash != detector_object.top_level_playlist_hash) {
                            logger.warn(`top-level playlist has changed [${detector_object.options.origin_url}]`);
                            detector_object.top_level_playlist_hash = hash;
                            if (detector_object.options.reload_on_top_level_change) {
                                logger.warn(`reloading configuration`);
                                this.transition("configure");
                            } else {
                                logger.warn(`not reloading configuration`);
                                this.transition("pause");
                            }
                        } else {
                            this.transition("pause");
                        }
                    }
                },
                "pause": {
                    _onEnter: () => {
                        // use the default or calculate a better pause_ms value
                        let duration = detector_object.pause_ms;
                        for (let playlist of detector_object.playlists) {
                            if (playlist.last_sample && playlist.last_sample.duration) {
                                duration = Math.max(duration, playlist.last_sample.duration * 1000);
                            }
                        }
                        detector_object.pause_ms = Number.parseInt(duration / detector_object.segment_pause_divisor);
                        logger.info(`pausing for ${detector_object.pause_ms}ms [${detector_object.options.origin_url}]`);
                        var f = (function() {
                            return function() {
                                detector_object.fsm.transition("check-segment-playlists");
                            };
                        })();
                        setTimeout(f, detector_object.pause_ms);
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

    start() {
        this.fsm.start();
    }

}

exports.Detector = Detector;