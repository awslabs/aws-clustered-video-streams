# Stale Playlist Detector (SPD)


## Design Notes

### Program Initialization

The Stale Playlist Detector (SPD) requires at one environment variable value to begin monitoring a live HLS endpoint. The operator must set the SPD\_ORIGIN\_URL environment variable to start the program. Other settings are derived from the playlist or program defaults.

When the SPD starts execution, the following happens at the top layer:

1. Parse environment variables into a configuration JSON structure. Use defaults where needed.
2. Create a new detector object and provide the configuration structure.
3. Start the detector.

### Detector Initialization

The detector object uses a finite state machine (FSM) created using the [Machina](https://www.npmjs.com/package/machina) package to manage it's overall state and execution. When enough playlists transition into or out of a stale state and notifications are sent, that data is tracked at the detector scope.  When the detector initializes, it will recursively parse playlists starting from the top using the [m3u8-parser](https://www.npmjs.com/package/m3u8-parser) package from the Video.js project. The detector will find the child playlists that include segment entries and create a playlist object for each one. Each playlist object creates a finite state machine (FSM) that manages the object's state through configuration, refreshing of playlist content, testing for changes and determining fresh or stale state.

### Flow of Execution

1. The detector object iterates through each playlist object and calls the playlist object's refresh function.
2. Each playlist object retrieves the content of its playlist, the current timestamp, and calculates a hash of the playlist data. 
3. The playlist object compares the current hash against the last hash generated, and takes action based on whether or not the hashes are different.
	* If the playlist has changed, the metrics for the playlist are updated and a fresh event is emitted from the playlist object.
	* If the playlist has not changed, the latest expected update is calculated from the last time the playlist changed. If that time has passed, the playlist object will emit a stale event. If the time for a change has not yet passed, the playlist object emits a fresh event. Metrics are not updated.
6. Each playlist will emit a fresh or stale event to the detector object.
7. The detector object will use the ratio of fresh to stale child playlists to determine if the entire playlist should be designated as stale or fresh. By default, 90% of the child playlists must be stale for the entire endpoint to be considered stale. This ratio is set in the environment variables before launch.
8. If the entire playlist has changed state (fresh to stale, or stale to fresh) notification is performed when SNS or SQS is specified.

### Output and Notification

The Stale Playlist Detector (SPD) provides several ways to indicate a playlist state change from fresh to stale and back. The SPD always prints console output using the Winston logger. Messages are prefixed with either `info:` or `error:` to indicate the nature of the message. The SPD will only print messages prefixed with `error:` when a playlist has become stale and action must be taken.

```
info: pausing for 2000ms
info: specified duration is 10s [https://devstreaming-cdn.apple.com/videos/streaming/examples/bipbop_4x3/gear1/prog_index.m3u8]
info: content hash is dfb189b7e44a40c042b74248da4d3a21 [https://devstreaming-cdn.apple.com/videos/streaming/examples/bipbop_4x3/gear1/prog_index.m3u8]
info: {"fromState":"refresh","action":"","toState":"check","namespace":"https://devstreaming-cdn.apple.com/videos/streaming/examples/bipbop_4x3/gear1/prog_index.m3u8"}
info: maximum allowed duration is 15s [https://devstreaming-cdn.apple.com/videos/streaming/examples/bipbop_4x3/gear1/prog_index.m3u8]
info: change due by 23:42:20 GMT+0000 (Coordinated Universal Time) 1563925340 [https://devstreaming-cdn.apple.com/videos/streaming/examples/bipbop_4x3/gear1/prog_index.m3u8]
info: {"fromState":"check","action":"","toState":"stale","namespace":"https://devstreaming-cdn.apple.com/videos/streaming/examples/bipbop_4x3/gear1/prog_index.m3u8"}
error: stale playlist [https://devstreaming-cdn.apple.com/videos/streaming/examples/bipbop_4x3/gear1/prog_index.m3u8]
info: specified duration is 10s [https://devstreaming-cdn.apple.com/videos/streaming/examples/bipbop_4x3/gear2/prog_index.m3u8]
info: content hash is dfb189b7e44a40c042b74248da4d3a21 [https://devstreaming-cdn.apple.com/videos/streaming/examples/bipbop_4x3/gear2/prog_index.m3u8]
info: {"fromState":"refresh","action":"","toState":"check","namespace":"https://devstreaming-cdn.apple.com/videos/streaming/examples/bipbop_4x3/gear2/prog_index.m3u8"}
info: maximum allowed duration is 15s [https://devstreaming-cdn.apple.com/videos/streaming/examples/bipbop_4x3/gear2/prog_index.m3u8]
info: change due by 23:42:20 GMT+0000 (Coordinated Universal Time) 1563925340 [https://devstreaming-cdn.apple.com/videos/streaming/examples/bipbop_4x3/gear2/prog_index.m3u8]
info: {"fromState":"check","action":"","toState":"stale","namespace":"https://devstreaming-cdn.apple.com/videos/streaming/examples/bipbop_4x3/gear2/prog_index.m3u8"}
error: stale playlist [https://devstreaming-cdn.apple.com/videos/streaming/examples/bipbop_4x3/gear2/prog_index.m3u8]
```

The SPD will identify the specific playlist in brackets at the end of messages.

```
info: ... [https://devstreaming-cdn.apple.com/videos/streaming/examples/bipbop_4x3/gear4/prog_index.m3u8]
```

The SPD can publish messages to AWS Simple Notification Service (SNS) topics or Amazon Simple Queue Service (SQS) queues, or both. The detector object will sent to SNS or SQS only when it transitions state at a detector scope. There are two cases for notification:

1. The detector is in fresh state and the number of stale playlists has exceeded the stale tolerance ratio. By default, this amount is 90% of all child playlists.
2. The detector is in a stale state and the number of stale playlists is now less than the tolerance ratio. By default, if this ratio falls below 90% then the playlist is now considered fresh.

An example notification message is shown below. The same message is used for SNS and SQS delivery, although it will be wrapped in a different JSON structure depending on the delivery system used.

```
{
    "options": {
        "cdn_url": "https://d43lrn1nr4l70l.cloudfront.net/out/v2/c557115c9628414cb5559d5bed8dd356/index.m3u8",
        "duration_multiplier": 1.5,
        "name": "Motocross",
        "origin_url": "https://d43lrn1nr4l70l.cloudfront.net/out/v2/c557115c9628414cb5559d5bed8dd356/index.m3u8",
        "region": "us-west-2",
        "sns_topic": "arn:aws:sns:us-west-2:658937807511:RodeoVideoStreamStalePlaylistDetector",
        "stale_tolerance": 0.9
    },
    "playlists": {
        "https://d23lrn1nr4l70l.cloudfront.net/out/v2/c557115c9628414cb6559d5bed8dd256/index_1.m3u8": {
            "state": "stale",
            "changed": 1563066645,
            "duration": 8,
            "mean_duration": "7.9",
            "median_duration": "8.0",
            "min_duration": "5.0",
            "max_duration": "11.0"
        },
        "https://d23lrn1nr4l70l.cloudfront.net/out/v2/c557115c9628414cb6559d5bed8dd256/index_2.m3u8": {
            "state": "stale",
            "changed": 1563066645,
            "duration": 8,
            "mean_duration": "7.9",
            "median_duration": "8.0",
            "min_duration": "5.0",
            "max_duration": "11.0"
        },
        "https://d23lrn1nr4l70l.cloudfront.net/out/v2/c557115c9628414cb6559d5bed8dd256/index_3.m3u8": {
            "state": "stale",
            "changed": 1563066645,
            "duration": 8,
            "mean_duration": "7.9",
            "median_duration": "8.0",
            "min_duration": "3.0",
            "max_duration": "13.0"
        },
        "https://d23lrn1nr4l70l.cloudfront.net/out/v2/c557115c9628414cb6559d5bed8dd256/index_4.m3u8": {
            "state": "stale",
            "changed": 1563066645,
            "duration": 8,
            "mean_duration": "7.9",
            "median_duration": "8.0",
            "min_duration": "5.0",
            "max_duration": "11.0"
        }
    },
    "detector": {
        "total": 4,
        "fresh": 0,
        "stale": 4,
        "stale_playlist_percent": 100,
        "stale_tolerance_percent": 90,
        "state": "stale",
        "sequence": 82
    }}
```

The notification message includes the SPD's configuration data in the `options` block.

Each `playlist` object in the list maintains data about it's current state, the timestamp of the last observed change, the current segment duration, and simple metrics about the playlist's change frequency.

The `detector` block at end includes summary data that includes a count of total, stale and fresh playlists, the percentage of stale playlists compared to the tolerance, and the overall state of the endpoint. The detector also includes a `sequence` number in it's messages. The sequence number starts at zero for each detector and is incremented each time a message is sent. It is set to zero when the detector is started. You can use this number to help process and sort messages in the case they arrive out of order, or if you are storing them in a way that can be queried, like [CloudWatch Insights](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/AnalyzingLogData.html).

## Navigate

Navigate to [README](README.md) | [Install](INSTALL.md) | [Design](DESIGN.md)

