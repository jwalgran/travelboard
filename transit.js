var bing = require('bing'),
    septa = require('septa'),

    // The Bing REST API returns times in strings like this /Date(1318813320000-0700)/
    // so a special convertion is needed to correctly apply the timezone offset.
    convertJsonDateString = function(jsonDateString) {
        var pattern = /Date\((\d+)([+-])(\d+)\)/,
            result = jsonDateString.match(pattern),
            t = parseInt(result[1], 10),
            op = result[2],
            z = parseInt(result[3], 10) / 100, // The time zones is expressed as 0700 so divide by 100 gives 7
            offset = (1000*60*60*(z)), // convert hours to milliseconds
            d;
            if (op === '-') {
                d = new Date(t - offset);
            }
            else {
                d = new Date(t + offset);
            }
        return dateToIsoString(d);
    },

    dateToIsoString = function(d) {
        var pad = function(n) { return n < 10 ? '0' + n : n };
        return d.getFullYear()  + '-' + 
            pad(d.getMonth()+1) + '-' +
            pad(d.getDate())    + 'T' +
            pad(d.getHours())   + ':' + 
            pad(d.getMinutes()) + ':' +
            pad(d.getSeconds());
    },

    bingResponseToRouteArray = function(resp) {
        var i, j, k, route, step, leg, item, resource, legArray, itemArray, resourceCount, legCount, itemCount,
            routeArray = [],
            resources = resp['resourceSets'][0]['resources'];
        // console.log(JSON.stringify(resp));
        for (i = 0, resourceCount = resources.length; i < resourceCount; i++) {
            resource = resources[i];
            legArray = resource['routeLegs'];
            route = {};
            route['distanceInMiles'] = resource['travelDistance'];
            route['durationInSeconds'] = resource['travelDuration'];
            route['steps'] = [];
            for (j = 0, legCount = legArray.length; j < legCount; j++) {
                leg = legArray[j];
                itemArray = leg['itineraryItems'];
                for (k = 0, itemCount = itemArray.length; k < itemCount; k++) {
                    item = itemArray[k];
                    step = {};
                    // it is strange to pull the iconType here, but it is the simplest indicator of the kind of transit.
                    step['type'] = item['iconType'];
                    step['instruction'] = item['instruction'];
                    if (item['travelDistance'] > 0) {
                        step['distanceInMiles'] = item['travelDistance']
                    }
                    step['durationInSeconds'] = item['travelDuration'];
                    if (item['transitLine']) {
                        step['transitDetails'] = {};
                        step['transitDetails']['line'] = item['transitLine']['abbreviatedName'];
                        step['transitDetails']['name'] = item['transitLine']['verboseName'];
                        if (item['childItineraryItems']) {
                            step['transitDetails']['depart_from'] = item['childItineraryItems'][0]['details'][0]['names'][0];
                            step['transitDetails']['depart_stop_id'] = item['childItineraryItems'][0]['transitStopId'];
                            step['transitDetails']['depart_time'] = convertJsonDateString(item['childItineraryItems'][0]['time']);
                            step['transitDetails']['arrive_at'] = item['childItineraryItems'][1]['details'][0]['names'][0];
                            step['transitDetails']['arrive_stop_id'] = item['childItineraryItems'][1]['transitStopId'];
                            step['transitDetails']['arrive_time'] = convertJsonDateString(item['childItineraryItems'][1]['time']);
                        }
                    }
                    route['steps'].push(step);
                }
            }
            routeArray.push(route);
        }
        return routeArray;
    },

    processErrorResponse = function(resp) {
        if (resp.error) {
            return {statusCode: resp.error.statusCode, errorDetails: resp.error.body.errorDetails[0]};
        }
        else {
            return resp;
        }
    },

    appendSeptaDetoursToRoutes = function(routeArray, callback) {
        var getSeptaDetoursForRoute = function(routeIndex) {
            var steps = routeArray[routeIndex].steps;
            if (steps.length > 0) {
                getSeptaDetoursForStep(routeIndex, 0);
            } else if (routeIndex < routeArray.length - 1) {
                getSeptaDetoursForRoute(routeIndex + 1);
            } else {
                callback(undefined, routeArray);
            }
        };

        var getSeptaDetoursForStep = function(routeIndex, stepIndex) {
            var steps = routeArray[routeIndex].steps;
            if (steps[stepIndex].type === 'Bus') {
               routeNumber = steps[stepIndex].transitDetails.line;
               busRoute = new septa.BusRoute(routeNumber);
               busRoute.fetchDetours(function(err, resp) {
                   if (!err) {
                       // If there are no detours on a route the SEPTA API still returns an
                       // [{"route_direction":"","reason":"","current_message":""}] so it is
                       // safe to check resp[0]
                       if (resp[0].current_message !== "") {
                           steps[stepIndex].transitDetails.detours = resp;
                       }
                       if (stepIndex < steps.length - 1) {
                           getSeptaDetoursForStep(routeIndex, stepIndex + 1);
                       } else if (routeIndex < routeArray.length - 1) {
                           getSeptaDetoursForRoute(routeIndex + 1);
                       } else {
                           callback(undefined, routeArray);
                       }
                   } else {
                       callback(err, routeArray);
                   }
               });
            } else {
                if (stepIndex < steps.length - 1) {
                    getSeptaDetoursForStep(routeIndex, stepIndex + 1);
                } else if (routeIndex < routeArray.length - 1) {
                    getSeptaDetoursForRoute(routeIndex + 1);
                } else {
                    callback(undefined, routeArray);
                }
            }
        };

        if (routeArray.length > 0) {
            getSeptaDetoursForRoute(0);
        }
    };
    
exports.getRoutes = function(startLocation, endLocation, callback) {
    bing.maps.getTransitRoute(startLocation, endLocation, function(err, resp) {
        var processedError, routeArray;
        if (!err && !resp.error) {
            routeArray = bingResponseToRouteArray(resp);
            appendSeptaDetoursToRoutes(routeArray, callback);
        }
        else {
            if (!err) {
                processedError = processErrorResponse(resp);
                if (processedError.errorDetails === "The transit stops are too close."
                || processedError.errorDetails === "Walking is a better option." ) {
                    bing.maps.getWalkingRoute(startLocation, endLocation, function(err, resp) {
                        if (!err && !resp.error) {
                            callback(undefined, bingResponseToRouteArray(resp));
                        }
                        else {
                            if (!err) {
                                callback(err, processErrorResponse(resp));
                            }
                            else {
                                callback(err, resp);
                            }
                        }
                    });
                }
                else {
                    callback(err, processedError);
                }
            }
            else {
                callback(err, resp);
            }
        }
    });
};