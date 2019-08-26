## aws-stale-playlist-detector

The Stale Playlist Detector (SPD) is a tool to monitor live HLS origin endpoints for changing playlists. The Stale Playlist Detector (SPD) will use data in the top-level playlist, the child playlists, and other information provided by the operator to determine the time by which each playlist should change. If enough playlists do not change by the deadline, the SPD can issue a notification through SNS or SQS to alert operators or other automated systems there may be a problem with the monitored live stream.

## License

This library is licensed under the Apache 2.0 License. 
