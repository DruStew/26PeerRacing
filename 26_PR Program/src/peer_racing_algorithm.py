import csv
import numpy as np
import matplotlib.pyplot as plt
from scipy.stats import norm
import scipy.integrate as integrate
import math
import argparse
import sys
import datetime
import logging as log
import json
from dataclasses import dataclass
import traceback
import os
import time

#Corrected import statements:
from config import load_config  # Use relative import
import master_calculator #Import the module


@dataclass
class Entry:
	id: str
	bib_number: int
	first_name: str
	last_name: str
	age: int
	sex: str
	time_s: int
	overall_rank: int
	peer_racing_rank: str
	time_raw: str
	military : bool = False
	payout: float = 0.0 # Add payout attribute
	incentive_payout1: float = 0.0
	incentive_payout2: float = 0.0
	incentive_payout3: float = 0.0
	
	def __post_init__(self):
		self.age = int(self.age)

	def get_incentive_payout(self,div):
		if (div == 0):
			return self.incentive_payout1
		elif (div == 1):
			return self.incentive_payout2
		elif (div == 2):
			return self.incentive_payout3

	def is_female(self):
		return (('f' in self.sex) or ('F' in self.sex))

	def is_military(self):
		return self.military

	def time_h(self):
		return self.time_s/3600.0

	def set_division(self, div='Z', place=0, segregated=False):
		if (segregated == False):
			self.peer_racing_rank = '%s%d' % (div, place)
		else:
			self.peer_racing_rank = '%s%s%d' % (div, self.sex[0].upper(), place)

	#get the entries info as a row
	def get_row(self):
		return [self.id, self.bib_number, self.first_name, self.last_name,
			self.age, self.sex, self.time_raw, self.overall_rank, self.peer_racing_rank]

	def header(self):
		return ['PRid', 'BIB#', 'First Name', 'Last Name', 'Age', 'Sex', 'Finish Time', 'Overall Rank', 'Peer Racing Rank']

	def jsonify(self, remove_name=False):
		to_return = {}
		to_return['id'] 	= self.id
		to_return['time_s']	= self.time_s
		to_return['time_h']	= '%2.2f Hours' % (self.time_h(),)
		if (remove_name == False):
			to_return['first_name'] = self.first_name
			to_return['last_name'] = self.last_name
			to_return['raw_entry'] = self.time_raw
		return to_return

def get_time_old_style(time_str):
	try:
		time_str = time_str.strip('\r\n ')
		e = time_str.split(':')
		to_return = 0
		m = [1, 60, 3600]
		for i, entry in enumerate(reversed(e)):
			to_return = to_return + float(entry)*m[i]
		return to_return
	except BaseException:
		#log.debug('here!!!!!!!!!')
		return None

def get_time(time_str, fstring):
	while(len(fstring)!=0):
		try:
			return datetime.datetime.strptime(time_str, fstring)
		except BaseException as ex:
			pass
			#log.debug(ex)
		fstring = fstring[1:]
	#log.error('failed to extract time')

def safe_get_index(ls, ind, default=None):
	if (type(ls) != 'list'):
		return default
	if (ind >= len(ls)):
		return default
	return ls[ind]

##@param row, the row to parse as a list
##@param row_index, the index of the row being parsed
##@param indices, the indices dictionary from the config
##@param time_fstr, the time format string
def parse_row(row, row_index, indices, time_fstr, silent=False):
	base_time = datetime.datetime.strptime('','')
	entry_time_s = 0
	try:
		time_str = row[indices['time']]
		if '.' not in time_str:
			time_str = time_str + '.0'

		t = get_time(time_str, time_fstr)
		if (t is not None):
			entry_time_s =  entry_time_s + (t - base_time).seconds
		else:
			t = get_time_old_style(time_str)
			if (t is None):
				raise ValueError('could not load raw entry! \"%s\"' % (row,))
			entry_time_s =  entry_time_s + t

		military = False
		if (indices['military'] >= 0):
			v = row[indices['military']].upper()
			if (v != '0') or ('T' in v):
				military = True

		new_entry = Entry(row[indices['id']],
							row[indices['bib']],
							row[indices['first']],
							row[indices['last']],
							row[indices['age']],
							'Female' if ('F' in row[indices['sex']].upper()) else 'Male',
							entry_time_s,
							safe_get_index(row, indices['overall_rank'], default=-1),
							safe_get_index(row, indices['peer_racing_rank'], default=""),
							row[indices['time']],
							military
						)
		return new_entry
	except BaseException as ex:
		if (not silent):
			log.warning('parse_row() failed!')
			log.warning('row %d, \"%s\"' % (row_index, str(row)))
			print(traceback.format_exc())
		return None

