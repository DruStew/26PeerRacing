import logging as log
import json

DEFAULT_CONFIG = {
	"input_path"	 : None,
	"output_path"	 : None,
	"input_sheet_id" : "1WO3Ji6fIyP8_bfo-W5-mvtaGa8s8N4Epnn6vUDwH-MI", #input google doc path
	"output_sheet_id": "1AmKGfhJBqDMXyGFM8d0iQZAnWTaomdtfUNNu43Mjoik", #output google doc path
	"import_mode" : "csv", #csv or sheets
	"export_mode" : "csv", #csv or sheets
	"csv_export_dir" : "race_results",
	"run_on_start" : False,
	'export_results' : False,
	"refresh_rate_s" : 30, 				#how often to refresh the divisions calculation in seconds
	"indices" : { #data index configuration
		"id" 				: 0, #column index to extract runner ids from
		"bib" 				: 1, #column index for the runner's bib number
		"first" 			: 2, #column index for the first name
		"last" 				: 3, #column index for the last name
		"age" 				: 4, #column index for the runner's age
		"sex" 				: 5, #column index for the runner's sex
		"time" 				: 6, #column index for the runner's unparsed time
		"military"			: -1,#column index for the runner's active/retired military status
		"overall_rank" 		: 7, #column index for the runner's overall rank
		"peer_racing_rank" 	: 8  #column index for the runner's peer racing rank, e.g. 'A1','B3','D4',etc.
	},
	"divisions" : { #divisions configuration
		"max_percentile": 95, #the maximum percentile setting the division bounds
		"min_percentile": 5,  #the minimum percentile setting the division bounds
		"auto_set_divisions" : True,
		"divisions" 	: 5,  #number of divisions to create
		"payout_slots"  : 5   #number of runners to payout per division
	},
	"incentive_division1" : {
		"type" : "off",
		"value" : "1000",
		"payout_slots" : 5,
		"divisions" : 1,
		"criteria" : "female",
		"png_path"  : "./.incentive_division1.png"
	},
	"incentive_division2" : {
		"type" : "off",
		"value" : "1000",
		"payout_slots" : 5,
		"divisions" : 1,
		"criteria" : "over 50",
		"png_path"  : "./.incentive_division2.png"
	},
	"incentive_division3" : {
		"type" : "off",
		"value" : "1000",
		"payout_slots" : 5,
		"divisions" : 1,
		"criteria" : "military",
		"png_path"  : "./.incentive_division3.png"
	},
	'd1_adjustment' : 0,
	"time_fstr" : '%H:%M:%S.%f',	#a time format string used to extract times'
	"png"		: True,			#'store output graphs to png image'
	"png_path"  : "./.test.png",
    "total_purse": 5000,
    "processing_fee_pct": 3,
    "pr_holding_pct": 40,
    "promoter_split_pct": 50,
    "added_money": 1000,
    "d1_adjustment": 0,
	"entry_fee": 45,
	"total_runners" : 100,
	"show_unpaid_runners" : False,
	"window" : {
		"width" : 1000,
		"height": 500,
		"x" : 100,
		"y" : 100,
		"maximized" : False
	},
	"initial_file_search_path" : "."
}


def load_entries(to_load={}, default={}):
	for key in default:
		if key not in to_load:
			to_load[key] = default[key]

def post_parse(config):
	d = config['divisions']
	
	if (d['segregate'] > d['divisions']):
		d['segregate'] = d['divisions']

def load_config(path):
	try:
		with open(path, 'r') as f:
			to_return = json.load(f)
			load_entries(to_return, DEFAULT_CONFIG)
			load_entries(to_return['indices'], DEFAULT_CONFIG['indices'])
			load_entries(to_return['divisions'], DEFAULT_CONFIG['divisions'])
			load_entries(to_return['incentive_division1'], DEFAULT_CONFIG['incentive_division1'])
			load_entries(to_return['incentive_division2'], DEFAULT_CONFIG['incentive_division2'])
			load_entries(to_return['incentive_division3'], DEFAULT_CONFIG['incentive_division3'])
			load_entries(to_return['window'], DEFAULT_CONFIG['window'])
			post_parse(to_return)
			return to_return
	except BaseException as ex:
		log.warning('could not load config at path \'%s\' %s' % (path,ex))
		post_parse(DEFAULT_CONFIG)
		return DEFAULT_CONFIG