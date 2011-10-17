var bing = require('bing'),

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
    };
    
exports.getRoutes = function(startLocation, endLocation, callback) {
    bing.maps.getTransitRoute(startLocation, endLocation, function(err, resp) {
        if (!err) {
            callback(undefined, bingResponseToRouteArray(resp));
        }
        else {
            callback(err, {"error": console.dir(resp)});
        }
    });
};