##@param config, the global config object
##@param entries_iter an iterable object that yields entries
##@return yields the next parsed entry
def parse_entries(config, raw_entries_iter):
	to_return = []
	max_index = max(config['indices'].values())

	for row_index, row in enumerate(raw_entries_iter):
		new_entry = parse_row(row, row_index, config['indices'], config['time_fstr'], silent=(row_index==0))
		if (new_entry is not None):
			to_return.append(new_entry)
	return to_return

def sort_entries(entries):
	return entries.sort(key = lambda x : x.time_s)

class Stats:
	def __init__(self,max,min,avg=0,std=0):
		self.max = max
		self.min = min
		self.avg = avg
		self.std = std

class Points:
	def __init__(self,x,y):
		self.x = x
		self.y = y

def get_stats(dataset, header=''):
	avg = np.mean(dataset)
	std = np.std(dataset)
	min = np.min(dataset)
	max = np.max(dataset)
	if (log.root.level == log.DEBUG):
		print(header)
		print('avg: %8.3f | std: %8.3f' % (avg, std))
		print('min: %8.3f | max: %8.3f' % (min, max))
		print('=================================')
	return Stats(max,min,avg,std)

def probability(a,b,avg,std):
	p = norm.cdf(b,avg,std) - norm.cdf(a,avg,std)
	print('%2.2f' % (p,))
	return p

def create_division_func(stat_max, stat_min, max, min, std, avg, stretch_factor=1.0):
	c1 = (max-min)/(4*std)
	c2 = math.log((max-avg)/(avg-min))/c1
	sig = lambda x : ((max-min)/(1 + math.exp(-(stretch_factor*c1)*(x-c2)))) + min
	return sig

def get_winners(entries, divisions_h, winners_per_division, remove_name=False):
	winners = {} #a dictionary containing arrays of arrays
	#dl = lambda i : chr(i+65) #ORIGINAL
	divisions = ["Alpha", "Bravo", "Charlie", "Delta", "Echo"] #CORRECTED               
	dl = lambda i : divisions[i] #CORRECTED
	for i, current_division, places in zip(range(0,len(divisions_h)), divisions_h, winners_per_division):
		next_div = sys.float_info.max if (i+1==len(divisions_h)) else divisions_h[i+1]

		division_winners = {}
		winners[dl(i)] = []
		wdiv = lambda : winners[dl(i)] #lambda function to get the current winners division being filled
		wdiv().append(entries[0].header())
		cp = lambda : len(wdiv()) #the current place being set
		for e in entries:
			if (e.time_h() >= next_div):
				break
			if (cp()-1 == places):
				break
			if (e.time_h() >= current_division):
				e.set_division(dl(i),cp())
				wdiv().append(e.get_row())
	return winners


#assume entries is already sorted
def set_entry_divisions(entries, divisions_h, race_finances, incentive_run):
	winners = {}
	#dl = lambda i: chr(i + 65)  # Division letter (A, B, C, etc.) -- OLD
	divisions = ["Alpha", "Bravo", "Charlie", "Delta", "Echo"] #CORRECTED
	dl = lambda i: divisions[i] #CORRECTED

	# Assign runners to divisions.
	divisions_list = divisions_h.copy()  # Work with a copy
	divisions_list.append(sys.float_info.max)

	cd = divisions_list.pop(0) #get the current division
	nd = divisions_list.pop(0) #get the next division
	i = 0
	winners[dl(i)] = []

	for e in entries:
		if (e.time_h() >= nd): #time exceeds next division
			cd = nd
			nd = divisions_list.pop(0)
			i+=1
			winners[dl(i)] = []
		if (e.time_h() >= cd): #time exceeds current division
			e.set_division(dl(i), len(winners[dl(i)]) + 1)  #Assign 1-based rank
			winners[dl(i)].append(e) #add to the correct division

	# Calculate payouts using the master_calculator results
	
	def set_runner_payout(r,payout):
		if (incentive_run is None):
			r.payout = payout
		elif (incentive_run == 0):
			r.incentive_payout1 = payout
		elif (incentive_run == 1):
			r.incentive_payout2 = payout
		elif (incentive_run == 2):
			r.incentive_payout3 = payout
		else:
			raise ValueError('Invalid Value for incentive_run argument %s' % (incentive_run,))
	
	
	for division, runners in winners.items():
		if division in race_finances.payout(incentive_run):
			payouts = race_finances.payout(incentive_run)[division]
			# Assign payouts to the top runners in the division.
			for i in range(len(payouts)):
				if i < len(runners):  # Check if there's a runner at this rank
					runners[i].peer_racing_rank = '%s %d' % (division, i+1)  # Update rank
					set_runner_payout(runners[i], payouts[i])
					#runners[i].payout = payouts[i]  # Assign the payout amount
				else:
					break # Stop if fewer runners than places
		else:
		  log.warning('Division %s does not exist in payouts!' % (division))
	return winners

