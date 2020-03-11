#!/bin/sh
AWS_PROFILE=events AWS_DEFAULT_REGION=us-east-1 aws s3 cp dashboard.html s3://stream-us-east-1/
AWS_PROFILE=events AWS_DEFAULT_REGION=us-east-1 aws s3 cp dashboard.js s3://stream-us-east-1/
AWS_PROFILE=events AWS_DEFAULT_REGION=us-west-2 aws s3 cp dashboard.html s3://stream-us-west-2/
AWS_PROFILE=events AWS_DEFAULT_REGION=us-west-2 aws s3 cp dashboard.js s3://stream-us-west-2/
AWS_PROFILE=events AWS_DEFAULT_REGION=us-west-2 aws cloudfront create-invalidation --distribution-id E7ITNJX2QJ17G --paths "/*"
