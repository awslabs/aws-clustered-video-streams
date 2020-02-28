# Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: Apache-2.0

# Adapted from: https://github.com/kspurrier/cfn-dynamodb-global-table/blob/master/DynamoDBGlobalTableCreate/dynamoDBGlobalTableCreate.py

import boto3
import cfnresponse
import json
import logging
import os

logger = logging.getLogger()

if 'LoggingLevel' in os.environ.keys() and os.environ['LoggingLevel']:
   log_level = logging.getLevelName(os.environ['LoggingLevel'])
else:
   log_level = logging.getLevelName('WARNING')

log_handler = logger.handlers[0]

if log_level == 30:
   log_handler.setFormatter(logging.Formatter('%(message)s'))
else:
   log_handler.setFormatter(logging.Formatter('[%(levelname)s]: %(message)s'))

logger.setLevel(log_level)


def global_table_create(event, context):
    logger.info(json.dumps(event))
    global_table_name = event['ResourceProperties']['GlobalTableName']

    try:
        resp = {'Status': 'FAILED', 'Data': {'GlobalTableName': global_table_name, 'LogGroup': context.log_group_name }}
        client = boto3.client('dynamodb')

        logger.debug('Creating DynamoDB Global Table ' + global_table_name)
        response = {}
        replication_group = []

        for region in event['ResourceProperties']['ReplicationGroupList']:
            replication_group.append({ 'RegionName': region})

        response = client.create_global_table(
            GlobalTableName=global_table_name,
            ReplicationGroup=replication_group
        )
        logger.info(response)
        resp['Reason'] = 'Created Global Table: ' + global_table_name
        resp['Status'] = 'SUCCESS'

    except client.exceptions.GlobalTableAlreadyExistsException as e:
        logger.info('Global Table already exists, falling back to update logic: ' + e.message )
        # Describe the already existing global table, so we can attempt to update instead
        response = {}
        response = client.describe_global_table(
            GlobalTableName=global_table_name
        )

        logger.debug(response)

        existing_replication_group_list = []
        for region in response['GlobalTableDescription']['ReplicationGroup']:
            logger.debug('Existing Replication Group List')
            existing_replication_group_list.append(region['RegionName'])
        event['OldResourceProperties']= { 'ReplicationGroupList': existing_replication_group_list }
        response = global_table_update(event,context)
        return response

    except Exception as e:
        logger.error('Failed to create DynamoDB Global Table: ' + global_table_name)
        resp['Reason'] = 'Failed to create DynamoDB Global Table: ' + e.message 
        resp['Status'] = 'FAILED'
    
    return resp

def global_table_update(event, context):
    logger.debug(json.dumps(event))
    global_table_name = event['ResourceProperties']['GlobalTableName']

    try:
        resp = {'Status': 'FAILED', 'Data': {'GlobalTableName': global_table_name, 'LogGroup': context.log_group_name }}
        client = boto3.client('dynamodb')

        # Describe the existing global table, as we cannot trust the provided
        # event['OldResourceProperties']['ReplicationGroupList']) to show the
        # current actual replication group list for a stack update failure / rollback.
        response = {}
        response = client.describe_global_table(
            GlobalTableName=global_table_name
        )
        logger.debug(response)

        existing_replication_groups = set() 
        for region in response['GlobalTableDescription']['ReplicationGroup']:
            existing_replication_groups.add(region['RegionName'])

        new_rep_groups = set(event['ResourceProperties']['ReplicationGroupList'])
        old_rep_groups = set(event['OldResourceProperties']['ReplicationGroupList'])

        changeset_rep_group_discrepancies = old_rep_groups - existing_replication_groups
        if len(changeset_rep_group_discrepancies):
            logger.info("Using the results of describe_global_table rather than the value from OldResourceProperties in the event")
            # Use reality, not the value from OldResourceProperties in the event
            old_rep_groups = existing_replication_groups

        if new_rep_groups == old_rep_groups:
            logger.info('No replication group changes detected')
            resp['Reason'] = 'No replication group changes detected'
            resp['Status'] = 'SUCCESS'
            return resp
        else:
            logger.info('Replication group changes detected. Updating Global Table')

        AddReplicationGroups = new_rep_groups - old_rep_groups
        RemoveReplicationGroups = old_rep_groups - new_rep_groups

        if len(AddReplicationGroups):
            for region in AddReplicationGroups:
                update_global_table(global_table_name, region, 'Create')
                logger.info('Add replication group region: ' + region)

        if len(RemoveReplicationGroups):
            for region in RemoveReplicationGroups:
                update_global_table(global_table_name, region, 'Delete')
                logger.info('Remove replication group region: ' + region)

        resp['Reason'] = 'Updated Global Table: ' + global_table_name
        resp['Status'] = 'SUCCESS'
    except Exception as e:
        logger.error('Failed to update DynamoDB Global Table: ' + global_table_name)
        resp['Reason'] = 'Failed to update Global Table: ' + e.message
        resp['Status'] = 'FAILED'
    
    return resp

def update_global_table(global_table_name, region, action):
    client = boto3.client('dynamodb')
    ReplicaUpdates = []
    ReplicaUpdate = {}
    ReplicationGroup = {}
    ReplicationGroup['RegionName'] = region
    ReplicaUpdate[action] = ReplicationGroup
    ReplicaUpdates.append(ReplicaUpdate)

    response = client.update_global_table(
        GlobalTableName=global_table_name,
        ReplicaUpdates=ReplicaUpdates
    )

    return response


def handler(event, context):
  if event['RequestType'] == 'Create':
    response = global_table_create(event,context)
  if event['RequestType'] == 'Delete':
    response = {'Status': 'SUCCESS', 'Data': { 'LogGroup': context.log_group_name }}
  if event['RequestType'] == 'Update':
    response = global_table_update(event,context)

  if 'Reason' in response.keys():
    cfnresponse.send(event, context, log_level, response['Status'], response['Data'], response['Reason'])
  else:
    cfnresponse.send(event, context, log_level, response['Status'], response['Data'])