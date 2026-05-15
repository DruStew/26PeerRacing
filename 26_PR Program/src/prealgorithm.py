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

from .peer_racing_algorithm import load_entries # Modified import
from .peer_racing_algorithm import Entry # Modified import
from .config import post_parse # Modified import

#run the pre-algorithm on a set of entries and remove entries with a z-score above or below a certain limit
#calculate percentiles required to remove these entries and round them to the nearest integer (i.e. 95%, 5%)
#return these new percentiles and return them in a tuple along with a context string
def run(entries, z_low=-3, z_high=3):
	log.debug('prealgorithm.run(%d entries, z_score_limits=[%2.1f,%2.1f])' % (len(entries), z_low, z_high))
#0. get all the times
	times_s = []
	for e in entries:
		times_s.append(e.time_s)
	times_s = np.array(times_s)
	
#1.
	times_h = times_s/3600.0
	avg = np.mean(times_h)
	std = np.std(times_h)
	log.debug('average: %2.2f, standard deviation %2.2f, max: %2.2f, min: %2.2f' % (avg,std,np.max(times_h),np.min(times_h)))
	
	zscore = lambda t: (t-avg)/std
	percentile = lambda t: 100*(float(sum(other < t for other in times_h))/float(len(times_h)))
	
	low_p_cutoff  = 0 #the low percentile cutoff will be raised to omit any scores that are lower than the minimum z-score
	high_p_cutoff = 100#the high percentile cutoff will be lowered to omit any scores that are higher than the maximum z-score

	for t in times_h:
		z = zscore(t)
		if (z < 0) and (z < z_low):
			p = math.ceil(percentile(t))
			p = p if (p>0) else 1
			log.debug('time %2.2f with z_score %5.2f, exceeds threshold %f percentile %d%%' % (t, zscore(t), z_low, p))
			low_p_cutoff = max([low_p_cutoff, p])
		elif (z > 0) and (z > z_high):
			p = math.floor(percentile(t))
			#log.debug('time %2.2f, z_score %5.2f, exceeds threshold %f percentile %d%%' % (t, zscore(t), z_high, p))
			high_p_cutoff = min([high_p_cutoff, p])

	log.debug('recommended percentile cutoffs [%d,%d]' % (low_p_cutoff, high_p_cutoff))
	return (low_p_cutoff, high_p_cutoff)

if __name__ == "__main__":
	log.basicConfig(level=log.DEBUG) #configure logging
	
	parser = argparse.ArgumentParser(description='run the pre-algorithm to determine appropriate percentile bounds for a given race')
	parser.add_argument('-in'   , '--input-path'    		,type=str, required=True, help='input file path')
	parser.add_argument('-f'    , '--first-name-index'		,type=int, default=-1, help='column index for the first name')
	parser.add_argument('-l'    , '--last-name-index' 		,type=int, default=-1, help='column index for the last name')
	parser.add_argument('-id'   , '--id-index'       		,type=int,default=0,help='the column index to extract runner ids from')
	parser.add_argument('-t'    , '--time-indices'  		,type=str,default='3',help='a comma delimitted list of indices where the running times are stored')
	parser.add_argument('-tf'   , '--time-format-strings'	,type=str, default='%H:%M:%S.%f', help='a comma delimitted list of time format strings used to extract times')
	parser.add_argument('-max'  , '--division-bounds-max-percentile',type=int, default=95, help='the maximum percentile setting the division bounds')
	parser.add_argument('-min'  , '--division-bounds-min-percentile',type=int, default=5,  help='the minimum percentile setting the division bounds')
	parser.add_argument('-d'    , '--divisions'     				,type=int, default=5, help='number of divisions to create')
	parser.add_argument('-w'    , '--winners-per-division'			,type=str, default='5,5,4,4,4', help='the number of winners per division as a comma delimitted list of integers or a single integer')
	parser.add_argument('-png'  , '--png'           ,action='store_true', help='store output graphs to png image')
	config = parser.parse_args().__dict__

	post_parse(config)
	e = load_entries(config)
	run(e)