def print_winners(winners): #Not needed anymore
	for d, w in winners.items():
		print('Division %s' % (d,))
		for e in w:
			print(e)
		print('')

def winners_string(winners): #Not needed anymore
	to_return = ''
	for i,division in enumerate(winners):
		to_return += 'Division %d\n' % (i+1,)
		d_str = ''
		for winner in division:
			d_str = d_str + '%s \n' % (':'.join(str(datetime.timedelta(hours=winner)).split('.')[:1]),)
		to_return += d_str
	return to_return
	

def run(entries, config, race_finances, incentive_run=None):
#0.
	d = config['divisions']
	num_divisions = race_finances.num_divisions(incentive_run)
	
	times_s = []
	for e in entries:
		times_s.append(e.time_s)
	times_s = np.array(times_s)
	
#1.
	times_h = times_s/3600.0
	times_h_stats = get_stats(times_s/3600.0, header='stats for raw data (hours)')
	points_raw = Points(times_h, norm.pdf(times_h,times_h_stats.avg,times_h_stats.std))
	
	#div_bounds_h = Stats(max=np.percentile(times_h,98), min=np.percentile(times_h,2))
	print(d)
	div_bounds_h = Stats(max=np.percentile(times_h,d['max_percentile']), min=np.percentile(times_h,d['min_percentile']))
	
#2. take a log of all times
	times_log = np.log(times_s)
	get_stats(times_log, header='stats for log(data)')
	
#3. scale the average to 100
	sf = np.mean(times_log)/100.0
	times_log_scaled = np.divide(times_log,sf)
	times_norm_stats = get_stats(times_log_scaled, header='stats for data scaled by %2.4f' % (sf,))
	points_normed = Points(times_log_scaled, norm.pdf(times_log_scaled,times_norm_stats.avg,times_norm_stats.std))
	
	h2log_scaled = lambda i : math.log(i*3600.0)/sf
	ivf = lambda i : math.exp(i*sf)/3600.0
	
#4. create the divisions
	div_cnt = num_divisions-1 
	#div_func = create_division_func(times_norm_stats.max, times_norm_stats.min, times_norm_stats.std, times_norm_stats.avg)
	#div_func = create_division_func(h2log_scaled(div_bounds_h.max), h2log_scaled(div_bounds_h.min), times_norm_stats.std, times_norm_stats.avg)
	div_func = create_division_func(times_norm_stats.max, times_norm_stats.min, h2log_scaled(div_bounds_h.max), h2log_scaled(div_bounds_h.min), times_norm_stats.std, times_norm_stats.avg)
	div_inputs = np.linspace(-div_cnt/2.0, div_cnt/2.0, div_cnt)
	divisions = [div_func(x) for x in div_inputs]
	
	samps = np.linspace(-div_cnt/2.0-3, div_cnt/2.0+3, 100)
	points_divisions = Points(samps, [div_func(x) for x in samps])

#5. return divisions to hour representation
	#divisions_h = [(x*sf)/3600.0 for x in divisions]
	divisions_h = [times_h_stats.min] + [ivf(x) for x in divisions]
	std_lines_h = [x*times_h_stats.std+times_h_stats.avg for x in range(-2,2+1,1)]
	percentiles_h = [div_bounds_h.min, div_bounds_h.max]
	
	log.debug('Divisions in seconds: %s' % ([x*3600.0 for x in divisions_h],))
	
