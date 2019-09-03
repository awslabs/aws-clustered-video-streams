# Stale Playlist Detector (SPD)

## Installing and Running

The Stale Playlist Detector (SPD) can be run as a standalone application on a workstation, physical or virtual server, or as a Docker container.

### General Prerequesites

The Stale Playlist Detector (SPD) code has been tested extensively with [Node.js LTS](https://nodejs.org/en/about/releases/).

The following npm packages are required by the tool:

* [aws-sdk](https://www.npmjs.com/package/aws-sdk)
* [jstat](https://www.npmjs.com/package/jstat)
* [lodash](https://www.npmjs.com/package/lodash)
* [m3u8-parser](https://www.npmjs.com/package/m3u8-parser)
* [machina](https://www.npmjs.com/package/machina)
* [winston](https://www.npmjs.com/package/winston)

### Runtime Configuration Settings

The Stale Playlist Detector (SPD) uses environment variables for configuration. This allows the most flexibility when using it standalone, in a virtual machine, or in a Docker container.

#### Required Environment Variables

* SPD\_ORIGIN\_URL = origin endpoint (http or https)

#### Optional Environment Variables

* SPD\_CDN\_URL = CDN endpoint (http or https)
* SPD\_DURATION\_MULTIPLIER = segment duration * multipler = maximum time allowed between playlist changes (default: 1.5)
* SPD\_NAME = anything to identify this instance of the SPD for humans (default: Stale Playlist Detector)
* SPD\_REGION = desired AWS region string (default: us-west-2)
* SPD\_SQS\_URL = queue endpoint (https)
* SPD\_SNS\_TOPIC = topic arn (AWS ARN)
* SPD\_STALE\_TOLERANCE = fraction of playlists that must be stale to notify (default: 0.95)
* SPD\_CHANGE\_DETECT = MEDIASEQUENCE or CONTENTHASH (method to determine when playlist changes, default: MEDIASEQUENCE)
 
Setting SPD\_SQS\_URL or SPD\_SNS\_TOPIC variables also require access to a role or credentials by the AWS SDK that grants permissions to these services for use.

#### Environment Variables Related to the AWS SDK

* AWS\_ACCESS\_KEY\_ID
* AWS\_SECRET\_ACCESS\_KEY
* AWS\_SESSION\_TOKEN
* AWS\_DEFAULT\_REGION
* AWS\_DEFAULT\_OUTPUT
* AWS\_DEFAULT\_PROFILE
* AWS\_CA\_BUNDLE
* AWS\_SHARED\_CREDENTIALS\_FILE
* AWS\_CONFIG\_FILE

[Details on docs.aws.amazon.com](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-envvars.html)

#### General Permissions and Networking

If you only want to monitor and capture logs from the SPD while it runs, and search or filter those logs to determine when action is needed, then no other permissions are required to run the detector. The detector's network traffic is concentrated on reading small text files (playlists) at a high rate. The detector must be able to make connections from the host or container to the origin endpoint. Make sure the host allows outgoing connections over HTTP or HTTPS to the endpoint so that the SPD can monitor the playlists.


#### AWS Permissions for SNS and SQS

The Stale Playlist Detector requires permissions that allow it to publish messages to the provided SNS topic or send messages to the provided SQS queue. The recommended way to grant permissions to an EC2 or container is through an IAM Role assigned to the resource when it starts. EC2 and ECS have inputs to specify an IAM Role. If you are running the program elsewhere and want to use SNS or SQS, you will need to provide access keys through environment variables for the SPD to use when notifying when a playlist changes state.

Here is an example role for the SPD to publish SNS topic notifications to a specific queue.

```
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Action": [
                "sns:publish"
            ],
            "Effect": "Allow",
            "Resource": "arn:aws:sns:us-west-4:123456789012:StalePlaylistDetectorNotify-SGZKQG"
        }
    ]
}
```

### Running on a Workstation or Server

The Stale Playlist Detector (SPD) is started from the `main.js` program. It can run on most platforms compatible with Node.js LTS. You should be able to run the program on a workstation, physical or virtual server. If you are monitoring a playlist with a large number of bitrates, you may be constrained by network performance on the local network. Verifying operation of the SPD should work fine from your workstation. After installing the npm dependencies and setting environment variables, the following should be all that's needed to begin monitoring an HLS origin:

`node main.js`

The program will continously output messages as it monitors the origin, regardless if any notification method was specified. The SPD can be launched in the background as a daemon process (headless) or launched inside a terminal multiplexer like [tmux](https://github.com/tmux/tmux/wiki).

### Building and Installing a Docker Container

Use the `Dockerfile` provided in the Git repository to build a container image and store it into an image repository for deployment. The following is an example command to build and tag the image. Run it from the same folder in which the `Dockerfile` is located.

`docker build -t stale-playlist-detector .`

Run the Docker image with a command similar to the following. Setting at least the SPD\_ORIGIN\_URL environment variable is required to run the image.

```
docker run -it \
    -e SPD_ORIGIN_URL=https://devstreaming-cdn.apple.com/videos/streaming/examples/bipbop_4x3/bipbop_4x3_variant.m3u8 \
    stale-playlist-detector:latest
```

After you start the container, it will parse the top-level playlist for the origin, find any child playlists and sample those on a periodic basis checking for changes to the playlist content. Below is sample output from the Stale Playlist Detector when it starts.

```
info: specified duration is 10s [https://devstreaming-cdn.apple.com/videos/streaming/examples/bipbop_4x3/gear2/prog_index.m3u8]
info: content hash is dfb189b7e44a40c042b74248da4d3a21 [https://devstreaming-cdn.apple.com/videos/streaming/examples/bipbop_4x3/gear2/prog_index.m3u8]
info: {"fromState":"refresh","action":"","toState":"check","namespace":"https://devstreaming-cdn.apple.com/videos/streaming/examples/bipbop_4x3/gear2/prog_index.m3u8"}
info: maximum allowed duration is 15s [https://devstreaming-cdn.apple.com/videos/streaming/examples/bipbop_4x3/gear2/prog_index.m3u8]
info: change due by 20:28:00 GMT+0000 (Coordinated Universal Time) 1563913680 [https://devstreaming-cdn.apple.com/videos/streaming/examples/bipbop_4x3/gear2/prog_index.m3u8]
info: {"fromState":"check","action":"","toState":"fresh","namespace":"https://devstreaming-cdn.apple.com/videos/streaming/examples/bipbop_4x3/gear2/prog_index.m3u8"}
info: fresh playlist [https://devstreaming-cdn.apple.com/videos/streaming/examples/bipbop_4x3/gear2/prog_index.m3u8]
```

This is a static, looping stream which will cause the SPD to issue errors to the console after about 15-20 seconds.

```
info: specified duration is 10s [https://devstreaming-cdn.apple.com/videos/streaming/examples/bipbop_4x3/gear1/prog_index.m3u8]
info: content hash is dfb189b7e44a40c042b74248da4d3a21 [https://devstreaming-cdn.apple.com/videos/streaming/examples/bipbop_4x3/gear1/prog_index.m3u8]
info: {"fromState":"refresh","action":"","toState":"check","namespace":"https://devstreaming-cdn.apple.com/videos/streaming/examples/bipbop_4x3/gear1/prog_index.m3u8"}
info: maximum allowed duration is 15s [https://devstreaming-cdn.apple.com/videos/streaming/examples/bipbop_4x3/gear1/prog_index.m3u8]
info: change due by 20:28:00 GMT+0000 (Coordinated Universal Time) 1563913680 [https://devstreaming-cdn.apple.com/videos/streaming/examples/bipbop_4x3/gear1/prog_index.m3u8]
info: {"fromState":"check","action":"","toState":"stale","namespace":"https://devstreaming-cdn.apple.com/videos/streaming/examples/bipbop_4x3/gear1/prog_index.m3u8"}
error: stale playlist [https://devstreaming-cdn.apple.com/videos/streaming/examples/bipbop_4x3/gear1/prog_index.m3u8]
info: 5 total playlists, 0 fresh, 5 stale, 100% stale, 95% stale tolerance
info: notify message = {"options":{"cdn_url":"https://devstreaming-cdn.apple.com/videos/streaming/examples/bipbop_4x3/bipbop_4x3_variant.m3u8","duration_multiplier":1.5,"name":"Stale Playlist Detector","origin_url":"https://devstreaming-cdn.apple.com/videos/streaming/examples/bipbop_4x3/bipbop_4x3_variant.m3u8","region":"us-west-2","stale_tolerance":0.95},"playlists":{"https://devstreaming-cdn.apple.com/videos/streaming/examples/bipbop_4x3/gear1/prog_index.m3u8":{"state":"stale","changed":1563913665,"duration":10,"mean_duration":0,"median_duration":0,"min_duration":0,"max_duration":0},"https://devstreaming-cdn.apple.com/videos/streaming/examples/bipbop_4x3/gear2/prog_index.m3u8":{"state":"stale","changed":1563913665,"duration":10,"mean_duration":0,"median_duration":0,"min_duration":0,"max_duration":0},"https://devstreaming-cdn.apple.com/videos/streaming/examples/bipbop_4x3/gear3/prog_index.m3u8":{"state":"stale","changed":1563913665,"duration":10,"mean_duration":0,"median_duration":0,"min_duration":0,"max_duration":0},"https://devstreaming-cdn.apple.com/videos/streaming/examples/bipbop_4x3/gear4/prog_index.m3u8":{"state":"stale","changed":1563913665,"duration":10,"mean_duration":0,"median_duration":0,"min_duration":0,"max_duration":0},"https://devstreaming-cdn.apple.com/videos/streaming/examples/bipbop_4x3/gear0/prog_index.m3u8":{"state":"stale","changed":1563913665,"duration":11,"mean_duration":0,"median_duration":0,"min_duration":0,"max_duration":0}},"detector":{"total":5,"fresh":0,"stale":5,"stale_playlist_percent":100,"stale_tolerance_percent":95,"state":"stale","sequence":0}}
info: skipping SQS
info: skipping SNS
```

Notice the messages leading up to the determination that playlists are stale. The Stale Playlist Detector (SPD) will print the duration specified in the playlist, the maximum allowed duration, the last content hash of the specific child playlist being checked, and the number of fresh and stale playlists. The SPD also prints the notification message it would send. Since we did not specify notification through SQS or SNS, the detector indicates that on the console output.

Once enough playlists have changed, the SPD will report the origin as fresh and optionally issue a notification through SQS or SNS.

## Navigate

Navigate to [README](README.md) | [Install](INSTALL.md) | [Design](DESIGN.md)
