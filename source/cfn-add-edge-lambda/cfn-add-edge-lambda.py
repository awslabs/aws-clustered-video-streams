# Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

from crhelper import CfnResource
import boto3
import logging
import json
import copy

logger = logging.getLogger(__name__)
# Initialise the helper, all inputs are optional, this example shows the defaults
helper = CfnResource(json_logging=False,
                     log_level='DEBUG',
                     boto_level='CRITICAL')

try:
    ## Init code goes here
    pass
except Exception as e:
    helper.init_failure(e)

client = boto3.client('cloudfront')


def update_cache_behavior(behavior, lambda_association):
    # only proceed if this is not a smooth streaming behavior
    if not behavior.get("SmoothStreaming", False):
        # default to an empty list if none yet
        behavior["LambdaFunctionAssociations"]["Items"] = behavior[
            "LambdaFunctionAssociations"].get("Items", [])
        # look for existing associations
        matches = [
            x for x in behavior["LambdaFunctionAssociations"]["Items"]
            if x["EventType"] == lambda_association["EventType"]
        ]
        if len(matches) > 0:
            # replace the lambda arn with the new lambda
            matches[0]["LambdaFunctionARN"] = lambda_association[
                "LambdaFunctionARN"]
            matches[0]["IncludeBody"] = lambda_association["IncludeBody"]
        else:
            # create a new association
            behavior["LambdaFunctionAssociations"]["Items"].append(
                lambda_association)
            behavior["LambdaFunctionAssociations"]["Quantity"] = behavior[
                "LambdaFunctionAssociations"]["Quantity"] + 1


def remove_cache_behavior(behavior, lambda_association):
    # default to an empty list if none yet
    behavior["LambdaFunctionAssociations"]["Items"] = behavior[
        "LambdaFunctionAssociations"].get("Items", [])
    # look for existing associations
    matches = [
        x for x in behavior["LambdaFunctionAssociations"]["Items"]
        if x == lambda_association
    ]

    if len(matches) > 0:
        logger.info(
            "Found matching LambdaFunctionAssociation to remove from the CloudFront Distribution"
        )
        behavior["LambdaFunctionAssociations"]["Items"].remove(
            lambda_association)
        behavior["LambdaFunctionAssociations"]["Quantity"] = len(
            behavior["LambdaFunctionAssociations"]["Items"])


def handler(event, context):
    helper(event, context)


@helper.create
@helper.update
def create(event, context):
    ReturnId = 0
    logger.info("Got Create")
    logger.info(json.dumps(event))

    # Check that all the required properties are specified
    if "Id" not in event["ResourceProperties"]:
        raise ValueError("Missing property 'Id'")
    if "LambdaFunctionARN" not in event["ResourceProperties"]:
        raise ValueError("Missing property 'LambdaFunctionARN'")
    if "EventType" not in event["ResourceProperties"]:
        raise ValueError("Missing property 'EventType'")

    # ReturnId = event["ResourceProperties"]["Id"]

    lambda_association = {
        "LambdaFunctionARN": event["ResourceProperties"]["LambdaFunctionARN"],
        "EventType": event["ResourceProperties"]["EventType"],
        "IncludeBody": False
    }

    try:
        response = client.get_distribution_config(
            Id=event["ResourceProperties"]["Id"])

        config = copy.deepcopy(response["DistributionConfig"])
        saved_config = copy.deepcopy(response["DistributionConfig"])

        # handle the DefaultCacheBehavior key first
        update_cache_behavior(config["DefaultCacheBehavior"],
                              lambda_association)

        # handle cache behaviors
        for behavior in config["CacheBehaviors"].get("Items", []):
            update_cache_behavior(behavior, lambda_association)

        # update CloudFormation and wait for the response
        response = client.update_distribution(
            DistributionConfig=config,
            Id=event["ResourceProperties"]["Id"],
            IfMatch=response["ETag"])

    except Exception as e:
        raise e

    # return ReturnId


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

    # delete any associated L@E functions with our Lambda ARN
    try:
        # get the distribution
        response = client.get_distribution_config(
            Id=event["ResourceProperties"]["Id"])
        config = response["DistributionConfig"]

        # handle the DefaultCacheBehavior key first
        remove_cache_behavior(config["DefaultCacheBehavior"],
                              lambda_association)

        # handle cache behaviors
        for behavior in config["CacheBehaviors"].get("Items", []):
            remove_cache_behavior(behavior, lambda_association)

        # update the distribution with changes
        client.update_distribution(DistributionConfig=config,
                                   Id=event["ResourceProperties"]["Id"],
                                   IfMatch=response["ETag"])

    except Exception as e:
        raise e