#6. calculate the winners for each division
	winners = set_entry_divisions(entries, divisions_h, race_finances, incentive_run)

	if (config['png'] is False):
		return winners, divisions_h

##############################################################
####################### CREATE PLOTS #########################
##############################################################

	fig = plt.figure()
	ax1 = fig.add_subplot(221)
	ax2 = fig.add_subplot(222)
	ax3 = fig.add_subplot(223, label='1')
	ax4 = fig.add_subplot(224)
	#ax5 = fig.add_subplot(223, label='2')
	fig.suptitle('Analysis for "%s" | winner=%2.2f hours' % (config['input_path'], min(times_h)), fontweight="bold")

	ax1.plot([x*60 for x in points_raw.x], points_raw.y)
	ax1.set_title('Probability Distribution Function (PDF)')
	ax1.set_xlabel('minutes')
	
	ax2.plot(points_normed.x, points_normed.y)
	#ax2.plot([math.exp(x*sf)/3600.0 for x in points_normed.x], points_normed.y)
	#ax2.xaxis.tick_top()
	#ax2.yaxis.tick_right()
	ax2.set_xlabel('ln(sec)/%2.3f' % (sf,))
	ax2.set_title('log normalized PDF')
	
	sig = lambda x : (times_norm_stats.max-times_norm_stats.min)/(1 + math.exp(-x)) + times_norm_stats.min
	ax3.plot(points_divisions.x, [sig(x) for x in points_divisions.x], 'g', alpha=0.25, label='Standard Sigmoid Function')
	ax3.plot(points_divisions.x, points_divisions.y, label='Adjusted Sigmoid Function')
	ax3.set_xlabel('Sigmoid Inputs')
	ax3.set_ylabel('Division Outputs\n minutes=(e^(y*%2.3f)/60' % (sf,))
	for i,v in enumerate(div_inputs):
		label = None if (i>0) else "Division Selection Inputs"
		ax3.axvline(x = v, color = 'r', label=label)
	for i,h in enumerate(divisions): #math.exp(i*sf)/3600.0
		label = None if (i>0) else "Divisions Selected"
		ax3.axhline(y = h, color = 'b', label=label)
	for i,h in  enumerate((div_bounds_h.min,div_bounds_h.max)):
		label = None if (i>0) else "Percentile Cutoffs"
		ax3.axhline(y = h2log_scaled(h), color = 'm', label=label)
	ax3.legend()
	
	#for i,v in enumerate([x*60 for x in divisions_h]):
	#	label = None# if (i>0) else "Division Lines"
	#	ax5.axvline(x=v, color='g', label=label)
	#ax5.yaxis.tick_right()

	ax4.scatter([x*60 for x in points_raw.x], points_raw.y,s=1, label="PDF")
	d_str = ''
	for d in divisions_h:
		d_str = d_str + '%s ' % (':'.join(str(datetime.timedelta(hours=d)).split('.')[:1]),)
	ax4.set_title('Divisions PDF (in blue) = [%s]' % (d_str,))
	ax4.set_xlabel('minutes')
	for i,v in enumerate([x*60 for x in divisions_h]):
		label = None if (i>0) else "Division Lines"
		ax4.axvline(x = v, color = 'b', label=label)
	for i,v in enumerate([x*60 for x in std_lines_h]):
		label = None if (i>0) else "Standard Deviation"
		ax4.axvline(x = v, color = 'r', label=label, alpha=0.35)
	for i,v in enumerate([x*60 for x in percentiles_h]):
		label = None if (i>0) else "Percentile Cutoffs"
		ax4.axvline(x = v, color = 'm', label=label, alpha=0.75)
	ax4.axvline(x=math.exp(times_norm_stats.avg*sf)/60.0, color = 'g', label='Log Average', alpha=0.35)
	ax4.legend()

	if (config['png'] is True):
		fig.set_size_inches(18.5, 10.5, forward=True)
		if (incentive_run is None):
			plt.savefig(config['png_path'])
		else:
			plt.savefig(race_finances.incentive_divisions[incentive_run].attr['png_path'])
	else:
		plt.show()
	plt.close()
	return winners, divisions_h
