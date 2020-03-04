# Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

from crhelper import CfnResource
import boto3
import logging
import json
import copy
import os

logger = logging.getLogger(__name__)
# Initialise the helper, all inputs are optional, this example shows the defaults
helper = CfnResource(json_logging=False, log_level='DEBUG', boto_level='CRITICAL')

try:
    ## Init code goes here
    pass
except Exception as e:
    helper.init_failure(e)

region = os.environ['AWS_REGION']
dynamodb_resource = boto3.resource('dynamodb', region_name=region)
cloudfront_client = boto3.client('cloudfront')


def handler(event, context):
    helper(event, context)

@helper.update
@helper.create
def create(event, context):
    logger.info("Got Create")
    logger.info(json.dumps(event))
    # Optionally return an ID that will be used for the resource PhysicalResourceId, 
    # if None is returned an ID will be generated. If a poll_create function is defined 
    # return value is placed into the poll event as event['CrHelperData']['PhysicalResourceId']
    #

    # Check that all the required properties are specified
    if "ClusteredVideoStreamName" not in event["ResourceProperties"]:
        raise ValueError("Missing property 'ClusteredVideoStreamName'")
    if "MasterPlaylistDistributionId" not in event["ResourceProperties"]:
        raise ValueError("Missing property 'MasterPlaylistDistributionId'")
    if "RegionOneCloudfrontDistributionId" not in event["ResourceProperties"]:
        raise ValueError("Missing property 'RegionOneCloudfrontDistributionId'")
    if "RegionTwoCloudfrontDistributionId" not in event["ResourceProperties"]:
        raise ValueError("Missing property 'RegionTwoCloudfrontDistributionId'")
    if "RegionOne" not in event["ResourceProperties"]:
        raise ValueError("Missing property 'RegionOne'")
    if "RegionTwo" not in event["ResourceProperties"]:
        raise ValueError("Missing property 'RegionTwo'")   

    try:
        # Create state table entries for each region in the clustered video stream

        # Region One
        response = cloudfront_client.get_distribution(Id=event["ResourceProperties"]["RegionOneCloudfrontDistributionId"])

        config = response["Distribution"]
        item = {}
        item["domain"] = config["DomainName"]
        item["region"] = event["ResourceProperties"]["RegionOne"]
        item["distro_open"] = True

        table = dynamodb_resource.Table(event["ResourceProperties"]["ClusteredVideoStreamName"])
        response = table.put_item(Item=item)
        
        # Region Two
        response = cloudfront_client.get_distribution(Id=event["ResourceProperties"]["RegionTwoCloudfrontDistributionId"])

        config = response["Distribution"]  
        item["domain"] = config["DomainName"]
        item["region"] = event["ResourceProperties"]["RegionTwo"]
        item["distro_open"] = True

        response = table.put_item(Item=item)

        # Create a cloudfront origin group using all the origins in the master playlist

        new_origin_groups = {
            "Quantity": 1,
            "Items": [{
                "Id": event["ResourceProperties"]["ClusteredVideoStreamName"]+"-"+"OriginGroup",
                "FailoverCriteria": {
                "StatusCodes": {
                    "Quantity": 4,
                    "Items": [
                        500,
                        502,
                        503,
                        504
                        ]
                    }
                },
                "Members": {
                    "Quantity": 0,
                    "Items": [
                        
                    ]}
                }]
            }

        response = cloudfront_client.get_distribution_config(Id=event["ResourceProperties"]["MasterPlaylistDistributionId"])

        config = copy.deepcopy(response["DistributionConfig"]) 

        

        for origin in config["Origins"]["Items"]:
            new_origin_group_member = {
                "OriginId": origin["Id"]
            }
            
            new_origin_groups["Items"][0]["Members"]["Quantity"] = new_origin_groups["Items"][0]["Members"]["Quantity"] + 1
            new_origin_groups["Items"][0]["Members"]["Items"].append(new_origin_group_member)

        config["OriginGroups"] = new_origin_groups

        response = cloudfront_client.update_distribution(DistributionConfig=config, Id=event["ResourceProperties"]["MasterPlaylistDistributionId"], IfMatch=response["ETag"])
    
    except Exception as e:
        raise e
    
    return "MyResourceId"


@helper.delete
def delete(event, context):
    logger.info("Got Delete")
    # Delete never returns anything. Should not fail if the underlying resources are already deleted.
    # Desired state.

    # Check that all the required properties are specified
    if "ClusteredVideoStreamName" not in event["ResourceProperties"]:
        raise ValueError("Missing property 'ClusteredVideoStreamName'")
    if "MasterPlaylistDistributionId" not in event["ResourceProperties"]:
        raise ValueError("Missing property 'MasterPlaylistDistributionId'")
    if "RegionOneCloudfrontDistributionId" not in event["ResourceProperties"]:
        raise ValueError("Missing property 'RegionOneCloudfrontDistributionId'")
    if "RegionTwoCloudfrontDistributionId" not in event["ResourceProperties"]:
        raise ValueError("Missing property 'RegionTwoCloudfrontDistributionId'")
    if "RegionOne" not in event["ResourceProperties"]:
        raise ValueError("Missing property 'RegionOne'")
    if "RegionTwo" not in event["ResourceProperties"]:
        raise ValueError("Missing property 'RegionTwo'") 

    # Delete the associated the origin group from the master playlist distributionn
    try:

        # Delete RegionOne domain
        response = cloudfront_client.get_distribution(Id=event["ResourceProperties"]["RegionOneCloudfrontDistributionId"])

        config = response["Distribution"]
        domain = config["DomainName"]

        table = dynamodb_resource.Table(event["ResourceProperties"]["ClusteredVideoStreamName"])

        response = table.delete_item(Key={'domain': domain})

        # Delete RegionTwo domain
        response = cloudfront_client.get_distribution(Id=event["ResourceProperties"]["RegionTwoCloudfrontDistributionId"])

        config = response["Distribution"]
        domain = config["DomainName"]

        table = dynamodb_resource.Table(event["ResourceProperties"]["ClusteredVideoStreamName"])

        response = table.delete_item(Key={'domain': domain})

        # Delete OriginGroup
        response = cloudfront_client.get_distribution_config(Id=event["ResourceProperties"]["MasterPlaylistDistributionId"])
        config = response["DistributionConfig"] 

        if "OriginGroups" in config:
            config["OriginGroups"]["Quantity"] = 0
            config["OriginGroups"]["Items"] = []

        response = cloudfront_client.update_distribution(DistributionConfig=config, Id=event["ResourceProperties"]["MasterPlaylistDistributionId"], IfMatch=response["ETag"])
        
    except Exception as e:
        raise e
    


