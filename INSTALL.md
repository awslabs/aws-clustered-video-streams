# Deployment 

## Terminology

**stream-regions**: regions where redundant video streams are running

## Prerequisites

1. Decide which AWS regions you want to use to host your clustered video stream in.  The architecture currently supports a two region deploy.  
2. Follow the instructions in the [Developing](https://quip-amazon.com/vSwOA2vuRTaU#ATC9CAssfFe) section to build and host the project in your AWS account.
3. Deploy your live streams to RegionOne and RegionTwo as you normally do.  The streams must have a separate CloudFront distribution for each region.  You can use the [Live Streaming on AWS](https://aws.amazon.com/solutions/live-streaming-on-aws/) solution as a starting point for setting up the live streams.  Simply deploy an instance of that solution in each of your chosen regions.
4. Gather values for the following properties of these base live streams to be used in deploying the rest of the stack:
    * *RegionOne* - the first region you want to deploy stream instances to
    * *RegionTwo* - the second region you want to deploy stream instances to
    * For each region:
        * *CloudFrontDistributionId* - Id of the distribution in that region
        * *DistributionDomain* - domain name of the CloudFront Distribution in that region
        * *DistributionPlaylistUrl *- The url, using the DistributionDomain, of the top-level playlist for the stream in this region.
        * *OriginPlaylistUrl* - The url, using the OriginDomain, of the top-level playlist for the stream in this region.  If you are using MediaPackage as an origin, you can find this url in the MediaPackage console 

**Result**

* ![Image: image](images/cvs-deploy-prereq.png)

## Deploy the Stale Playlist Detector stack

Use CloudFormation to deploy the stale playlist detector in each stream-region using the information below.

**Template:** stale-playlist-detector.template
**Run in regions:** RegionOne AND RegionTwo
**Required Inputs:**

* *DistributionDomain* 
* *DistributionPlaylistUrl*
* *OriginPlaylistUrl* 

**Outputs used later in deployments**

* *TopicArn* - the ARN of the SNS topic stale playlist metrics are written to

**Result**

* ![Image: spd-healthcheck-deploy.png](images/spd-healthcheck-deploy.png)


## Deploy the copilot lambda in us-east-1

Lambda@Edge functions must be defined in us-east-1 before they can be attached to edge locations.

**Template:** copilot.template
**Run in regions:** us-east-1
**Required Inputs:**

* *ClusteredVideoStreamName* - the unique name across AWS for this clustered video stream.
* *RegionOne*
* *RegionOneDistributionDomain*
* *RegionTwo*
* *RegionTwoDistributionDomain*

**Outputs used later in deployments**

* *CopilotLambdaArn* - the ARN of the copilot lambda
* *CopilotLambdaVersion* - the Version of this copilot lambda

## Deploy the clustered-video-stream-instance stack

**Template:** clustered-video-stream-instance.template
**Run in regions:** RegionOne **AND** RegionTwo
**Required Inputs:**

* *ClusteredVideoStreamName* 
* *RegionOne*
* *RegionTwo*
* *CloudfrontDistributionId* - The CloudfronDistributionId from the deployment region

**Outputs used later in deployments**

* *MasterPlaylistBucket* - the name of the master playlist bucket deployed in this region.  
* *OriginAccessIdentity* - Origin access identity created to access the MasterPlaylistBucket from CloudFront.

**Result**

* ![Image: clustered-video-stream-instance-deploy.png](images/clustered-video-stream-instance-deploy.png)


## Deploy the clustered-video-stream stack

**Template:** clustered-video-stream.template
**Run in regions:** Any one region - RegionOne **OR** RegionTwo
**Required Inputs:**

* *ClusteredVideoStreamName*
* *RegionOne*
* *RegionOneCloudfrontDistributionId*
* *RegionOneOriginAccessIdentity*
* *RegionOneMasterPlaylistBucket*
* *RegionTwo*
* *RegionOneCloudfrontDistributionId*
* *RegionOneOriginAccessIdentity*
* *RegionOneMasterPlaylistBucket*

**Output **

* *MasterPlaylistCloudFrontDomain* - the domain name used to access the master playlist.  This is the domain we will use to distribute the clustered video stream to viewers.

**Result**

* ![Image: clustered-video-stream-deploy.png](images/clustered-video-stream-deploy.png)

## Create the merged master playlist  

1.  **Instructions coming soon!**

# Testing the deployment

### Testing failover

1. Setup a video player to playback using the master playlist.   
2. Use your browser developer tools to observe the domains being used to pull variant playlists and segments from the regional streams.
3. In the dynamodb state table in any region:
    1.   Set the distro_open attribute to false for the distribution domain matching the segments being consumed by the player.
4. The player will get errors for all requests on the closed domain and should start requesting segments from another available domain.  The video should continue to play without any noticable interruption.


## Developing

### Build docker container image for the stale playlist detector

Optional: see [INSTALL-stale-playlist-detector.md](./INSTALL-stale-playlist-detector.md)

### Build deployment packages

The build steps below use the following variables:

*region* - the name of the AWS region of a deployment package
*project* - project name you want to use for this package
*version* - version name you want to use for this pacakge
*bucket-base-name* - base bucket name for hosting regional deployment packages

**Create S3 buckets for hosting lambdas**

You must have a bucket for hosting lambda packages and web page assets in each AWS region that you want to deploy to.  The bucket names should be of the following format: <*base-bucket-name>*-<*region-name>*.  For example, if my base-bucket-name is “elementalrodeo99” and I want to deploy in eu-west-1 and eu-west-2, I would create the followin S3 buckets:

elementalrodeo99-eu-west-1
elementalrodeo99-eu-west-2

**Build the deployment packages**

The build script will create regional and global S3 assets required to deploy a clustered video stream on AWS.  

```
cd deployment
./build-s3-dist.sh <base-bucket-name> <project> <version>
```

**Host the deployment packages in S3**

**For each region** you want to deploy to:

```
cd deployment
aws s3 cp global-s3-assets/* s3://<base-bucket-name>-<region>/<project>/<version>
aws s3 cp regional-s3-assets/* s3://<base-bucket-name>-<region>/<project>/<version>
```

## Navigate

Navigate to [README](README.md) | [INSTALL](INSTALL.md) | [DESIGN](DESIGN.md)