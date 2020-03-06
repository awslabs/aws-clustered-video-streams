# Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

from crhelper import CfnResource
import boto3
import logging
import json
import copy

logger = logging.getLogger(__name__)
# Initialise the helper, all inputs are optional, this example shows the defaults
helper = CfnResource(json_logging=False, log_level='DEBUG', boto_level='CRITICAL')

try:
    ## Init code goes here
    pass
except Exception as e:
    helper.init_failure(e)
    
client = boto3.client('cloudfront')

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
    if "Id" not in event["ResourceProperties"]:
        raise ValueError("Missing property 'Id'")
    if "LambdaFunctionARN" not in event["ResourceProperties"]:
        raise ValueError("Missing property 'LambdaFunctionARN'")
    if "EventType" not in event["ResourceProperties"]:
        raise ValueError("Missing property 'EventType'")

    ReturnId = event["ResourceProperties"]["Id"]

    new_lambda_association = {
            "LambdaFunctionARN": event["ResourceProperties"]["LambdaFunctionARN"],
            "EventType": event["ResourceProperties"]["EventType"],
            "IncludeBody": False
        }
    
    try:

        response = client.get_distribution_config(Id=event["ResourceProperties"]["Id"])

        config = copy.deepcopy(response["DistributionConfig"]) 
        saved_config = copy.deepcopy(response["DistributionConfig"]) 
        
        # If no lambda associations exist create the lambda associations list
        if "Items" not in config["DefaultCacheBehavior"]["LambdaFunctionAssociations"]:
            config["DefaultCacheBehavior"]["LambdaFunctionAssociations"]["Items"] = []
        
        # If there is an existing association for this event type, replace the lambda arn with the new lambda, otherwise create a new association
        matches = []
        matches = [x for x in config["DefaultCacheBehavior"]["LambdaFunctionAssociations"]["Items"] if x["EventType"] == new_lambda_association["EventType"]]
        if len(matches) > 0:
            matches[0]["LambdaFunctionARN"] = new_lambda_association["LambdaFunctionARN"]
            matches[0]["IncludeBody"] = new_lambda_association["IncludeBody"]
        else: 
            config["DefaultCacheBehavior"]["LambdaFunctionAssociations"]["Items"].append(new_lambda_association)
            config["DefaultCacheBehavior"]["LambdaFunctionAssociations"]["Quantity"] = config["DefaultCacheBehavior"]["LambdaFunctionAssociations"]["Quantity"] + 1

        response = client.update_distribution(DistributionConfig=config, Id=event["ResourceProperties"]["Id"], IfMatch=response["ETag"])
    # except client.exceptions.InvalidLambdaFunctionAssociation as e:

    #     logger.info("Got InvalidLambdaFunctionAssociation...check if this lambda behavior already exists")
        
    #     # Check if this exact lambda association already exists and return success if it does.  This
    #     # protects us from deleting an association we didn't create in the Cloudformation error
    #     # path which will call helper.delete with this event
    #     matches = []
    #     if "Items" in saved_config["DefaultCacheBehavior"]["LambdaFunctionAssociations"]:
    #         matches = [x for x in saved_config["DefaultCacheBehavior"]["LambdaFunctionAssociations"]["Items"] if x == new_lambda_association]
        
    #     if len(matches) > 0:
    #         logger.info("this lambda behavior already exists")
    #     else:
    #         logger.info("this lambda behavior does not already exist")
    #         raise e

    except Exception as e:
        raise e
    
    return ReturnId

@helper.delete
def delete(event, context):
    logger.info("Got Delete")
    # Delete never returns anything. Should not fail if the underlying resources are already deleted.
    # Desired state.

    # Check that all the required properties are specified
    if "Id" not in event["ResourceProperties"]:
        raise ValueError("Missing property 'Id'")
    if "LambdaFunctionARN" not in event["ResourceProperties"]:
        raise ValueError("Missing property 'LambdaFunctionARN'")
    if "EventType" not in event["ResourceProperties"]:
        raise ValueError("Missing property 'EventType'")

    lambda_association = {
            "LambdaFunctionARN": event["ResourceProperties"]["LambdaFunctionARN"],
            "EventType": event["ResourceProperties"]["EventType"],
            "IncludeBody": False
        }

    # Delete the associated lambda function behavior if it exists for the distribution
    try:

        response = client.get_distribution_config(Id=event["ResourceProperties"]["Id"])

        config = response["DistributionConfig"]  
        
        # Check if this exact lambda association already exists and return success if it does.  This
        # protects us from deleting an association we didn't create in the Cloudformation error
        # path which will call helper.delete with this event
        matches = []
        if "Items" in config["DefaultCacheBehavior"]["LambdaFunctionAssociations"]:
            matches = [x for x in config["DefaultCacheBehavior"]["LambdaFunctionAssociations"]["Items"] if x == lambda_association]
        
        
        if len(matches) > 0:
            logger.info("Found matching LambdaFunctionAssociation to remove from the CloudFront Distribution")
            config["DefaultCacheBehavior"]["LambdaFunctionAssociations"]["Items"].remove(lambda_association)
            config["DefaultCacheBehavior"]["LambdaFunctionAssociations"]["Quantity"] = len(config["DefaultCacheBehavior"]["LambdaFunctionAssociations"]["Items"])
            response = client.update_distribution(DistributionConfig=config, Id=event["ResourceProperties"]["Id"], IfMatch=response["ETag"])

    except Exception as e:
        raise e
    


