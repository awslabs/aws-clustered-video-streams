# Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

from crhelper import CfnResource
import boto3
import logging
import json
import os
from botocore.exceptions import ClientError

logger = logging.getLogger(__name__)
# Initialise the helper, all inputs are optional, this example shows the defaults
helper = CfnResource(json_logging=False, log_level='DEBUG', boto_level='CRITICAL')

try:
    ## Init code goes here
    pass
except Exception as e:
    helper.init_failure(e)
    
client = boto3.client('s3')

def handler(event, context):
    helper(event, context)

@helper.create
@helper.update
def create(event, context):
    ReturnId = 0
    logger.info("Got Create")
    logger.info(json.dumps(event))
    # Optionally return an ID that will be used for the resource PhysicalResourceId, 
    # if None is returned an ID will be generated. If a poll_create function is defined 
    # return value is placed into the poll event as event['CrHelperData']['PhysicalResourceId']
    #

    # Check that all the required properties are specified
    if "SourceBucket" not in event["ResourceProperties"]:
        raise ValueError("Missing property 'SourceBucket'")
    if "Bucket" not in event["ResourceProperties"]:
        raise ValueError("Missing property 'Bucket'")

    ReturnId = event["ResourceProperties"]["Bucket"]
    source_bucket = event['ResourceProperties']['SourceBucket']
    source_prefix = event['ResourceProperties'].get('SourcePrefix') or ''
    bucket = event['ResourceProperties']['Bucket']
    prefix = event['ResourceProperties'].get('Prefix') or ''
    
    try:

        paginator = client.get_paginator('list_objects_v2')
        page_iterator = paginator.paginate(Bucket=source_bucket, Prefix=source_prefix)
        for key in {x['Key'] for page in page_iterator for x in page['Contents']}:
            dest_key = os.path.join(prefix, os.path.relpath(key, source_prefix))
            print("dest_key: {}".format(dest_key))
            if not key.endswith('/'):
                print ('copy {} to {}'.format(key, dest_key))
                #client.copy_object(CopySource={'Bucket': source_bucket, 'Key': key}, Bucket=bucket, Key = dest_key, ACL='public-read')
                client.copy_object(CopySource={'Bucket': source_bucket, 'Key': key}, Bucket=bucket, Key = dest_key)
                
                logger.info("Received event: %s" % json.dumps(event))
    except Exception as e:
        raise e
    
    return ReturnId

@helper.delete
def delete(event, context):
    logger.info("Got Delete")
    # Delete never returns anything. Should not fail if the underlying resources are already deleted.
    # Desired state.

    

    # Delete the associated lambda function behavior if it exists for the distribution
    try:

        print ('delete no-op')

    except Exception as e:
        raise e
    


