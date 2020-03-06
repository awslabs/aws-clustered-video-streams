// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

'use strict';

exports.timeseconds = () => {
    var d = new Date();
    return Number.parseInt(d.getTime() / 1000);
};