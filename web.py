from restful_lib import *
from datetime import datetime
import simplejson
from pprint import pprint
import re
import time
from time import mktime
import os
from flask import Flask
app = Flask(__name__)

class BingMaps(object):
    """Wrapper around the Bing Maps REST API"""

    def __init__(self, api_key):
        self.api_key = api_key

    def get_transit_route(self, start_location, end_location, optimize = 'time', distance_unit = 'mi', travel_time = datetime.now(), time_type = 'Departure', max_solution_count = 3):
        SERVICE_URL = 'http://dev.virtualearth.net/REST/v1'
        TRANSIT_RESOURCE = 'Routes/Transit'
        response = Connection(SERVICE_URL).request_get(TRANSIT_RESOURCE, {
            'wp.0': start_location,
            'wp.1': end_location,
            'key': self.api_key,
            'o': 'json',
            'optmz': optimize,
            'du': distance_unit,
            'dt': travel_time,
            'tt': time_type,
            'maxSolutions': max_solution_count
        })
        #print(response)
        route_dict = simplejson.loads(response['body'])
        #pprint(route_dict)
        
        simple_routes = self._bing_routes_to_simple_routes(route_dict)
        self._append_transit_alerts(simple_routes)
        return simple_routes

    def _append_transit_alerts(self, simple_routes):
        SERVICE_URL = 'http://www3.septa.org/hackathon/Alerts'
        for route in simple_routes:
            #pprint(route)
            for step in route['steps']:
                if step['type'] == 'Bus' or step['type'] == 'Train':
                    line = step['transit_details']['line']
                    response = Connection(SERVICE_URL).request_get(line)
                    alerts = simplejson.loads(response['body'])
                    if len(alerts) > 0:
                        step['transit_details']['alerts'] = alerts

    def _convert_json_date_string(self, json_date_string):
        pattern = re.compile('Date\((\d+)-(\d+)\)')
        result = pattern.search(json_date_string)
        t = int(result.groups()[0]) / 1000 # The string is in milliseconds, Python wants seconds
        z = int(result.groups()[1]) / 100 # The time zones is expressed as -0700 so divide by 100 gives 7
        # Subtracting the number of hours specified by the timezone was off by one
        # TODO: Find the source of this off by one error rather than hard code it.
        dt = datetime.fromtimestamp(mktime(time.gmtime(t - 60*60*(z+1))))
        return dt.strftime('%Y-%m-%dT%H:%M:%S')

    def _bing_routes_to_simple_routes(self, bing_route_dict):
        simple_routes = []
        for resource in bing_route_dict['resourceSets'][0]['resources']:
            route = {}
            route['distance_in_miles'] = resource['travelDistance']
            route['duration_in_seconds'] = resource['travelDuration']
            route['steps'] = []
            for leg in resource['routeLegs']:    
                for item in leg['itineraryItems']:
                    step = {}
                    step['type'] = item['iconType'] # strange to pull the icon type, but it requires the least parsing
                    if item['travelDistance'] > 0:
                        step['distance_in_miles'] = item['travelDistance']
                    step['duration_in_seconds'] = item['travelDuration']
                    if 'transitLine' in item:
                        step['transit_details'] = {}
                        step['transit_details']['line'] = item['transitLine']['abbreviatedName']
                        step['transit_details']['name'] = item['transitLine']['verboseName']
                        if 'childItineraryItems' in item:
                            step['transit_details']['depart_from'] = item['childItineraryItems'][0]['details'][0]['names'][0]
                            step['transit_details']['depart_stop_id'] = item['childItineraryItems'][0]['transitStopId']
                            step['transit_details']['depart_time'] = self._convert_json_date_string(item['childItineraryItems'][0]['time'])
                            step['transit_details']['arrive_at'] = item['childItineraryItems'][1]['details'][0]['names'][0]
                            step['transit_details']['arrive_stop_id'] = item['childItineraryItems'][1]['transitStopId']
                            step['transit_details']['arrive_time'] = self._convert_json_date_string(item['childItineraryItems'][1]['time'])

                    route['steps'].append(step)


            simple_routes.append(route)

        #pprint(simple_routes)
        return simple_routes

@app.route("/")
def root():
    return get_routes('100 Chestnut St, Philadelphia, PA', '980 N 3RD ST, Philadelphia, PA')

@app.route('/from/<from_address>/to/<to_address>')
def get_routes(from_address, to_address):
    print from_address
    print to_address
    bing_maps = BingMaps(os.environ.get("BING_MAPS_API_KEY"))
    result = bing_maps.get_transit_route(from_address, to_address) 
    return simplejson.dumps(result)

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host='0.0.0.0', port=port)