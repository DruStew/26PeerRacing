import time
import functools
from master_calculator import calclulate_num_divisions
from master_calculator import calclulate_num_payout_slots
import traceback
import google_sheets_util as gs
from peer_racing_algorithm import parse_entries
import csv

class State:
	def __init__(self, config):
		self.config = config
		self.stopped = True
		self.status_label = None
		self.status_str = None
		self.update_callback = None
		self.entries = None
		self.results_loaded = None

		self.high_cutoff = lambda : self.config["divisions"]["max_percentile"]
		self.low_cutoff  = lambda : self.config["divisions"]["min_percentile"]
		self.refresh_rate = lambda : self.config['refresh_rate_s'] * 1000

		self.last_run = time.monotonic()
		self.time_until_next_run = lambda : (self.config['refresh_rate_s'] - (time.monotonic()-self.last_run))

	def divisions(self, total_runners=None):
		if (total_runners is None):
			return self.config['divisions']['divisions']
		return calclulate_num_divisions(total_runners) if (self.config['divisions']['auto_set_divisions']==True) else self.config['divisions']['divisions']
	
	def payout_slots(self, total_runners=None):
		if (total_runners is None):
			return self.config['divisions']['payout_slots']
		return calclulate_num_payout_slots(total_runners) if (self.config['divisions']['auto_set_divisions']==True) else self.config['divisions']['payout_slots']

	def set_cutoffs(self, high, low):
		self.config["divisions"]["max_percentile"] = high
		self.config["divisions"]["min_percentile"] = low

	def clear_status(self):
		self.status_str = None

	def set_status(self,s):
		self.status_str = s

	def update_status_label(self, time_until_next_run=True):
		if ((time_until_next_run == True) and (self.stopped == False) and (self.status_str is None)):
			status_str = 'algorithm runs again in %d seconds' % (self.time_until_next_run(),)
			self.status_label.config(text=status_str)
		else:
			self.status_label.config(text=self.status_str)
		self.status_label.after(1000, self.update_status_label)
	
	def sort_entries(self):
		self.entries.sort(key = lambda x : x.time_s)
		for i, e in enumerate(self.entries):
			e.overall_rank = i+1
	
	def load_race_results_from_csv(self):
		input_path = self.config['input_path']
		print("load_race_results_from_csv(%s)" % (input_path,))
		self.entries = None
		try:
			with open(self.config['input_path'], 'r') as f:
				self.entries = parse_entries(self.config, csv.reader(f))
			assert(len(self.entries) != 0)
			self.sort_entries()
		except BaseException:
			print(traceback.format_exc())
			raise IOError("Failed to load race data from csv at '%s'" % (input_path,))
		return self.entries

	def load_race_results_from_sheets(self):
		sheet_id = self.config['input_sheet_id']
		print("load_race_results_from_sheets(%s)" % (sheet_id,))
		self.entries = None
		try:
			raw_entries = gs.read_sheet(sheet_id)
			self.entries = parse_entries(self.config, raw_entries)
			assert(len(self.entries) != 0)
			self.sort_entries()
		except BaseException as ex:
			print(traceback.format_exc())
			raise IOError("Failed to load race data from google sheets with id '%s'" % (sheet_id,))
		return self.entries
	
	def import_description(self):
		return "race data loaded from %s at '%s'" % (self.config['import_mode'], self.config['input_path'] if (self.config['import_mode']=='csv') else self.config['input_sheet_id'])