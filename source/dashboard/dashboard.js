// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
//        SPDX-License-Identifier: Apache-2.0

var status_and_control_table;
var configuration;
var clustered_video_stream_name;
var table_name;
var access_key_id;
var secret_access_key;
var sdk_region;

const UPDATE_INTERVAL_MS = 2000;

var init_control_compartment = () => {
    status_and_control_table = new Tabulator("#status-control-inner", {
        layout: "fitColumns",
        placeholder: "Stand by for status",
        height: 400,
        initialSort: [
            { column: "name", dir: "asc" }
        ],
        columns: [
            { title: "Name", align: "center", field: "name", },
            { title: "AWS Region", align: "center", field: "region" },
            { title: "CloudFront Domain", align: "center", field: "domain" },
            {
                title: "Playlists Fresh",
                align: "center",
                formatter: "tickCross",
                field: "playlist_fresh",
                formatterParams: {
                    allowEmpty: true,
                    allowTruthy: true,
                    tickElement: `<i class="material-icons playlist-fresh">thumb_up</i>`,
                    crossElement: `<i class="material-icons playlist-stale">thumb_down</i>`
                }

            },
            {
                title: "404 Blocking State",
                align: "center",
                formatter: "tickCross",
                field: "distro_open",
                formatterParams: {
                    allowEmpty: true,
                    allowTruthy: true,
                    tickElement: `<i class="material-icons distro-open">lock_open</i>`,
                    crossElement: `<i class="material-icons distro-blocked">lock</i>`
                }
            },
            { title: "Last Change", align: "center", field: "updated" },
            { title: "Enable 404 Blocking", align: "center", formatter: enableBlockingIcon, cellClick: clickEnableBlockingIcon },
            { title: "Disable 404 Blocking", align: "center", formatter: disableBlockingIcon, cellClick: clickDisableBlockingIcon }
        ]
    });
};

var detectorStateFormatter = function(cell, formatterParams, onRendered) {
    return `<i class="material-icons">lock_open</i>`;
};

var disableBlockingIcon = function(cell, formatterParams, onRendered) {
    return `<i class="material-icons">lock_open</i>`;
};

var enableBlockingIcon = function(cell, formatterParams, onRendered) {
    return `<i class="material-icons">lock</i>`;
};

var clickEnableBlockingIcon = function(e, cell) {
    var data = cell._cell.row.data;
    var domain = data.domain;
    var distro_open = false;
    if (window.confirm(`Enable blocking for ${domain}?`)) {
        updateBlockingState(domain, distro_open);
    }
};

var clickDisableBlockingIcon = function(e, cell) {
    var data = cell._cell.row.data;
    var domain = data.domain;
    var distro_open = true;
    if (window.confirm(`Disable blocking for ${domain}?`)) {
        updateBlockingState(domain, distro_open);
    }
};

var updateBlockingState = function(domain, state) {
    var dynamodb = new AWS.DynamoDB({
        "accessKeyId": access_key_id,
        "secretAccessKey": secret_access_key,
        "region": sdk_region
    });
    var documentClient = new AWS.DynamoDB.DocumentClient({
        "service": dynamodb
    });
    var params = {
        TableName: table_name,
        Key: { "domain": domain },
        UpdateExpression: 'set #attr = :value',
        ExpressionAttributeNames: { '#attr': 'distro_open' },
        ExpressionAttributeValues: {
            ':value': state
        }
    };
    documentClient.update(params, function(err, data) {
        if (err) {
            console.log(err, err.stack);
        }
    });
}

var interval_task = () => {
    try {
        $("#update-icon").html(`<i class="material-icons">update</i>`);
        if (access_key_id && secret_access_key && sdk_region) {
            var dynamodb = new AWS.DynamoDB({
                "accessKeyId": access_key_id,
                "secretAccessKey": secret_access_key,
                "region": sdk_region
            });
            var documentClient = new AWS.DynamoDB.DocumentClient({
                "service": dynamodb
            });
            var params = {
                TableName: table_name
            };
            documentClient.scan(params, function(err, data) {
                if (err) {
                    console.log(err, err.stack);
                } else {
                    configuration = data.Items;
                    for (var c of configuration) {
                        var timestamp = Number.parseInt(Number.parseFloat(c["aws:rep:updatetime"]) * 1000)
                        c["updated"] = new Date(timestamp).toLocaleString();
                    }
                    status_and_control_table.replaceData(configuration);
                }
            });
        } else {
            console.log("waiting on keys");
        }
    } catch (error) {
        console.error(error);
        $("#update-icon").html(`<i class="material-icons">cloud_off</i>`);
    }
    $("#update-icon").html("");
}

// PAGE ENTRY POINT
$(document).ready(function() {
    console.log("ready");
    $("#update-icon").html(`<i class="material-icons">cloud_off</i>`);
    clustered_video_stream_name = window.localStorage.getItem('clustered_video_stream_name');
    table_name = clustered_video_stream_name;
    access_key_id = window.localStorage.getItem('access_key_id');
    secret_access_key = window.localStorage.getItem('secret_access_key');
    sdk_region = window.localStorage.getItem('sdk_region');
    if (!sdk_region) {
        sdk_region = "eu-west-1";
    }
    $("#clusteredVideoStreamNameInput").val(clustered_video_stream_name);
    $("#accessKeyIdInput").val(access_key_id);
    $("#secretAccessKeyInput").val(secret_access_key);
    $("#regionInput").val(sdk_region)
    init_control_compartment();
    configuration = [];
    $("#clusteredVideoStreamNameInput").on("blur", (event) => {
        console.log(event);
        clustered_video_stream_name = event.target.value;
        window.localStorage.setItem('clustered_video_stream_name', clustered_video_stream_name);
    });
    $("#accessKeyIdInput").on("blur", (event) => {
        console.log(event);
        access_key_id = event.target.value;
        window.localStorage.setItem('access_key_id', access_key_id);
    });
    $("#secretAccessKeyInput").on("blur", (event) => {
        console.log(event);
        secret_access_key = event.target.value;
        window.localStorage.setItem('secret_access_key', secret_access_key);
    });
    $("#regionInput").on("blur", (event) => {
        console.log(event);
        sdk_region = event.target.value;
        window.localStorage.setItem('sdk_region', sdk_region);
    });
    setInterval(interval_task, UPDATE_INTERVAL_MS);
});